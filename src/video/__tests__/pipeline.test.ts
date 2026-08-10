import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

// Wrap (not replace) node:child_process's `spawn` so we can assert on call
// counts/arguments while letting real ffmpeg spawns in the integration test
// below still execute for real.
vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  return { ...actual, spawn: vi.fn(actual.spawn) };
});

const { spawn, spawnSync } = await import("node:child_process");
const { parseSceneTimestamps, extractFrames, narrateFrames } = await import(
  "../pipeline.js"
);

const FFMPEG_AVAILABLE =
  spawnSync("which", ["ffmpeg"], { stdio: "ignore" }).status === 0;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("parseSceneTimestamps", () => {
  it("extracts pts_time values in emission order from real showinfo stderr lines", () => {
    const stderrOutput = [
      "[Parsed_showinfo_1 @ 0xb04c25980] n:   0 pts: 342696 pts_time:11.4232 duration:   1500 duration_time:0.05 fmt:yuv420p sar:1/1 s:1920x1080 i:P iskey:1 type:I checksum:AB12CD34 plane_checksum:[AB12CD34] mean:[128] stdev:[10.0]",
      "[Parsed_showinfo_1 @ 0xb04c25980] n:   1 pts: 345696 pts_time:11.4732 duration:   1500 duration_time:0.05 fmt:yuv420p sar:1/1 s:1920x1080 i:P iskey:0 type:P checksum:AB12CD35 plane_checksum:[AB12CD35] mean:[128] stdev:[10.0]",
      "[Parsed_showinfo_1 @ 0xb04c25980] n:   2 pts: 348696 pts_time:11.5232 duration:   1500 duration_time:0.05 fmt:yuv420p sar:1/1 s:1920x1080 i:P iskey:0 type:P checksum:AB12CD36 plane_checksum:[AB12CD36] mean:[128] stdev:[10.0]",
      "[Parsed_showinfo_1 @ 0xb04c25980] n:   3 color_range:unknown color_space:bt709 color_primaries:bt709 color_trc:bt709",
    ].join("\n");

    expect(parseSceneTimestamps(stderrOutput)).toEqual([
      11.4232, 11.4732, 11.5232,
    ]);
  });

  it("ignores trailing summary lines that have no pts_time field", () => {
    const stderrOutput = [
      "[Parsed_showinfo_1 @ 0x1] n:   0 pts:     0 pts_time:0 duration:   100 duration_time:0.01",
      "[Parsed_showinfo_1 @ 0x1] n:   1 color_range:unknown color_space:bt709 color_primaries:bt709 color_trc:bt709",
    ].join("\n");

    expect(parseSceneTimestamps(stderrOutput)).toEqual([0]);
  });

  it("returns an empty array when no pts_time fields are present", () => {
    const stderrOutput =
      "[Parsed_showinfo_1 @ 0x1] color_range:unknown color_space:bt709";

    expect(parseSceneTimestamps(stderrOutput)).toEqual([]);
  });

  it("returns an empty array for empty input", () => {
    expect(parseSceneTimestamps("")).toEqual([]);
  });
});

describe("extractFrames (integration, real ffmpeg)", () => {
  let workDir: string | undefined;

  afterEach(async () => {
    if (workDir) {
      await rm(workDir, { recursive: true, force: true });
      workDir = undefined;
    }
  });

  it.skipIf(!FFMPEG_AVAILABLE)(
    "extracts real frames from a generated fixture video with correct positional timestamps",
    async () => {
      workDir = await mkdtemp(join(tmpdir(), "pipeline-fixture-"));
      const videoPath = join(workDir, "fixture.mp4");

      const generate = spawnSync("ffmpeg", [
        "-y",
        "-hide_banner",
        "-loglevel",
        "error",
        "-f",
        "lavfi",
        "-i",
        "testsrc=duration=3:size=64x64:rate=10",
        "-pix_fmt",
        "yuv420p",
        videoPath,
      ]);
      expect(generate.status).toBe(0);

      const { frames, cleanup } = await extractFrames(videoPath, {
        mode: "fps",
        fps: 2,
      });

      try {
        expect(frames.length).toBeGreaterThanOrEqual(5);
        expect(frames[0]!.timestampSec).toBe(0);
        expect(frames[1]!.timestampSec).toBeCloseTo(0.5, 5);

        for (const frame of frames) {
          const info = await stat(frame.framePath);
          expect(info.isFile()).toBe(true);
        }
      } finally {
        const frameDir = dirname(frames[0]!.framePath);
        await cleanup();
        await expect(stat(frameDir)).rejects.toThrow();
      }
    },
    30_000,
  );
});

describe("narrateFrames", () => {
  it("short-circuits to an empty result without spawning any subprocess when frames is empty", async () => {
    const result = await narrateFrames([]);

    expect(result).toEqual({ frames: [], narration: "" });
    expect(spawn).not.toHaveBeenCalled();
  });
});
