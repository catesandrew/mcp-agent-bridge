import { spawn } from "node:child_process";
import { resolve, normalize } from "node:path";
import type {
  ClaudeJsonOutput,
  ClaudeRunnerOptions,
  ReviewResult,
} from "../shared/types.js";
import { REVIEW_JSON_SCHEMA } from "../shared/types.js";

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

function buildArgs(
  prompt: string,
  options: ClaudeRunnerOptions,
): string[] {
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

  args.push(prompt);

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
  const args = buildArgs(prompt, merged);

  return new Promise<ClaudeJsonOutput>((resolve, reject) => {
    const proc = spawn("claude", args, {
      stdio: ["pipe", "pipe", "pipe"],
      cwd: merged.cwd,
    });

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
          reject(new Error(`claude exited with code ${code ?? "null"}`));
          return;
        }

        try {
          const parsed: unknown = JSON.parse(stdout);
          if (
            !parsed ||
            typeof parsed !== "object" ||
            !("result" in parsed) ||
            !("session_id" in parsed)
          ) {
            throw new Error("Unexpected claude output structure");
          }
          resolve(parsed as ClaudeJsonOutput);
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

/**
 * Run a structured code review via `claude -p --json-schema`.
 *
 * Wraps the prompt in a reviewer system instruction and constrains the output
 * to the {@link ReviewResult} schema. The model defaults to `"opus"`.
 *
 * @param prompt - The content to review (code, plan, diff, etc.).
 * @param options - Override model, max turns, cwd, or allowed tools.
 * @returns Parsed {@link ReviewResult} with verdict, issues, and suggestions.
 * @throws {Error} On spawn failure, non-zero exit, timeout, output overflow,
 *   or if the response does not match the expected review structure.
 *
 * @example
 * ```ts
 * const review = await runClaudeReview("function add(a, b) { return a + b; }");
 * if (review.verdict === "APPROVED") console.log("Ship it!");
 * ```
 */
export async function runClaudeReview(
  prompt: string,
  options: ClaudeRunnerOptions = {},
): Promise<ReviewResult> {
  const envConfig = getEnvConfig();
  const merged: ClaudeRunnerOptions = { ...envConfig, ...options };
  merged.model = merged.model ?? "opus";

  const schemaStr = JSON.stringify(REVIEW_JSON_SCHEMA);

  const reviewPrompt = `You are a code reviewer. Analyze the following and respond with a structured review.

${prompt}`;

  const args = buildArgs(reviewPrompt, merged);

  // Insert --json-schema before the prompt (last element)
  const promptArg = args.pop()!;
  args.push("--json-schema", schemaStr, promptArg);

  return new Promise<ReviewResult>((resolve, reject) => {
    const proc = spawn("claude", args, {
      stdio: ["pipe", "pipe", "pipe"],
      cwd: merged.cwd,
    });

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
          reject(new Error(`claude review exited with code ${code ?? "null"}`));
          return;
        }

        try {
          const output: unknown = JSON.parse(stdout);
          if (!output || typeof output !== "object" || !("result" in output)) {
            throw new Error("Unexpected claude output structure");
          }
          const resultStr = (output as ClaudeJsonOutput).result;
          const review: unknown = JSON.parse(resultStr);
          if (
            !review ||
            typeof review !== "object" ||
            !("verdict" in review) ||
            !("issues" in review)
          ) {
            throw new Error("Review result missing required fields");
          }
          resolve(review as ReviewResult);
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
