import { z } from "zod";
import { createServer, startServer, startHttpServer } from "../shared/server-factory.js";
import { extractFrames, narrateFrames } from "./pipeline.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { PORTS } from "../shared/types.js";

/**
 * Create the Video MCP bridge server with the `narrate_video` tool.
 *
 * Extracts frames from a video with `ffmpeg` and narrates them by spawning
 * `claude -p` via {@link extractFrames} and {@link narrateFrames}. The server
 * is configured but not connected -- call {@link startServer} or
 * `server.connect()` to begin serving.
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
