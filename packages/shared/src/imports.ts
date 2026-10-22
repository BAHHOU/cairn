export const IMPORT_STATUSES = ["queued", "cloning", "scanning", "done", "failed"] as const;
export type ImportStatus = (typeof IMPORT_STATUSES)[number];

export const isImportActive = (status: ImportStatus): boolean =>
  status === "queued" || status === "cloning" || status === "scanning";

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
