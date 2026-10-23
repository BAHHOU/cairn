# Cairn: technology stack

Status: proposed, versions verified against the internal registry on 2026-10-20.
Rule: one tool per job, no runtime dependency on any external service.

## 1. Architecture in one picture

```
Browser ──► apps/web (Next.js 16, React 19)  ──► PostgreSQL 17 (Drizzle + pg-boss queue)
              │  UI + route handlers + server actions          ▲
              │  Auth (OIDC), RBAC, ingest, MCP endpoint       │
              ▼                                                │
         apps/worker (Node 24) ── consumes jobs ───────────────┘
              │
              ├─► scanner container   read-only mount, --network none, no DB   (facts only)
              └─► packages/llm ──► internal CACIB LLM gateway (OpenAI-compatible)  (narrative only)
```

Key point: the scanner never talks to the LLM and has no network. Facts come out of the container as JSON. The worker (not the scanner) calls the internal LLM, with a secret firewall in front and usage recording behind.

## 2. Core choices

| Area | Choice | Version | Why |
|---|---|---|---|
| Runtime | Node.js LTS | 24 | Already installed, long support |
| Package manager | pnpm workspaces | 11.x | Strict, fast, monorepo native |
| Language | TypeScript strict | 6.0 | TS 7 (native) is too new for the Next.js toolchain, revisit later |
| Framework | Next.js App Router, Turbopack | 16.4 | Front and back in one deployable, server components, route handlers, server actions |
| UI runtime | React + React Compiler | 19.3 | No manual memoization |
| Styling | Tailwind CSS | 4.3 | CSS-first config, tokens as CSS variables |
| Components | shadcn/ui pattern, code owned in `apps/web/src/components/ui` | Radix primitives | The shadcn CLI needs ui.shadcn.com, blocked by the proxy: components are written by hand in the same shape, so they stay compatible if the CLI becomes reachable |
| Lint and format | Biome | 2.x | One tool instead of ESLint + Prettier |
| Database | PostgreSQL | 17 | One datastore for data, queue and (later) vectors |
| ORM and migrations | Drizzle ORM + drizzle-kit | 0.45 / 0.31 | Pure TypeScript, plain SQL migrations, no binary download. Prisma was tried and dropped: its engines come from binaries.prisma.sh, blocked by the corporate proxy (407) |
| Job queue | pg-boss | 12 | Queue on PostgreSQL, no Redis to operate |
| Validation | Zod | 4 | One schema for API, forms, env, LLM structured output |
| Auth | Better Auth (generic OIDC plugin) | 1.7 | Keycloak or Entra ID, roles from groups. Auth.js v5 is still beta |
| Logging | pino | 10 | Structured, fast |
| Tests | Vitest, Playwright, axe-core | 5, 1.64 | Unit, end to end, accessibility |

## 3. Frontend libraries

| Need | Library | Notes |
|---|---|---|
| Design system | shadcn/ui + Radix primitives | Zinc theme, one green accent, dark mode |
| Icons | lucide-react | |
| Theme | next-themes | |
| Command palette | cmdk | Ctrl+K |
| Charts | Recharts 3 | Radar, sparkline, bars, lines |
| Tables | TanStack Table 8 | shadcn data-table pattern (v8 pinned on purpose) |
| Server state | TanStack Query 5 | Only for client-side polling and mutations. Prefer server components |
| URL state | nuqs | Filters and tabs in the URL |
| Forms | react-hook-form + @hookform/resolvers + Zod | |
| i18n | next-intl | French default, English available |
| Toasts | sonner | |
| Motion | motion | Subtle transitions, respects reduced motion |
| Code and diff | shiki, react-diff-viewer-continued | Docs history side-by-side diff |
| Markdown | react-markdown + remark-gfm | Render generated docs |
| Diagrams | mermaid (bundled, no CDN), @xyflow/react | C4 and architecture contract |
| Virtual lists | @tanstack/react-virtual | Token x-ray with thousands of files |

## 4. Backend and domain libraries

| Need | Library | Notes |
|---|---|---|
| API style | Route handlers + Server Actions + Zod | No tRPC: fewer layers. OpenAPI generated from Zod 4 JSON Schema |
| Env validation | @t3-oss/env-nextjs | Fails fast at boot |
| Scanner parsing | fast-glob, ignore, yaml, smol-toml, fast-xml-parser, web-tree-sitter (WASM) | No native build, works in a locked-down container |
| Git access | git CLI through execa | Present in the scanner image, read-only |
| Token counting | gpt-tokenizer | Offline. Result is labeled Estimated unless the gateway reports usage |
| Doc diff and freshness | diff | |
| MCP server | @modelcontextprotocol/sdk | HTTP transport, mounted by the web app |
| Telemetry ingest | OpenTelemetry JSON over HTTP, plain JSON endpoint | Counters only, no user field |
| Observability | OpenTelemetry SDK, Prometheus metrics endpoint | Exports go to the internal collector only |
| Secrets at rest | Node crypto envelope encryption, key from env or vault | Provider tokens |

## 5. Internal LLM integration (CACIB gateway)

Goal: the platform uses the LLMs deployed inside CACIB, never an external provider.

Design:
- `packages/llm` exposes a small port: `generateText`, `generateObject` (Zod schema), `embed`, `countTokens`.
- Adapter: Vercel AI SDK (`ai` + `@ai-sdk/openai-compatible`). Most internal gateways (LiteLLM, vLLM, Azure-style, Ollama, API management in front of them) speak the OpenAI-compatible protocol, so the base URL and model names are configuration, not code. If the CACIB gateway uses another protocol, only the adapter changes.
- Configuration (all in `.env`, validated by Zod):
  - `LLM_ENABLED` (default `false`, platform works fully without it)
  - `LLM_BASE_URL`, `LLM_API_KEY` or `LLM_AUTH_HEADER` (for gateway-specific auth)
  - `LLM_MODEL_DEFAULT`, `LLM_MODEL_SMALL`, `LLM_MODEL_EMBED`
  - `LLM_TIMEOUT_MS`, `LLM_MAX_INPUT_TOKENS`, `LLM_MAX_OUTPUT_TOKENS`
  - `NODE_EXTRA_CA_CERTS` for the corporate certificate authority
- Safety rails, enforced in code, not by convention:
  1. Egress allowlist: only the host of `LLM_BASE_URL` is reachable from the worker. Anything else is refused.
  2. Context firewall before every call: secrets, keys, account numbers, customer data are masked. Only category and count are kept.
  3. Input comes from facts and diffs, never from the whole repository, and is capped by `LLM_MAX_INPUT_TOKENS`.
  4. Usage recorded after every call from the `usage` field of the response, stored as `UsageEvent` with provenance `Measured`, no user id. Cairn eats its own dog food: its own LLM cost is visible in the token budget.
  5. Deterministic fallback: if the LLM is disabled or fails, documents are generated from facts with templates.
  6. Prompts are versioned files in `packages/llm/prompts`, covered by golden tests.
- What the LLM does: narrative sections of docs from a diff, ADR draft wording, fix explanations, glossary wording. What it never does: scoring, gates, maturity, architecture violations (all deterministic).
- Optional later: embeddings for semantic search of decisions and docs, stored with `pgvector` in the same PostgreSQL.
- Note on the AI SDK: the `ai` package pulls `@ai-sdk/gateway` (Vercel AI Gateway, an external service). Cairn never uses it: models are always created from the OpenAI-compatible provider with an explicit base URL, and the egress allowlist would refuse any other host anyway. A CI check must fail if a model is referenced by plain string (which would route to the external gateway).

Open questions for the platform owner are listed in section 8.

## 6. Repository layout

```
cairn/
  apps/
    web/            Next.js 16 app (UI, route handlers, server actions, MCP endpoint)
    worker/         Node process: pg-boss consumers, runs scanner container, calls LLM
  packages/
    shared/         Zod schemas, types, roles and permissions, provenance model
    db/             Drizzle schema, migrations, client, seed (demo mode)
    scanner/        Fact extraction, scoring, rules, gates, maturity (pure, deterministic)
    llm/            Internal LLM port, adapter, firewall, usage recorder, prompts
    docgen/         Document generators and templates (added in phase 4)
    mcp-server/     MCP tool definitions (added in phase 5)
    cli/            `cairn scan`, `cairn docs` (added in phase 8)
  docs/             STACK.md, BUILD_BRIEF.md, DECISIONS.md
  infra/            docker-compose, Dockerfiles, Kustomize
```

Dependency rule: `shared` depends on nothing; `scanner`, `llm`, `db` depend on `shared`; apps depend on packages; packages never depend on apps. Domain logic lives in packages so it can be tested without Next.js.

## 7. Alternatives considered

| Topic | Chosen | Rejected | Reason |
|---|---|---|---|
| Queue | pg-boss | BullMQ + Redis | One less service to run and secure |
| Auth | Better Auth | Auth.js 4/5, Keycloak adapters only | Auth.js v5 still beta, Better Auth has OIDC and is actively maintained |
| ORM | Drizzle 0.45 | Prisma 7 | Engine binaries cannot be downloaded through the corporate proxy. Drizzle needs only npm packages |
| API | Route handlers + Zod | tRPC | Public ingest and MCP need plain HTTP anyway |
| LLM client | AI SDK | Hand-written fetch, LangChain | Typed structured output, small, provider-neutral. LangChain is too heavy for this need |
| Lint | Biome | ESLint + Prettier | One fast tool |
| Components | shadcn/ui | MUI, Ant | Owned code, Tailwind native, matches the prototype look |
| Monorepo runner | pnpm -r | Turborepo, Nx | Add Turborepo only when build time hurts |
| TypeScript | 6.0 | 7.0 native | Ecosystem support not yet validated |

## 8. Questions to settle with the owner of the internal LLM platform

1. Protocol: is it OpenAI-compatible (`/v1/chat/completions`)? If not, which one?
2. Base URL per environment and how to authenticate (API key, bearer token from OIDC, mutual TLS, custom header)?
3. Model names available and their data-classification ceiling (can internal source code be sent?).
4. Does the response include a `usage` field (prompt and completion tokens)? Required for Measured provenance.
5. Rate limits, maximum context size, streaming supported?
6. Is an embedding model available?
7. Does the gateway log prompts, and who can read them?

## 9. Versions pinned at setup (2026-10-20)

next 16.4.2, react and react-dom 19.3.1, typescript 6.0.3, tailwindcss 4.3.3, shadcn 4.22.1 (reference only), drizzle-orm 0.45.4, drizzle-kit 0.31.11, better-auth 1.7.11, zod 4.6.7, @tanstack/react-query 5.104.5, recharts 3.10.1, ai 7.0.146, @ai-sdk/openai-compatible 3.0.74, @modelcontextprotocol/sdk 1.32.1, pg-boss 12.38.0, vitest 5.0.5, @playwright/test 1.64.1, @biomejs/biome 2.5.15, pnpm 11.28.6.
