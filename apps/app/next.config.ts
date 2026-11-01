import path from "node:path";
import type { NextConfig } from "next";

// The monorepo root. Without this, Next.js picks the first lockfile it finds
// above the app (for example a stray ~/package-lock.json), watches that whole
// folder and fails to resolve workspace packages.
const WORKSPACE_ROOT = path.join(__dirname, "..", "..");

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: WORKSPACE_ROOT,
  serverExternalPackages: ["@copilotkit/runtime"],
  turbopack: { root: WORKSPACE_ROOT },
};

export default nextConfig;
