import type { ImportFacts, ImportStatus, ImportView } from "@cairn/shared";
import { and, desc, eq, inArray, lt } from "drizzle-orm";
import type { Db } from "./index";
import { auditEvents, repositories, repositoryImports, teams } from "./schema";

const ACTIVE: ImportStatus[] = ["queued", "cloning", "scanning"];

/** The repository (same host, path and branch) already has an import in progress. */
export class ImportConflictError extends Error {
  constructor(readonly importId: string) {
    super("An import is already running for this repository and branch");
    this.name = "ImportConflictError";
  }
}

/** Another project with the same name already exists in the team, or the source is a duplicate. */
export class ProjectExistsError extends Error {
  constructor() {
    super("A project with this name already exists in this team");
    this.name = "ProjectExistsError";
  }
}

function isUniqueViolation(error: unknown): boolean {
  const code = (e: unknown) => (e as { code?: string } | undefined)?.code;
  return (
    code(error) === "23505" || code((error as { cause?: unknown } | undefined)?.cause) === "23505"
  );
}

export interface CreateImportInput {
  team: string;
  provider: string;
  host: string;
  fullPath: string;
  /** Display name: `owner/repo`, suffixed with `@branch` when not the default branch. */
  name: string;
  webUrl: string;
  branch: string;
  defaultBranch: string;
  /** Already encrypted. Null for a public repository. */
  credentialEnc: string | null;
  requestedSha: string;
  requestedBy: string;
}

/** Records the request (repository, queued import, audit trail) in one transaction. */
export async function createImport(
  db: Db,
  input: CreateImportInput,
): Promise<{ importId: string; repositoryId: string }> {
  try {
    return await db.transaction(async (tx) => {
      await tx.insert(teams).values({ name: input.team }).onConflictDoNothing();
      const [team] = await tx.select().from(teams).where(eq(teams.name, input.team));
      if (!team) throw new Error("Team could not be created");

      const [existing] = await tx
        .select({ id: repositories.id })
        .from(repositories)
        .where(
          and(
            eq(repositories.host, input.host),
            eq(repositories.fullPath, input.fullPath),
            eq(repositories.branch, input.branch),
          ),
        );

      const fields = {
        teamId: team.id,
        provider: input.provider,
        url: input.webUrl,
        defaultBranch: input.defaultBranch,
        credentialEnc: input.credentialEnc,
      };

      let repositoryId: string;
      if (existing) {
        const [running] = await tx
          .select({ id: repositoryImports.id })
          .from(repositoryImports)
          .where(
            and(
              eq(repositoryImports.repositoryId, existing.id),
              inArray(repositoryImports.status, ACTIVE),
            ),
          );
        if (running) throw new ImportConflictError(running.id);
        await tx.update(repositories).set(fields).where(eq(repositories.id, existing.id));
        repositoryId = existing.id;
      } else {
        const [created] = await tx
          .insert(repositories)
          .values({
            ...fields,
            name: input.name,
            host: input.host,
            fullPath: input.fullPath,
            branch: input.branch,
          })
          .returning({ id: repositories.id });
        if (!created) throw new Error("Repository could not be created");
        repositoryId = created.id;
      }

      const [run] = await tx
        .insert(repositoryImports)
        .values({
          repositoryId,
          requestedSha: input.requestedSha,
          requestedBy: input.requestedBy,
        })
        .returning({ id: repositoryImports.id });
      if (!run) throw new Error("Import could not be created");

      await tx.insert(auditEvents).values({
        actor: input.requestedBy,
        action: "repo.import.requested",
        target: `${input.host}/${input.fullPath}@${input.branch}`,
        detail: {
          importId: run.id,
          provider: input.provider,
          branch: input.branch,
          requestedSha: input.requestedSha,
          team: input.team,
          tokenProvided: input.credentialEnc !== null,
        },
      });

      return { importId: run.id, repositoryId };
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw new ProjectExistsError();
    throw error;
  }
}

/**
 * Queues a new run for a repository already imported, with the credential stored at import time:
 * nobody has to paste the token again. The branch head is read by the worker when it clones.
 */
export async function createRescan(
  db: Db,
  repositoryId: string,
  requestedBy: string,
): Promise<{ importId: string }> {
  return db.transaction(async (tx) => {
    const [repo] = await tx.select().from(repositories).where(eq(repositories.id, repositoryId));
    if (!repo) throw new Error("Repository not found");
    const [running] = await tx
      .select({ id: repositoryImports.id })
      .from(repositoryImports)
      .where(
        and(
          eq(repositoryImports.repositoryId, repositoryId),
          inArray(repositoryImports.status, ACTIVE),
        ),
      );
    if (running) throw new ImportConflictError(running.id);
    const [run] = await tx
      .insert(repositoryImports)
      .values({ repositoryId, requestedBy })
      .returning({ id: repositoryImports.id });
    if (!run) throw new Error("Rescan could not be created");
    await tx.insert(auditEvents).values({
      actor: requestedBy,
      action: "repo.import.requested",
      target: `${repo.host}/${repo.fullPath}@${repo.branch}`,
      detail: { importId: run.id, rescan: true, branch: repo.branch },
    });
    return { importId: run.id };
  });
}

const viewColumns = {
  imp: repositoryImports,
  repo: repositories,
  team: teams.name,
};

function toView(row: {
  imp: typeof repositoryImports.$inferSelect;
  repo: typeof repositories.$inferSelect;
  team: string;
}): ImportView {
  const iso = (d: Date | null) => (d ? d.toISOString() : null);
  return {
    id: row.imp.id,
    status: row.imp.status,
    repository: {
      id: row.repo.id,
      team: row.team,
      name: row.repo.name,
      provider: row.repo.provider,
      host: row.repo.host,
      fullPath: row.repo.fullPath,
      webUrl: row.repo.url,
      branch: row.repo.branch,
      defaultBranch: row.repo.defaultBranch,
    },
    requestedSha: row.imp.requestedSha,
    commitSha: row.imp.commitSha,
    errorCode: row.imp.errorCode,
    errorMessage: row.imp.errorMessage,
    facts: row.imp.facts,
    requestedBy: row.imp.requestedBy,
    createdAt: row.imp.createdAt.toISOString(),
    startedAt: iso(row.imp.startedAt),
    finishedAt: iso(row.imp.finishedAt),
  };
}

export async function getImportView(db: Db, importId: string): Promise<ImportView | undefined> {
  const [row] = await db
    .select(viewColumns)
    .from(repositoryImports)
    .innerJoin(repositories, eq(repositories.id, repositoryImports.repositoryId))
    .innerJoin(teams, eq(teams.id, repositories.teamId))
    .where(eq(repositoryImports.id, importId));
  return row ? toView(row) : undefined;
}

export async function listImportViews(db: Db, limit = 50): Promise<ImportView[]> {
  const rows = await db
    .select(viewColumns)
    .from(repositoryImports)
    .innerJoin(repositories, eq(repositories.id, repositoryImports.repositoryId))
    .innerJoin(teams, eq(teams.id, repositories.teamId))
    .orderBy(desc(repositoryImports.createdAt))
    .limit(limit);
  return rows.map(toView);
}

export async function listTeamNames(db: Db): Promise<string[]> {
  const rows = await db.select({ name: teams.name }).from(teams).orderBy(teams.name);
  return rows.map((r) => r.name);
}

/** Every import run of one repository (project), newest first. Empty when the repository is unknown. */
export async function listImportViewsForRepository(
  db: Db,
  repositoryId: string,
  limit = 20,
): Promise<ImportView[]> {
  const rows = await db
    .select(viewColumns)
    .from(repositoryImports)
    .innerJoin(repositories, eq(repositories.id, repositoryImports.repositoryId))
    .innerJoin(teams, eq(teams.id, repositories.teamId))
    .where(eq(repositoryImports.repositoryId, repositoryId))
    .orderBy(desc(repositoryImports.createdAt))
    .limit(limit);
  return rows.map(toView);
}

export async function markImportFailed(
  db: Db,
  importId: string,
  failure: { code: string; message: string },
): Promise<void> {
  await db
    .update(repositoryImports)
    .set({
      status: "failed",
      errorCode: failure.code,
      errorMessage: failure.message.slice(0, 1000),
      finishedAt: new Date(),
    })
    .where(and(eq(repositoryImports.id, importId), inArray(repositoryImports.status, ACTIVE)));
}

/* ----- worker side ----- */

export interface ClaimedImport {
  importId: string;
  requestedBy: string;
  repository: typeof repositories.$inferSelect;
}

/** Atomically moves queued -> cloning. Returns nothing if the run was already taken or is finished. */
export async function claimImport(db: Db, importId: string): Promise<ClaimedImport | undefined> {
  const [claimed] = await db
    .update(repositoryImports)
    .set({ status: "cloning", startedAt: new Date() })
    .where(and(eq(repositoryImports.id, importId), eq(repositoryImports.status, "queued")))
    .returning();
  if (!claimed) return undefined;
  const [repository] = await db
    .select()
    .from(repositories)
    .where(eq(repositories.id, claimed.repositoryId));
  if (!repository) return undefined;
  return { importId, requestedBy: claimed.requestedBy, repository };
}

export async function markImportScanning(
  db: Db,
  importId: string,
  commitSha: string,
): Promise<void> {
  await db
    .update(repositoryImports)
    .set({ status: "scanning", commitSha })
    .where(eq(repositoryImports.id, importId));
}

export async function markImportDone(
  db: Db,
  importId: string,
  result: { commitSha: string; facts: ImportFacts },
): Promise<void> {
  await db
    .update(repositoryImports)
    .set({
      status: "done",
      commitSha: result.commitSha,
      facts: result.facts,
      finishedAt: new Date(),
    })
    .where(eq(repositoryImports.id, importId));
}

export async function recordImportAudit(
  db: Db,
  importId: string,
  action: "repo.import.done" | "repo.import.failed" | "repo.scan.failed",
  detail: Record<string, unknown>,
): Promise<void> {
  const [row] = await db
    .select({
      host: repositories.host,
      fullPath: repositories.fullPath,
      branch: repositories.branch,
    })
    .from(repositoryImports)
    .innerJoin(repositories, eq(repositories.id, repositoryImports.repositoryId))
    .where(eq(repositoryImports.id, importId));
  await db.insert(auditEvents).values({
    actor: "worker",
    action,
    target: row ? `${row.host}/${row.fullPath}@${row.branch}` : importId,
    detail: { importId, ...detail },
  });
}

/** After a worker crash, runs stuck in cloning/scanning would stay "running" forever. */
export async function failStaleImports(db: Db, olderThanMs: number): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanMs);
  const rows = await db
    .update(repositoryImports)
    .set({
      status: "failed",
      errorCode: "interrupted",
      errorMessage: "The import was interrupted (worker stopped). Start it again.",
      finishedAt: new Date(),
    })
    .where(
      and(
        inArray(repositoryImports.status, ["cloning", "scanning"]),
        lt(repositoryImports.startedAt, cutoff),
      ),
    )
    .returning({ id: repositoryImports.id });
  return rows.length;
}
