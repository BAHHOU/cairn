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

const id = () => text("id").primaryKey().$defaultFn(() => crypto.randomUUID());
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
    url: text("url"),
    defaultBranch: text("default_branch").notNull().default("main"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("repository_team_name").on(t.teamId, t.name)],
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
