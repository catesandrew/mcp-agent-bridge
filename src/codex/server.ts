import { z } from "zod";
import { spawn } from "node:child_process";
import { createServer, startServer } from "../shared/server-factory.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

/** Parsed output from a `codex --quiet` invocation. */
interface CodexResult {
  /** Trimmed stdout from the Codex CLI. */
  text: string;
  /** Reserved for future session-based continuation. */
  conversationId?: string;
}

async function runCodex(prompt: string): Promise<CodexResult> {
  return new Promise<CodexResult>((resolve, reject) => {
    const proc = spawn("codex", ["--quiet", prompt], {
      stdio: ["pipe", "pipe", "pipe"],
    });

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
  typeof process !== "undefined" &&
  process.argv[1] &&
  (process.argv[1].endsWith("/codex/server.js") ||
    process.argv[1].endsWith("/codex/server.ts"));

if (isMain) {
  const server = createCodexServer();
  startServer(server).catch((err: unknown) => {
    console.error("Failed to start Codex MCP server:", err);
    process.exit(1);
  });
}
