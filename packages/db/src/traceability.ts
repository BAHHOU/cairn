import type { TraceSummary, TrackerKind } from "@cairn/shared";
import { and, asc, eq } from "drizzle-orm";
import type { Db } from "./index";
import {
  auditEvents,
  repositories,
  repositoryTrackerLinks,
  teams,
  traceSnapshots,
  trackerConnections,
} from "./schema";

export interface TrackerLink {
  id: string;
  connectionId: string;
  kind: TrackerKind;
  /** The connection's name, as the superadmin wrote it. */
  label: string;
  scope: Record<string, string>;
  createdBy: string;
  createdAt: Date;
}

/** The boards linked to a repository, with the connection each one is read through. */
export async function listTrackerLinks(db: Db, repositoryId: string): Promise<TrackerLink[]> {
  return db
    .select({
      id: repositoryTrackerLinks.id,
      connectionId: repositoryTrackerLinks.connectionId,
      kind: trackerConnections.kind,
      label: trackerConnections.label,
      scope: repositoryTrackerLinks.scope,
      createdBy: repositoryTrackerLinks.createdBy,
      createdAt: repositoryTrackerLinks.createdAt,
    })
    .from(repositoryTrackerLinks)
    .innerJoin(trackerConnections, eq(trackerConnections.id, repositoryTrackerLinks.connectionId))
    .where(eq(repositoryTrackerLinks.repositoryId, repositoryId))
    .orderBy(asc(repositoryTrackerLinks.createdAt));
}

export async function addTrackerLink(
  db: Db,
  actor: string,
  link: { repositoryId: string; connectionId: string; scope: Record<string, string> },
): Promise<string> {
  const id = crypto.randomUUID();
  await db.transaction(async (tx) => {
    await tx.insert(repositoryTrackerLinks).values({ id, ...link, createdBy: actor });
    await tx.insert(auditEvents).values({
      actor,
      action: "tracker.link",
      target: link.repositoryId,
      detail: { connection: link.connectionId, scope: link.scope },
    });
  });
  return id;
}

export async function removeTrackerLink(
  db: Db,
  actor: string,
  repositoryId: string,
  id: string,
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const removed = await tx
      .delete(repositoryTrackerLinks)
      .where(
        and(
          eq(repositoryTrackerLinks.id, id),
          eq(repositoryTrackerLinks.repositoryId, repositoryId),
        ),
      )
      .returning({ connectionId: repositoryTrackerLinks.connectionId });
    if (!removed[0]) return false;
    await tx.insert(auditEvents).values({
      actor,
      action: "tracker.unlink",
      target: repositoryId,
      detail: { link: id, connection: removed[0].connectionId },
    });
    return true;
  });
}

export async function saveTraceSnapshot(
  db: Db,
  repositoryId: string,
  summary: TraceSummary,
): Promise<void> {
  const computedAt = new Date();
  await db
    .insert(traceSnapshots)
    .values({ repositoryId, summary, computedAt })
    .onConflictDoUpdate({ target: traceSnapshots.repositoryId, set: { summary, computedAt } });
}

export interface TraceSnapshotRow {
  repositoryId: string;
  fullPath: string;
  team: string;
  summary: TraceSummary;
  computedAt: Date;
}

export async function getTraceSnapshot(db: Db, repositoryId: string) {
  const [row] = await db
    .select()
    .from(traceSnapshots)
    .where(eq(traceSnapshots.repositoryId, repositoryId))
    .limit(1);
  return row ?? null;
}

/** Every repository's last run, for the portfolio. */
export async function listTraceSnapshots(db: Db): Promise<TraceSnapshotRow[]> {
  return db
    .select({
      repositoryId: traceSnapshots.repositoryId,
      fullPath: repositories.fullPath,
      team: teams.name,
      summary: traceSnapshots.summary,
      computedAt: traceSnapshots.computedAt,
    })
    .from(traceSnapshots)
    .innerJoin(repositories, eq(repositories.id, traceSnapshots.repositoryId))
    .innerJoin(teams, eq(teams.id, repositories.teamId))
    .orderBy(asc(repositories.fullPath));
}
