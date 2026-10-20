# Cairn: build brief for an AI coding agent

You are asked to build **Cairn**, a self-hosted platform that makes software projects ready to be developed with AI assistants and agents, generates and maintains their documentation automatically, and reduces wasted AI tokens.

Read this whole file before writing code. Follow the phases in section 14 in order. Do not skip the acceptance criteria.

Working name: Cairn (replaceable through one config constant). Default UI language: French, with English available (i18n from day one).

---

## 1. Product in one paragraph

GitHub and GitLab manage code. Cairn manages **how a team works with AI on that code**. It scans repositories (read-only), scores how understandable they are for an AI and for a newcomer, generates living documentation and AI context files, guides each project along an **AI maturity model**, measures and reduces token waste, and governs agents and AI-written code. The pitch: "SonarQube says whether the code is good. Cairn says whether the project is understandable, safe and cheap for an AI."

## 2. Target users and the value for each

| Role | Job to be done | What they must get |
|---|---|---|
| Developer | Work faster with AI without breaking things | A mission brief before launching an agent, auto-fixable issues, up-to-date docs, a clear next action |
| Tech lead / architect | Keep the architecture from drifting when AI writes code | Architecture contract, violation detection, decision history |
| Manager | Steer the team's AI health and budget | Team score, gates, token budget and forecast, priorities |
| Platform admin | Operate the platform | Connections, rules, gates, MCP server, models, measurement sources |
| Super admin | Govern | Users, roles, budgets in euros, audit, compliance |
| Security / compliance officer | Prove control over AI usage | AI usage register, firewall statistics, audit log, provenance of AI-written code |

Primary buyer pitch (must be visible in the product and the demo): fewer wasted tokens, less AI-written code merged without review, no secret sent to a model, faster onboarding, documentation that never goes stale, evidence for AI Act and DORA type audits.

## 3. Non-negotiable principles

1. **Isolation by design.** The scanner runs in a disposable container: repository mounted read-only, no network, no access to any application database. Database schema is rebuilt from migration files, never from a live database.
2. **No external SaaS dependency at runtime.** No CDN, no third-party analytics, no external LLM by default. Everything works offline inside the company network. An internal model gateway is optional and off by default.
3. **Deterministic first, LLM last.** Facts (config, build, routes, schema, dependencies, architecture) are extracted by code at zero token cost. A model, if enabled, only writes narrative text from a diff, never from the full repository.
4. **Never write directly to a branch.** Every proposed change arrives as a merge request / pull request for human review.
5. **Privacy of people.** Never collect prompts, answers or file contents from conversations. Collect counters only. Never display individual usage. Aggregate at team or project level, with a minimum group size of 5 for any breakdown by team (below that, merge into "other").
6. **Honest numbers.** Every metric carries a provenance label: `Measured`, `Declared` or `Estimated`. Theoretical ceilings are never presented as results.
7. **Secrets are never read.** Detected sensitive files are listed by path and type only. Their content is never parsed, stored or sent anywhere.

## 4. Recommended stack

- Next.js (current stable, App Router), React, TypeScript strict.
- UI: Tailwind CSS + shadcn/ui, lucide-react icons, Recharts for charts, TanStack Table for tables, Framer Motion for subtle transitions, `next-themes` for dark mode, `cmdk` for the command palette.
- Data: PostgreSQL + Drizzle ORM (Prisma is unusable behind the corporate proxy). Redis or `pg-boss` for the job queue.
- Auth: Auth.js with OIDC (Keycloak, Entra ID, or any OIDC provider). Roles come from OIDC groups.
- Scanner worker: separate Node or Python container image, invoked per scan with a read-only mount and `--network none`.
- Validation: Zod on every API boundary. API: route handlers plus a typed client (tRPC or generated OpenAPI client).
- Telemetry ingest: OpenTelemetry-compatible HTTP endpoint plus a simple JSON endpoint.
- MCP server: official TypeScript MCP SDK, HTTP transport.
- Tests: Vitest (unit), Playwright (end to end and visual smoke), axe for accessibility.
- Deployment: Dockerfile, docker-compose for local demo, Kubernetes manifests (Kustomize) for production.
- Monorepo (pnpm workspaces): `apps/web`, `apps/worker`, `packages/scanner`, `packages/docgen`, `packages/shared`, `packages/mcp-server`, `packages/cli`.

Where a library choice is a judgment call, pick the simplest option and note it in `docs/DECISIONS.md`.

## 5. Information architecture (pages)

Sidebar groups, in this order. Show only what the role is allowed to see.

1. **Pilotage**: Overview (org dashboard), My space (developer home), My team (manager home).
2. **Work with AI**: Mission brief, Agents (flight recorder, token burn radar, context firewall), AI-written code, Living architecture, Maturity roadmap.
3. **Optimization**: Token budget, Measurement sources, AI governance (models, routing, guardrails), Gates and rules.
4. **Repositories**: Projects, Project detail (tabs below), Issues, Suggestions (merge requests), Connect a repository.
5. **Governance**: MCP server, Teams, Compliance, AI usage register, Innovation.
6. **Administration** (super admin): Users and roles, permission matrix, SSO and integrations, audit log.

Project detail tabs: Overview, Issues, Token x-ray, Documentation, Docs history, Context pack, Architecture, Database, Decisions (ADR), Onboarding, Security, Maturity.

Global: command palette (Ctrl+K), dark mode, role switcher in demo mode only, keyboard navigable, responsive down to tablet.

## 6. Feature specification

Each feature lists what it does and its acceptance rule. All of them must work on seeded demo data without any real repository (see section 12), and the scanner features must also work on a real repository.

### 6.1 Repository connection and scanning
- Connect GitHub, GitLab (self-hosted or SaaS), Azure DevOps, Bitbucket, or a local path. Wizard: provider, token (stored encrypted, scope read-only), pick repositories, pick branches, options, scan.
- Scan triggers: manual, nightly, on webhook (push, merge request opened, merge). Scan any branch; compare branches.
- Technology detection: Java/Maven/Gradle, Node/TypeScript, Python, Kotlin, .NET, Go, Docker, Kubernetes/Kustomize/Helm, CI files.
- Output of a scan: a `ScanResult` (facts), a score per axis, a list of issues, a list of generated artifacts, a maturity level.
- Acceptance: scanning the same commit twice gives identical results; a scan never modifies the repository; scan time shown.

### 6.2 AI-readiness score and axes
Five axes, each 0 to 100, with a checklist of verifiable criteria:
- Documentation: README structured, configuration reference, no drift between docs and code, decision log.
- AI context: ignore file for AI tools, repository map, short permanent instructions (under 500 tokens), scoped instructions by folder, no huge files.
- Local start: prerequisites listed, quick start documented, quick start executed in CI, measured time.
- Configuration: variables listed, defaults explicit, every variable described, required secrets identified.
- Context security: no clear-text secret, secrets excluded from AI context, no keytab or private key versioned, periodic review.
Overall score = weighted mean; ratings A to E per axis. Show a radar chart, trend over six months, and "potential score if all recommended actions are done".

### 6.3 AI maturity model and roadmap (key differentiator)
Six levels per project. The platform computes the current level from measurable criteria, shows what blocks the next level, and recommends **which AI usage mode is appropriate now**.

| Level | Name | Evidence required | Recommended AI usage |
|---|---|---|---|
| 0 | Unprepared | Nothing in place | Chat questions only, no code generation on sensitive modules |
| 1 | Assisted | README ok, secrets excluded from AI context | Chat and inline completion |
| 2 | Guided | Ignore file, short permanent instructions, config reference | Chat with file context, small edits |
| 3 | Context-engineered | Repository map, scoped instructions, MCP server connected, mission briefs used | Agent mode on small, well-defined tasks |
| 4 | Agent-ready | Architecture contract enforced, merge guards, tests run in CI, quick start verified | Agent mode on normal tasks, with review rules by risk |
| 5 | Optimized | Tokens per delivered task measured and decreasing, continuous AI evaluations, model routing | Autonomous agents with budgets and guardrails |

Roadmap view: for each project, a ladder with the current level, the exact checklist to reach the next one, estimated effort, and an "unlock" statement (for example "Reaching level 3 allows agent mode on this repository"). Organization view: distribution of projects by level and a target by quarter. Level 4 and 5 gates can be enforced as policy (block agent mode on a repository below level 3, configurable).

### 6.4 Quality gates, rules and issues (Sonar-like logic applied to AI)
- Rule catalog with types: Context leak, Documentation drift, Token hog, Ambiguity, Broken onboarding. Severities: blocker, critical, major, minor. At least 25 rules seeded.
- Each issue shows: file and line, why it matters to an AI, effort in minutes, estimated wasted tokens per month (role-restricted), assignee, and a proposed fix with a diff preview. Most issues have an automatic fix delivered as a merge request.
- Quality gate profiles (standard, strict, soft) with editable thresholds; changing a threshold recomputes the result on existing projects immediately. Conditions: score, blocking leaks, drift, permanent instruction tokens, quick start verified, context debt.
- "Clean as You Prompt": the gate applies first to files changed by the merge request, not to the legacy.
- Merge request decoration: post a comment with the gate result and top issues on the GitHub or GitLab merge request.
- Acceptance: disabling a rule removes its issues everywhere; gate status updates live.

### 6.5 Automatic documentation after each development (key differentiator)
Triggered by a merge or push webhook. Pipeline:
1. Extract facts deterministically (config keys and defaults, build commands, endpoints, schedulers, queues, schema from migrations, dependencies, environment variables, deployment manifests).
2. Diff facts against the previous commit.
3. Regenerate only the affected sections of each document.
4. Open a documentation merge request with a changelog entry and the reason.
5. If documentation no longer matches code, raise a drift issue and optionally fail a CI check (`docs-check`).

Generated documents (templates, editable, versioned):
- README quick start, prerequisites, how to run tests.
- `docs/REFERENCE.md`: configuration, build, deployment, CI jobs.
- `docs/ARCHITECTURE.md` with Mermaid C4-style diagrams, each element labeled `EXTRACTED` or `INFERRED`.
- `docs/DB_SCHEMA.md` with an ER diagram, rebuilt from migrations.
- API reference (OpenAPI from annotations or routes when available).
- Runbook (how to start, stop, check health, common failures).
- Decision log (ADR) extracted from merge requests and commits, each with its source, status `Proposed` until a human validates.
- `CHANGELOG.md` and release notes from merged merge requests, grouped by type.
- Glossary of domain terms found in the code.
- Onboarding guide ("first day"), executed in a disposable container to verify each step.
- `docs/ai/REPO_MAP.md` (compact map for agents) and AI instruction files (see 6.6).
- Optional LLM narrative: only when enabled in policy, only from the diff, with the model chosen by the routing rules, tokens recorded.

**Documentation history (must exist):** every generated document keeps versions linked to the commit and merge request that caused them. UI: a timeline per project ("what changed in the documentation, when, why, by which merge request"), a side-by-side diff between any two versions, a "freshness" badge per document (age compared with the last code change in its scope), and a decision timeline. Acceptance: for any document, one can answer "when did this sentence change and because of which change?".

### 6.6 AI context pack
Generate, propose by merge request, and keep in sync:
- Ignore file for AI tools (secrets, generated files, logs, large samples, build output).
- Permanent instruction file kept under a token budget.
- Scoped instruction files by folder (`applyTo` style) for source, tests, deployment.
- `REPO_MAP.md`: entry points, packages, key classes, where to look for what, in a compact format.
- Format adapters: GitHub Copilot instructions, `AGENTS.md`, `CLAUDE.md`, Cursor rules, with the same source of truth so teams using different tools get the same context.
- Token budget view: permanent tokens, on-demand tokens, which file is loaded when.
- Acceptance: switching tool adapter changes only the file format, not the facts.

### 6.7 Token x-ray and optimization
- Per project: list of files with token cost, kind (source, config, generated, log, secret, sample), how often an agent loads it, and a note. Interactive simulation: apply the ignore file, use generated summaries, see tokens per session before and after.
- Burn radar: causes of waste, share of each, a fix for each, "create merge request" or "create ticket". Causes at least: reading large or generated files, correction loops, blind exploration without a map, long permanent instructions, unfiltered context, repeated build errors.
- Show the **theoretical ceiling** and the **measured gain** separately and label them.
- Budget view per team: consumed, quota, end-of-month projection, alert when the projection exceeds the quota.
- Model routing simulator: share of requests routed to a lighter model and estimated saving.
- Acceptance: numbers in simulators recompute instantly; euro amounts appear only for roles allowed to see them.

### 6.8 Measurement sources (how tokens are really tracked)
The product must be explicit about where numbers come from. Implement ingestion paths and show coverage per tool.

| Source | Precision | Provenance label |
|---|---|---|
| Internal AI gateway (proxy that forwards to the models and reads the usage field of each response) | Exact per request | Measured |
| Tool telemetry (OpenTelemetry export from command-line agents, where the tool supports it; verify per tool and version) | Exact per session, counters only | Measured |
| Provider usage reports (organization-level usage APIs) | Exact but aggregated by key, model and day | Declared |
| Git signals (commit trailer such as `AI-Assisted: tool-name`, agent signatures in commits) | Share of AI-written code, no tokens | Declared |
| Estimation from context size (files an agent would read) | Approximate | Estimated |

Notes the UI must state: Copilot-type seat products expose requests and activity, not exact tokens, to the company; personal accounts on public AI services cannot be measured and should be blocked at network level and replaced by an internal offering; collect counters only, never contents.

Provide:
- `POST /api/ingest/usage` accepting `{ source, tool, model, repo?, ticket?, team, ts, tokensIn, tokensOut, cached?, durationMs?, outcome? }` and an OpenTelemetry-compatible endpoint. No user identifier field. Token-authenticated per team.
- A small CLI wrapper in `packages/cli` that sets repository and ticket context for a command-line agent and forwards counters to the ingest endpoint.
- A "Measurement sources" page: coverage by tool (percentage of estimated usage that is measured), provenance mix, setup guide per source, health of collectors.
- Primary optimization KPI: **tokens per delivered task** (closed ticket or merged merge request), compared before and after, or between projects with and without mission briefs, normalized by task size. Show it on the org, team and project views.

### 6.9 Mission brief
Before launching an agent, the user pastes a ticket or picks a task. The platform returns: files to read and why (with token cost), rules to respect, tests to run, risks, and blast radius in other repositories. Show "without brief versus with brief": files explored, round trips, tokens. Exposed in the IDE through the MCP server as a command. Acceptance: result is deterministic for a given ticket and commit; the brief itself is small (target under 2,000 tokens).

### 6.10 Agents: flight recorder, guardrails, context firewall
- Flight recorder: sessions anonymized by project and tool (never by person). Replay step by step with token share per step. Detect loops (repeated fix and test cycles), blind exploration, large-file reads, blocked actions. Recommended fix per cause, creatable as merge request.
- Guardrails: allowed tools and commands, forbidden paths, human approval for destructive actions, per-session and per-task token cap (at 80 percent summarize, at 100 percent stop cleanly with a diagnosis), loop limit.
- Context firewall: before a request reaches a model, detect and block or mask secrets, API keys, production data extracts, bank account numbers, customer data. Keep only category and count. Statistics page for admins.

### 6.11 AI-written code control
- For each merge request: share of code written by an agent, share read by a human, tests present, new dependencies (flag any dependency that is absent from the internal registry, a sign of a hallucinated or typosquatted package), sensitive modules touched, security scan signal, secret detection. Compute a risk score and a decision: Compliant, Reinforced review, Block.
- Merge guards (configurable): block unknown dependency, require second reviewer above a threshold of agent-written code, mandatory human review on sensitive modules, require tests, block secrets, block architecture violations.
- Guided review: point to the few zones to read first.
- Provenance report per repository for auditors. Measure code, never people.

### 6.12 Living architecture
- Detect layers and dependencies from code and config; draw the diagram; label `EXTRACTED` or `INFERRED`.
- Architecture contract: layers, forbidden dependencies, rules with severity, validated by the team.
- Generate the instruction file that gives the contract to the agent before it writes code. Check merge requests against the contract afterwards. Show violations introduced by an agent with a proposed fix.
- Cross-repository links from multiple connected repositories; blast radius (services, jobs, tables affected by a change).

### 6.13 Database documentation
Rebuild schema from migration files (Flyway, Liquibase, Prisma, Alembic, plain SQL), or from an ephemeral database created and destroyed inside the scan container. Never connect to a real database. Show tables, columns, keys, relations, detect drift between migrations and documentation.

### 6.14 Security of context
Detect sensitive files (keytab, keystore, private keys, credentials files, environment files) by name and structure, never read content. Generate the AI ignore rules. Show findings with treatment. Feed the context firewall rules.

### 6.15 MCP server
Expose compact, secret-free tools to any MCP-capable assistant: `get_repo_map`, `get_config_reference`, `get_architecture_contract`, `get_mission_brief`, `search_decisions`, `get_db_schema`, `check_drift`, `list_open_issues`. Each response is token-budgeted and labeled with its commit. Page with a live side-by-side demo (without MCP versus with MCP: files read, tokens, time). Authentication per team, rate limits, audit of calls (counters only).

### 6.16 Governance, compliance and innovation
- AI models catalog (status, maximum data classification allowed, price per million tokens, traffic share), routing by task, simulator.
- AI usage register: automatic inventory of AI usage detected in repositories (SDKs, assistants, model calls) with risk class and owner, exportable for audits (EU AI Act, DORA type requirements; present as support for evidence, not as legal advice).
- Audit log (kept 12 months, exportable to a SIEM), policies with toggles, compliance page.
- Innovation page: ideas with impact, effort, horizon and voting. Seed these: continuous AI evaluations, blast radius before change, team memory for agents, token cap per task, semantic cache for frequent questions, validated prompt library, FinOps chargeback by cost center, stale-answer detector.
- Continuous AI evaluations: replay a fixed set of tasks nightly on each model and each version of the instruction files; track quality, tokens and cost; block regressions.

### 6.17 Dashboards by role
- Super admin and admin: org score trend, maturity distribution, gates, issues by type, activity feed, heat map by team and axis, highest-gain actions, tokens saved (volumes), euros saved (super admin and manager only).
- Manager: team score, gates, context debt, token budget and projection, projects, top priorities by wasted tokens. No individual data.
- Developer: greeting, best next action, my projects, my tasks, my merge requests, "prepare a mission" shortcut, practical tips with no usage numbers. Never any token, quota or cost figure.

## 7. Roles and visibility

| Capability | Super admin | Admin | Manager | Developer |
|---|---|---|---|---|
| All teams and projects | yes | yes | own team | own team |
| Token volumes | yes | yes | own team | no |
| Euro amounts and budgets | yes | no | own team | no |
| Rules, gates, models, MCP | yes | yes | no | no |
| Users, roles, audit | yes | no | no | no |
| Individual usage | never collected | never collected | never collected | never collected |

Enforce permissions on the server (route handlers and data access layer), not only in the UI. A forbidden page shows an "access restricted" screen and the attempt is logged. Add a demo-only role switcher guarded by an environment flag.

## 8. Data model (minimum)

`Organization, Team, User, Role, Connection (provider, encrypted token ref, scopes), Repository, Branch, Scan, ScanFact, Score (axis, value), MaturityLevel, Rule, Issue (rule, repo, path, line, effort, wastedTokens, status, assignee), Gate (profile, conditions), GateResult, Artifact (type, path, version), ArtifactVersion (commit, mergeRequest, contentHash, diff), Decision (ADR), Suggestion (merge request proposal, status), UsageEvent (source, tool, model, repo, ticket, team, tokensIn, tokensOut, provenance, ts; no user), AgentSession (anonymized), AiChange (merge request, aiShare, reviewShare, tests, dependencies, risk), ArchitectureContract, Violation, MissionBrief, Policy, Guardrail, FirewallStat (category, count), ModelCatalog, AuditEvent, Idea, Vote`.

Index `UsageEvent` by `(team, repo, ts)`. Partition or roll up daily to keep dashboards fast. Retention configurable.

## 9. API surface (internal, typed, versioned under `/api/v1`)

Repositories and scans, scores, issues, gates, artifacts and their versions, suggestions, maturity, usage ingest, usage queries (aggregated only), agents and sessions (anonymized), AI changes, contracts and violations, briefs, MCP, models and policies, users and roles, audit. Every list endpoint supports pagination, filtering and sorting. Every endpoint checks role and team scope.

## 10. Design guidelines

- Clean, professional, dense but calm; shadcn/ui look; neutral zinc palette with one green brand accent; semantic colors only for status (green good, amber warning, red critical, blue info).
- Light and dark themes, WCAG AA contrast, visible focus, keyboard support for all interactive elements, reduced-motion support.
- Components to build once and reuse: KPI card, score ring, radar, sparkline, line chart, bar rows, heat map, diff viewer, code block, timeline, stepper, badge, pill, empty state, restricted state, locked card ("hidden for your role"), command palette, confirmation dialog, toast.
- Every number that is estimated or derived shows its provenance label on hover.
- Empty, loading and error states for every page.
- Reference UX: the HTML prototype in `prototype/ai-readiness/` of the source repository (same navigation, same tone). It is a visual and wording reference, not code to port.

## 11. Security requirements

- OWASP Top 10 aware: server-side authorization on every route, CSRF protection, strict CSP, output encoding, parameterized queries, rate limiting, secure cookies.
- Provider tokens encrypted at rest (envelope encryption, key from the environment or a vault), never logged, never returned by the API.
- Scanner container: read-only mount, no network, resource and time limits, non-root user, dropped capabilities.
- Webhook signature verification. Idempotent webhook handling.
- Audit log for every sensitive action (connect repository, change gate or policy, view restricted page attempt, role change).
- No telemetry leaves the deployment.
- Dependency policy: pin versions, run a dependency audit in CI.

## 12. Demo mode and seed data

The product must be fully demonstrable with no connected repository:
- Seed 9 or more projects across 5 teams, mixed technologies and providers, scores from 28 to 85, maturity levels 0 to 4.
- Seed at least 25 rules, 30 issues, 12 agent sessions (loops, blind exploration, large reads, blocked actions, good sessions), 8 AI-written changes with varied risk, architecture contracts for 3 projects, 3 mission briefs, 5 usage sources with different provenance labels, a documentation history with at least 10 versions on one project.
- Mark all seeded data clearly as fictitious. Use a `DEMO_MODE=true` flag.
- Include one real example: scan a small public sample repository included in `fixtures/` to prove the scanner end to end.

## 13. Quality, testing and CI

- Unit tests for scoring, maturity computation, gate evaluation, risk score, token provenance mixing, documentation diff and freshness.
- Golden-file tests for generated documents (same input, same output).
- Playwright tests: each role visits each page without error; developer role never shows tokens, euros or quotas; restricted pages show the restricted screen.
- Accessibility check (axe) on main pages.
- CI pipeline: lint, type check, unit tests, build, end-to-end tests, container build, dependency audit.
- Provide `README.md` (quick start in under 10 minutes with `docker compose up`), `docs/ARCHITECTURE.md`, `docs/DECISIONS.md`, `docs/SECURITY.md`, `docs/MEASUREMENT.md`.

## 14. Delivery phases (build in this order, stop and verify after each)

1. **Foundation**: monorepo, design system, layout, auth with roles, i18n, demo seed, role-aware navigation, restricted states. *Accept:* every role can log in (demo) and sees the right menu.
2. **Scanner core**: connect a local path, detect stack, extract facts, compute five axes and scores, issues and rules, gate evaluation. *Accept:* deterministic results on the fixture repository.
3. **Projects experience**: project list, project overview, issues with fix preview, gates and rules editor, token x-ray with simulation.
4. **Documentation engine**: generators, drift detection, documentation merge request proposal, documentation history with versions, diffs and freshness. *Accept:* the "when and why did this change" question is answerable for each document.
5. **AI context and MCP**: context pack with tool adapters, token budget view, MCP server with live demo page.
6. **Maturity model and roadmap**: level computation, ladder per project, org distribution, policy enforcement option.
7. **Work with AI**: mission brief, agent flight recorder, burn radar, guardrails, context firewall page, AI-written code risk and merge guards, living architecture contract.
8. **Measurement**: ingest endpoints, CLI wrapper, measurement sources page, tokens per delivered task, provenance labels everywhere.
9. **Providers**: GitHub and GitLab connections, webhooks, merge request creation and decoration.
10. **Governance**: models catalog, routing simulator, usage register, audit, compliance, innovation page, admin pages.
11. **Hardening**: security review against section 11, performance pass, accessibility pass, documentation, production manifests.

At the end of each phase, update `docs/DECISIONS.md` and run the full test suite.

## 15. Definition of done

- Every feature in section 6 is reachable from the navigation and works in demo mode.
- Developers never see tokens, euros, quotas or other teams, verified by automated tests.
- No individual usage is stored or displayed anywhere.
- Every metric shows its provenance label.
- A generated document set can be produced for the fixture repository and for any repository passed to the CLI: `Cairn scan <path>` prints score, maturity level and top issues, and `Cairn docs <path>` writes the documents without modifying anything else.
- The scanner demonstrably runs with a read-only mount and no network.
- Lint, type check, tests and build pass in CI.

## 16. Questions the agent should ask the owner before coding (if not answered)

1. Which OIDC provider and group names map to the four roles?
2. Which Git providers must be supported first?
3. Is an internal model gateway available, and which tools should send telemetry first?
4. Where must generated documentation live: inside each repository under `docs/`, or in a separate documentation repository?
5. Which languages and frameworks must the scanner support in version one?
6. What is the target hosting (Kubernetes, VM, docker compose) and database?
