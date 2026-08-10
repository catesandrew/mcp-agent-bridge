import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { z } from "zod";
import { createServer, startServer, startHttpServer } from "../shared/server-factory.js";
import { extractFrames, narrateFrames, type ExtractedFrame } from "./pipeline.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { PORTS } from "../shared/types.js";

/**
 * A previously extracted-but-not-yet-narrated (or re-narratable) frame set,
 * kept in memory so `extract_frames` and `narrate_frames` can be split across
 * two separate tool calls -- e.g. by a client that wants to re-run narration
 * against the same frames without re-invoking ffmpeg.
 *
 * Declared at module scope (not inside {@link createVideoServer}) because
 * `startHttpServer` calls its server factory fresh per HTTP request -- a
 * per-request Map would never see its own previous entries.
 */
interface FrameSession {
  frames: ExtractedFrame[];
  cleanup: () => Promise<void>;
  expiresAt: number;
}

const SESSION_TTL_MS = parseInt(process.env["VIDEO_SESSION_TTL_MS"] ?? "1800000", 10); // 30 min
const sessions = new Map<string, FrameSession>();
let sweepTimer: NodeJS.Timeout | undefined;

function touchSession(id: string, frames: ExtractedFrame[], cleanup: () => Promise<void>): void {
  sessions.set(id, { frames, cleanup, expiresAt: Date.now() + SESSION_TTL_MS });
}

async function sweepExpiredSessions(): Promise<void> {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (session.expiresAt < now) {
      sessions.delete(id);
      await session.cleanup().catch(() => {});
    }
  }
}

/** Lazily start the expiry sweep so a server that never extracts anything never schedules a timer. */
function ensureSweepTimer(): void {
  if (sweepTimer) return;
  sweepTimer = setInterval(() => {
    void sweepExpiredSessions();
  }, 5 * 60 * 1000);
  sweepTimer.unref();
}

async function toThumbnail(frame: ExtractedFrame): Promise<{ timestampSec: number; thumbnail: string }> {
  const bytes = await readFile(frame.framePath);
  return {
    timestampSec: frame.timestampSec,
    thumbnail: `data:image/png;base64,${bytes.toString("base64")}`,
  };
}

/**
 * Create the Video MCP bridge server.
 *
 * Registers `narrate_video` (one-shot extract+narrate, for programmatic
 * callers) plus a split `extract_frames` / `narrate_frames` / `close_session`
 * trio (for UI-style clients that want to inspect frames before narrating, or
 * re-narrate the same frames with a different prompt without re-running
 * ffmpeg). All four spawn `ffmpeg` and `claude -p` via {@link extractFrames}
 * and {@link narrateFrames}. The server is configured but not connected --
 * call {@link startServer} or `server.connect()` to begin serving.
 *
 * @returns A configured {@link McpServer} ready to connect to a transport.
 *
 * @example
 * ```ts
 * const server = createVideoServer();
 * await startServer(server); // listens on stdio
 * ```
 */
export function createVideoServer(): McpServer {
  const server = createServer({
    name: "video-mcp-bridge",
    version: "0.1.0",
    description:
      "Extracts frames from a video and narrates them with Claude via ffmpeg + claude -p",
    instructions:
      "Use narrate_video to extract frames from a video file and generate a per-frame description plus a synthesized narration.",
  });

  server.registerTool(
    "narrate_video",
    {
      title: "Narrate Video",
      description:
        "Extract frames from a video (fixed-fps or scene-change sampling) and narrate the sequence with Claude. Returns both the per-frame descriptions and a single synthesized narration string.",
      inputSchema: {
        videoPath: z.string().describe("Path to the source video file"),
        mode: z
          .enum(["fps", "scene"])
          .optional()
          .describe("Frame sampling strategy: fixed fps or scene-change detection. Defaults to fps."),
        fps: z
          .number()
          .optional()
          .describe("Frames per second to sample in fps mode. Defaults to 1."),
        sceneThreshold: z
          .number()
          .optional()
          .describe("Scene-change score (0-1) above which a frame is emitted in scene mode. Defaults to 0.4."),
        batchSize: z
          .number()
          .optional()
          .describe("Frames per claude -p call during narration. Defaults to 6."),
        prompt: z
          .string()
          .optional()
          .describe("Override the per-frame description instruction."),
        keepFrames: z
          .boolean()
          .optional()
          .describe("Debug flag: skip cleanup of extracted frame files after narration."),
      },
    },
    async ({ videoPath, mode, fps, sceneThreshold, batchSize, prompt, keepFrames }) => {
      const extracted = await extractFrames(videoPath, { mode, fps, sceneThreshold });
      try {
        const result = await narrateFrames(extracted.frames, { batchSize, prompt });

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ frames: result.frames, narration: result.narration }, null, 2),
            },
          ],
          structuredContent: { frames: result.frames, narration: result.narration },
        };
      } finally {
        if (!keepFrames) {
          await extracted.cleanup();
        }
      }
    },
  );

  server.registerTool(
    "extract_frames",
    {
      title: "Extract Video Frames",
      description:
        "Extract frames from a video (fixed-fps or scene-change sampling) without narrating them. Returns a sessionId plus a thumbnail per frame; pass the sessionId to narrate_frames to describe them, or to close_session to free the extracted files early. Sessions auto-expire after 30 minutes.",
      inputSchema: {
        videoPath: z.string().describe("Path to the source video file"),
        mode: z
          .enum(["fps", "scene"])
          .optional()
          .describe("Frame sampling strategy: fixed fps or scene-change detection. Defaults to fps."),
        fps: z
          .number()
          .optional()
          .describe("Frames per second to sample in fps mode. Defaults to 1."),
        sceneThreshold: z
          .number()
          .optional()
          .describe("Scene-change score (0-1) above which a frame is emitted in scene mode. Defaults to 0.4."),
      },
    },
    async ({ videoPath, mode, fps, sceneThreshold }) => {
      const extracted = await extractFrames(videoPath, { mode, fps, sceneThreshold });

      if (extracted.frames.length === 0) {
        await extracted.cleanup();
        const payload = { sessionId: null, frames: [], zeroFrames: true };
        return {
          content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
          structuredContent: payload,
        };
      }

      const sessionId = randomUUID();
      touchSession(sessionId, extracted.frames, extracted.cleanup);
      ensureSweepTimer();

      const thumbnails = await Promise.all(extracted.frames.map(toThumbnail));
      const payload = { sessionId, frames: thumbnails, zeroFrames: false };
      return {
        content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
        structuredContent: payload,
      };
    },
  );

  server.registerTool(
    "narrate_frames",
    {
      title: "Narrate Extracted Frames",
      description:
        "Narrate frames previously extracted via extract_frames, identified by sessionId. Can be called more than once against the same sessionId (e.g. with a different prompt or batchSize) without re-extracting. Pass close: true to free the session's frame files immediately after this call instead of waiting for the 30-minute expiry.",
      inputSchema: {
        sessionId: z.string().describe("sessionId returned by a prior extract_frames call"),
        batchSize: z
          .number()
          .optional()
          .describe("Frames per claude -p call during narration. Defaults to 6."),
        prompt: z
          .string()
          .optional()
          .describe("Override the per-frame description instruction."),
        model: z.string().optional().describe("Override the claude model used for narration."),
        close: z
          .boolean()
          .optional()
          .describe("Free the session's frame files immediately after this call instead of waiting for expiry."),
      },
    },
    async ({ sessionId, batchSize, prompt, model, close }) => {
      const session = sessions.get(sessionId);
      if (!session) {
        throw new Error(`Unknown or expired session: ${sessionId}`);
      }

      const result = await narrateFrames(session.frames, { batchSize, prompt, model });

      if (close) {
        sessions.delete(sessionId);
        await session.cleanup();
      } else {
        session.expiresAt = Date.now() + SESSION_TTL_MS;
      }

      const payload = {
        frames: result.frames.map(({ timestampSec, description }) => ({ timestampSec, description })),
        narration: result.narration,
      };
      return {
        content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
        structuredContent: payload,
      };
    },
  );

  server.registerTool(
    "close_session",
    {
      title: "Close Frame Session",
      description:
        "Free the frame files held by a session started with extract_frames. Safe to call on an already-closed or expired sessionId (no-op).",
      inputSchema: {
        sessionId: z.string().describe("sessionId returned by a prior extract_frames call"),
      },
    },
    async ({ sessionId }) => {
      const session = sessions.get(sessionId);
      if (session) {
        sessions.delete(sessionId);
        await session.cleanup();
      }
      return { content: [{ type: "text" as const, text: JSON.stringify({ closed: true }) }] };
    },
  );

  return server;
}

// Start when run directly (node, bun, or compiled binary)
const isMain =
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  (import.meta as unknown as Record<string, unknown>).main === true ||
  (typeof process !== "undefined" &&
    process.argv[1] &&
    (process.argv[1].endsWith("/video/server.js") ||
      process.argv[1].endsWith("/video/server.ts")));

if (isMain) {
  const useHttp =
    process.argv.includes("--http") || process.env["VIDEO_MCP_HTTP"] === "1";
  const port = parseInt(
    process.env["VIDEO_MCP_HTTP_PORT"] ?? String(PORTS.video),
    10,
  );

  if (useHttp) {
    startHttpServer(createVideoServer, port).catch((err: unknown) => {
      console.error("Failed to start Video MCP HTTP server:", err);
      process.exit(1);
    });
  } else {
    const server = createVideoServer();
    startServer(server).catch((err: unknown) => {
      console.error("Failed to start Video MCP server:", err);
      process.exit(1);
    });
  }
}
