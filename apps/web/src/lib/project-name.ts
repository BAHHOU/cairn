/**
 * An imported repository is named `group/sub/name@branch`. Screens show its parts separately, as
 * GitLab does: the short name where space is scarce, the group and branch as quieter context.
 * Demo projects have a plain name and come back with no namespace and no branch.
 */
export interface ProjectName {
  /** `group/sub/name`, without the branch. */
  path: string;
  /** `name`: the last segment. */
  short: string;
  /** `group/sub`, or null for a name without a slash. */
  namespace: string | null;
  branch: string | null;
}

export function splitProjectName(full: string): ProjectName {
  const at = full.lastIndexOf("@");
  const path = at > 0 ? full.slice(0, at) : full;
  const branch = at > 0 ? full.slice(at + 1) || null : null;
  const slash = path.lastIndexOf("/");
  return {
    path,
    short: slash >= 0 ? path.slice(slash + 1) : path,
    namespace: slash > 0 ? path.slice(0, slash) : null,
    branch,
  };
}
