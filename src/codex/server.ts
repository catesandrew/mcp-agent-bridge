import { z } from "zod";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { createServer, startServer } from "../shared/server-factory.js";
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
    const proc = spawn("codex", ["exec"], {
      stdio: ["pipe", "pipe", "pipe"],
    });

    proc.stdin.write(prompt);
    proc.stdin.end();

    let stdout = "";
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

    proc.on("close", (code: number | null) => {
      if (settled) return;
      settled = true;

      if (code !== 0) {
        reject(new Error(`codex exited with code ${code ?? "null"}`));
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
