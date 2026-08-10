"use client";

import { useCallback, useState } from "react";
import type { FrameSampleMode } from "@video/pipeline";
import type { ExtractResponseBody } from "../api/extract/route";

type Phase = "idle" | "extracting" | "narrating" | "done" | "error";

interface DisplayFrame {
  framePath: string;
  timestampSec: number;
  thumbnail: string;
  description: string | null;
}

const DEFAULTS = {
  mode: "fps" as FrameSampleMode,
  fps: 1,
  sceneThreshold: 0.4,
  batchSize: 6,
};

function formatTimestamp(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = (sec % 60).toFixed(2).padStart(5, "0");
  return `${m}:${s}`;
}

export function StudioApp() {
  const [videoPath, setVideoPath] = useState("");
  const [mode, setMode] = useState<FrameSampleMode>(DEFAULTS.mode);
  const [fps, setFps] = useState(DEFAULTS.fps);
  const [sceneThreshold, setSceneThreshold] = useState(DEFAULTS.sceneThreshold);
  const [batchSize, setBatchSize] = useState(DEFAULTS.batchSize);
  const [prompt, setPrompt] = useState("");

  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [zeroFrames, setZeroFrames] = useState(false);
  const [tempId, setTempId] = useState<string | null>(null);
  const [frames, setFrames] = useState<DisplayFrame[]>([]);
  const [narration, setNarration] = useState<string | null>(null);

  const runNarration = useCallback(
    async (sessionId: string, baseFrames: DisplayFrame[]) => {
      setPhase("narrating");
      setNarration(null);
      try {
        const res = await fetch("/api/narrate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tempId: sessionId,
            batchSize,
            prompt: prompt.trim() || undefined,
          }),
        });
        const body = await res.json();
        if (!res.ok) {
          throw new Error(body.error ?? `Narration failed (${res.status})`);
        }
        const descByPath = new Map<string, string>(
          body.frames.map((f: { framePath: string; description: string }) => [
            f.framePath,
            f.description,
          ]),
        );
        setFrames(
          baseFrames.map((f) => ({
            ...f,
            description: descByPath.get(f.framePath) ?? f.description,
          })),
        );
        setNarration(body.narration);
        setPhase("done");
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setPhase("error");
      }
    },
    [batchSize, prompt],
  );

  const runExtractAndNarrate = useCallback(async () => {
    setError(null);
    setZeroFrames(false);
    setNarration(null);
    setTempId(null);
    setFrames([]);

    if (!videoPath.trim()) {
      setError("Enter a video path first.");
      setPhase("error");
      return;
    }

    setPhase("extracting");
    try {
      const res = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          videoPath: videoPath.trim(),
          mode,
          fps,
          sceneThreshold,
        }),
      });
      const body: ExtractResponseBody & { error?: string } = await res.json();
      if (!res.ok) {
        throw new Error(body.error ?? `Extraction failed (${res.status})`);
      }
      if (body.zeroFrames || !body.tempId) {
        setZeroFrames(true);
        setPhase("idle");
        return;
      }

      const baseFrames: DisplayFrame[] = body.frames.map((f) => ({
        framePath: f.framePath,
        timestampSec: f.timestampSec,
        thumbnail: f.thumbnail,
        description: null,
      }));
      setFrames(baseFrames);
      setTempId(body.tempId);

      await runNarration(body.tempId, baseFrames);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPhase("error");
    }
  }, [videoPath, mode, fps, sceneThreshold, runNarration]);

  const rerunNarrationOnly = useCallback(() => {
    if (!tempId) return;
    void runNarration(
      tempId,
      frames.map((f) => ({ ...f, description: null })),
    );
  }, [tempId, frames, runNarration]);

  const busy = phase === "extracting" || phase === "narrating";

  return (
    <div className="shell">
      <header className="masthead">
        <div>
          <h1>Video Narration Studio</h1>
          <div className="subtitle">extractFrames → narrateFrames · local pipeline debug UI</div>
        </div>
        <span className="badge">local only</span>
      </header>

      <div className="grid-layout">
        <div>
          <div className="panel">
            <h2>Source</h2>
            <div className="field">
              <label htmlFor="videoPath">Video path</label>
              <input
                id="videoPath"
                type="text"
                placeholder="/path/to/recording.mp4"
                value={videoPath}
                onChange={(e) => setVideoPath(e.target.value)}
                disabled={busy}
              />
            </div>
          </div>

          <div className="panel">
            <h2>Sampling</h2>
            <div className="field">
              <label>Mode</label>
              <div className="mode-toggle" role="group" aria-label="Sampling mode">
                <button
                  type="button"
                  aria-pressed={mode === "fps"}
                  onClick={() => setMode("fps")}
                  disabled={busy}
                >
                  fps
                </button>
                <button
                  type="button"
                  aria-pressed={mode === "scene"}
                  onClick={() => setMode("scene")}
                  disabled={busy}
                >
                  scene
                </button>
              </div>
            </div>

            {mode === "fps" ? (
              <div className="field">
                <label htmlFor="fps">
                  Frames per second <span className="hint">default {DEFAULTS.fps}</span>
                </label>
                <input
                  id="fps"
                  type="number"
                  min={0.1}
                  step={0.1}
                  value={fps}
                  onChange={(e) => setFps(Number(e.target.value))}
                  disabled={busy}
                />
              </div>
            ) : (
              <div className="field">
                <label htmlFor="sceneThreshold">
                  Scene threshold <span className="hint">default {DEFAULTS.sceneThreshold}</span>
                </label>
                <input
                  id="sceneThreshold"
                  type="number"
                  min={0}
                  max={1}
                  step={0.01}
                  value={sceneThreshold}
                  onChange={(e) => setSceneThreshold(Number(e.target.value))}
                  disabled={busy}
                />
              </div>
            )}

            <div className="field">
              <label htmlFor="batchSize">
                Narration batch size <span className="hint">default {DEFAULTS.batchSize}</span>
              </label>
              <input
                id="batchSize"
                type="number"
                min={1}
                step={1}
                value={batchSize}
                onChange={(e) => setBatchSize(Number(e.target.value))}
                disabled={busy}
              />
            </div>

            <div className="field">
              <label htmlFor="prompt">
                Narration prompt <span className="hint">optional override</span>
              </label>
              <textarea
                id="prompt"
                placeholder="Leave blank to use the pipeline default prompt…"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                disabled={busy}
              />
            </div>

            <div className="btn-row" style={{ flexDirection: "column" }}>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => void runExtractAndNarrate()}
                disabled={busy}
              >
                {busy ? "Working…" : "Extract & Narrate"}
              </button>
              {tempId && (
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={rerunNarrationOnly}
                  disabled={busy}
                  style={{ width: "100%" }}
                >
                  Re-run narration only (same frames)
                </button>
              )}
            </div>
          </div>
        </div>

        <div>
          {phase === "extracting" && (
            <div className="status-line" style={{ marginBottom: 20 }}>
              <span className="dot-pulse" />
              Extracting frames with ffmpeg…
            </div>
          )}
          {phase === "narrating" && (
            <div className="status-line" style={{ marginBottom: 20 }}>
              <span className="dot-pulse" />
              Narrating {frames.length} frame{frames.length === 1 ? "" : "s"} with claude…
            </div>
          )}

          {zeroFrames && (
            <div className="callout callout-warn">
              <strong>0 frames extracted</strong>
              {mode === "scene"
                ? "The scene-change threshold may be too high for this video — screen recordings are often too static for the default of 0.4. Try lowering it (e.g. 0.1) and re-running."
                : "ffmpeg produced no output frames for this fps setting — double-check the video path and fps value."}
            </div>
          )}

          {error && (
            <div className="callout callout-danger">
              <strong>Something went wrong</strong>
              {error}
            </div>
          )}

          {frames.length > 0 ? (
            <div className="panel">
              <h2>
                Frames <span className="hint">({frames.length})</span>
              </h2>
              <div className="frame-grid">
                {frames.map((frame, i) => (
                  <div className="frame-card" key={frame.framePath} style={{ animationDelay: `${i * 25}ms` }}>
                    <div className="thumb-wrap">
                      {/* eslint-disable-next-line @next/next/no-img-element -- inline base64 data URL, not an optimizable static asset */}
                      <img src={frame.thumbnail} alt={`Frame at ${formatTimestamp(frame.timestampSec)}`} />
                      <span className="timestamp">{formatTimestamp(frame.timestampSec)}</span>
                    </div>
                    <div className={`description${frame.description ? "" : " pending"}`}>
                      {frame.description ?? (phase === "narrating" ? "narrating…" : "—")}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            !zeroFrames &&
            !error &&
            phase === "idle" && (
              <div className="empty-state">
                Point at a local video file and click “Extract &amp; Narrate” to see sampled frames here.
              </div>
            )
          )}

          {narration && (
            <div className="panel narration-panel">
              <h2>Narration</h2>
              <p>{narration}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
