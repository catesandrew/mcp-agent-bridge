import { spawn } from "node:child_process";
import { mkdtemp, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

/**
 * Frame sampling strategy.
 * - `"fps"`: sample at a fixed rate (`ffmpeg -vf fps=N`).
 * - `"scene"`: sample on scene changes (`ffmpeg -vf select='gt(scene,T)'`).
 */
export type FrameSampleMode = "fps" | "scene";

export interface ExtractFramesOptions {
  /**
   * Sampling strategy.
   * @defaultValue `"fps"`
   */
  mode?: FrameSampleMode;
  /**
   * Frames per second to sample in `"fps"` mode.
   * @defaultValue {@link DEFAULT_FPS}
   */
  fps?: number;
  /**
   * Scene-change score (0-1) above which a frame is emitted in `"scene"` mode.
   * @defaultValue {@link DEFAULT_SCENE_THRESHOLD}
   */
  sceneThreshold?: number;
}

/** A frame written to disk with the video timestamp it was sampled at. */
export interface ExtractedFrame {
  /** Absolute path to the PNG file. */
  framePath: string;
  /** Offset into the source video, in seconds. */
  timestampSec: number;
}

export interface ExtractFramesResult {
  frames: ExtractedFrame[];
  /**
   * Remove the temp directory holding the extracted frames. Safe to call more
   * than once. Callers should invoke this in a `finally` block.
   */
  cleanup: () => Promise<void>;
}

export interface NarrateFramesOptions {
  /**
   * Frames per `claude -p` call. Bounds image count/cost per invocation.
   * @defaultValue {@link DEFAULT_BATCH_SIZE}
   */
  batchSize?: number;
  /**
   * Override the per-frame description instruction.
   * @defaultValue {@link DEFAULT_NARRATION_PROMPT}
   */
  prompt?: string;
  /**
   * Claude model used for both the per-batch and synthesis calls.
   * @defaultValue `process.env.VIDEO_NARRATION_MODEL` or `"sonnet"`
   */
  model?: string;
}

/** A frame paired with its Claude-generated description. */
export interface NarratedFrame {
  timestampSec: number;
  framePath: string;
  description: string;
}

export interface NarrateFramesResult {
  frames: NarratedFrame[];
  /** Single flowing narration synthesized from every frame description. */
  narration: string;
}

/** @defaultValue for {@link ExtractFramesOptions.fps} */
export const DEFAULT_FPS = 1;
/** @defaultValue for {@link ExtractFramesOptions.sceneThreshold} */
export const DEFAULT_SCENE_THRESHOLD = 0.4;
/** @defaultValue for {@link NarrateFramesOptions.batchSize} */
export const DEFAULT_BATCH_SIZE = 6;

export const DEFAULT_NARRATION_PROMPT =
  "You are narrating a screen recording frame by frame. For each frame, describe " +
  "what is visible (application, screen, key UI elements) and what changed from the " +
  "previous frame (navigation, input, state transitions). Be concrete and specific — " +
  "name the actual buttons, fields, and values you can see. Two to four sentences per frame.";

const FFMPEG_TIMEOUT_MS = parseInt(
  process.env["VIDEO_FFMPEG_TIMEOUT_MS"] ?? "600000",
  10,
);

const NARRATION_TIMEOUT_MS = parseInt(
  process.env["VIDEO_NARRATION_TIMEOUT_MS"] ?? "300000",
  10,
);

const MAX_OUTPUT_BYTES = 10 * 1024 * 1024; // 10 MB

const FRAME_PATTERN = "frame_%04d.png";
const FRAME_FILE_RE = /^frame_\d+\.png$/;

/**
 * Descriptions for one batch of frames, keyed by 1-based position within the
 * batch (Claude echoes the index back rather than the path, which keeps the
 * response small and avoids path-mangling).
 */
const BATCH_JSON_SCHEMA = {
  type: "object" as const,
  properties: {
    frames: {
      type: "array" as const,
      items: {
        type: "object" as const,
        properties: {
          index: { type: "integer" as const },
          description: { type: "string" as const },
        },
        required: ["index", "description"],
      },
    },
  },
  required: ["frames"],
};

const NARRATION_JSON_SCHEMA = {
  type: "object" as const,
  properties: {
    narration: { type: "string" as const },
  },
  required: ["narration"],
};

interface BatchDescriptions {
  frames: { index: number; description: string }[];
}

interface NarrationOutput {
  narration: string;
}

function isBatchDescriptions(value: unknown): value is BatchDescriptions {
  return (
    !!value &&
    typeof value === "object" &&
    "frames" in value &&
    Array.isArray((value as BatchDescriptions).frames)
  );
}

function isNarrationOutput(value: unknown): value is NarrationOutput {
  return (
    !!value &&
    typeof value === "object" &&
    "narration" in value &&
    typeof (value as NarrationOutput).narration === "string"
  );
}

/**
 * Parse the timestamps emitted by ffmpeg's `showinfo` filter out of a captured
 * stderr stream. Each selected frame produces one `pts_time:<seconds>` token,
 * in output order — so the Nth timestamp belongs to the Nth written frame.
 *
 * Pure and spawn-free so the parsing contract can be unit tested without a
 * real ffmpeg on PATH.
 *
 * @param stderrOutput - Full stderr text from an ffmpeg run using `showinfo`.
 * @returns Frame timestamps in seconds, in emission order.
 *
 * @example
 * ```ts
 * parseSceneTimestamps("[Parsed_showinfo_1 @ 0x1] n:0 pts:342696 pts_time:11.4232 duration:1500");
 * // [11.4232]
 * ```
 */
export function parseSceneTimestamps(stderrOutput: string): number[] {
  const timestamps: number[] = [];
  const re = /pts_time:\s*(-?\d+(?:\.\d+)?)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(stderrOutput)) !== null) {
    const raw = match[1];
    if (raw === undefined) continue;
    const value = Number.parseFloat(raw);
    if (!Number.isNaN(value)) timestamps.push(value);
  }
  return timestamps;
}

function buildFfmpegArgs(
  videoPath: string,
  frameDir: string,
  mode: FrameSampleMode,
  fps: number,
  sceneThreshold: number,
): string[] {
  const output = join(frameDir, FRAME_PATTERN);
  if (mode === "scene") {
    // The single quotes are consumed by ffmpeg's own filtergraph parser (no
    // shell is involved) and are what protect the comma inside gt(scene,T).
    return [
      "-hide_banner",
      "-nostdin",
      "-i",
      videoPath,
      "-vf",
      `select='gt(scene,${sceneThreshold})',showinfo`,
      "-vsync",
      "vfr",
      output,
    ];
  }
  return [
    "-hide_banner",
    "-nostdin",
    "-i",
    videoPath,
    "-vf",
    `fps=${fps}`,
    output,
  ];
}

/** Run ffmpeg to completion and resolve its captured stderr. */
function runFfmpeg(args: string[]): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const proc = spawn("ffmpeg", args, {
      stdio: ["ignore", "ignore", "pipe"],
    });

    let stderr = "";
    let stderrSize = 0;
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
        reject(new Error(`ffmpeg timed out after ${FFMPEG_TIMEOUT_MS}ms`));
      });
    }, FFMPEG_TIMEOUT_MS);

    proc.on("error", (err: Error) => {
      settle(() => reject(new Error(`Failed to spawn ffmpeg: ${err.message}`)));
    });

    proc.stderr.on("data", (chunk: Buffer) => {
      stderrSize += chunk.length;
      if (stderrSize > MAX_OUTPUT_BYTES) {
        settle(() => {
          proc.kill("SIGTERM");
          reject(new Error("ffmpeg output exceeded maximum allowed size"));
        });
        return;
      }
      stderr += chunk.toString();
    });

    proc.on("close", (code: number | null) => {
      settle(() => {
        if (code !== 0) {
          const detail = stderr.trim().split("\n").slice(-5).join("\n");
          reject(
            new Error(
              `ffmpeg exited with code ${code ?? "null"}${detail ? `: ${detail}` : ""}`,
            ),
          );
          return;
        }
        resolve(stderr);
      });
    });
  });
}

/**
 * Sample frames out of a video with ffmpeg into a fresh temp directory.
 *
 * In `"fps"` mode each frame's timestamp is derived positionally as
 * `index / fps` (0-based, since ffmpeg emits the first sample at t=0). In
 * `"scene"` mode the real presentation timestamps are recovered from the
 * `showinfo` filter's stderr output via {@link parseSceneTimestamps}.
 *
 * The caller owns the returned {@link ExtractFramesResult.cleanup} — call it in
 * a `finally` block or the frames leak into the temp dir.
 *
 * @param videoPath - Path to the source video.
 * @param opts - Sampling mode and its tuning knobs.
 * @throws {Error} If the video is unreadable, ffmpeg cannot be spawned, or
 *   ffmpeg exits non-zero. The temp directory is removed before throwing.
 *
 * @example
 * ```ts
 * const { frames, cleanup } = await extractFrames("demo.mp4", { mode: "fps", fps: 2 });
 * try {
 *   console.log(frames[0]);  // { framePath: "/tmp/.../frame_0001.png", timestampSec: 0 }
 * } finally {
 *   await cleanup();
 * }
 * ```
 */
export async function extractFrames(
  videoPath: string,
  opts: ExtractFramesOptions = {},
): Promise<ExtractFramesResult> {
  const mode: FrameSampleMode = opts.mode ?? "fps";
  const fps = opts.fps ?? DEFAULT_FPS;
  const sceneThreshold = opts.sceneThreshold ?? DEFAULT_SCENE_THRESHOLD;

  if (mode === "fps" && (!Number.isFinite(fps) || fps <= 0)) {
    throw new Error(`fps must be a positive number, got ${fps}`);
  }

  try {
    const info = await stat(videoPath);
    if (!info.isFile()) {
      throw new Error(`Not a file: ${videoPath}`);
    }
  } catch (err) {
    throw new Error(
      `Cannot read video "${videoPath}": ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const frameDir = await mkdtemp(join(tmpdir(), "video-frames-"));
  const cleanup = async (): Promise<void> => {
    await rm(frameDir, { recursive: true, force: true });
  };

  try {
    const stderr = await runFfmpeg(
      buildFfmpegArgs(videoPath, frameDir, mode, fps, sceneThreshold),
    );

    const files = (await readdir(frameDir))
      .filter((name) => FRAME_FILE_RE.test(name))
      .sort();

    const timestamps = mode === "scene" ? parseSceneTimestamps(stderr) : [];
    const frames: ExtractedFrame[] = files.map((name, index) => ({
      framePath: join(frameDir, name),
      timestampSec: mode === "scene" ? (timestamps[index] ?? 0) : index / fps,
    }));

    return { frames, cleanup };
  } catch (err) {
    await cleanup();
    throw err;
  }
}

interface ClaudeCallOptions {
  /** Directories to grant the CLI read access to via `--add-dir`. */
  addDirs?: string[];
  model: string;
}

/**
 * Spawn `claude -p --json-schema` and return its validated structured output.
 *
 * Mirrors the machinery in `src/claude/claude-runner.ts`: prompt over stdin,
 * `--output-format json --verbose`, result read from `structured_output` (with
 * a fallback to parsing `result`). Images are attached by listing their
 * absolute paths in the prompt and allowing the `Read` tool — the Claude Code
 * CLI has no dedicated image flag, and `Read` handles PNGs natively.
 */
function runClaudeStructured<T>(
  prompt: string,
  schema: object,
  validate: (value: unknown) => value is T,
  invalidMessage: string,
  options: ClaudeCallOptions,
): Promise<T> {
  const args = [
    "-p",
    "--output-format",
    "json",
    "--verbose",
    "--permission-mode",
    process.env["VIDEO_CLAUDE_PERMISSION_MODE"] ?? "dontAsk",
    "--model",
    options.model,
    "--allowedTools",
    "Read",
    "--json-schema",
    JSON.stringify(schema),
  ];
  for (const dir of options.addDirs ?? []) {
    args.push("--add-dir", dir);
  }

  // Strip ANTHROPIC_BASE_URL so these calls hit Anthropic directly rather than
  // an interactive session proxy, and make sure the CLI's v2.1+ install
  // location is on PATH — same reasoning as src/claude/claude-runner.ts.
  const env = { ...process.env };
  delete env["ANTHROPIC_BASE_URL"];
  const home = env["HOME"] ?? "";
  const localBin = `${home}/.local/bin`;
  const pathParts = (env["PATH"] ?? "").split(":");
  if (home && !pathParts.includes(localBin)) {
    env["PATH"] = [localBin, ...pathParts].join(":");
  }

  return new Promise<T>((resolve, reject) => {
    const proc = spawn("claude", args, {
      stdio: ["pipe", "pipe", "pipe"],
      env,
    });

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
        reject(
          new Error(`claude narration timed out after ${NARRATION_TIMEOUT_MS}ms`),
        );
      });
    }, NARRATION_TIMEOUT_MS);

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
          const value = extractStructuredOutput(stdout);
          if (!validate(value)) {
            throw new Error(invalidMessage);
          }
          resolve(value);
        } catch (err) {
          reject(
            new Error(
              `Failed to parse claude output: ${err instanceof Error ? err.message : String(err)}`,
            ),
          );
        }
      });
    });
  });
}

/**
 * Pull the structured payload out of `claude -p --output-format json --verbose`
 * output, which is either a single result object or an array of events
 * containing one `type: "result"` entry.
 */
function extractStructuredOutput(stdout: string): unknown {
  const parsed: unknown = JSON.parse(stdout);
  const entry: unknown = Array.isArray(parsed)
    ? parsed.find(
        (candidate: unknown) =>
          !!candidate &&
          typeof candidate === "object" &&
          (candidate as Record<string, unknown>)["type"] === "result",
      )
    : parsed;

  if (!entry || typeof entry !== "object") {
    throw new Error("No result entry found in claude output");
  }

  const record = entry as Record<string, unknown>;
  if (record["structured_output"] !== undefined) {
    return record["structured_output"];
  }
  if (typeof record["result"] === "string") {
    return JSON.parse(record["result"]);
  }
  throw new Error("No structured output in claude output");
}

function formatTimestamp(timestampSec: number): string {
  return `${timestampSec.toFixed(2)}s`;
}

function buildBatchPrompt(
  batch: ExtractedFrame[],
  instruction: string,
): string {
  const listing = batch
    .map(
      (frame, index) =>
        `${index + 1}. t=${formatTimestamp(frame.timestampSec)} — ${frame.framePath}`,
    )
    .join("\n");

  return `${instruction}

Read each of the following ${batch.length} image files with the Read tool, in order, then describe each one.

${listing}

Return exactly ${batch.length} entries in the "frames" array — one per image above, in the same order — where "index" is the 1-based number of the image in that list and "description" is your description of it.`;
}

function buildSynthesisPrompt(frames: NarratedFrame[]): string {
  const listing = frames
    .map(
      (frame) => `[${formatTimestamp(frame.timestampSec)}] ${frame.description}`,
    )
    .join("\n\n");

  return `Below are per-frame descriptions of a screen recording, in chronological order.

${listing}

Synthesize these into a single flowing narration of the recording as one continuous walkthrough: what the user is doing, in what order, and why each step follows from the last. Collapse repeated or near-identical frames instead of restating them, and do not enumerate frames or timestamps. Return the narration in the "narration" field.`;
}

/**
 * Describe every frame with Claude, then synthesize the descriptions into one
 * flowing narration.
 *
 * Frames are grouped into batches of {@link NarrateFramesOptions.batchSize} and
 * each batch is sent to a single `claude -p` call with the image paths attached
 * (paths listed in the prompt, read via the CLI's `Read` tool). Batches run
 * sequentially to keep concurrent CLI processes and cost bounded. A final
 * `claude -p` call turns all descriptions, in timestamp order, into the
 * narration string.
 *
 * @param frames - Frames to narrate, typically from {@link extractFrames}.
 * @param opts - Batch size, prompt override, model override.
 * @returns Per-frame descriptions plus the synthesized narration. Both are
 *   empty when `frames` is empty.
 * @throws {Error} If a `claude` call fails, times out, or returns output that
 *   does not match the requested schema.
 *
 * @example
 * ```ts
 * const { frames: described, narration } = await narrateFrames(frames, { batchSize: 4 });
 * ```
 */
export async function narrateFrames(
  frames: ExtractedFrame[],
  opts: NarrateFramesOptions = {},
): Promise<NarrateFramesResult> {
  if (frames.length === 0) {
    return { frames: [], narration: "" };
  }

  const batchSize = opts.batchSize ?? DEFAULT_BATCH_SIZE;
  if (!Number.isFinite(batchSize) || batchSize < 1) {
    throw new Error(`batchSize must be at least 1, got ${batchSize}`);
  }
  const instruction = opts.prompt ?? DEFAULT_NARRATION_PROMPT;
  const model = opts.model ?? process.env["VIDEO_NARRATION_MODEL"] ?? "sonnet";

  const ordered = [...frames].sort((a, b) => a.timestampSec - b.timestampSec);
  const addDirs = [...new Set(ordered.map((frame) => dirname(frame.framePath)))];

  const described: NarratedFrame[] = [];
  for (let start = 0; start < ordered.length; start += Math.floor(batchSize)) {
    const batch = ordered.slice(start, start + Math.floor(batchSize));
    const batchResult = await runClaudeStructured(
      buildBatchPrompt(batch, instruction),
      BATCH_JSON_SCHEMA,
      isBatchDescriptions,
      "Frame descriptions missing required fields",
      { addDirs, model },
    );

    const byIndex = new Map<number, string>();
    for (const entry of batchResult.frames) {
      if (typeof entry?.index === "number" && typeof entry.description === "string") {
        byIndex.set(entry.index, entry.description);
      }
    }

    batch.forEach((frame, index) => {
      described.push({
        timestampSec: frame.timestampSec,
        framePath: frame.framePath,
        description: byIndex.get(index + 1) ?? "",
      });
    });
  }

  const synthesis = await runClaudeStructured(
    buildSynthesisPrompt(described),
    NARRATION_JSON_SCHEMA,
    isNarrationOutput,
    "Narration result missing required fields",
    { model },
  );

  return { frames: described, narration: synthesis.narration };
}
