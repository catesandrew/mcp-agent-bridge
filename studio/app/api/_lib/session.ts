import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import type { ExtractedFrame, ExtractFramesResult } from "@video/pipeline";

/**
 * Bridges `extractFrames` and `narrateFrames` across two stateless Next.js API
 * routes (`/api/extract` then `/api/narrate`).
 *
 * Why a filesystem-backed manifest instead of an in-memory module variable:
 * the studio UI needs a "re-run narration" action (retune the prompt/batch
 * size and re-narrate the *same* frames without re-invoking ffmpeg, which is
 * the slow step), so something has to remember which frames belong to a
 * `tempId` across two separate requests. An in-memory singleton looked
 * simpler but is unsafe here — in `next dev`, each API route is compiled as
 * its own on-demand bundle, and the *first* request to a not-yet-compiled
 * route triggers a server-bundle rebuild that re-executes top-level module
 * code, silently resetting any in-memory state. That reliably broke the very
 * first "Extract & Narrate" click of a fresh dev server (extract's bundle
 * compiles, then narrate's compiles for the first time immediately after —
 * exactly when the reset hits). A small JSON manifest on disk, alongside the
 * extracted frame files themselves, isn't subject to that and behaves the
 * same in dev and in a production `next start`.
 *
 * This is a single-process, single-user local dev tool (per the plan doc,
 * `studio/` is explicitly a local debug/tuning UI) — one active session is
 * sufficient: starting a new extraction cleans up whatever the previous one
 * left behind first.
 */
const SESSIONS_DIR = join(tmpdir(), "video-narration-studio-sessions");

interface SessionManifest {
  frames: ExtractedFrame[];
}

/** Frame handed to the client: real timestamp/path plus an inline preview. */
export interface ThumbnailedFrame extends ExtractedFrame {
  /** `data:image/png;base64,...` — self-contained so the browser never needs to re-read the temp file. */
  thumbnail: string;
}

function manifestPath(tempId: string): string {
  return join(SESSIONS_DIR, `${tempId}.json`);
}

async function readManifest(tempId: string): Promise<SessionManifest | null> {
  try {
    const raw = await readFile(manifestPath(tempId), "utf8");
    return JSON.parse(raw) as SessionManifest;
  } catch {
    return null;
  }
}

/** Best-effort removal of a session's frame temp dir and its manifest file. */
async function destroySession(tempId: string): Promise<void> {
  const manifest = await readManifest(tempId);
  const firstFrame = manifest?.frames[0];
  if (firstFrame) {
    await rm(dirname(firstFrame.framePath), { recursive: true, force: true }).catch(() => {});
  }
  await rm(manifestPath(tempId), { force: true }).catch(() => {});
}

/**
 * Clear out any session(s) left behind by a previous run. Exported so
 * `/api/extract` can also call it on a zero-frames result — that path never
 * calls {@link startSession} (there's nothing to cache), but it still
 * supersedes whatever the previous successful extraction left on disk.
 */
export async function clearAllSessions(): Promise<void> {
  let entries: string[];
  try {
    entries = await readdir(SESSIONS_DIR);
  } catch {
    return; // nothing to clean up yet
  }
  await Promise.all(
    entries
      .filter((name) => name.endsWith(".json"))
      .map((name) => destroySession(name.slice(0, -".json".length))),
  );
}

/** Read every extracted frame into a base64 data URL for the browser. */
async function toThumbnails(frames: ExtractedFrame[]): Promise<ThumbnailedFrame[]> {
  return Promise.all(
    frames.map(async (frame) => {
      const bytes = await readFile(frame.framePath);
      return {
        ...frame,
        thumbnail: `data:image/png;base64,${bytes.toString("base64")}`,
      };
    }),
  );
}

/**
 * Persist a fresh extraction result as the active session and return
 * browser-ready thumbnails for it. On any failure after extraction succeeded
 * (e.g. a frame file can't be read), the new result's temp dir is cleaned up
 * before rethrowing so nothing leaks.
 */
export async function startSession(
  tempId: string,
  result: ExtractFramesResult,
): Promise<ThumbnailedFrame[]> {
  try {
    const thumbnails = await toThumbnails(result.frames);
    await clearAllSessions();
    await mkdir(SESSIONS_DIR, { recursive: true });
    const manifest: SessionManifest = { frames: result.frames };
    await writeFile(manifestPath(tempId), JSON.stringify(manifest));
    return thumbnails;
  } catch (err) {
    await result.cleanup();
    throw err;
  }
}

/** Look up the frames for a previously started session, for re-narration. */
export async function getSessionFrames(tempId: string): Promise<ExtractedFrame[] | null> {
  const manifest = await readManifest(tempId);
  return manifest?.frames ?? null;
}
