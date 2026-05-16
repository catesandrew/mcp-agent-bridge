import { z } from "zod";
import { createServer, startServer } from "../shared/server-factory.js";
import { runClaude, runClaudeReview, validateCwd } from "./claude-runner.js";
import { buildCoverLetterPrompt } from "../shared/cover-letter-skill.js";
import { buildCreativePortfolioResumePrompt } from "../shared/creative-portfolio-resume-skill.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ReviewResult } from "../shared/types.js";

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
      },
    },
    async ({ content, context }) => {
      const prompt = context ? `Context: ${context}\n\n${content}` : content;

      const review: ReviewResult = await runClaudeReview(prompt);

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
  const server = createClaudeServer();
  startServer(server).catch((err: unknown) => {
    console.error("Failed to start Claude MCP server:", err);
    process.exit(1);
  });
}
