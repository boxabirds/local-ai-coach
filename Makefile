.PHONY: help install setup dev dev-stub dev-app dev-agent dev-mcp build lint check clean

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

dev: ## Start all services (frontend + agent + mcp)
	pnpm dev

STUB_URL := http://127.0.0.1:8123/stub

dev-stub: ## Start the stub coach: no model, no keys (writes ~/.local-ai-coach/progress.stub.json)
	pnpm exec concurrently --names app,agent --kill-others \
		"cd apps/app && NEXT_PUBLIC_COACH_STUB=1 LANGGRAPH_DEPLOYMENT_URL=$(STUB_URL) pnpm dev" \
		"pnpm dev:agent"

dev-app: ## Start Next.js frontend only (http://localhost:3000)
	pnpm dev:app

dev-agent: ## Start LangGraph agent only (http://localhost:8123)
	pnpm dev:agent

dev-mcp: ## Start MCP server only
	pnpm dev:mcp

build: ## Build all apps
	pnpm build

lint: ## Lint all apps
	pnpm lint

check: ## Validate the curriculum (lessons, term register, probes, voice rules)
	uv run --directory apps/agent python ../../curriculum/validate.py

clean: ## Clean build artifacts
	pnpm clean
