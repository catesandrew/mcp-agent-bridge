import { z } from "zod";
import { spawn } from "node:child_process";
import { createServer, startServer } from "../shared/server-factory.js";
import { buildCoverLetterPrompt } from "../shared/cover-letter-skill.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

/** Parsed response from a `copilot -p` invocation. */
interface CopilotResult {
  text: string;
  exitCode: number;
}

/**
 * Extract the final assistant message content from Copilot JSONL output.
 *
 * Copilot `--output-format json` emits one JSON object per line (JSONL).
 * The last `assistant.message` entry with a non-empty `content` field
 * contains the final response.
 */
function parseCopilotOutput(stdout: string): string {
  const lines = stdout.trim().split("\n");
  let lastContent = "";

  for (const line of lines) {
    try {
      const event: unknown = JSON.parse(line);
      if (
        event &&
        typeof event === "object" &&
        "type" in event &&
        (event as Record<string, unknown>).type === "assistant.message" &&
        "data" in event
      ) {
        const data = (event as Record<string, unknown>).data;
        if (data && typeof data === "object" && "content" in data) {
          const content = (data as Record<string, unknown>).content;
          if (typeof content === "string" && content.length > 0) {
            lastContent = content;
          }
        }
      }
    } catch {
      // Skip non-JSON lines
    }
  }

  return lastContent;
}

async function runCopilot(prompt: string): Promise<CopilotResult> {
  return new Promise<CopilotResult>((resolve, reject) => {
    const args = ["-p", prompt, "--output-format", "json"];
    const model = process.env["COPILOT_REVIEW_MODEL"];
    if (model) args.push("--model", model);

    const proc = spawn("copilot", args, {
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let settled = false;

    proc.on("error", (err: Error) => {
      if (!settled) {
        settled = true;
        reject(new Error(`Failed to spawn copilot: ${err.message}`));
      }
    });

    proc.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });

    proc.on("close", (code: number | null) => {
      if (settled) return;
      settled = true;

      if (code !== 0) {
        reject(new Error(`copilot exited with code ${code ?? "null"}`));
        return;
      }

      const text = parseCopilotOutput(stdout);
      if (!text) {
        reject(new Error("No assistant response found in copilot output"));
        return;
      }

      resolve({ text, exitCode: code ?? 0 });
    });
  });
}

/**
 * Create the Copilot MCP bridge server with `ask` and `code_review` tools.
 *
 * Each tool spawns `copilot -p` with `--output-format json` and extracts
 * the assistant's response from the JSONL stream.
 *
 * @returns A configured {@link McpServer} ready to connect to a transport.
 */
export function createCopilotServer(): McpServer {
  const server = createServer({
    name: "copilot-mcp-bridge",
    version: "0.1.0",
    description:
      "Wraps GitHub Copilot CLI as MCP tools for questions and code review",
  });

  server.registerTool(
    "ask",
    {
      title: "Ask Copilot",
      description:
        "Ask GitHub Copilot a freeform question. Returns text.",
      inputSchema: {
        question: z.string().max(500_000).describe("The question to ask"),
      },
    },
    async ({ question }) => {
      const result = await runCopilot(question);
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
        "Send a git diff or code snippet to Copilot for review. Returns structured JSON when possible, raw text otherwise.",
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
      const reviewPrompt = `You are a code reviewer. Review the following and respond with ONLY valid JSON matching this exact schema (no markdown fencing, no extra text):
{"verdict": "APPROVED" or "NEEDS_REVISION", "issues": [{"severity": "critical" or "major" or "minor", "description": "...", "recommendation": "..."}], "suggestions": ["..."]}

${context ? `Context: ${context}\n\n` : ""}${diff}`;

      const result = await runCopilot(reviewPrompt);

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
        // Copilot doesn't support schema-constrained output
      }

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

      const result = await runCopilot(prompt);

      return {
        content: [{ type: "text" as const, text: result.text }],
      };
    },
  );

  return server;
}

const isMain =
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  (import.meta as unknown as Record<string, unknown>).main === true ||
  (typeof process !== "undefined" &&
    process.argv[1] &&
    (process.argv[1].endsWith("/copilot/server.js") ||
      process.argv[1].endsWith("/copilot/server.ts")));

if (isMain) {
  const server = createCopilotServer();
  startServer(server).catch((err: unknown) => {
    console.error("Failed to start Copilot MCP server:", err);
    process.exit(1);
  });
}
