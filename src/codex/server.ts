import { z } from "zod";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { createServer, startServer } from "../shared/server-factory.js";
import { buildCoverLetterPrompt } from "../shared/cover-letter-skill.js";
import { buildCreativePortfolioResumePrompt } from "../shared/creative-portfolio-resume-skill.js";
import { buildExecutiveResumePrompt } from "../shared/executive-resume-skill.js";
import { buildInterviewPrepPrompt } from "../shared/interview-prep-skill.js";
import { buildJobDescriptionAnalyzerPrompt } from "../shared/job-description-analyzer-skill.js";
import { buildLinkedInProfileOptimizerPrompt } from "../shared/linkedin-profile-optimizer-skill.js";
import { buildPortfolioCaseStudyPrompt } from "../shared/portfolio-case-study-skill.js";
import { buildReferenceListPrompt } from "../shared/reference-list-skill.js";
import { buildResumeAtsOptimizerPrompt } from "../shared/resume-ats-optimizer-skill.js";
import { buildResumeBulletWriterPrompt } from "../shared/resume-bullet-writer-skill.js";
import { buildResumeFormatterPrompt } from "../shared/resume-formatter-skill.js";
import { buildResumeQuantifierPrompt } from "../shared/resume-quantifier-skill.js";
import { buildResumeSectionBuilderPrompt } from "../shared/resume-section-builder-skill.js";
import { buildCareerFactExtractorPrompt } from "../shared/career-fact-extractor-skill.js";
import { buildRecruiterFirstScreenPrompt } from "../shared/recruiter-first-screen-skill.js";
import { buildResumeTailorPrompt } from "../shared/resume-tailor-skill.js";
import { buildResumeVersionManagerPrompt } from "../shared/resume-version-manager-skill.js";
import { buildTechResumeOptimizerPrompt } from "../shared/tech-resume-optimizer-skill.js";
import { buildOpenPrGhPrompt } from "../shared/pr-gh-open-skill.js";
import { buildReviewPrGhPrompt } from "../shared/pr-gh-review-skill.js";
import { buildOpenPrAdoPrompt } from "../shared/pr-ado-open-skill.js";
import { buildReviewPrAdoPrompt } from "../shared/pr-ado-review-skill.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

/** Parsed output from a `codex exec` invocation. */
interface CodexResult {
  /** Trimmed stdout from the Codex CLI. */
  text: string;
}

const DEFAULT_AGENT_PATH = join(
  homedir(),
  ".codex",
  "agents",
  "code-reviewer.toml",
);

let cachedAgentInstructions: string | null | undefined;

/**
 * Load the developer_instructions from the codex code-reviewer agent toml.
 * Falls back to null if the file doesn't exist.
 * Configurable via CODEX_REVIEW_AGENT_PATH env var.
 */
async function loadAgentInstructions(): Promise<string | null> {
  if (cachedAgentInstructions !== undefined) return cachedAgentInstructions;

  const agentPath =
    process.env["CODEX_REVIEW_AGENT_PATH"] ?? DEFAULT_AGENT_PATH;

  try {
    const content = await readFile(agentPath, "utf-8");
    // Extract developer_instructions from TOML (between triple-quote delimiters)
    const match = content.match(
      /developer_instructions\s*=\s*"""([\s\S]*?)"""/,
    );
    cachedAgentInstructions = match ? match[1]!.trim() : null;
  } catch {
    cachedAgentInstructions = null;
  }

  return cachedAgentInstructions;
}

async function runCodex(prompt: string): Promise<CodexResult> {
  return new Promise<CodexResult>((resolve, reject) => {
    const args = ["exec", "--skip-git-repo-check"];
    const model = process.env["CODEX_REVIEW_MODEL"];
    if (model) args.push("--model", model);

    const proc = spawn("codex", args, {
      stdio: ["pipe", "pipe", "pipe"],
    });

    proc.stdin.write(prompt);
    proc.stdin.end();

    let stdout = "";
    let stderr = "";
    let settled = false;

    proc.on("error", (err: Error) => {
      if (!settled) {
        settled = true;
        reject(new Error(`Failed to spawn codex: ${err.message}`));
      }
    });

    proc.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });

    proc.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    proc.on("close", (code: number | null) => {
      if (settled) return;
      settled = true;

      if (code !== 0) {
        reject(new Error(`codex exited with code ${code ?? "null"}: ${stderr.slice(-500)}`));
        return;
      }

      resolve({ text: stdout.trim() });
    });
  });
}

/**
 * Create the Codex MCP bridge server with `codex` and `codex_reply` tools.
 *
 * Each tool invokes the `codex` CLI as a child process. The `codex_reply`
 * tool does not maintain real session state -- context is passed inline.
 *
 * @returns A configured {@link McpServer} ready to connect to a transport.
 *
 * @example
 * ```ts
 * const server = createCodexServer();
 * await startServer(server);
 * ```
 */
export function createCodexServer(): McpServer {
  const server = createServer({
    name: "codex-mcp-bridge",
    version: "0.1.0",
    description:
      "Exposes OpenAI Codex CLI as MCP tools for code generation and conversation",
  });

  server.registerTool(
    "codex",
    {
      title: "Codex",
      description:
        "Send a prompt to OpenAI Codex CLI for code generation or analysis.",
      inputSchema: {
        prompt: z.string().describe("The prompt to send to Codex"),
      },
    },
    async ({ prompt }) => {
      const result = await runCodex(prompt);

      return {
        content: [{ type: "text" as const, text: result.text }],
      };
    },
  );

  server.registerTool(
    "code_review",
    {
      title: "Code Review",
      description:
        "Send a git diff or code snippet to Codex for structured review. Returns JSON with verdict, issues, and suggestions when possible.",
      inputSchema: {
        diff: z
          .string()
          .max(500_000)
          .describe("The git diff or code to review"),
        context: z
          .string()
          .optional()
          .describe("Additional context about the changes"),
      },
    },
    async ({ diff, context }) => {
      const agentInstructions = await loadAgentInstructions();

      const reviewPrompt = `${agentInstructions ? agentInstructions + "\n\n" : ""}Review the following and respond with ONLY valid JSON matching this exact schema (no markdown fencing, no extra text):
{"verdict": "APPROVED" or "NEEDS_REVISION", "issues": [{"severity": "critical" or "major" or "minor", "description": "...", "recommendation": "..."}], "suggestions": ["..."]}

${context ? `Context: ${context}\n\n` : ""}${diff}`;

      const result = await runCodex(reviewPrompt);

      // Try to parse as structured JSON; fall back to raw text
      try {
        const parsed: unknown = JSON.parse(result.text);
        if (
          parsed &&
          typeof parsed === "object" &&
          "verdict" in parsed &&
          "issues" in parsed
        ) {
          return {
            content: [
              { type: "text" as const, text: JSON.stringify(parsed, null, 2) },
            ],
          };
        }
      } catch {
        // Codex doesn't support schema-constrained output, so raw text is expected
      }

      return {
        content: [{ type: "text" as const, text: result.text }],
      };
    },
  );

  server.registerTool(
    "review",
    {
      title: "Review",
      description:
        "Send a plan, diff, or implementation to Codex for independent review. Returns structured JSON with verdict, issues, and suggestions.",
      inputSchema: {
        content: z
          .string()
          .max(500_000)
          .describe("The code, plan, or diff to review"),
        context: z
          .string()
          .optional()
          .describe("Additional context about what is being reviewed"),
      },
    },
    async ({ content, context }) => {
      const agentInstructions = await loadAgentInstructions();

      const reviewPrompt = `${agentInstructions ? agentInstructions + "\n\n" : ""}Review the following and respond with ONLY valid JSON matching this exact schema (no markdown fencing, no extra text):
{"verdict": "APPROVED" or "NEEDS_REVISION", "issues": [{"severity": "critical" or "major" or "minor", "description": "...", "recommendation": "..."}], "suggestions": ["..."]}

${context ? `Context: ${context}\n\n` : ""}${content}`;

      const result = await runCodex(reviewPrompt);

      try {
        const parsed: unknown = JSON.parse(result.text);
        if (
          parsed &&
          typeof parsed === "object" &&
          "verdict" in parsed &&
          "issues" in parsed
        ) {
          return {
            content: [
              { type: "text" as const, text: JSON.stringify(parsed, null, 2) },
            ],
          };
        }
      } catch {
        // Codex doesn't support schema-constrained output, so raw text is expected
      }

      return {
        content: [{ type: "text" as const, text: result.text }],
      };
    },
  );

  server.registerTool(
    "open_pr_gh",
    {
      title: "Open PR (GitHub)",
      description:
        "Push the active branch and open a GitHub pull request with a structured description, linked ticket, reviewers, and labels. Returns step-by-step workflow instructions.",
      inputSchema: {
        baseBranch: z.string().optional().describe("Target branch (default: dev)"),
        jiraBaseUrl: z.string().optional().describe("Issue tracker base URL for ticket links"),
        reviewers: z.string().optional().describe("Comma-separated GitHub usernames"),
        labels: z.string().optional().describe("Comma-separated PR labels"),
        draft: z.boolean().optional().describe("Open as draft PR (default: false)"),
      },
    },
    async ({ baseBranch, jiraBaseUrl, reviewers, labels, draft }) => {
      const instructions = buildOpenPrGhPrompt({ baseBranch, jiraBaseUrl, reviewers, labels, draft });
      return { content: [{ type: "text" as const, text: instructions }] };
    },
  );

  server.registerTool(
    "review_pr_gh",
    {
      title: "Review PR (GitHub)",
      description:
        "Systematic file-by-file GitHub PR code review. Posts inline comments and a verdict. Returns step-by-step workflow instructions.",
      inputSchema: {
        pr: z.string().describe("GitHub PR URL or number"),
        repo: z.string().optional().describe("owner/repo slug (inferred from URL if omitted)"),
      },
    },
    async ({ pr, repo }) => {
      const instructions = buildReviewPrGhPrompt({ pr, repo });
      return { content: [{ type: "text" as const, text: instructions }] };
    },
  );

  server.registerTool(
    "open_pr_ado",
    {
      title: "Open PR (Azure DevOps)",
      description:
        "Push the active branch and open an Azure DevOps pull request with a structured description, linked work items, and optional auto-complete. Returns step-by-step workflow instructions.",
      inputSchema: {
        org: z.string().describe("Azure DevOps organization URL (e.g. https://dev.azure.com/myorg)"),
        project: z.string().describe("ADO project name"),
        repo: z.string().describe("Repository name"),
        baseBranch: z.string().optional().describe("Target branch (default: dev)"),
        jiraBaseUrl: z.string().optional().describe("Issue tracker base URL for ticket links"),
        reviewers: z.string().optional().describe("Space-separated reviewer emails"),
        workItems: z.string().optional().describe("Space-separated ADO work item IDs to link"),
        draft: z.boolean().optional().describe("Open as draft PR (default: false)"),
        autoComplete: z.boolean().optional().describe("Enable auto-complete on creation (default: false)"),
      },
    },
    async ({ org, project, repo, baseBranch, jiraBaseUrl, reviewers, workItems, draft, autoComplete }) => {
      const instructions = buildOpenPrAdoPrompt({ org, project, repo, baseBranch, jiraBaseUrl, reviewers, workItems, draft, autoComplete });
      return { content: [{ type: "text" as const, text: instructions }] };
    },
  );

  server.registerTool(
    "review_pr_ado",
    {
      title: "Review PR (Azure DevOps)",
      description:
        "Systematic file-by-file ADO PR code review. Posts inline thread comments and a vote. Returns step-by-step workflow instructions.",
      inputSchema: {
        prId: z.string().describe("ADO pull request ID"),
        org: z.string().describe("Azure DevOps organization URL"),
        project: z.string().describe("ADO project name"),
        repo: z.string().describe("Repository name"),
      },
    },
    async ({ prId, org, project, repo }) => {
      const instructions = buildReviewPrAdoPrompt({ prId, org, project, repo });
      return { content: [{ type: "text" as const, text: instructions }] };
    },
  );

  server.registerTool(
    "codex_reply",
    {
      title: "Codex Reply",
      description:
        "Continue a conversation with Codex by sending a follow-up reply. Note: Does not maintain actual session state; context is passed inline.",
      inputSchema: {
        conversation_id: z.string().describe("The conversation ID to continue"),
        reply: z.string().describe("The follow-up message"),
      },
    },
    async ({ conversation_id, reply }) => {
      const result = await runCodex(
        `[Continuing conversation ${conversation_id}] ${reply}`,
      );

      return {
        content: [{ type: "text" as const, text: result.text }],
      };
    },
  );

  server.registerTool(
    "cover_letter_generator",
    {
      title: "Application Cover Letter Generator",
      description:
        "Generate a personalized, compelling cover letter from a resume and job description. Returns an analysis, the complete letter, alternative opening hooks, and interview talking points.",
      inputSchema: {
        resume: z
          .string()
          .max(50_000)
          .describe("The candidate's resume or experience summary"),
        job_description: z
          .string()
          .max(20_000)
          .describe("The full job posting text"),
        company_name: z.string().describe("Name of the company"),
        role_title: z.string().describe("Title of the role being applied for"),
        additional_context: z
          .string()
          .optional()
          .describe(
            "Optional: mutual connections, specific reasons for applying, notable company news, etc.",
          ),
      },
    },
    async ({ resume, job_description, company_name, role_title, additional_context }) => {
      const prompt = buildCoverLetterPrompt({
        resume,
        jobDescription: job_description,
        companyName: company_name,
        roleTitle: role_title,
        additionalContext: additional_context,
      });

      const result = await runCodex(prompt);

      return {
        content: [{ type: "text" as const, text: result.text }],
      };
    },
  );

  server.registerTool(
    "creative_portfolio_resume",
    {
      title: "Creative Portfolio Resume Generator",
      description:
        "Generate both an ATS-compatible and a designed resume for creative professionals (graphic designers, UX, marketing, writers, photographers, etc.). Returns both versions plus field-specific tips and portfolio link strategy.",
      inputSchema: {
        experience: z
          .string()
          .max(50_000)
          .describe("Work experience and employment history"),
        skills: z
          .string()
          .max(10_000)
          .describe("Technical, creative, and soft skills"),
        field: z
          .enum([
            "graphic_design",
            "ux_product_design",
            "marketing_brand",
            "writing",
            "photography_video",
            "other",
          ])
          .describe("The candidate's creative field"),
        target_role: z
          .string()
          .optional()
          .describe("Specific role or type of role being targeted"),
        portfolio_url: z
          .string()
          .optional()
          .describe("URL to the candidate's portfolio"),
        additional_context: z
          .string()
          .optional()
          .describe(
            "Optional: awards, publications, education, or other relevant details",
          ),
      },
    },
    async ({ experience, skills, field, target_role, portfolio_url, additional_context }) => {
      const prompt = buildCreativePortfolioResumePrompt({
        experience,
        skills,
        field,
        targetRole: target_role,
        portfolioUrl: portfolio_url,
        additionalContext: additional_context,
      });

      const result = await runCodex(prompt);

      return {
        content: [{ type: "text" as const, text: result.text }],
      };
    },
  );

  server.registerTool(
    "executive_resume_writer",
    {
      title: "Executive Resume Writer",
      description:
        "Craft a C-suite, VP, or Director-level resume that tells a transformation story. Returns executive profile, core competencies, career highlights, full experience section, and coaching notes.",
      inputSchema: {
        experience: z
          .string()
          .max(50_000)
          .describe("Full career history with company context (revenue, stage, headcount)"),
        current_level: z
          .enum(["c_suite", "vp", "director", "other_executive"])
          .describe("Current or target executive level"),
        target_role: z.string().optional().describe("Specific role or title being targeted"),
        industry: z.string().optional().describe("Industry or sector"),
        board_experience: z
          .string()
          .optional()
          .describe("Board memberships, advisory roles, and governance experience"),
        additional_context: z
          .string()
          .optional()
          .describe("Optional: awards, publications, or other relevant details"),
      },
    },
    async ({ experience, current_level, target_role, industry, board_experience, additional_context }) => {
      const prompt = buildExecutiveResumePrompt({
        experience,
        current_level,
        target_role,
        industry,
        board_experience,
        additional_context,
      });

      const result = await runCodex(prompt);

      return {
        content: [{ type: "text" as const, text: result.text }],
      };
    },
  );

  server.registerTool(
    "interview_prep_generator",
    {
      title: "Interview Prep Generator",
      description:
        "Generate STAR stories, predicted questions, self-introduction pitch, and interview strategy tailored to a specific role.",
      inputSchema: {
        resume: z
          .string()
          .max(50_000)
          .describe("The candidate's resume or experience summary"),
        job_description: z
          .string()
          .max(20_000)
          .describe("The full job posting text"),
        company_name: z.string().describe("Name of the company"),
        role_title: z.string().describe("Title of the role being applied for"),
        interview_format: z
          .string()
          .optional()
          .describe("Optional: e.g. behavioral, technical, case study, panel"),
        additional_context: z
          .string()
          .optional()
          .describe("Optional: additional preparation context"),
      },
    },
    async ({ resume, job_description, company_name, role_title, interview_format, additional_context }) => {
      const prompt = buildInterviewPrepPrompt({
        resume,
        job_description,
        company_name,
        role_title,
        interview_format,
        additional_context,
      });

      const result = await runCodex(prompt);

      return {
        content: [{ type: "text" as const, text: result.text }],
      };
    },
  );

  server.registerTool(
    "job_description_analyzer",
    {
      title: "Job Description Analyzer",
      description:
        "Analyze a job posting to extract requirements, calculate match score, detect red flags, and generate tailored application strategy.",
      inputSchema: {
        job_description: z
          .string()
          .max(20_000)
          .describe("The full job posting text"),
        resume: z
          .string()
          .max(50_000)
          .optional()
          .describe("Optional: candidate resume — if provided, calculates match score"),
        additional_context: z
          .string()
          .optional()
          .describe("Optional: additional context"),
      },
    },
    async ({ job_description, resume, additional_context }) => {
      const prompt = buildJobDescriptionAnalyzerPrompt({
        job_description,
        resume,
        additional_context,
      });

      const result = await runCodex(prompt);

      return {
        content: [{ type: "text" as const, text: result.text }],
      };
    },
  );

  server.registerTool(
    "linkedin_profile_optimizer",
    {
      title: "LinkedIn Profile Optimizer",
      description:
        "Optimize a LinkedIn profile with keyword-rich headline options, rewritten About section, experience bullet rewrites, skills recommendations, and a 30-day action plan.",
      inputSchema: {
        current_profile: z
          .string()
          .max(50_000)
          .describe("Current LinkedIn profile sections pasted as text"),
        target_role: z.string().optional().describe("Target role or job title"),
        industry: z.string().optional().describe("Industry or sector"),
        resume: z
          .string()
          .max(50_000)
          .optional()
          .describe("Optional: resume for cross-reference"),
        additional_context: z
          .string()
          .optional()
          .describe("Optional: additional context"),
      },
    },
    async ({ current_profile, target_role, industry, resume, additional_context }) => {
      const prompt = buildLinkedInProfileOptimizerPrompt({
        current_profile,
        target_role,
        industry,
        resume,
        additional_context,
      });

      const result = await runCodex(prompt);

      return {
        content: [{ type: "text" as const, text: result.text }],
      };
    },
  );

  server.registerTool(
    "portfolio_case_study_writer",
    {
      title: "Portfolio Case Study Writer",
      description:
        "Transform a project into a compelling portfolio case study with problem, process, solution, results, and learnings. Returns full case study, executive summary, and interview prep notes.",
      inputSchema: {
        project_description: z
          .string()
          .max(20_000)
          .describe("What the project was, your role, and context"),
        outcomes: z
          .string()
          .max(10_000)
          .describe("Results achieved, metrics, and impact"),
        field: z
          .enum(["product_management", "design", "engineering", "marketing", "other"])
          .describe("The candidate's professional field"),
        depth: z
          .enum(["essential", "deep_dive"])
          .optional()
          .describe("Optional: essential (600-800 words) or deep_dive (2000-3000 words). Defaults to essential."),
        additional_context: z
          .string()
          .optional()
          .describe("Optional: additional context"),
      },
    },
    async ({ project_description, outcomes, field, depth, additional_context }) => {
      const prompt = buildPortfolioCaseStudyPrompt({
        project_description,
        outcomes,
        field,
        depth,
        additional_context,
      });

      const result = await runCodex(prompt);

      return {
        content: [{ type: "text" as const, text: result.text }],
      };
    },
  );

  server.registerTool(
    "reference_list_builder",
    {
      title: "Reference List Builder",
      description:
        "Build a formatted professional reference list with briefing emails, permission scripts, talking points, and timing strategy for each reference.",
      inputSchema: {
        references: z
          .string()
          .max(20_000)
          .describe("List of potential references with names, titles, relationships, and how long known"),
        target_role: z.string().describe("The role being applied for"),
        company_name: z.string().describe("Name of the company"),
        resume_highlights: z
          .string()
          .optional()
          .describe("Optional: key achievements for references to emphasize"),
        additional_context: z
          .string()
          .optional()
          .describe("Optional: additional context"),
      },
    },
    async ({ references, target_role, company_name, resume_highlights, additional_context }) => {
      const prompt = buildReferenceListPrompt({
        references,
        target_role,
        company_name,
        resume_highlights,
        additional_context,
      });

      const result = await runCodex(prompt);

      return {
        content: [{ type: "text" as const, text: result.text }],
      };
    },
  );

  server.registerTool(
    "resume_ats_optimizer",
    {
      title: "Resume ATS Optimizer",
      description:
        "Optimize a resume to pass ATS screening. Returns keyword gap analysis, match score, formatting fixes, and optimized sections with projected score improvement.",
      inputSchema: {
        resume: z
          .string()
          .max(50_000)
          .describe("The candidate's resume"),
        job_description: z
          .string()
          .max(20_000)
          .describe("The full job posting text"),
        industry: z
          .string()
          .optional()
          .describe("Optional: tech, finance, healthcare, marketing, other"),
        additional_context: z
          .string()
          .optional()
          .describe("Optional: additional context"),
      },
    },
    async ({ resume, job_description, industry, additional_context }) => {
      const prompt = buildResumeAtsOptimizerPrompt({
        resume,
        job_description,
        industry,
        additional_context,
      });

      const result = await runCodex(prompt);

      return {
        content: [{ type: "text" as const, text: result.text }],
      };
    },
  );

  server.registerTool(
    "resume_bullet_writer",
    {
      title: "Resume Bullet Writer",
      description:
        "Transform weak, duty-focused resume bullets into achievement-focused statements using the X-Y-Z formula. Returns diagnosed issues, metric-extraction questions, and 2-3 rewritten versions per bullet.",
      inputSchema: {
        bullets: z
          .string()
          .max(20_000)
          .describe("Existing resume bullets to transform (one per line or as a list)"),
        role_context: z
          .string()
          .max(5_000)
          .describe("Role title, industry, and company type for context"),
        metrics_available: z
          .string()
          .optional()
          .describe("Optional: any numbers or data points the user can share to help quantify"),
        additional_context: z
          .string()
          .optional()
          .describe("Optional: additional context"),
      },
    },
    async ({ bullets, role_context, metrics_available, additional_context }) => {
      const prompt = buildResumeBulletWriterPrompt({
        bullets,
        role_context,
        metrics_available,
        additional_context,
      });

      const result = await runCodex(prompt);

      return {
        content: [{ type: "text" as const, text: result.text }],
      };
    },
  );

  server.registerTool(
    "resume_formatter",
    {
      title: "Resume Formatter",
      description:
        "Audit and fix resume formatting for ATS compatibility and human readability. Returns formatting audit, specific fixes, reformatted sections, and ATS compatibility score.",
      inputSchema: {
        resume: z
          .string()
          .max(50_000)
          .describe("The candidate's resume"),
        career_level: z
          .enum(["entry_level", "mid_level", "senior_executive"])
          .describe("Career level to determine appropriate page length and emphasis"),
        additional_context: z
          .string()
          .optional()
          .describe("Optional: additional context"),
      },
    },
    async ({ resume, career_level, additional_context }) => {
      const prompt = buildResumeFormatterPrompt({
        resume,
        career_level,
        additional_context,
      });

      const result = await runCodex(prompt);

      return {
        content: [{ type: "text" as const, text: result.text }],
      };
    },
  );

  server.registerTool(
    "resume_quantifier",
    {
      title: "Resume Quantifier",
      description:
        "Add metrics and data-driven impact to resume bullets. Returns discovery questions, estimated metrics, and 2 quantified versions (conservative and optimistic) per bullet.",
      inputSchema: {
        bullets: z
          .string()
          .max(20_000)
          .describe("Existing resume bullets that lack metrics"),
        role_context: z
          .string()
          .max(5_000)
          .describe("Role, industry, and company size for context"),
        data_available: z
          .string()
          .optional()
          .describe("Optional: any numbers, percentages, or data points the user can share"),
        additional_context: z
          .string()
          .optional()
          .describe("Optional: additional context"),
      },
    },
    async ({ bullets, role_context, data_available, additional_context }) => {
      const prompt = buildResumeQuantifierPrompt({
        bullets,
        role_context,
        data_available,
        additional_context,
      });

      const result = await runCodex(prompt);

      return {
        content: [{ type: "text" as const, text: result.text }],
      };
    },
  );

  server.registerTool(
    "resume_section_builder",
    {
      title: "Resume Section Builder",
      description:
        "Build all resume sections optimized for career stage and target role. Returns section order, professional summary, skills section, experience guidance, and complete section checklist.",
      inputSchema: {
        experience: z
          .string()
          .max(50_000)
          .describe("Work history and employment background"),
        skills: z
          .string()
          .max(10_000)
          .describe("Skills list (technical, soft, domain expertise)"),
        career_stage: z
          .enum(["entry_level", "mid_career", "senior", "executive", "career_changer"])
          .describe("Career stage to tailor section structure and emphasis"),
        target_role: z.string().describe("The role being targeted"),
        education: z
          .string()
          .optional()
          .describe("Optional: educational background"),
        additional_sections: z
          .string()
          .optional()
          .describe("Optional: projects, volunteer work, certifications, languages, etc."),
        additional_context: z
          .string()
          .optional()
          .describe("Optional: additional context"),
      },
    },
    async ({ experience, skills, career_stage, target_role, education, additional_sections, additional_context }) => {
      const prompt = buildResumeSectionBuilderPrompt({
        experience,
        skills,
        career_stage,
        target_role,
        education,
        additional_sections,
        additional_context,
      });

      const result = await runCodex(prompt);

      return {
        content: [{ type: "text" as const, text: result.text }],
      };
    },
  );

  server.registerTool(
    "resume_tailor",
    {
      title: "Resume Tailor",
      description:
        "Tailor a resume to a specific job posting with keyword extraction, match audit, rewritten summary, prioritized skills, and bullet rewrites. Maintains authenticity — all changes reflect genuine experience.",
      inputSchema: {
        resume: z
          .string()
          .max(50_000)
          .describe("The candidate's resume"),
        job_description: z
          .string()
          .max(20_000)
          .describe("The full job posting text"),
        company_name: z.string().describe("Name of the company"),
        role_title: z.string().describe("Title of the role being applied for"),
        additional_context: z
          .string()
          .optional()
          .describe("Optional: additional context"),
      },
    },
    async ({ resume, job_description, company_name, role_title, additional_context }) => {
      const prompt = buildResumeTailorPrompt({
        resume,
        job_description,
        company_name,
        role_title,
        additional_context,
      });

      const result = await runCodex(prompt);

      return {
        content: [{ type: "text" as const, text: result.text }],
      };
    },
  );

  server.registerTool(
    "resume_version_manager",
    {
      title: "Resume Version Manager",
      description:
        "Create and organize a master resume, manage tailored versions with naming conventions, track applications, and establish an update workflow.",
      inputSchema: {
        master_resume: z
          .string()
          .max(50_000)
          .optional()
          .describe("Current resume or all experience to organize into a master resume"),
        existing_versions: z
          .string()
          .optional()
          .describe("Description of current resume files or versions (names, purposes, dates)"),
        target_roles: z
          .string()
          .optional()
          .describe("Roles and industries being targeted (e.g. 'PM at tech startups, SWE at FAANG')"),
        job_applications: z
          .string()
          .optional()
          .describe("Current job applications to incorporate into the tracker"),
        additional_context: z
          .string()
          .optional()
          .describe("Optional: career stage, volume of applications, or other context"),
      },
    },
    async ({ master_resume, existing_versions, target_roles, job_applications, additional_context }) => {
      const prompt = buildResumeVersionManagerPrompt({
        masterResume: master_resume,
        existingVersions: existing_versions,
        targetRoles: target_roles,
        jobApplications: job_applications,
        additionalContext: additional_context,
      });

      const result = await runCodex(prompt);

      return {
        content: [{ type: "text" as const, text: result.text }],
      };
    },
  );

  server.registerTool(
    "tech_resume_optimizer",
    {
      title: "Tech Resume Optimizer",
      description:
        "Optimize resumes for software engineering, PM, data, and DevOps roles with skill section restructuring, technical bullet rewrites, projects section guidance, and GitHub recommendations.",
      inputSchema: {
        resume: z
          .string()
          .max(50_000)
          .describe("The candidate's resume"),
        role_type: z
          .enum([
            "software_engineer",
            "product_manager",
            "data_engineer",
            "devops_sre",
            "data_scientist",
            "other_technical",
          ])
          .describe("The technical role type being targeted"),
        job_description: z
          .string()
          .max(20_000)
          .optional()
          .describe("Optional: job posting to tailor optimization to a specific role"),
        career_level: z
          .string()
          .optional()
          .describe("Optional: junior, mid, senior, staff, principal, or manager"),
        additional_context: z
          .string()
          .optional()
          .describe("Optional: GitHub URL, portfolio, bootcamp background, or other context"),
      },
    },
    async ({ resume, role_type, job_description, career_level, additional_context }) => {
      const prompt = buildTechResumeOptimizerPrompt({
        resume,
        roleType: role_type,
        jobDescription: job_description,
        careerLevel: career_level,
        additionalContext: additional_context,
      });

      const result = await runCodex(prompt);

      return {
        content: [{ type: "text" as const, text: result.text }],
      };
    },
  );

  server.registerTool(
    "career_fact_extractor",
    {
      title: "Career Fact Extractor",
      description:
        "Extract a structured, fact-ID-tagged database of career facts from a resume, LinkedIn profile, brag document, or any source material. Preserves truthfulness for downstream resume tailoring.",
      inputSchema: {
        source_material: z
          .string()
          .max(100_000)
          .describe(
            "Resume, LinkedIn profile, brag document, performance reviews, project notes — any source of career information",
          ),
        additional_context: z
          .string()
          .optional()
          .describe("Target role, industry, or any other relevant context"),
      },
    },
    async ({ source_material, additional_context }) => {
      const prompt = buildCareerFactExtractorPrompt({
        source_material,
        additional_context,
      });
      const result = await runCodex(prompt);
      return { content: [{ type: "text" as const, text: result.text }] };
    },
  );

  server.registerTool(
    "recruiter_first_screen_simulation",
    {
      title: "Recruiter First-Screen Simulation",
      description:
        "Simulate a skeptical hiring manager's 45-second resume screen. Returns a Yes/Maybe/No decision, top reasons and concerns, scores across 6 dimensions, and exact rewrites to make before applying.",
      inputSchema: {
        resume: z
          .string()
          .max(50_000)
          .describe("The resume to screen"),
        job_description: z
          .string()
          .max(20_000)
          .describe("The job description for the role"),
        seniority_level: z
          .string()
          .optional()
          .describe(
            "Expected seniority level for calibration (e.g. senior, staff, director)",
          ),
        additional_context: z
          .string()
          .optional()
          .describe("Any additional context for the simulation"),
      },
    },
    async ({ resume, job_description, seniority_level, additional_context }) => {
      const prompt = buildRecruiterFirstScreenPrompt({
        resume,
        job_description,
        seniority_level,
        additional_context,
      });
      const result = await runCodex(prompt);
      return { content: [{ type: "text" as const, text: result.text }] };
    },
  );

  return server;
}

const isMain =
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  (import.meta as unknown as Record<string, unknown>).main === true ||
  (typeof process !== "undefined" &&
    process.argv[1] &&
    (process.argv[1].endsWith("/codex/server.js") ||
      process.argv[1].endsWith("/codex/server.ts")));

if (isMain) {
  const server = createCodexServer();
  startServer(server).catch((err: unknown) => {
    console.error("Failed to start Codex MCP server:", err);
    process.exit(1);
  });
}
