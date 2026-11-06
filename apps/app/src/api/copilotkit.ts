/**
 * The chat's CopilotKit endpoint (story 31): the same runtime, single-route mode and base path
 * as upstream's route, through CopilotKit's own framework-free endpoint, which is what
 * upstream's framework helper wrapped. No telemetry: the coach sends nothing anywhere.
 */
import { CopilotRuntime, ExperimentalEmptyAdapter } from "@copilotkit/runtime";
import { createCopilotEndpointSingleRoute } from "@copilotkit/runtime/v2";
import { readProviderHeaders, PROVIDER_KEY_INPUT_ERROR } from "@/lib/provider-keys";
import { buildRuntimeOptions } from "@/lib/copilotkit-runtime-options";

export const COPILOT_PATH = "/api/copilotkit";
const TOO_MANY = 429;
const BAD_INPUT = 400;
const PRUNE_EVERY_MS = 300_000;

// Simple in-memory sliding-window rate limiter (per IP), from upstream.
// Enable via RATE_LIMIT_ENABLED=true; off by default.
const RATE_LIMIT_ENABLED = process.env.RATE_LIMIT_ENABLED === "true";
const RATE_LIMIT_WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS) || 60_000;
const RATE_LIMIT_MAX = Number(process.env.RATE_LIMIT_MAX) || 40;
const hits = new Map<string, number[]>();

function isRateLimited(ip: string): boolean {
  if (!RATE_LIMIT_ENABLED) return false;
  const now = Date.now();
  const timestamps = hits.get(ip)?.filter((t) => t > now - RATE_LIMIT_WINDOW_MS) ?? [];
  timestamps.push(now);
  hits.set(ip, timestamps);
  return timestamps.length > RATE_LIMIT_MAX;
}

if (RATE_LIMIT_ENABLED) {
  setInterval(() => {
    const cutoff = Date.now() - RATE_LIMIT_WINDOW_MS;
    hits.forEach((timestamps, ip) => {
      const recent = timestamps.filter((t) => t > cutoff);
      if (recent.length === 0) hits.delete(ip);
      else hits.set(ip, recent);
    });
  }, PRUNE_EVERY_MS);
}

export async function POST(req: Request): Promise<Response> {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (isRateLimited(ip)) return new Response("Too many requests", { status: TOO_MANY });

  let providerHeaders;
  try {
    providerHeaders = readProviderHeaders(req.headers);
  } catch {
    return Response.json({ error: PROVIDER_KEY_INPUT_ERROR }, { status: BAD_INPUT, headers: { "Cache-Control": "no-store" } });
  }
  // Construct the agent per request so one visitor's keys cannot reach another.
  const runtime = new CopilotRuntime(
    buildRuntimeOptions({
      langgraphUrl: process.env.LANGGRAPH_DEPLOYMENT_URL,
      mcpServerUrl: process.env.MCP_SERVER_URL,
      providerHeaders,
    }),
  );
  runtime.handleServiceAdapter(new ExperimentalEmptyAdapter());
  const endpoint = createCopilotEndpointSingleRoute({ runtime: runtime.instance, basePath: COPILOT_PATH });
  return endpoint.fetch(req);
}
