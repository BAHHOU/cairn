import type { ScanFileRecord, ScanReport, ScanView } from "@cairn/shared";
import { and, desc, eq, isNotNull, ne } from "drizzle-orm";
import type { Db } from "./index";
import { repositories, repositoryScans, teams } from "./schema";

export interface SaveScanInput {
  repositoryId: string;
  importId: string;
  commitSha: string;
  report: ScanView["report"];
  architecture: ScanView["architecture"];
  codeGraph: ScanView["codeGraph"];
  delivery: ScanView["delivery"];
  onboarding: ScanView["onboarding"];
  docs: ScanView["docs"];
  fileIndex: ScanFileRecord[];
}

/** Stores a scan and drops the file index of the older ones: only the latest is needed to skip files. */
export async function saveScan(db: Db, input: SaveScanInput): Promise<string> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(repositoryScans)
      .values(input)
      .onConflictDoUpdate({
        target: repositoryScans.importId,
        set: {
          commitSha: input.commitSha,
          report: input.report,
          architecture: input.architecture,
          codeGraph: input.codeGraph,
          delivery: input.delivery,
          onboarding: input.onboarding,
          docs: input.docs,
          fileIndex: input.fileIndex,
        },
      })
      .returning({ id: repositoryScans.id });
    if (!row) throw new Error("Scan could not be saved");
    await tx
      .update(repositoryScans)
      .set({ fileIndex: null })
      .where(
        and(
          eq(repositoryScans.repositoryId, input.repositoryId),
          ne(repositoryScans.id, row.id),
          isNotNull(repositoryScans.fileIndex),
        ),
      );
    return row.id;
  });
}

/** The latest scan of a repository, without the heavy file index. */
export async function getLatestScan(db: Db, repositoryId: string): Promise<ScanView | null> {
  const [row] = await db
    .select({
      id: repositoryScans.id,
      importId: repositoryScans.importId,
      commitSha: repositoryScans.commitSha,
      createdAt: repositoryScans.createdAt,
      report: repositoryScans.report,
      architecture: repositoryScans.architecture,
      codeGraph: repositoryScans.codeGraph,
      delivery: repositoryScans.delivery,
      onboarding: repositoryScans.onboarding,
      docs: repositoryScans.docs,
    })
    .from(repositoryScans)
    .where(eq(repositoryScans.repositoryId, repositoryId))
    .orderBy(desc(repositoryScans.createdAt))
    .limit(1);
  return row ? { ...row, createdAt: row.createdAt.toISOString() } : null;
}

export interface RepositoryScanSummary {
  repositoryId: string;
  fullPath: string;
  host: string;
  branch: string;
  team: string;
  scanId: string;
  commitSha: string;
  createdAt: string;
  report: ScanReport;
}

/** The latest scan of every scanned repository, without the architecture, code map or file index. */
export async function listLatestScanSummaries(db: Db): Promise<RepositoryScanSummary[]> {
  const rows = await db
    .selectDistinctOn([repositoryScans.repositoryId], {
      repositoryId: repositoryScans.repositoryId,
      fullPath: repositories.fullPath,
      host: repositories.host,
      branch: repositories.branch,
      team: teams.name,
      scanId: repositoryScans.id,
      commitSha: repositoryScans.commitSha,
      createdAt: repositoryScans.createdAt,
      report: repositoryScans.report,
    })
    .from(repositoryScans)
    .innerJoin(repositories, eq(repositories.id, repositoryScans.repositoryId))
    .innerJoin(teams, eq(teams.id, repositories.teamId))
    .orderBy(repositoryScans.repositoryId, desc(repositoryScans.createdAt));
  return rows
    .map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }))
    .sort((a, b) => a.fullPath.localeCompare(b.fullPath));
}

/** What the next scan of this repository can reuse: the per-file records of the last one. */
export async function getPreviousFileIndex(
  db: Db,
  repositoryId: string,
): Promise<{ commit: string; files: ScanFileRecord[] } | null> {
  const [row] = await db
    .select({ commitSha: repositoryScans.commitSha, fileIndex: repositoryScans.fileIndex })
    .from(repositoryScans)
    .where(
      and(eq(repositoryScans.repositoryId, repositoryId), isNotNull(repositoryScans.fileIndex)),
    )
    .orderBy(desc(repositoryScans.createdAt))
    .limit(1);
  return row?.fileIndex ? { commit: row.commitSha, files: row.fileIndex } : null;
}
