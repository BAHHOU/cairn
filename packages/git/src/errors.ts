/** Stable codes: the UI maps them to user-facing text, the worker stores them on the import row. */
export const GIT_ERROR_CODES = [
  "invalid_url",
  "invalid_branch",
  "credentials_in_url",
  "host_not_allowed",
  "unauthorized",
  "not_found",
  "branch_not_found",
  "rate_limited",
  "unreachable",
  "timeout",
  "provider_error",
  "clone_failed",
  "git_missing",
  "secret_key_missing",
  "interrupted",
  "internal",
] as const;

export type GitErrorCode = (typeof GIT_ERROR_CODES)[number];

/** `message` is safe to display and to persist: it never contains a credential. */
export class GitError extends Error {
  readonly code: GitErrorCode;

  constructor(code: GitErrorCode, message: string) {
    super(message);
    this.name = "GitError";
    this.code = code;
  }
}

export function isGitError(error: unknown): error is GitError {
  return error instanceof GitError;
}
