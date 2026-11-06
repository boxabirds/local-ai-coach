import { describe, expect, it } from "vitest";
import { fromTheCoach } from "../coach-routes";

/**
 * The guard in front of the agent's settings (stories 16 and 21). Next's dev server reports
 * request.url as localhost whatever address the browser used, so the guard must judge the
 * Host the browser sent, and only a loopback Host is the coach.
 */
const NEXT_URL = "http://localhost:3000/api/coach-keys"; // what Next gives the route
const asSent = (host: string, origin: string | null, site = "same-origin") =>
  ({ url: NEXT_URL, headers: new Headers({ host, "sec-fetch-site": site, ...(origin && { origin }) }) }) as unknown as Request;

describe("fromTheCoach", () => {
  it.each([["localhost:3000"], ["127.0.0.1:3000"], ["[::1]:3000"]])("accepts the coach's own page at %s", (host) => {
    expect(fromTheCoach(asSent(host, `http://${host}`))).toBe(true);
  });

  it.each([
    ["another site", "127.0.0.1:3000", "https://evil.example", "cross-site"],
    ["a site rebound to this computer", "evil.example:3000", "http://evil.example:3000", "same-origin"],
    ["the right origin but not same-origin", "127.0.0.1:3000", "http://127.0.0.1:3000", "cross-site"],
    ["a different port", "127.0.0.1:3000", "http://127.0.0.1:4000", "same-origin"],
  ])("refuses %s", (_label, host, origin, site) => {
    expect(fromTheCoach(asSent(host, origin, site))).toBe(false);
  });

  it("refuses a request with no Origin", () => {
    expect(fromTheCoach(asSent("127.0.0.1:3000", null))).toBe(false);
  });
});
