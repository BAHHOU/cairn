import {
  type CodeGraph,
  type DeliveryView,
  type DocsView,
  IMPORT_STATUSES,
  type ImportFacts,
  type OnboardingView,
  type ProjectArchitecture,
  type ScanFileRecord,
  type ScanReport,
} from "@cairn/shared";
import {
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const provenanceEnum = pgEnum("provenance", ["measured", "declared", "estimated"]);
export const importStatusEnum = pgEnum("import_status", IMPORT_STATUSES);

const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const teams = pgTable("team", {
  id: id(),
  name: text("name").notNull().unique(),
  createdAt: createdAt(),
});

export const repositories = pgTable(
  "repository",
  {
    id: id(),
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id),
    name: text("name").notNull(),
    provider: text("provider").notNull(),
    /** Web URL of the project on its provider. */
    url: text("url"),
    /** Git host as configured in GIT_HOSTS (`host` or `host:port`). */
    host: text("host").notNull(),
    /** `owner/repo` or `group/subgroup/project` on the provider. */
    fullPath: text("full_path").notNull(),
    /** The branch Cairn tracks for this project. The same repository on two branches = two projects. */
    branch: text("branch").notNull(),
    defaultBranch: text("default_branch").notNull().default("main"),
    /** Provider token, AES-256-GCM (see @cairn/git credentials). Null for public repositories. */
    credentialEnc: text("credential_enc"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("repository_team_name").on(t.teamId, t.name),
    uniqueIndex("repository_source").on(t.host, t.fullPath, t.branch),
  ],
);

export const repositoryImports = pgTable(
  "repository_import",
  {
    id: id(),
    repositoryId: text("repository_id")
      .notNull()
      .references(() => repositories.id, { onDelete: "cascade" }),
    status: importStatusEnum("status").notNull().default("queued"),
    requestedSha: text("requested_sha"),
    commitSha: text("commit_sha"),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    facts: jsonb("facts").$type<ImportFacts>(),
    requestedBy: text("requested_by").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("repository_import_repo_created").on(t.repositoryId, t.createdAt)],
);

/**
 * The result of reading an imported repository: numbers, architecture, code map. One per import.
 * `fileIndex` (hash and facts of every file) only lives on the latest scan of a repository: it is
 * what lets the next scan skip every file whose hash did not change.
 */
export const repositoryScans = pgTable(
  "repository_scan",
  {
    id: id(),
    repositoryId: text("repository_id")
      .notNull()
      .references(() => repositories.id, { onDelete: "cascade" }),
    importId: text("import_id")
      .notNull()
      .references(() => repositoryImports.id, { onDelete: "cascade" }),
    commitSha: text("commit_sha").notNull(),
    report: jsonb("report").$type<ScanReport>().notNull(),
    architecture: jsonb("architecture").$type<ProjectArchitecture>().notNull(),
    codeGraph: jsonb("code_graph").$type<CodeGraph>().notNull(),
    /** Null for scans made before the guides existed, and for repositories without a pipeline file. */
    delivery: jsonb("delivery").$type<DeliveryView>(),
    onboarding: jsonb("onboarding").$type<OnboardingView>(),
    docs: jsonb("docs").$type<DocsView>(),
    fileIndex: jsonb("file_index").$type<ScanFileRecord[]>(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("repository_scan_import").on(t.importId),
    index("repository_scan_repo_created").on(t.repositoryId, t.createdAt),
  ],
);

export const scans = pgTable(
  "scan",
  {
    id: id(),
    repositoryId: text("repository_id")
      .notNull()
      .references(() => repositories.id),
    commitSha: text("commit_sha").notNull(),
    /** Facts extracted by the isolated scanner (no secret content). */
    facts: jsonb("facts").notNull(),
    score: integer("score").notNull(),
    axes: jsonb("axes").notNull(),
    maturity: integer("maturity").notNull(),
    durationMs: integer("duration_ms").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("scan_repo_commit").on(t.repositoryId, t.commitSha)],
);

/** Counter only. There is deliberately NO user column: usage is never attributed to a person. */
export const usageEvents = pgTable(
  "usage_event",
  {
    id: id(),
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id),
    source: text("source").notNull(),
    tool: text("tool").notNull(),
    model: text("model").notNull(),
    repo: text("repo"),
    ticket: text("ticket"),
    tokensIn: integer("tokens_in").notNull(),
    tokensOut: integer("tokens_out").notNull(),
    cached: integer("cached"),
    durationMs: integer("duration_ms"),
    outcome: text("outcome"),
    provenance: provenanceEnum("provenance").notNull(),
    ts: timestamp("ts", { withTimezone: true }).notNull(),
  },
  (t) => [index("usage_team_repo_ts").on(t.teamId, t.repo, t.ts)],
);

export const auditEvents = pgTable(
  "audit_event",
  {
    id: id(),
    actor: text("actor").notNull(),
    action: text("action").notNull(),
    target: text("target"),
    detail: jsonb("detail"),
    createdAt: createdAt(),
  },
  (t) => [index("audit_created").on(t.createdAt)],
);
