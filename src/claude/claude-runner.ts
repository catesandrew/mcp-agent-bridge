import { spawn } from "node:child_process";
import { resolve, normalize } from "node:path";
import type {
  ClaudeJsonOutput,
  ClaudeRunnerOptions,
  ReviewResult,
} from "../shared/types.js";
import { REVIEW_JSON_SCHEMA, QUICK_ANALYSIS_JSON_SCHEMA } from "../shared/types.js";
import type { QuickAnalysisResult } from "../shared/types.js";

const DEFAULT_ALLOWED_TOOLS = ["Read", "Grep", "Glob", "LS"];

const PROCESS_TIMEOUT_MS = parseInt(
  process.env["CLAUDE_REVIEW_TIMEOUT_MS"] ?? "300000",
  10,
);

const MAX_OUTPUT_BYTES = 10 * 1024 * 1024; // 10 MB

function getEnvConfig(): ClaudeRunnerOptions {
  return {
    model: process.env["CLAUDE_REVIEW_MODEL"],
    maxTurns: process.env["CLAUDE_REVIEW_MAX_TURNS"]
      ? (Number.isNaN(parseInt(process.env["CLAUDE_REVIEW_MAX_TURNS"], 10))
          ? undefined
          : parseInt(process.env["CLAUDE_REVIEW_MAX_TURNS"], 10))
      : undefined,
    cwd: process.env["CLAUDE_REVIEW_CWD"],
    allowedTools: process.env["CLAUDE_REVIEW_ALLOWED_TOOLS"]
      ? process.env["CLAUDE_REVIEW_ALLOWED_TOOLS"].split(",")
      : undefined,
  };
}

/**
 * Validate that a working directory path falls within the allowed roots.
 *
 * Allowed roots default to `process.cwd()` and can be extended via the
 * colon-separated `CLAUDE_ALLOWED_CWD_ROOTS` env var.
 *
 * @param cwd - Absolute or relative path to validate. `undefined` passes through.
 * @returns The resolved absolute path, or `undefined` if input was `undefined`.
 * @throws {Error} If the resolved path is outside every allowed root.
 *
 * @example
 * ```ts
 * validateCwd("/allowed/project");   // "/allowed/project"
 * validateCwd(undefined);            // undefined
 * validateCwd("/etc/shadow");        // throws Error
 * ```
 */
export function validateCwd(cwd: string | undefined): string | undefined {
  if (!cwd) return undefined;
  const resolved = resolve(normalize(cwd));
  const allowedRoots = (
    process.env["CLAUDE_ALLOWED_CWD_ROOTS"] ?? process.cwd()
  ).split(":");
  const isAllowed = allowedRoots.some((root) =>
    resolved.startsWith(resolve(root)),
  );
  if (!isAllowed) {
    throw new Error(`cwd "${cwd}" is outside allowed directories`);
  }
  return resolved;
}

/**
 * Extract the result entry from claude JSON output, which may be a single
 * object or an array of event objects (when --verbose is used).
 */
function extractResultEntry(parsed: unknown): ClaudeJsonOutput {
  // Array format: find the entry with type === "result"
  if (Array.isArray(parsed)) {
    const resultEntry = parsed.find(
      (entry: unknown) =>
        entry &&
        typeof entry === "object" &&
        "type" in entry &&
        (entry as Record<string, unknown>).type === "result",
    );
    if (
      !resultEntry ||
      typeof resultEntry !== "object" ||
      !("result" in resultEntry)
    ) {
      throw new Error(
        "No result entry found in claude output array",
      );
    }
    return resultEntry as ClaudeJsonOutput;
  }

  // Single object format
  if (
    parsed &&
    typeof parsed === "object" &&
    "result" in parsed &&
    "session_id" in parsed
  ) {
    return parsed as ClaudeJsonOutput;
  }

  throw new Error("Unexpected claude output structure");
}

/**
 * Build a clean process environment for spawning claude subprocesses.
 * - Strips ANTHROPIC_BASE_URL so automated claude -p calls hit Anthropic
 *   directly rather than routing through any interactive session proxy
 *   (e.g. headroom sets ANTHROPIC_BASE_URL=http://127.0.0.1:8787).
 * - Ensures ~/.local/bin is in PATH — the Claude Code CLI moved there in
 *   v2.1+ (previously /opt/homebrew/bin) and may be absent if this server
 *   was started with a minimal or stale PATH.
 */
function buildSpawnEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  delete env["ANTHROPIC_BASE_URL"];

  const home = env["HOME"] ?? "";
  const localBin = `${home}/.local/bin`;
  const pathParts = (env["PATH"] ?? "").split(":");
  if (home && !pathParts.includes(localBin)) {
    env["PATH"] = [localBin, ...pathParts].join(":");
  }

  return env;
}

function buildArgs(options: ClaudeRunnerOptions): string[] {
  const args: string[] = ["-p", "--output-format", "json", "--verbose"];

  const permissionMode =
    process.env["CLAUDE_REVIEW_PERMISSION_MODE"] ?? "dontAsk";
  args.push("--permission-mode", permissionMode);

  if (options.model) {
    args.push("--model", options.model);
  }

  if (options.maxTurns !== undefined) {
    args.push("--max-turns", String(options.maxTurns));
  }

  if (options.sessionId) {
    args.push("--resume", options.sessionId);
  }

  const tools =
    options.allowedTools && options.allowedTools.length > 0
      ? options.allowedTools
      : DEFAULT_ALLOWED_TOOLS;
  args.push("--allowedTools", tools.join(","));

  return args;
}

/**
 * Spawn `claude -p` with the given prompt and return the parsed JSON output.
 *
 * Options are merged over environment-based defaults (`CLAUDE_REVIEW_*`).
 * The process is killed after {@link PROCESS_TIMEOUT_MS} or if stdout exceeds
 * {@link MAX_OUTPUT_BYTES}.
 *
 * @param prompt - The prompt string passed as the final positional argument.
 * @param options - Override model, max turns, cwd, allowed tools, or session.
 * @returns Parsed {@link ClaudeJsonOutput} envelope from the CLI.
 * @throws {Error} On spawn failure, non-zero exit, timeout, output overflow,
 *   or malformed JSON.
 *
 * @example
 * ```ts
 * const out = await runClaude("Explain this function", { model: "sonnet" });
 * console.log(out.result);
 * ```
 */
export async function runClaude(
  prompt: string,
  options: ClaudeRunnerOptions = {},
): Promise<ClaudeJsonOutput> {
  const envConfig = getEnvConfig();
  const merged: ClaudeRunnerOptions = { ...envConfig, ...options };
  const args = buildArgs(merged);

  return new Promise<ClaudeJsonOutput>((resolve, reject) => {
    const proc = spawn("claude", args, {
      stdio: ["pipe", "pipe", "pipe"],
      cwd: merged.cwd,
      env: buildSpawnEnv(),
    });

    // Write prompt via stdin — claude -p reads from stdin when no positional arg
    proc.stdin.write(prompt);
    proc.stdin.end();

    let stdout = "";
    let stderr = "";
    let stdoutSize = 0;
    let settled = false;

    const settle = (fn: () => void): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn();
    };

    const timer = setTimeout(() => {
      settle(() => {
        proc.kill("SIGTERM");
        reject(new Error(`claude process timed out after ${PROCESS_TIMEOUT_MS}ms`));
      });
    }, PROCESS_TIMEOUT_MS);

    proc.on("error", (err: Error) => {
      settle(() => reject(new Error(`Failed to spawn claude: ${err.message}`)));
    });

    proc.stdout.on("data", (chunk: Buffer) => {
      stdoutSize += chunk.length;
      if (stdoutSize > MAX_OUTPUT_BYTES) {
        settle(() => {
          proc.kill("SIGTERM");
          reject(new Error("claude output exceeded maximum allowed size"));
        });
        return;
      }
      stdout += chunk.toString();
    });

    proc.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    proc.on("close", (code: number | null) => {
      settle(() => {
        if (code !== 0) {
          const detail = stderr.trim();
          reject(
            new Error(
              `claude exited with code ${code ?? "null"}${detail ? `: ${detail}` : ""}`,
            ),
          );
          return;
        }

        try {
          const parsed: unknown = JSON.parse(stdout);
          resolve(extractResultEntry(parsed));
        } catch (err) {
          reject(
            new Error(
              `Failed to parse claude output as JSON: ${err instanceof Error ? err.message : String(err)}`,
            ),
          );
        }
      });
    });
  });
}

function isReviewResult(value: unknown): value is ReviewResult {
  return (
    !!value &&
    typeof value === "object" &&
    "verdict" in value &&
    "issues" in value
  );
}

function isQuickAnalysisResult(value: unknown): value is QuickAnalysisResult {
  return (
    !!value &&
    typeof value === "object" &&
    "verdict" in value &&
    "reason" in value
  );
}

/**
 * Shared spawn + `--json-schema` + parse machinery for any `claude -p`
 * call that must return one specific JSON shape. `runClaudeReview` and
 * `runQuickAnalysis` are both thin wrappers around this with their own
 * schema and validator.
 */
function runClaudeStructured<T>(
  prompt: string,
  schema: object,
  validate: (value: unknown) => value is T,
  invalidMessage: string,
  options: ClaudeRunnerOptions = {},
): Promise<T> {
  const envConfig = getEnvConfig();
  const merged: ClaudeRunnerOptions = { ...envConfig, ...options };
  merged.model = merged.model ?? "opus";

  const schemaStr = JSON.stringify(schema);

  const reviewPrompt = `You are a code reviewer. Analyze the following and respond with a structured review.

${prompt}`;

  const args = buildArgs(merged);
  args.push("--json-schema", schemaStr);

  return new Promise<T>((resolve, reject) => {
    const proc = spawn("claude", args, {
      stdio: ["pipe", "pipe", "pipe"],
      cwd: merged.cwd,
      env: buildSpawnEnv(),
    });

    proc.stdin.write(reviewPrompt);
    proc.stdin.end();

    let stdout = "";
    let stderr = "";
    let stdoutSize = 0;
    let settled = false;

    const settle = (fn: () => void): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn();
    };

    const timer = setTimeout(() => {
      settle(() => {
        proc.kill("SIGTERM");
        reject(new Error(`claude review timed out after ${PROCESS_TIMEOUT_MS}ms`));
      });
    }, PROCESS_TIMEOUT_MS);

    proc.on("error", (err: Error) => {
      settle(() => reject(new Error(`Failed to spawn claude: ${err.message}`)));
    });

    proc.stdout.on("data", (chunk: Buffer) => {
      stdoutSize += chunk.length;
      if (stdoutSize > MAX_OUTPUT_BYTES) {
        settle(() => {
          proc.kill("SIGTERM");
          reject(new Error("claude review output exceeded maximum allowed size"));
        });
        return;
      }
      stdout += chunk.toString();
    });

    proc.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    proc.on("close", (code: number | null) => {
      settle(() => {
        if (code !== 0) {
          const detail = stderr.trim();
          reject(
            new Error(
              `claude review exited with code ${code ?? "null"}${detail ? `: ${detail}` : ""}`,
            ),
          );
          return;
        }

        try {
          const parsed: unknown = JSON.parse(stdout);
          const output = extractResultEntry(parsed);

          // --json-schema puts the result in structured_output, not result
          let value: unknown;
          if (output.structured_output !== undefined) {
            value = output.structured_output;
          } else if (output.result) {
            value = JSON.parse(output.result);
          } else {
            throw new Error("No review content in claude output");
          }

          if (!validate(value)) {
            throw new Error(invalidMessage);
          }
          resolve(value);
        } catch (err) {
          reject(
            new Error(
              `Failed to parse review output: ${err instanceof Error ? err.message : String(err)}`,
            ),
          );
        }
      });
    });
  });
}

export async function runClaudeReview(
  prompt: string,
  options: ClaudeRunnerOptions = {},
): Promise<ReviewResult> {
  return runClaudeStructured(
    prompt,
    REVIEW_JSON_SCHEMA,
    isReviewResult,
    "Review result missing required fields",
    options,
  );
}

/**
 * Run a lightweight, non-agentic triage over a stale PR review via
 * `claude -p --json-schema`, constrained to {@link QuickAnalysisResult}.
 * Unlike {@link runClaudeReview}, this does not re-read the diff — it is
 * meant to be cheap enough to run over dozens of PRs in one batch.
 *
 * @example
 * ```ts
 * const { verdict, reason } = await runQuickAnalysis("This PR has had no activity in 9 days...");
 * ```
 */
export async function runQuickAnalysis(
  prompt: string,
  options: ClaudeRunnerOptions = {},
): Promise<QuickAnalysisResult> {
  return runClaudeStructured(
    prompt,
    QUICK_ANALYSIS_JSON_SCHEMA,
    isQuickAnalysisResult,
    "Quick analysis result missing required fields",
    options,
  );
}
