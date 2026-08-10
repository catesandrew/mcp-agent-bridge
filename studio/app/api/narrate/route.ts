import { NextResponse } from "next/server";
import { narrateFrames, type NarrateFramesResult } from "@video/pipeline";
import { getSessionFrames } from "../_lib/session";

interface NarrateRequestBody {
  tempId?: string;
  batchSize?: number;
  prompt?: string;
  model?: string;
}

export async function POST(request: Request): Promise<NextResponse> {
  let body: NarrateRequestBody;
  try {
    body = (await request.json()) as NarrateRequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const tempId = body.tempId?.trim();
  if (!tempId) {
    return NextResponse.json({ error: "tempId is required" }, { status: 400 });
  }

  const frames = await getSessionFrames(tempId);
  if (!frames) {
    return NextResponse.json(
      { error: "This extraction session has expired or was replaced — re-extract and try again." },
      { status: 409 },
    );
  }

  try {
    // Deliberately not cleaning up the session here: the whole point of a
    // separate /api/narrate route is letting the UI re-run narration (new
    // prompt, new batch size) against the same already-extracted frames
    // without re-invoking ffmpeg. The session is only torn down when a new
    // extraction replaces it (see _lib/session.ts).
    const result: NarrateFramesResult = await narrateFrames(frames, {
      batchSize: body.batchSize,
      prompt: body.prompt,
      model: body.model,
    });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
