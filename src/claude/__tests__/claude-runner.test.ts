import { describe, it, expect, vi, beforeEach } from "vitest";
import { PassThrough } from "node:stream";
import type { ChildProcess } from "node:child_process";
import type { ClaudeJsonOutput, ReviewResult } from "../../shared/types.js";

// Mock child_process before importing the module under test
vi.mock("node:child_process", () => ({
  spawn: vi.fn(),
}));

// Import after mocking
const { spawn } = await import("node:child_process");
const { runClaude, runClaudeReview, runQuickAnalysis, runClaudeChat } = await import("../claude-runner.js");

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

  // Write output then end stdout, then emit close after stdout drains
  process.nextTick(() => {
    stdout.write(output);
    stdout.end();
    stderr.end();
    // Emit close after streams have flushed
    setTimeout(() => proc.emit("close", exitCode, null), 5);
  });

  return proc;
}

describe("runClaude", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("spawns claude with correct default arguments", async () => {
    const mockOutput: ClaudeJsonOutput = {
      type: "result",
      subtype: "success",
      cost_usd: 0.01,
      is_error: false,
      duration_ms: 1000,
      duration_api_ms: 900,
      num_turns: 1,
      result: "Hello world",
      session_id: "sess-123",
    };

    vi.mocked(spawn).mockReturnValue(
      createMockProcess(JSON.stringify(mockOutput)),
    );

    const result = await runClaude("test prompt");

    expect(spawn).toHaveBeenCalledWith(
      "claude",
      expect.arrayContaining([
        "-p",
        "--output-format",
        "json",
        "--verbose",
      ]),
      expect.objectContaining({
        stdio: ["pipe", "pipe", "pipe"],
      }),
    );

    expect(result.result).toBe("Hello world");
    expect(result.session_id).toBe("sess-123");
  });

  it("passes custom model via --model flag", async () => {
    const mockOutput: ClaudeJsonOutput = {
      type: "result",
      subtype: "success",
      cost_usd: 0.01,
      is_error: false,
      duration_ms: 1000,
      duration_api_ms: 900,
      num_turns: 1,
      result: "test",
      session_id: "sess-123",
    };

    vi.mocked(spawn).mockReturnValue(
      createMockProcess(JSON.stringify(mockOutput)),
    );

    await runClaude("test prompt", { model: "sonnet" });

    const args = vi.mocked(spawn).mock.calls[0]![1] as string[];
    expect(args).toContain("--model");
    expect(args[args.indexOf("--model") + 1]).toBe("sonnet");
  });

  it("passes --max-turns flag", async () => {
    const mockOutput: ClaudeJsonOutput = {
      type: "result",
      subtype: "success",
      cost_usd: 0.01,
      is_error: false,
      duration_ms: 1000,
      duration_api_ms: 900,
      num_turns: 1,
      result: "test",
      session_id: "sess-123",
    };

    vi.mocked(spawn).mockReturnValue(
      createMockProcess(JSON.stringify(mockOutput)),
    );

    await runClaude("test prompt", { maxTurns: 5 });

    const args = vi.mocked(spawn).mock.calls[0]![1] as string[];
    expect(args).toContain("--max-turns");
    expect(args[args.indexOf("--max-turns") + 1]).toBe("5");
  });

  it("passes --resume flag with sessionId", async () => {
    const mockOutput: ClaudeJsonOutput = {
      type: "result",
      subtype: "success",
      cost_usd: 0.01,
      is_error: false,
      duration_ms: 1000,
      duration_api_ms: 900,
      num_turns: 1,
      result: "test",
      session_id: "sess-456",
    };

    vi.mocked(spawn).mockReturnValue(
      createMockProcess(JSON.stringify(mockOutput)),
    );

    await runClaude("test prompt", { sessionId: "sess-456" });

    const args = vi.mocked(spawn).mock.calls[0]![1] as string[];
    expect(args).toContain("--resume");
    expect(args[args.indexOf("--resume") + 1]).toBe("sess-456");
  });

  it("uses cwd option for spawn", async () => {
    const mockOutput: ClaudeJsonOutput = {
      type: "result",
      subtype: "success",
      cost_usd: 0.01,
      is_error: false,
      duration_ms: 1000,
      duration_api_ms: 900,
      num_turns: 1,
      result: "test",
      session_id: "sess-123",
    };

    vi.mocked(spawn).mockReturnValue(
      createMockProcess(JSON.stringify(mockOutput)),
    );

    await runClaude("test prompt", { cwd: "/some/path" });

    expect(spawn).toHaveBeenCalledWith(
      "claude",
      expect.any(Array),
      expect.objectContaining({ cwd: "/some/path" }),
    );
  });

  it("handles array output format from --verbose", async () => {
    const arrayOutput = [
      { type: "system", subtype: "init", session_id: "sess-arr" },
      { type: "assistant", message: { content: [{ type: "text", text: "hi" }] } },
      {
        type: "result",
        subtype: "success",
        cost_usd: 0.01,
        is_error: false,
        duration_ms: 500,
        duration_api_ms: 400,
        num_turns: 1,
        result: "Array response",
        session_id: "sess-arr",
      },
    ];

    vi.mocked(spawn).mockReturnValue(
      createMockProcess(JSON.stringify(arrayOutput)),
    );

    const result = await runClaude("test prompt");

    expect(result.result).toBe("Array response");
    expect(result.session_id).toBe("sess-arr");
  });

  it("rejects on non-zero exit code", async () => {
    vi.mocked(spawn).mockReturnValue(
      createMockProcess("", 1),
    );

    await expect(runClaude("test prompt")).rejects.toThrow(
      /exited with code 1/,
    );
  });

  it("rejects on invalid JSON output", async () => {
    vi.mocked(spawn).mockReturnValue(
      createMockProcess("not valid json"),
    );

    await expect(runClaude("test prompt")).rejects.toThrow();
  });

  it("passes --permission-mode dontAsk", async () => {
    const mockOutput: ClaudeJsonOutput = {
      type: "result",
      subtype: "success",
      cost_usd: 0.01,
      is_error: false,
      duration_ms: 1000,
      duration_api_ms: 900,
      num_turns: 1,
      result: "test",
      session_id: "sess-123",
    };

    vi.mocked(spawn).mockReturnValue(
      createMockProcess(JSON.stringify(mockOutput)),
    );

    await runClaude("test prompt");

    const args = vi.mocked(spawn).mock.calls[0]![1] as string[];
    expect(args).toContain("--permission-mode");
    expect(args[args.indexOf("--permission-mode") + 1]).toBe("dontAsk");
  });

  it("passes --allowedTools when specified", async () => {
    const mockOutput: ClaudeJsonOutput = {
      type: "result",
      subtype: "success",
      cost_usd: 0.01,
      is_error: false,
      duration_ms: 1000,
      duration_api_ms: 900,
      num_turns: 1,
      result: "test",
      session_id: "sess-123",
    };

    vi.mocked(spawn).mockReturnValue(
      createMockProcess(JSON.stringify(mockOutput)),
    );

    await runClaude("test prompt", {
      allowedTools: ["Read", "Grep", "Glob"],
    });

    const args = vi.mocked(spawn).mock.calls[0]![1] as string[];
    expect(args).toContain("--allowedTools");
    expect(args[args.indexOf("--allowedTools") + 1]).toBe("Read,Grep,Glob");
  });
});

describe("runClaudeReview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("passes --output-format json and --json-schema flag", async () => {
    const reviewResult: ReviewResult = {
      verdict: "APPROVED",
      issues: [],
      suggestions: ["Looks good"],
    };

    const mockOutput: ClaudeJsonOutput = {
      type: "result",
      subtype: "success",
      cost_usd: 0.05,
      is_error: false,
      duration_ms: 5000,
      duration_api_ms: 4500,
      num_turns: 3,
      result: JSON.stringify(reviewResult),
      session_id: "sess-review",
    };

    vi.mocked(spawn).mockReturnValue(
      createMockProcess(JSON.stringify(mockOutput)),
    );

    const result = await runClaudeReview("review this code");

    const args = vi.mocked(spawn).mock.calls[0]![1] as string[];
    expect(args).toContain("--output-format");
    expect(args).toContain("json");
    expect(args).toContain("--json-schema");

    expect(result.verdict).toBe("APPROVED");
    expect(result.issues).toEqual([]);
    expect(result.suggestions).toEqual(["Looks good"]);
  });

  it("returns parsed ReviewResult with issues", async () => {
    const reviewResult: ReviewResult = {
      verdict: "NEEDS_REVISION",
      issues: [
        {
          severity: "critical",
          description: "SQL injection vulnerability",
          recommendation: "Use parameterized queries",
        },
      ],
      suggestions: ["Add input validation"],
    };

    const mockOutput: ClaudeJsonOutput = {
      type: "result",
      subtype: "success",
      cost_usd: 0.05,
      is_error: false,
      duration_ms: 5000,
      duration_api_ms: 4500,
      num_turns: 3,
      result: JSON.stringify(reviewResult),
      session_id: "sess-review-2",
    };

    vi.mocked(spawn).mockReturnValue(
      createMockProcess(JSON.stringify(mockOutput)),
    );

    const result = await runClaudeReview("review this code");

    expect(result.verdict).toBe("NEEDS_REVISION");
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]!.severity).toBe("critical");
  });
});

describe("runQuickAnalysis", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("passes --json-schema and returns the parsed verdict/reason", async () => {
    const analysis = { verdict: "NUDGE_AUTHOR", reason: "Waiting on the author's response." };

    const mockOutput: ClaudeJsonOutput = {
      type: "result",
      subtype: "success",
      cost_usd: 0.01,
      is_error: false,
      duration_ms: 2000,
      duration_api_ms: 1800,
      num_turns: 1,
      result: JSON.stringify(analysis),
      session_id: "sess-quick",
    };

    vi.mocked(spawn).mockReturnValue(
      createMockProcess(JSON.stringify(mockOutput)),
    );

    const result = await runQuickAnalysis("this PR has been quiet for 9 days");

    const args = vi.mocked(spawn).mock.calls[0]![1] as string[];
    expect(args).toContain("--json-schema");

    expect(result.verdict).toBe("NUDGE_AUTHOR");
    expect(result.reason).toBe("Waiting on the author's response.");
  });

  it("rejects when the model's output is missing verdict or reason", async () => {
    const mockOutput: ClaudeJsonOutput = {
      type: "result",
      subtype: "success",
      cost_usd: 0.01,
      is_error: false,
      duration_ms: 2000,
      duration_api_ms: 1800,
      num_turns: 1,
      result: JSON.stringify({ verdict: "NUDGE_AUTHOR" }),
      session_id: "sess-quick-2",
    };

    vi.mocked(spawn).mockReturnValue(
      createMockProcess(JSON.stringify(mockOutput)),
    );

    await expect(runQuickAnalysis("prompt")).rejects.toThrow(
      /missing required fields/,
    );
  });
});

describe("runClaudeChat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("passes --json-schema and returns a reply with an empty toolCalls array", async () => {
    const chat = { reply: "This PR looks safe to merge.", toolCalls: [] };

    const mockOutput: ClaudeJsonOutput = {
      type: "result",
      subtype: "success",
      cost_usd: 0.01,
      is_error: false,
      duration_ms: 1500,
      duration_api_ms: 1400,
      num_turns: 1,
      result: JSON.stringify(chat),
      session_id: "sess-chat",
    };

    vi.mocked(spawn).mockReturnValue(
      createMockProcess(JSON.stringify(mockOutput)),
    );

    const result = await runClaudeChat("User: is this PR safe to merge?");

    const args = vi.mocked(spawn).mock.calls[0]![1] as string[];
    expect(args).toContain("--json-schema");

    expect(result.reply).toBe("This PR looks safe to merge.");
    expect(result.toolCalls).toEqual([]);
  });

  it("returns proposed tool calls when present", async () => {
    const chat = {
      reply: "I'll approve this signal.",
      toolCalls: [
        { name: "approve_signal", arguments: { id: "sig-1" }, reason: "User asked to approve it." },
      ],
    };

    const mockOutput: ClaudeJsonOutput = {
      type: "result",
      subtype: "success",
      cost_usd: 0.01,
      is_error: false,
      duration_ms: 1500,
      duration_api_ms: 1400,
      num_turns: 1,
      result: JSON.stringify(chat),
      session_id: "sess-chat-2",
    };

    vi.mocked(spawn).mockReturnValue(
      createMockProcess(JSON.stringify(mockOutput)),
    );

    const result = await runClaudeChat("User: approve signal sig-1");

    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0]!.name).toBe("approve_signal");
  });

  it("rejects when the model's output is missing reply or toolCalls", async () => {
    const mockOutput: ClaudeJsonOutput = {
      type: "result",
      subtype: "success",
      cost_usd: 0.01,
      is_error: false,
      duration_ms: 1500,
      duration_api_ms: 1400,
      num_turns: 1,
      result: JSON.stringify({ reply: "missing toolCalls field" }),
      session_id: "sess-chat-3",
    };

    vi.mocked(spawn).mockReturnValue(
      createMockProcess(JSON.stringify(mockOutput)),
    );

    await expect(runClaudeChat("prompt")).rejects.toThrow(
      /missing required fields/,
    );
  });
});
