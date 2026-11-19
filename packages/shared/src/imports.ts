export const IMPORT_STATUSES = ["queued", "cloning", "scanning", "done", "failed"] as const;
export type ImportStatus = (typeof IMPORT_STATUSES)[number];

export const isImportActive = (status: ImportStatus): boolean =>
  status === "queued" || status === "cloning" || status === "scanning";

/** A queued run nobody picks up within this delay means no worker is running. */
export const IMPORT_QUEUE_STALL_MS = 2 * 60_000;
/** A run still cloning or scanning after this is stuck: the worker marks it failed on restart. */
export const IMPORT_RUN_STALL_MS = 15 * 60_000;

/**
 * Whether a run that should be moving is not. A 9,000-file repository imports in seconds, so a
 * long wait is never "a big repository": it is a stopped worker.
 */
export function isImportStalled(
  view: { status: ImportStatus; createdAt: string; startedAt: string | null },
  now: number,
): boolean {
  if (view.status === "queued") return now - Date.parse(view.createdAt) > IMPORT_QUEUE_STALL_MS;
  if (view.status === "cloning" || view.status === "scanning")
    return now - Date.parse(view.startedAt ?? view.createdAt) > IMPORT_RUN_STALL_MS;
  return false;
}

export interface ImportFacts {
  technologies: string[];
  fileCount: number;
}

/** What the UI needs to show one import run. Dates are ISO strings so the view crosses RSC boundaries. */
export interface ImportView {
  id: string;
  status: ImportStatus;
  repository: {
    id: string;
    team: string;
    name: string;
    provider: string;
    host: string;
    fullPath: string;
    webUrl: string | null;
    branch: string;
    defaultBranch: string;
  };
  /** Head of the branch when the import was requested. */
  requestedSha: string | null;
  /** The commit that was really cloned and scanned. */
  commitSha: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  facts: ImportFacts | null;
  requestedBy: string;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}
