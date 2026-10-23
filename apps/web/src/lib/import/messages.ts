import { GIT_ERROR_CODES } from "@cairn/git/errors";

/**
 * Every failure an import can show. The text lives in the catalog (`importErrors.<code>`):
 * server actions and stored runs only carry the code, so each viewer reads it in their language.
 */
export const IMPORT_ERROR_CODES = [
  ...GIT_ERROR_CODES,
  "forbidden",
  "invalid_input",
  "invalid_team",
  "empty_repository",
  "queue_unavailable",
  "import_conflict",
  "rescan_conflict",
  "exists",
  "unknown",
] as const;
export type ImportErrorCode = (typeof IMPORT_ERROR_CODES)[number];

/** A stored or returned code, or `unknown` when it is not one Cairn knows. */
export const importErrorCode = (code: string | null | undefined): ImportErrorCode =>
  (IMPORT_ERROR_CODES as readonly string[]).includes(code ?? "")
    ? (code as ImportErrorCode)
    : "unknown";
