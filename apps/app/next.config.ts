import path from "node:path";
import type { NextConfig } from "next";

// The monorepo root. Without this, Next.js picks the first lockfile it finds
// above the app (for example a stray ~/package-lock.json), watches that whole
// folder and fails to resolve workspace packages.
const WORKSPACE_ROOT = path.join(__dirname, "..", "..");

const nextConfig: NextConfig = {
  // Test builds go to their own folder (NEXT_DIST_DIR=.next-e2e), so building for the browser
  // suite never rewrites the folder a running `make dev` serves from.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // No floating "Compiling" badge in development: it covers the chat and says nothing a
  // learner or the author needs; the terminal already shows compiles.
  devIndicators: false,
  output: "standalone",
  outputFileTracingRoot: WORKSPACE_ROOT,
  serverExternalPackages: ["@copilotkit/runtime"],
  turbopack: { root: WORKSPACE_ROOT },
  // The coach serves no optimised images, so Next never loads sharp; the release
  // script removes sharp's native binary so the server is plain JavaScript that runs
  // on any Mac or Linux machine (Ceetrix story 6).
  images: { unoptimized: true },
};

export default nextConfig;
