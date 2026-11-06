.PHONY: help install setup dev dev-stub dev-app dev-agent dev-mcp build lint check tail evals evals-smoke smoke release release-test clean

help: ## Show this help message
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-15s\033[0m %s\n", $$1, $$2}'

install: ## Install all dependencies (Node + Python)
	pnpm install

setup: install ## Full setup: install deps and create .env from template
	@if [ ! -f apps/agent/.env ]; then \
		printf '%s\n' 'OPENAI_API_KEY=' 'TYPESAFE_API_KEY=' 'LLM_MODEL=chat-latest' 'JEV_MODEL=jev-latest' > apps/agent/.env; \
		echo "Created apps/agent/.env — set OPENAI_API_KEY and TYPESAFE_API_KEY"; \
	else \
		echo "apps/agent/.env already exists, skipping"; \
	fi

dev: ## Start all services (frontend + agent + mcp); the agent reloads on src/ edits only
	pnpm dev

STUB_URL := http://127.0.0.1:8123/stub

dev-stub: ## Start the stub coach: no model, no keys (writes ~/.local-ai-coach/progress.stub.json)
	pnpm exec concurrently --names app,agent --kill-others \
		"cd apps/app && NEXT_PUBLIC_COACH_STUB=1 LANGGRAPH_DEPLOYMENT_URL=$(STUB_URL) pnpm dev" \
		"pnpm dev:agent"

dev-app: ## Start Next.js frontend only (http://localhost:3000)
	pnpm dev:app

dev-agent: ## Start LangGraph agent only (http://localhost:8123); reloads on src/ edits, restart after editing main.py
	pnpm dev:agent

dev-mcp: ## Start MCP server only
	pnpm dev:mcp

build: ## Build all apps
	pnpm build

lint: ## Lint all apps
	pnpm lint

release: ## Build the tester release: make release VERSION=0.1.0 (writes dist/)
	@test -n "$(VERSION)" || (echo "Set VERSION, for example: make release VERSION=0.1.0"; exit 1)
	scripts/build-release.sh $(VERSION)

release-test: ## Build, install from scratch and run the browser suite against the install (downloads ~100 MB); then the smoke test if make dev is running
	COACH_RELEASE_E2E=1 uv run --directory apps/agent pytest -q tests/test_release.py
	@if curl -s -m 5 -o /dev/null "$(SMOKE_URL)/api/health"; then $(MAKE) smoke; else echo "SMOKE NOT RUN: nothing answers at $(SMOKE_URL). Start make dev and run make smoke."; fi

SMOKE_URL ?= http://127.0.0.1:3000
smoke: ## Real-browser smoke test of the running coach (make dev): load, API keys, typing, reload. Never types a key
	cd apps/app && SMOKE_URL=$(SMOKE_URL) npx playwright test -c playwright.smoke.config.ts

evals: ## Dispatch cases against the real model, 5 runs each (ONLY=D-11,D-13 for some; REASONING=low|medium|high; needs apps/agent/.env.test)
	cd apps/agent && COACH_EVALS=1 COACH_EVALS_ONLY=$(ONLY) $(if $(REASONING),COACH_REASONING_EFFORT=$(REASONING)) uv run pytest evals -q -s -p no:cacheprovider

evals-smoke: ## D-01 to D-06 on the real curriculum (before a release)
	cd apps/agent && COACH_EVALS=1 COACH_EVALS_SMOKE=1 COACH_EVALS_REAL_CURRICULUM=1 uv run pytest evals -q -s -p no:cacheprovider

tail: ## Follow the coach's turn log: model inputs, outputs and tool calls (FULL=1 for raw JSON)
	@python3 scripts/tail-log.py

check: ## Validate the curriculum (lessons, term register, probes, voice rules)
	uv run --directory apps/agent python ../../curriculum/validate.py
	uv run --directory apps/agent python ../../curriculum/figures/make_figures.py --check

clean: ## Clean build artifacts
	pnpm clean
