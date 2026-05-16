import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

vi.mock("node:child_process", () => ({
  spawn: vi.fn(),
}));

import { PassThrough } from "node:stream";
import type { ChildProcess } from "node:child_process";
const { spawn } = await import("node:child_process");
const { createCopilotServer } = await import("../server.js");

function createMockProcess(output: string, exitCode = 0): ChildProcess {
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  const stdin = new PassThrough();

  const proc = Object.assign(new PassThrough(), {
    stdout,
    stderr,
    stdin,
    pid: 12345,
    killed: false,
    connected: false,
    exitCode: null as number | null,
    signalCode: null as NodeJS.Signals | null,
    spawnargs: [] as string[],
    spawnfile: "",
    kill: vi.fn().mockReturnValue(true),
    send: vi.fn().mockReturnValue(true),
    disconnect: vi.fn(),
    ref: vi.fn(),
    unref: vi.fn(),
    [Symbol.dispose]: vi.fn(),
  }) as unknown as ChildProcess;

  process.nextTick(() => {
    stdout.write(output);
    stdout.end();
    stderr.end();
    setTimeout(() => proc.emit("close", exitCode, null), 5);
  });

  return proc;
}

/** Build a JSONL stream mimicking copilot --output-format json */
function buildCopilotJsonl(content: string): string {
  return [
    JSON.stringify({ type: "session.mcp_servers_loaded", data: {} }),
    JSON.stringify({ type: "user.message", data: { content: "test" } }),
    JSON.stringify({
      type: "assistant.message",
      data: { messageId: "msg-1", content, toolRequests: [] },
    }),
    JSON.stringify({ type: "result", sessionId: "sess-1", exitCode: 0 }),
  ].join("\n");
}

describe("Copilot MCP Server", () => {
  let client: Client;
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    vi.clearAllMocks();

    const server = createCopilotServer();
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();

    await server.connect(serverTransport);

    client = new Client({ name: "test-client", version: "1.0.0" });
    await client.connect(clientTransport);

    cleanup = async () => {
      await client.close();
      await server.close();
    };
  });

  afterEach(async () => {
    await cleanup();
  });

  it("registers ask and code_review tools", async () => {
    const { tools } = await client.listTools();
    const toolNames = tools.map((t) => t.name);

    expect(toolNames).toContain("ask");
    expect(toolNames).toContain("code_review");
    expect(toolNames).toContain("cover_letter_generator");
    expect(tools).toHaveLength(3);
  });

  describe("ask tool", () => {
    it("has question input schema", async () => {
      const { tools } = await client.listTools();
      const askTool = tools.find((t) => t.name === "ask");

      expect(askTool).toBeDefined();
      expect(askTool!.inputSchema.properties).toHaveProperty("question");
      expect(askTool!.inputSchema.required).toContain("question");
    });

    it("calls copilot -p and returns text response", async () => {
      vi.mocked(spawn).mockReturnValue(
        createMockProcess(buildCopilotJsonl("Hello from Copilot!")),
      );

      const result = await client.callTool({
        name: "ask",
        arguments: { question: "say hello" },
      });

      expect(spawn).toHaveBeenCalledWith(
        "copilot",
        ["-p", "say hello", "--output-format", "json"],
        expect.objectContaining({ stdio: ["pipe", "pipe", "pipe"] }),
      );

      const textContent = result.content as Array<{ type: string; text: string }>;
      expect(textContent[0]!.text).toBe("Hello from Copilot!");
    });
  });

  describe("code_review tool", () => {
    it("has diff and context input schema", async () => {
      const { tools } = await client.listTools();
      const crTool = tools.find((t) => t.name === "code_review");

      expect(crTool).toBeDefined();
      expect(crTool!.inputSchema.properties).toHaveProperty("diff");
      expect(crTool!.inputSchema.properties).toHaveProperty("context");
      expect(crTool!.inputSchema.required).toContain("diff");
    });

    it("returns structured JSON when copilot produces valid review JSON", async () => {
      const reviewJson = JSON.stringify({
        verdict: "APPROVED",
        issues: [],
        suggestions: ["Looks good"],
      });

      vi.mocked(spawn).mockReturnValue(
        createMockProcess(buildCopilotJsonl(reviewJson)),
      );

      const result = await client.callTool({
        name: "code_review",
        arguments: { diff: "+const x = 1;" },
      });

      const textContent = result.content as Array<{ type: string; text: string }>;
      const parsed = JSON.parse(textContent[0]!.text);
      expect(parsed.verdict).toBe("APPROVED");
    });

    it("returns raw text when copilot produces non-JSON output", async () => {
      vi.mocked(spawn).mockReturnValue(
        createMockProcess(buildCopilotJsonl("The code looks fine.")),
      );

      const result = await client.callTool({
        name: "code_review",
        arguments: { diff: "+const x = 1;", context: "Simple change" },
      });

      const textContent = result.content as Array<{ type: string; text: string }>;
      expect(textContent[0]!.text).toBe("The code looks fine.");
    });
  });
});
