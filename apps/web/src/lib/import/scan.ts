import {
  getLatestScan,
  listImportViewsForRepository,
  listLatestScanSummaries,
  type RepositoryScanSummary,
} from "@cairn/db";
import { can, type ScanView } from "@cairn/shared";
import { getViewer } from "@/lib/session";
import { getDb, isImportConfigured } from "./runtime";
import type { SourceBase } from "./source-link";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface ImportedScan {
  repositoryId: string;
  name: string;
  /** Where the files can be opened on the forge. */
  source: SourceBase;
  /** Null while the first scan has not finished (or for an import made before scans existed). */
  scan: ScanView | null;
}

/**
 * The real scan of an imported repository, for the viewers allowed to see every team.
 * Demo projects use slugs, imported ones use UUIDs: anything else is simply not found here.
 */
export async function loadImportedScan(id: string): Promise<ImportedScan | null> {
  if (!UUID.test(id) || !isImportConfigured()) return null;
  const viewer = await getViewer();
  if (!can(viewer.role, "see.allTeams")) return null;
  const db = getDb();
  const [runs, scan] = await Promise.all([
    listImportViewsForRepository(db, id, 1),
    getLatestScan(db, id),
  ]);
  const latest = runs[0];
  if (!latest) return null;
  return {
    repositoryId: id,
    name: latest.repository.fullPath,
    source: {
      webUrl: latest.repository.webUrl ?? null,
      branch: latest.repository.branch,
      provider: latest.repository.provider,
    },
    scan,
  };
}

/**
 * The latest real scan of every imported repository, for the viewers allowed to see every team.
 * Empty when imports are not configured or the database is down: the dashboard then shows demo data only.
 */
export async function loadRealScans(): Promise<RepositoryScanSummary[]> {
  if (!isImportConfigured()) return [];
  const viewer = await getViewer();
  if (!can(viewer.role, "see.allTeams")) return [];
  try {
    return await listLatestScanSummaries(getDb());
  } catch {
    return [];
  }
}
