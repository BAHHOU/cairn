/**
 * What reached a repository's main branch, read from GitLab for traceability: the merge requests
 * merged into it (with when each approval and each commit happened), and the commits on its
 * first-parent history, so a push that skipped review shows up. Read-only.
 */

import type { ChangedFile, CommitInfo } from "@cairn/shared";
import { z } from "zod";
import { gitlabOnly, MAX_FILES, parseUnifiedDiff } from "./merge-requests";
import { getJson, type ProviderOptions, parseOrThrow } from "./providers";
import type { RemoteRepo } from "./remote";

const PAGE_SIZE = 100;
/** Pages of first-parent history read at most: 300 commits on main over the window. */
const MAX_COMMIT_PAGES = 3;

export interface MergedRef {
  iid: number;
  title: string;
  author: string;
  sourceBranch: string;
  mergedAt: string;
  /** The commits that may carry this merge on main: merge, squash, or the head (fast-forward). */
  shas: string[];
  url: string;
}

const mergedSchema = z.object({
  iid: z.number(),
  title: z.string(),
  author: z.object({ username: z.string() }),
  source_branch: z.string(),
  merged_at: z.string().nullable().optional(),
  merge_commit_sha: z.string().nullable().optional(),
  squash_commit_sha: z.string().nullable().optional(),
  sha: z.string().nullable().optional(),
  web_url: z.string(),
});

/** Merge requests merged into `branch` since `since`, the most recent first. */
export async function listMergedMergeRequests(
  remote: RemoteRepo,
  token: string | undefined,
  query: { branch: string; since: string; limit: number },
  options: ProviderOptions = {},
): Promise<MergedRef[]> {
  const base = gitlabOnly(remote);
  const body = await getJson(
    `${base}/merge_requests?state=merged&target_branch=${encodeURIComponent(query.branch)}` +
      `&updated_after=${encodeURIComponent(query.since)}&order_by=updated_at&sort=desc&per_page=${PAGE_SIZE}`,
    remote,
    token,
    options,
  );
  return parseOrThrow(
    () =>
      z
        .array(mergedSchema)
        .parse(body)
        .filter((mr) => mr.merged_at && mr.merged_at >= query.since)
        .map((mr) => ({
          iid: mr.iid,
          title: mr.title,
          author: mr.author.username,
          sourceBranch: mr.source_branch,
          mergedAt: mr.merged_at as string,
          shas: [mr.merge_commit_sha, mr.squash_commit_sha, mr.sha].filter(
            (s): s is string => typeof s === "string" && s.length > 0,
          ),
          url: mr.web_url,
        }))
        .sort((a, b) => b.mergedAt.localeCompare(a.mergedAt))
        .slice(0, query.limit),
    remote,
  );
}

const commitSchema = z.object({
  id: z.string(),
  created_at: z.string(),
  author_name: z.string(),
  author_email: z.string(),
  title: z.string(),
  message: z.string().optional(),
  parent_ids: z.array(z.string()).optional(),
});

const toCommit = (c: z.infer<typeof commitSchema>): CommitInfo => ({
  sha: c.id,
  at: new Date(c.created_at).toISOString(),
  authorName: c.author_name,
  authorEmail: c.author_email,
  message: c.message ?? c.title,
});

const noteSchema = z.object({
  body: z.string(),
  system: z.boolean(),
  created_at: z.string(),
  author: z.object({ username: z.string() }),
});

/**
 * The commits of a merge request and its approvals with their dates. GitLab's approvals endpoint
 * says who, not when: the dates come from the system notes it writes on approve and unapprove.
 */
export async function getMergeRequestActivity(
  remote: RemoteRepo,
  token: string | undefined,
  iid: number,
  options: ProviderOptions = {},
): Promise<{ commits: CommitInfo[]; approvals: { by: string; at: string }[] }> {
  const mrUrl = `${gitlabOnly(remote)}/merge_requests/${iid}`;
  const get = (url: string) => getJson(url, remote, token, options);
  const [commits, notes] = await Promise.all([
    get(`${mrUrl}/commits?per_page=${PAGE_SIZE}`),
    get(`${mrUrl}/notes?per_page=${PAGE_SIZE}&sort=asc&order_by=created_at`),
  ]);
  return parseOrThrow(() => {
    const state = new Map<string, string | null>();
    for (const n of z.array(noteSchema).parse(notes)) {
      if (!n.system) continue;
      const at = new Date(n.created_at).toISOString();
      if (/^approved this merge request/.test(n.body)) state.set(n.author.username, at);
      else if (/^unapproved this merge request/.test(n.body)) state.set(n.author.username, null);
    }
    return {
      commits: z.array(commitSchema).parse(commits).map(toCommit),
      approvals: [...state]
        .filter((e): e is [string, string] => e[1] !== null)
        .map(([by, at]) => ({ by, at })),
    };
  }, remote);
}

/** The first-parent history of `branch` since `since`: what main went through, one step each. */
export async function listBranchCommits(
  remote: RemoteRepo,
  token: string | undefined,
  query: { branch: string; since: string },
  options: ProviderOptions = {},
): Promise<(CommitInfo & { parents: string[] })[]> {
  const base = gitlabOnly(remote);
  const all: (CommitInfo & { parents: string[] })[] = [];
  for (let page = 1; page <= MAX_COMMIT_PAGES; page++) {
    const body = await getJson(
      `${base}/repository/commits?ref_name=${encodeURIComponent(query.branch)}` +
        `&since=${encodeURIComponent(query.since)}&first_parent=true&per_page=${PAGE_SIZE}&page=${page}`,
      remote,
      token,
      options,
    );
    const items = parseOrThrow(() => z.array(commitSchema).parse(body), remote);
    all.push(...items.map((c) => ({ ...toCommit(c), parents: c.parent_ids ?? [] })));
    if (items.length < PAGE_SIZE) break;
  }
  return all;
}

const diffSchema = z.object({ new_path: z.string(), diff: z.string() });

/** The files one commit changed, as change control reads a diff. */
export async function getCommitFiles(
  remote: RemoteRepo,
  token: string | undefined,
  sha: string,
  options: ProviderOptions = {},
): Promise<ChangedFile[]> {
  const body = await getJson(
    `${gitlabOnly(remote)}/repository/commits/${encodeURIComponent(sha)}/diff?per_page=${PAGE_SIZE}`,
    remote,
    token,
    options,
  );
  return parseOrThrow(
    () =>
      z
        .array(diffSchema)
        .parse(body)
        .filter((d) => d.diff.length > 0)
        .slice(0, MAX_FILES)
        .map((d) => ({ path: d.new_path, ...parseUnifiedDiff(d.diff) })),
    remote,
  );
}
