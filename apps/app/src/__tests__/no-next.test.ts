// @vitest-environment node
/**
 * The web side is Bun (story 31, TC-12, TC-13): nothing in the repository may bring back the old
 * framework, its packages, its configuration, its build folders or its variables.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const REPO = resolve(__dirname, "../../../..");
/** Built from parts, so this file does not trip its own scan. */
const N = "Ne" + "xt";
const n = N.toLowerCase();
export const PATTERNS: RegExp[] = [
  new RegExp(`\\b${N}\\.js\\b`),
  new RegExp(`\\b${n}js\\b`, "i"),
  new RegExp(`from ["']${n}(/[a-z-]+)?["']`),
  new RegExp(`require\\(["']${n}(/[a-z-]+)?["']\\)`),
  new RegExp(`"${n}"\\s*:\\s*"`),
  new RegExp(`${n}\\.config\\.(ts|js|mjs)`),
  new RegExp(`\\.${n}(-[a-z]+)?/`),
  new RegExp(`${N.toUpperCase()}_(PUBLIC|DIST)`),
  new RegExp(`\\b${n} (dev|build|start)\\b`),
  new RegExp(`eslint-config-${n}|@${n}/`),
  new RegExp(`${N}(Request|Response|Config)\\b`),
  new RegExp(`${n}-env\\.d\\.ts`),
];
/** The move's own record names what it removed; the lockfile is checked by package name below. */
const EXEMPT = new Set(["docs/design/20261106-bun-migration-proposal.md", "pnpm-lock.yaml", "apps/app/src/__tests__/no-next.test.ts"]);
const LOCK_ENTRY = new RegExp(`^  (${n}|eslint-config-${n}|@${n}/[a-z-]+)@`, "m");

export function offenders(root: string, files: string[]): string[] {
  const found: string[] = [];
  for (const file of files) {
    if (EXEMPT.has(file)) continue;
    let text: string;
    try {
      text = readFileSync(join(root, file), "utf8");
    } catch {
      continue;
    }
    text.split("\n").forEach((line, i) => {
      if (PATTERNS.some((p) => p.test(line))) found.push(`${file}:${i + 1}: ${line.trim().slice(0, 120)}`);
    });
  }
  return found;
}

function tracked(): string[] {
  return execFileSync("git", ["ls-files"], { cwd: REPO, encoding: "utf8" }).split("\n").filter(Boolean);
}

describe("no trace of the old framework", () => {
  it("TC-13: no tracked file names it", () => {
    expect(offenders(REPO, tracked())).toEqual([]);
  });

  it("TC-13: the lockfile holds none of its packages", () => {
    expect(readFileSync(join(REPO, "pnpm-lock.yaml"), "utf8")).not.toMatch(LOCK_ENTRY);
  });

  it.each([
    ["an import", `import { x } from "${n}/server";`],
    ["a bare import", `import ${n} from '${n}';`],
    ["a dependency", `"${n}": "16.1.6",`],
    ["a config file name", `see ${n}.config.ts`],
    ["a build folder", `rm -rf .${n}-serve/`],
    ["a public variable", `${N.toUpperCase()}_PUBLIC_COACH_STUB=1`],
    ["a dev command", `run ${n} dev --turbopack`],
    ["the lint config", `eslint-config-${n}`],
    ["its name", `the ${N}.js app`],
    ["its request type", `(req: ${N}Request)`],
  ])("TC-12: finds %s", (_label, line) => {
    const root = mkdtempSync(join(tmpdir(), "no-old-framework-"));
    const file = "src/thing.ts";
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), `const ok = 1;\n${line}\n`);
    expect(offenders(root, [file])).toEqual([`${file}:2: ${line}`]);
  });

  it.each([
    ["a step's next", "show_next_step(next.jsFunctions)"],
    ["a CopilotKit prerelease", '"@copilotkit/runtime": "1.55.2-next.1"'],
    ["an iterator", "const v = it.next().value;"],
  ])("TC-12: leaves %s alone", (_label, line) => {
    const root = mkdtempSync(join(tmpdir(), "no-old-framework-"));
    writeFileSync(join(root, "a.ts"), line);
    expect(offenders(root, ["a.ts"])).toEqual([]);
  });
});
