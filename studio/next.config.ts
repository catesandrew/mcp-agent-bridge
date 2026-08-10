import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

// `studio/` is an independently-installed sibling package (no pnpm workspace
// with the repo root — see the plan doc). It imports ../src/video/pipeline.ts
// directly from outside this project's directory, which makes Next infer the
// monorepo-ish root incorrectly (it walks up and finds the root repo's
// pnpm-lock.yaml). Pinning the tracing root here silences that inference
// warning; it has no effect on `next dev`, only on build output tracing.
const nextConfig: NextConfig = {
  outputFileTracingRoot: __dirname,
};

export default nextConfig;
