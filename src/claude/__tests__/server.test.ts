import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { ReviewResult, FailureAnalysisResult } from "../../shared/types.js";

// Mock the claude-runner module
vi.mock("../claude-runner.js", () => ({
  runClaude: vi.fn(),
  runClaudeReview: vi.fn(),
  runClaudeStructured: vi.fn(),
  runQuickAnalysis: vi.fn(),
  runClaudeChat: vi.fn(),
  validateCwd: vi.fn((cwd: string | undefined) => cwd),
}));

const { runClaude, runClaudeReview, runClaudeStructured, runQuickAnalysis, runClaudeChat } = await import(
  "../claude-runner.js"
);
const { createClaudeServer } = await import("../server.js");

describe("Claude MCP Server", () => {
  let client: Client;
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    vi.clearAllMocks();

    const server = createClaudeServer();
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

  it("registers review, ask, and code_review tools", async () => {
    const { tools } = await client.listTools();
    const toolNames = tools.map((t) => t.name);

    expect(toolNames).toContain("review");
    expect(toolNames).toContain("ask");
    expect(toolNames).toContain("code_review");
    expect(toolNames).toContain("analyze_failure");
    expect(toolNames).toContain("quick_analysis");
    expect(toolNames).toContain("agent_chat");
    expect(toolNames).toContain("cover_letter_generator");
    expect(toolNames).toContain("creative_portfolio_resume");
    expect(toolNames).toContain("executive_resume_writer");
    expect(toolNames).toContain("interview_prep_generator");
    expect(toolNames).toContain("job_description_analyzer");
    expect(toolNames).toContain("linkedin_profile_optimizer");
    expect(toolNames).toContain("portfolio_case_study_writer");
    expect(toolNames).toContain("reference_list_builder");
    expect(toolNames).toContain("resume_ats_optimizer");
    expect(toolNames).toContain("resume_bullet_writer");
    expect(toolNames).toContain("resume_formatter");
    expect(toolNames).toContain("resume_quantifier");
    expect(toolNames).toContain("resume_section_builder");
    expect(toolNames).toContain("resume_tailor");
    expect(toolNames).toContain("resume_version_manager");
    expect(toolNames).toContain("tech_resume_optimizer");
    expect(toolNames).toContain("career_fact_extractor");
    expect(toolNames).toContain("recruiter_first_screen_simulation");
    expect(toolNames).toContain("open_pr_gh");
    expect(toolNames).toContain("review_pr_gh");
    expect(toolNames).toContain("open_pr_ado");
    expect(toolNames).toContain("review_pr_ado");
    expect(tools).toHaveLength(28);
  });

  describe("review tool", () => {
    it("has correct input schema", async () => {
      const { tools } = await client.listTools();
      const reviewTool = tools.find((t) => t.name === "review");

      expect(reviewTool).toBeDefined();
      expect(reviewTool!.inputSchema.properties).toHaveProperty("content");
      expect(reviewTool!.inputSchema.properties).toHaveProperty("context");
      expect(reviewTool!.inputSchema.required).toContain("content");
    });

    it("calls runClaudeReview and returns structured result", async () => {
      const mockReview: ReviewResult = {
        verdict: "APPROVED",
        issues: [],
        suggestions: ["Code looks clean"],
      };

      vi.mocked(runClaudeReview).mockResolvedValue(mockReview);

      const result = await client.callTool({
        name: "review",
        arguments: {
          content: "function add(a, b) { return a + b; }",
          context: "Simple utility function",
        },
      });

      expect(runClaudeReview).toHaveBeenCalledOnce();
      expect(result.content).toBeDefined();

      const textContent = result.content as Array<{ type: string; text: string }>;
      const parsed = JSON.parse(textContent[0]!.text) as ReviewResult;
      expect(parsed.verdict).toBe("APPROVED");
    });
  });

  describe("analyze_failure tool", () => {
    it("has correct input schema", async () => {
      const { tools } = await client.listTools();
      const tool = tools.find((t) => t.name === "analyze_failure");

      expect(tool).toBeDefined();
      expect(tool!.inputSchema.properties).toHaveProperty("content");
      expect(tool!.inputSchema.required).toContain("content");
    });

    it("calls runClaudeStructured and returns findings JSON", async () => {
      const mockAnalysis: FailureAnalysisResult = {
        runSummary: {
          passed: 95,
          failed: 1,
          flaky: 9,
          skipped: 1,
          duration: "21.0m",
          release: "Release-8600",
          environment: "QA1 QAStatus",
        },
        findings: [
          {
            title: "Employment History step regressed",
            rootCause: "Progress bar shows Residential History instead of Employment History",
            confidence: "high",
            status: "new",
            matchedKnownArea: null,
            modelSuggestedConnection: null,
            affectedTests: [{ name: "homebankingFlowOAO.spec.ts:534", outcome: "failed" }],
            evidence: 'toHaveText expected "Employment History", received "Residential History"',
            suggestedAction: "Check the application-progress-bar step ordering",
          },
        ],
      };

      vi.mocked(runClaudeStructured).mockResolvedValue(mockAnalysis);

      const result = await client.callTool({
        name: "analyze_failure",
        arguments: { content: "Release: Release-8600\n..." },
      });

      expect(runClaudeStructured).toHaveBeenCalledOnce();

      const textContent = result.content as Array<{ type: string; text: string }>;
      const parsed = JSON.parse(textContent[0]!.text) as FailureAnalysisResult;
      expect(parsed.runSummary.release).toBe("Release-8600");
      expect(parsed.findings).toHaveLength(1);
      expect(parsed.findings[0]!.confidence).toBe("high");
    });
  });

  describe("ask tool", () => {
    it("has correct input schema", async () => {
      const { tools } = await client.listTools();
      const askTool = tools.find((t) => t.name === "ask");

      expect(askTool).toBeDefined();
      expect(askTool!.inputSchema.properties).toHaveProperty("question");
      expect(askTool!.inputSchema.required).toContain("question");
    });

    it("calls runClaude and returns text response", async () => {
      vi.mocked(runClaude).mockResolvedValue({
        type: "result",
        subtype: "success",
        cost_usd: 0.01,
        is_error: false,
        duration_ms: 1000,
        duration_api_ms: 900,
        num_turns: 1,
        result: "The function uses a recursive approach.",
        session_id: "sess-ask",
      });

      const result = await client.callTool({
        name: "ask",
        arguments: { question: "How does this function work?" },
      });

      expect(runClaude).toHaveBeenCalledOnce();

      const textContent = result.content as Array<{ type: string; text: string }>;
      expect(textContent[0]!.text).toBe(
        "The function uses a recursive approach.",
      );
    });
  });

  describe("code_review tool", () => {
    it("has correct input schema", async () => {
      const { tools } = await client.listTools();
      const crTool = tools.find((t) => t.name === "code_review");

      expect(crTool).toBeDefined();
      expect(crTool!.inputSchema.properties).toHaveProperty("diff");
    });

    it("calls runClaudeReview with diff content", async () => {
      const mockReview: ReviewResult = {
        verdict: "NEEDS_REVISION",
        issues: [
          {
            severity: "major",
            description: "Missing error handling",
            recommendation: "Add try/catch",
          },
        ],
        suggestions: [],
      };

      vi.mocked(runClaudeReview).mockResolvedValue(mockReview);

      const result = await client.callTool({
        name: "code_review",
        arguments: {
          diff: "--- a/file.ts\n+++ b/file.ts\n@@ -1 +1 @@\n-old\n+new",
        },
      });

      expect(runClaudeReview).toHaveBeenCalledOnce();

      const textContent = result.content as Array<{ type: string; text: string }>;
      const parsed = JSON.parse(textContent[0]!.text) as ReviewResult;
      expect(parsed.verdict).toBe("NEEDS_REVISION");
      expect(parsed.issues).toHaveLength(1);
    });
  });

  describe("quick_analysis tool", () => {
    it("has correct input schema", async () => {
      const { tools } = await client.listTools();
      const tool = tools.find((t) => t.name === "quick_analysis");

      expect(tool).toBeDefined();
      expect(tool!.inputSchema.properties).toHaveProperty("content");
      expect(tool!.inputSchema.required).toContain("content");
    });

    it("calls runQuickAnalysis and returns structured result", async () => {
      vi.mocked(runQuickAnalysis).mockResolvedValue({
        verdict: "SAFE_TO_MERGE",
        reason: "Approved and CI is green.",
      });

      const result = await client.callTool({
        name: "quick_analysis",
        arguments: {
          content: "This PR has been inactive for 9 days, approved, CI green.",
        },
      });

      expect(runQuickAnalysis).toHaveBeenCalledOnce();
      const textContent = result.content as Array<{ type: string; text: string }>;
      const parsed = JSON.parse(textContent[0]!.text) as { verdict: string; reason: string };
      expect(parsed.verdict).toBe("SAFE_TO_MERGE");
    });
  });

  describe("agent_chat tool", () => {
    it("has correct input schema", async () => {
      const { tools } = await client.listTools();
      const tool = tools.find((t) => t.name === "agent_chat");

      expect(tool).toBeDefined();
      expect(tool!.inputSchema.properties).toHaveProperty("prompt");
      expect(tool!.inputSchema.required).toContain("prompt");
    });

    it("calls runClaudeChat and returns a reply with no tool calls", async () => {
      vi.mocked(runClaudeChat).mockResolvedValue({
        reply: "This review has 2 open critical issues.",
        toolCalls: [],
      });

      const result = await client.callTool({
        name: "agent_chat",
        arguments: {
          prompt: "System: you are reviewing PR #123.\n\nUser: what's blocking this PR?",
        },
      });

      expect(runClaudeChat).toHaveBeenCalledOnce();
      const textContent = result.content as Array<{ type: string; text: string }>;
      const parsed = JSON.parse(textContent[0]!.text) as { reply: string; toolCalls: unknown[] };
      expect(parsed.reply).toBe("This review has 2 open critical issues.");
      expect(parsed.toolCalls).toEqual([]);
    });

    it("returns proposed tool calls when the model suggests an action", async () => {
      vi.mocked(runClaudeChat).mockResolvedValue({
        reply: "I can reject this signal for you — it's a duplicate.",
        toolCalls: [
          {
            name: "reject_signal",
            arguments: { id: "sig-1", reason: "duplicate of sig-2" },
            reason: "The user asked to clean up duplicate signals.",
          },
        ],
      });

      const result = await client.callTool({
        name: "agent_chat",
        arguments: { prompt: "User: reject the duplicate signal" },
      });

      const textContent = result.content as Array<{ type: string; text: string }>;
      const parsed = JSON.parse(textContent[0]!.text) as {
        toolCalls: Array<{ name: string; arguments: Record<string, unknown> }>;
      };
      expect(parsed.toolCalls).toHaveLength(1);
      expect(parsed.toolCalls[0]!.name).toBe("reject_signal");
    });
  });
});
