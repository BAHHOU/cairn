# Cairn

Des projets lisibles, documentés et sûrs pour l'IA, au moindre coût en tokens.

Documents: [docs/STACK.md](docs/STACK.md) (technology choices), [docs/BUILD_BRIEF.md](docs/BUILD_BRIEF.md) (product specification).

## Prerequisites

- Node.js 24, pnpm 11 (`npm i -g pnpm@11`)
- Docker (for the local PostgreSQL)

## Quick start

```bash
cp .env.example .env
docker compose -f infra/docker-compose.yml up -d
pnpm install
pnpm db:generate    # SQL migration from the Drizzle schema
pnpm db:migrate
pnpm dev            # web on http://localhost:3000
pnpm dev:worker     # background worker (scan queue)
```

## Layout

| Path | Role |
|---|---|
| `apps/web` | Next.js 16 app: UI, route handlers, server actions |
| `apps/worker` | pg-boss consumers, scanner runs, internal LLM calls |
| `packages/shared` | Zod schemas, roles, provenance |
| `packages/db` | Drizzle schema, migrations and client |
| `packages/scanner` | Deterministic fact extraction (read-only) |
| `packages/llm` | Internal CACIB LLM client, context firewall, usage recording |

## Internal LLM

Disabled by default (`LLM_ENABLED=false`). To enable, set `LLM_BASE_URL`, `LLM_MODEL_DEFAULT` and the gateway credentials in `.env`. Only the gateway host is reachable from the worker. See section 5 of docs/STACK.md.
