import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

// Mock child_process before importing the module under test
vi.mock("node:child_process", () => ({
  spawn: vi.fn(),
}));

import { PassThrough } from "node:stream";
import type { ChildProcess } from "node:child_process";
const { spawn } = await import("node:child_process");
const { createCodexServer } = await import("../server.js");

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

describe("Codex MCP Server", () => {
  let client: Client;
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    vi.clearAllMocks();

    const server = createCodexServer();
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

  it("registers codex, code_review, codex_reply, review, and PR tools", async () => {
    const { tools } = await client.listTools();
    const toolNames = tools.map((t) => t.name);

    expect(toolNames).toContain("codex");
    expect(toolNames).toContain("code_review");
    expect(toolNames).toContain("codex_reply");
    expect(toolNames).toContain("review");
    expect(toolNames).toContain("open_pr_gh");
    expect(toolNames).toContain("review_pr_gh");
    expect(toolNames).toContain("open_pr_ado");
    expect(toolNames).toContain("review_pr_ado");
    expect(tools).toHaveLength(26);
  });

  describe("codex tool", () => {
    it("has prompt input schema", async () => {
      const { tools } = await client.listTools();
      const codexTool = tools.find((t) => t.name === "codex");

      expect(codexTool).toBeDefined();
      expect(codexTool!.inputSchema.properties).toHaveProperty("prompt");
      expect(codexTool!.inputSchema.required).toContain("prompt");
    });

    it("calls codex CLI and returns text response", async () => {
      vi.mocked(spawn).mockReturnValue(
        createMockProcess("Hello from Codex!"),
      );

      const result = await client.callTool({
        name: "codex",
        arguments: { prompt: "say hello" },
      });

      expect(spawn).toHaveBeenCalledWith(
        "codex",
        ["exec", "--skip-git-repo-check"],
        expect.objectContaining({ stdio: ["pipe", "pipe", "pipe"] }),
      );

      const textContent = result.content as Array<{ type: string; text: string }>;
      expect(textContent[0]!.text).toBe("Hello from Codex!");
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

    it("returns structured JSON when codex produces valid review JSON", async () => {
      const reviewJson = JSON.stringify({
        verdict: "NEEDS_REVISION",
        issues: [
          {
            severity: "major",
            description: "Missing null check",
            recommendation: "Add guard clause",
          },
        ],
        suggestions: ["Add unit tests"],
      });

      vi.mocked(spawn).mockReturnValue(createMockProcess(reviewJson));

      const result = await client.callTool({
        name: "code_review",
        arguments: { diff: "--- a/f.ts\n+++ b/f.ts\n@@ -1 +1 @@\n-old\n+new" },
      });

      const textContent = result.content as Array<{ type: string; text: string }>;
      const parsed = JSON.parse(textContent[0]!.text);
      expect(parsed.verdict).toBe("NEEDS_REVISION");
      expect(parsed.issues).toHaveLength(1);
      expect(parsed.issues[0].severity).toBe("major");
    });

    it("returns raw text when codex produces non-JSON output", async () => {
      vi.mocked(spawn).mockReturnValue(
        createMockProcess("This code looks fine, no issues found."),
      );

      const result = await client.callTool({
        name: "code_review",
        arguments: { diff: "+const x = 1;", context: "Simple assignment" },
      });

      const textContent = result.content as Array<{ type: string; text: string }>;
      expect(textContent[0]!.text).toBe(
        "This code looks fine, no issues found.",
      );
    });
  });

  describe("codex_reply tool", () => {
    it("has conversation_id and reply input schema", async () => {
      const { tools } = await client.listTools();
      const replyTool = tools.find((t) => t.name === "codex_reply");

      expect(replyTool).toBeDefined();
      expect(replyTool!.inputSchema.properties).toHaveProperty(
        "conversation_id",
      );
      expect(replyTool!.inputSchema.properties).toHaveProperty("reply");
    });

    it("sends reply with conversation context", async () => {
      vi.mocked(spawn).mockReturnValue(
        createMockProcess("Follow-up response"),
      );

      const result = await client.callTool({
        name: "codex_reply",
        arguments: { conversation_id: "conv-123", reply: "explain more" },
      });

      expect(spawn).toHaveBeenCalledWith(
        "codex",
        ["exec", "--skip-git-repo-check"],
        expect.objectContaining({ stdio: ["pipe", "pipe", "pipe"] }),
      );

      const textContent = result.content as Array<{ type: string; text: string }>;
      expect(textContent[0]!.text).toBe("Follow-up response");
    });
  });
});
