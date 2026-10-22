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
| `packages/git` | Provider APIs (GitHub, GitLab), safe single-branch clone, token encryption |
| `packages/llm` | Internal CACIB LLM client, context firewall, usage recording |

## Importing a repository (superadmin)

`/projects/import` clones **one branch** of a GitHub or GitLab repository for real: the web app checks the token, the repository and the branch against the provider, records the request, and the worker clones (`--depth 1 --single-branch`), scans the stack and deletes the working copy.

Setup (in `.env`):

- `DATABASE_URL`, then `pnpm db:migrate`; start `pnpm dev:worker` (it consumes the import queue).
- `CAIRN_SECRET_KEY`: 32 random bytes in base64, encrypts tokens at rest (AES-256-GCM).
- `GIT_HOSTS`: the only Git hosts Cairn may contact (egress allowlist). Add your self-hosted GitLab / GitHub Enterprise here.
- Behind a corporate proxy: `NODE_USE_ENV_PROXY=1` (Node's fetch), `HTTPS_PROXY`/`NO_PROXY`, and `NODE_EXTRA_CA_CERTS` / `GIT_SSL_CAINFO` for TLS inspection.
- Token scopes (read-only): GitLab `read_api` + `read_repository`; GitHub fine-grained "Contents: Read".

Check connectivity from the command line, without the UI or the database:

```bash
GIT_TOKEN=... pnpm --filter @cairn/worker smoke gitlab https://gitlab.example.com/group/project main
```

Try the whole flow without any real server: `pnpm --filter @cairn/git forge` starts a local GitLab-style server (real git over HTTP) on `http://127.0.0.1:4010`; add `http://127.0.0.1:4010` to `GIT_HOSTS` and import `http://127.0.0.1:4010/acme/payments-api` with token `demo-token`.

The role check runs in every server action. With `DEMO_MODE=true` the role comes from a cookie, so imports are refused on production builds until OIDC is wired.

## The scan of an imported repository

After the clone, the worker reads the repository the way Sonar does: deterministic, no AI, nothing written back to the project.

- **Numbers**: files, lines, estimated tokens (1 token per 4 bytes, always labelled as an estimate), tokens useful to an assistant versus noise (data, generated files, binaries), by kind, language and module.
- **Architecture** (`/projects/<id>/architecture`): Spring Boot services, Angular apps, shared libraries, components by role, databases (from Maven dependencies), MQ queues and external systems (from the configuration of a reference environment), CI pipeline and images. Every node and link says whether it was `extracted` or `inferred`. The layering contract is Cairn's default and says it has not been validated by a team.
- **Code map** (`/projects/<id>/code-map`): Java packages and TypeScript folders grouped into modules, entry-point classes, JPA tables, the main external libraries, imports counted per pair of modules.
- **Secrets**: only the file, line and key name are kept. The value is never stored nor shown.
- **Incremental**: per-file facts are cached by git blob hash. "Re-scanner" on the project page queues a new run with the stored credential; unchanged files are not read again. Bump `EXTRACTOR_VERSION` (`packages/shared/src/scan.ts`) when an extractor changes, otherwise cached facts are reused.

## Internal LLM

Disabled by default (`LLM_ENABLED=false`). To enable, set `LLM_BASE_URL`, `LLM_MODEL_DEFAULT` and the gateway credentials in `.env`. Only the gateway host is reachable from the worker. See section 5 of docs/STACK.md.
