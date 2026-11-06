# Moving the app from Next.js to Bun (2026-11-06)

Asked by Julian: "migrate to bun and get all evidence of next.js out of this project". This retires two V1 rules he owns: "the upstream stack runs unchanged" (for the web side) and the do-not-touch status of the CopilotKit route and the runtime options. That is his decision, made here.

## What Next.js does for us today

| Next.js feature | Where | Replaced by |
|---|---|---|
| Builds the page (React, Tailwind 4, CSS imports, `@/` alias) | `next build` | `Bun.build` from `src/web/index.html` with `bun-plugin-tailwind` (0.1.2, pinned) |
| `app/layout.tsx`: html shell, metadata, fonts, icon | layout | `src/web/index.html` |
| `app/page.tsx` + `providers.tsx` rendered on the client | page | `src/web/main.tsx` mounts the same components with `createRoot` |
| 13 route handlers under `app/api/**/route.ts` | file-system routing | `server.ts`: one `Bun.serve` route table; the handlers move to `src/api/` unchanged (they already take a `Request` and return a `Response`) |
| Dynamic segments (`[id]`, `[station]/[step]`) | `params` promise | `Bun.serve` `:id` params, passed the same way |
| CopilotKit endpoint | `copilotRuntimeNextJSAppRouterEndpoint` | CopilotKit's own `createCopilotEndpointSingleRoute` (`@copilotkit/runtime/v2`), which is what the Next helper wraps: same runtime, same single-route mode, same base path |
| `after()` for install counting | `next/server` | dropped, with the inert `launch-telemetry.ts` it served (no telemetry, per the hard rules) |
| `NEXT_PUBLIC_*` variables in the page | build-time | `define` in the build: `COACH_STUB`, `OPEN_LINK_ALLOWED_ORIGINS` |
| `next dev` / `next start` | Makefile, scripts, Playwright | `bun run build` then `bun server.ts`; `make dev` rebuilds on change |
| Standalone server for the tester release | `scripts/build-release.sh`, `install.sh` downloads Node | `bun build --compile` per platform: one executable, no Node download |
| `eslint-config-next` | lint | `typescript-eslint` + `eslint-plugin-react-hooks` |

Spike, done before this proposal: `Bun.build` bundles the whole page (14 MB of JS, about the same as Next's 17 MB of chunks); `Bun.serve`'s own on-the-fly HTML bundling in Bun 1.2.17 writes wrong asset paths (`/../../chunk.js`) for a page that imports from outside its folder, so the page is built ahead of time and served as static files.

## What stays

- pnpm, the workspace, the lockfile, vitest and Playwright (none of them are Next).
- Every component, hook, test and the design-system package.
- The agent, its port, `127.0.0.1` binding, `DO_NOT_TRACK=1`.
- The release's shape (one tar per machine, checked by SHA-256, `install.sh`, the `local-ai-coach` launcher), with the app as a Bun executable instead of Node plus Next's standalone server.

## Places affected

- `apps/app`: `next.config.ts`, `next-env.d.ts`, `src/app/` (layout, page, providers, api) moved to `src/web/` and `src/api/`; `server.ts`, `build.ts`; package scripts; tsconfig; eslint; Playwright configs; tests that name Next paths.
- `public/`: `icon.svg` moves beside the page; the unused upstream files (Next and Vercel logos, an unused font) go.
- `Makefile`, `turbo.json`, `.gitignore`, `.dockerignore`, `.github/workflows/ci.yml`, `.env.example`.
- Release: `scripts/build-release.sh`, `install.sh`, `scripts/local-ai-coach`, `apps/agent/tests/test_release.py`.
- Docs: `CLAUDE.md` (stack, do-not-touch list), `docs/design.md`, `docs/architecture.md`, `docs/deployment.md`, `docs/bring-to-your-app.md`, `README.md`, `CONTRIBUTING.md`, `docs/telemetry.md`, the Mac install proposal (option 2 is now the path).
- Not learner-facing content: nothing in the curriculum, the book or the coach's words changes.

## Decisions that are Julian's

1. ~~Move off Next.js?~~ Yes, to Bun (Julian, 2026-11-06).
2. Package manager: this keeps pnpm. Moving to `bun install` is a separate change to the lockfile.
3. Bun version: the build uses the installed 1.2.17. A newer Bun would allow on-the-fly page bundling in development; upgrading is a deliberate dependency change.

## Done

(filled in as the work lands)
