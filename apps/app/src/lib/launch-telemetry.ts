/**
 * Telemetry is removed from the coach (no data leaves the learner's machine).
 *
 * Upstream's `app/api/copilotkit/route.ts` imports this module and is on the
 * do-not-touch list, so the module stays with the same exports but does nothing:
 * no network, no files, no installation id. `runtimeProperties()` returns
 * undefined, so the route adds no telemetry metadata to the CopilotKit runtime,
 * and `DO_NOT_TRACK=1` in the app's scripts turns the runtime's own telemetry off.
 */

class InertLaunchTelemetry {
  /** Always true, so the route never tees a run's stream to observe it. */
  readonly activated = true;

  runtimeProperties(): Record<string, string> | undefined {
    return undefined;
  }

  recordOpened(): Promise<void> {
    return Promise.resolve();
  }

  recordActivated(): Promise<void> {
    return Promise.resolve();
  }
}

const shared = new InertLaunchTelemetry();

export function getLaunchTelemetry(): InertLaunchTelemetry {
  return shared;
}

/** Kept for the route's signature; it is never awaited because `activated` is true. */
export async function runtimeMethod(req: Request): Promise<string | undefined> {
  void req;
  return undefined;
}

/** Kept for the route's signature; cancels the stream it is given and reports nothing. */
export async function observeRunResult(stream: ReadableStream<Uint8Array | string>): Promise<boolean> {
  await stream.cancel();
  return false;
}
