import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { extractFrames, type FrameSampleMode } from "@video/pipeline";
import { clearAllSessions, startSession, type ThumbnailedFrame } from "../_lib/session";

interface ExtractRequestBody {
  videoPath?: string;
  mode?: FrameSampleMode;
  fps?: number;
  sceneThreshold?: number;
}

export interface ExtractResponseBody {
  tempId: string | null;
  frames: ThumbnailedFrame[];
  /** True when ffmpeg ran successfully but produced no frames — surface this distinctly, don't just show an empty grid. */
  zeroFrames: boolean;
}

export async function POST(request: Request): Promise<NextResponse> {
  let body: ExtractRequestBody;
  try {
    body = (await request.json()) as ExtractRequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const videoPath = body.videoPath?.trim();
  if (!videoPath) {
    return NextResponse.json({ error: "videoPath is required" }, { status: 400 });
  }

  try {
    const result = await extractFrames(videoPath, {
      mode: body.mode,
      fps: body.fps,
      sceneThreshold: body.sceneThreshold,
    });

    if (result.frames.length === 0) {
      // Nothing to cache or show a re-run button for — clean this attempt up
      // immediately, drop whatever a previous successful extraction left
      // behind (it's no longer reachable once the UI clears its tempId), and
      // tell the UI explicitly so it doesn't just render an empty grid.
      await result.cleanup();
      await clearAllSessions();
      const empty: ExtractResponseBody = { tempId: null, frames: [], zeroFrames: true };
      return NextResponse.json(empty);
    }

    const tempId = randomUUID();
    const frames = await startSession(tempId, result);
    const payload: ExtractResponseBody = { tempId, frames, zeroFrames: false };
    return NextResponse.json(payload);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
