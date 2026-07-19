/**
 * Outcome of a structured code review -- either approved or requiring changes.
 */
export type ReviewVerdict = "APPROVED" | "NEEDS_REVISION";

/**
 * Severity level for an issue found during review.
 * - `"critical"` -- must be fixed before merge
 * - `"major"` -- should be fixed
 * - `"minor"` -- at the author's discretion
 */
export type ReviewIssueSeverity = "critical" | "major" | "minor";

/**
 * A single issue identified during a structured code review.
 */
export interface ReviewIssue {
  /** How urgent the issue is. */
  severity: ReviewIssueSeverity;
  /** What the issue is. */
  description: string;
  /** Suggested fix or approach. */
  recommendation: string;
}

/**
 * Structured output from a Claude code review, returned by {@link runClaudeReview}.
 *
 * @example
 * ```ts
 * const result: ReviewResult = {
 *   verdict: "NEEDS_REVISION",
 *   issues: [{ severity: "major", description: "Missing null check", recommendation: "Add guard" }],
 *   suggestions: ["Consider adding a test"],
 * };
 * ```
 */
export interface ReviewResult {
  /** Whether the reviewed code is approved or needs changes. */
  verdict: ReviewVerdict;
  /** Concrete issues found, ordered by severity. */
  issues: ReviewIssue[];
  /** Optional improvement ideas that are not blocking. */
  suggestions: string[];
}

/**
 * Options for spawning a `claude -p` child process.
 *
 * Every field is optional; defaults are derived from environment variables
 * prefixed with `CLAUDE_REVIEW_*` (see {@link runClaude}).
 */
export interface ClaudeRunnerOptions {
  /**
   * Claude model to use (e.g. `"opus"`, `"sonnet"`).
   * @defaultValue `process.env.CLAUDE_REVIEW_MODEL`
   */
  model?: string;
  /**
   * Maximum number of agentic turns the CLI may take.
   * @defaultValue `process.env.CLAUDE_REVIEW_MAX_TURNS`
   */
  maxTurns?: number;
  /**
   * Working directory for the spawned process.
   * Validated against `CLAUDE_ALLOWED_CWD_ROOTS` when passed via MCP tools.
   * @defaultValue `process.env.CLAUDE_REVIEW_CWD`
   */
  cwd?: string;
  /**
   * Explicit tool allowlist passed to `--allowedTools`.
   * When omitted, defaults to read-only tools (`Read`, `Grep`, `Glob`, `LS`).
   * @defaultValue `process.env.CLAUDE_REVIEW_ALLOWED_TOOLS` (comma-separated)
   */
  allowedTools?: string[];
  /**
   * Session ID for continuing a previous conversation via `--resume`.
   */
  sessionId?: string;
}

/**
 * Raw JSON envelope returned by `claude -p --output-format json`.
 *
 * The {@link result} field contains the model's text output, which may itself
 * be JSON when `--json-schema` is used.
 */
export interface ClaudeJsonOutput {
  type: string;
  subtype: string;
  cost_usd: number;
  is_error: boolean;
  duration_ms: number;
  duration_api_ms: number;
  num_turns: number;
  /** The model's text response. Empty when `--json-schema` is used. */
  result: string;
  /** Opaque session identifier for use with `--resume`. */
  session_id: string;
  /**
   * Structured output when `--json-schema` constrains the response.
   * Present instead of `result` for schema-constrained calls.
   */
  structured_output?: unknown;
}

/**
 * Configuration for creating an MCP server via {@link createServer}.
 */
export interface ServerConfig {
  /** Human-readable server name advertised during MCP handshake. */
  name: string;
  /** Semver version string advertised during MCP handshake. */
  version: string;
  /** Short description of the server's purpose. */
  description?: string;
  /** Usage instructions sent to connecting clients. */
  instructions?: string;
}

/**
 * JSON Schema definition for the {@link ReviewResult} type, passed to
 * `claude -p --json-schema` to constrain the model's output format.
 */
export const REVIEW_JSON_SCHEMA = {
  type: "object" as const,
  properties: {
    verdict: { type: "string" as const, enum: ["APPROVED", "NEEDS_REVISION"] },
    issues: {
      type: "array" as const,
      items: {
        type: "object" as const,
        properties: {
          severity: { type: "string" as const, enum: ["critical", "major", "minor"] },
          description: { type: "string" as const },
          recommendation: { type: "string" as const },
        },
        required: ["severity", "description", "recommendation"],
      },
    },
    suggestions: {
      type: "array" as const,
      items: { type: "string" as const },
    },
  },
  required: ["verdict", "issues", "suggestions"],
} as const;

/**
 * The 5 verdicts `quick_analysis` picks exactly one from when triaging a
 * stale PR review. See docs/superpowers/specs in pr-bot for the taxonomy
 * definitions (ALREADY_RESOLVED, SAFE_TO_MERGE, NEEDS_WORK, NUDGE_AUTHOR,
 * STILL_RELEVANT).
 */
export interface QuickAnalysisResult {
  verdict:
    | "ALREADY_RESOLVED"
    | "SAFE_TO_MERGE"
    | "NEEDS_WORK"
    | "NUDGE_AUTHOR"
    | "STILL_RELEVANT";
  reason: string;
}

/**
 * JSON Schema for {@link QuickAnalysisResult}, passed to
 * `claude -p --json-schema` to constrain quick_analysis output.
 */
export const QUICK_ANALYSIS_JSON_SCHEMA = {
  type: "object" as const,
  properties: {
    verdict: {
      type: "string" as const,
      enum: [
        "ALREADY_RESOLVED",
        "SAFE_TO_MERGE",
        "NEEDS_WORK",
        "NUDGE_AUTHOR",
        "STILL_RELEVANT",
      ],
    },
    reason: { type: "string" as const },
  },
  required: ["verdict", "reason"],
};

/**
 * A single action Claude proposes in response to a chat turn. The caller
 * (e.g. pr-bot's agent chat) decides whether to execute it — this bridge
 * never invokes tools itself, it only asks the model to describe one.
 */
export interface ChatToolCall {
  /** Name of the tool being proposed, from the set the caller described in its prompt. */
  name: string;
  /** Arguments for the proposed tool call. */
  arguments: Record<string, unknown>;
  /** Why the model is proposing this action. */
  reason: string;
}

/**
 * Structured output from a Claude chat turn, returned by {@link runClaudeChat}.
 * The caller is responsible for assembling conversation history, resource
 * context, and available tool descriptions into the prompt string — this
 * bridge has no notion of multi-turn state or tool execution itself.
 */
export interface ChatResult {
  /** The assistant's text reply to show the user. */
  reply: string;
  /** Zero or more proposed tool calls awaiting the caller's confirmation. */
  toolCalls: ChatToolCall[];
}

/**
 * JSON Schema for {@link ChatResult}, passed to `claude -p --json-schema`
 * to constrain agent-chat output to a reply plus optional tool proposals.
 */
export const CHAT_JSON_SCHEMA = {
  type: "object" as const,
  properties: {
    reply: { type: "string" as const },
    toolCalls: {
      type: "array" as const,
      items: {
        type: "object" as const,
        properties: {
          name: { type: "string" as const },
          arguments: { type: "object" as const },
          reason: { type: "string" as const },
        },
        required: ["name", "arguments", "reason"],
      },
    },
  },
  required: ["reply", "toolCalls"],
} as const;

/**
 * Default HTTP ports for each MCP proxy, used by LaunchAgent scripts.
 *
 * Override per-server via environment variables:
 * `CLAUDE_MCP_HTTP_PORT`, `CODEX_MCP_HTTP_PORT`, `COPILOT_MCP_HTTP_PORT`.
 */
export const PORTS = {
  claude: 8940,
  codex: 8941,
  copilot: 8945,
} as const;
