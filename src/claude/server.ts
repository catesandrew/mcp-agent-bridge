import { z } from "zod";
import { createServer, startServer, startHttpServer } from "../shared/server-factory.js";
import { runClaude, runClaudeChat, runClaudeReview, runClaudeStructured, runQuickAnalysis, validateCwd } from "./claude-runner.js";
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
import type { ReviewResult, FailureAnalysisResult } from "../shared/types.js";
import { PORTS, FAILURE_ANALYSIS_JSON_SCHEMA } from "../shared/types.js";

/**
 * Create the Claude MCP bridge server with `review`, `ask`, and `code_review` tools.
 *
 * Each tool spawns a `claude -p` child process via {@link runClaude} or
 * {@link runClaudeReview}. The server is configured but not connected --
 * call {@link startServer} or `server.connect()` to begin serving.
 *
 * @returns A configured {@link McpServer} ready to connect to a transport.
 *
 * @example
 * ```ts
 * const server = createClaudeServer();
 * await startServer(server); // listens on stdio
 * ```
 */
export function createClaudeServer(): McpServer {
  const server = createServer({
    name: "claude-mcp-bridge",
    version: "0.1.0",
    description:
      "Wraps claude -p as MCP tools for code review, questions, and analysis",
    instructions:
      "Use the review tool for structured code reviews, ask for freeform questions, and code_review for git diff analysis.",
  });

  server.registerTool(
    "review",
    {
      title: "Review",
      description:
        "Send a plan, diff, or implementation to a Claude instance for independent review. Returns structured JSON with verdict, issues, and suggestions.",
      inputSchema: {
        content: z
          .string()
          .max(500_000)
          .describe("The code, plan, or diff to review"),
        context: z
          .string()
          .optional()
          .describe("Additional context about what is being reviewed"),
        cwd: z
          .string()
          .optional()
          .describe("Working directory for the Claude session to read files from"),
      },
    },
    async ({ content, context, cwd }) => {
      const prompt = context ? `Context: ${context}\n\n${content}` : content;

      const review: ReviewResult = await runClaudeReview(prompt, {
        cwd: validateCwd(cwd ?? undefined),
      });

      return {
        content: [
          { type: "text" as const, text: JSON.stringify(review, null, 2) },
        ],
      };
    },
  );

  server.registerTool(
    "ask",
    {
      title: "Ask Claude",
      description:
        "Ask a Claude instance a freeform question about the codebase. Returns text.",
      inputSchema: {
        question: z.string().max(500_000).describe("The question to ask"),
        cwd: z
          .string()
          .optional()
          .describe("Working directory for the Claude session"),
      },
    },
    async ({ question, cwd }) => {
      const result = await runClaude(question, {
        cwd: validateCwd(cwd ?? undefined),
      });

      return {
        content: [{ type: "text" as const, text: result.result }],
      };
    },
  );

  server.registerTool(
    "implement",
    {
      title: "Implement",
      description:
        "Have a Claude instance actually implement a task -- unlike `review`/`ask`/`code_review` " +
        "(read-only by default: Read/Grep/Glob/LS), this grants Edit/Write/Bash so the session can " +
        "make real file changes in `cwd`. Added 2026-08-29 for agent-ops: routing the actual coding " +
        "step through this already-running, already-authenticated bridge process instead of spawning " +
        "a fresh `claude -p` per job sidesteps a macOS Keychain access issue a freshly-spawned " +
        "process (from a launchd-managed CI runner) hits that this long-lived bridge process doesn't.",
      inputSchema: {
        content: z
          .string()
          .max(500_000)
          .describe("The task/prompt describing what to implement"),
        cwd: z
          .string()
          .describe("Working directory to make changes in (required -- this tool edits files)"),
        context: z
          .string()
          .optional()
          .describe("Additional context about the task"),
      },
    },
    async ({ content, cwd, context }) => {
      const prompt = context ? `Context: ${context}\n\n${content}` : content;
      const result = await runClaude(prompt, {
        cwd: validateCwd(cwd),
        allowedTools: ["Read", "Grep", "Glob", "LS", "Edit", "Write", "Bash", "WebFetch"],
      });

      return {
        content: [{ type: "text" as const, text: JSON.stringify(result) }],
      };
    },
  );

  server.registerTool(
    "code_review",
    {
      title: "Code Review",
      description:
        "Specialized code review that analyzes a git diff. Returns structured JSON with verdict, issues, and suggestions.",
      inputSchema: {
        diff: z
          .string()
          .max(500_000)
          .describe("The git diff to review (output of git diff)"),
        context: z
          .string()
          .optional()
          .describe("Additional context about the changes"),
      },
    },
    async ({ diff, context }) => {
      const prompt = context
        ? `Review this git diff.\n\nContext: ${context}\n\nDiff:\n${diff}`
        : `Review this git diff:\n\n${diff}`;

      const review: ReviewResult = await runClaudeReview(prompt);

      return {
        content: [
          { type: "text" as const, text: JSON.stringify(review, null, 2) },
        ],
      };
    },
  );

  server.registerTool(
    "analyze_failure",
    {
      title: "Analyze Test Failure",
      description:
        "Analyze a Playwright release-failure evidence bundle and return a structured diagnostic report. The caller supplies the full prompt (run summary, failed/flaky results, and repo context) as `content`; the model's output is constrained to the findings[] schema (runSummary + per-finding rootCause, confidence, status, evidence, suggestedAction).",
      inputSchema: {
        content: z
          .string()
          .max(500_000)
          .describe(
            "The full analysis prompt: run summary, failed/flaky results with errors/stacks/error-context, and repo context",
          ),
      },
    },
    async ({ content }) => {
      const analysis = await runClaudeStructured<FailureAnalysisResult>(
        content,
        FAILURE_ANALYSIS_JSON_SCHEMA,
        { model: process.env["CLAUDE_ANALYSIS_MODEL"] ?? "sonnet" },
      );

      return {
        content: [
          { type: "text" as const, text: JSON.stringify(analysis, null, 2) },
        ],
      };
    },
  );

  server.registerTool(
    "quick_analysis",
    {
      title: "Quick Analysis",
      description:
        "Lightweight, non-agentic triage for a stale or low-priority item — e.g. deciding what to do with a PR review that's gone quiet. Returns a verdict from a small fixed set plus a one-sentence reason. Not a full code review.",
      inputSchema: {
        content: z
          .string()
          .max(50_000)
          .describe("The situation to triage — current state, activity history, whatever context is relevant"),
        cwd: z
          .string()
          .optional()
          .describe("Working directory for the Claude session, if file access is needed"),
      },
    },
    async ({ content, cwd }) => {
      const analysis = await runQuickAnalysis(content, {
        cwd: validateCwd(cwd ?? undefined),
      });

      return {
        content: [
          { type: "text" as const, text: JSON.stringify(analysis, null, 2) },
        ],
      };
    },
  );

  server.registerTool(
    "agent_chat",
    {
      title: "Agent Chat",
      description:
        "One turn of an interactive chat with resource context and optional tool proposals. The caller assembles the full prompt (system instructions, resource context, available tool descriptions, and conversation history) — this tool has no memory of prior turns. Returns a text reply plus zero or more proposed tool calls; this bridge never executes a tool call itself, the caller decides whether to act on a proposal.",
      inputSchema: {
        prompt: z
          .string()
          .max(500_000)
          .describe(
            "The fully assembled prompt: system instructions, resource context, tool descriptions, conversation history, and the user's latest message",
          ),
        cwd: z
          .string()
          .optional()
          .describe("Working directory for the Claude session, if file access is needed"),
      },
    },
    async ({ prompt, cwd }) => {
      const chat = await runClaudeChat(prompt, {
        cwd: validateCwd(cwd ?? undefined),
      });

      return {
        content: [
          { type: "text" as const, text: JSON.stringify(chat, null, 2) },
        ],
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

      const result = await runClaude(prompt);

      return {
        content: [{ type: "text" as const, text: result.result }],
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

      const result = await runClaude(prompt);

      return {
        content: [{ type: "text" as const, text: result.result }],
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

      const result = await runClaude(prompt);

      return {
        content: [{ type: "text" as const, text: result.result }],
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

      const result = await runClaude(prompt);

      return {
        content: [{ type: "text" as const, text: result.result }],
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

      const result = await runClaude(prompt);

      return {
        content: [{ type: "text" as const, text: result.result }],
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

      const result = await runClaude(prompt);

      return {
        content: [{ type: "text" as const, text: result.result }],
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

      const result = await runClaude(prompt);

      return {
        content: [{ type: "text" as const, text: result.result }],
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

      const result = await runClaude(prompt);

      return {
        content: [{ type: "text" as const, text: result.result }],
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

      const result = await runClaude(prompt);

      return {
        content: [{ type: "text" as const, text: result.result }],
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

      const result = await runClaude(prompt);

      return {
        content: [{ type: "text" as const, text: result.result }],
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

      const result = await runClaude(prompt);

      return {
        content: [{ type: "text" as const, text: result.result }],
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

      const result = await runClaude(prompt);

      return {
        content: [{ type: "text" as const, text: result.result }],
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

      const result = await runClaude(prompt);

      return {
        content: [{ type: "text" as const, text: result.result }],
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

      const result = await runClaude(prompt);

      return {
        content: [{ type: "text" as const, text: result.result }],
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

      const result = await runClaude(prompt);

      return {
        content: [{ type: "text" as const, text: result.result }],
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

      const result = await runClaude(prompt);

      return {
        content: [{ type: "text" as const, text: result.result }],
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
      const result = await runClaude(prompt);
      return { content: [{ type: "text" as const, text: result.result }] };
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
      const result = await runClaude(prompt);
      return { content: [{ type: "text" as const, text: result.result }] };
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

  return server;
}

// Start when run directly (node, bun, or compiled binary)
const isMain =
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  (import.meta as unknown as Record<string, unknown>).main === true ||
  (typeof process !== "undefined" &&
    process.argv[1] &&
    (process.argv[1].endsWith("/claude/server.js") ||
      process.argv[1].endsWith("/claude/server.ts")));

if (isMain) {
  const useHttp =
    process.argv.includes("--http") || process.env["CLAUDE_MCP_HTTP"] === "1";
  const port = parseInt(
    process.env["CLAUDE_MCP_HTTP_PORT"] ?? String(PORTS.claude),
    10,
  );

  if (useHttp) {
    startHttpServer(createClaudeServer, port).catch((err: unknown) => {
      console.error("Failed to start Claude MCP HTTP server:", err);
      process.exit(1);
    });
  } else {
    const server = createClaudeServer();
    startServer(server).catch((err: unknown) => {
      console.error("Failed to start Claude MCP server:", err);
      process.exit(1);
    });
  }
}
