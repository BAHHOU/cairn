/**
 * Merge requests read from GitLab, shaped for change control: the diff as added and removed lines,
 * the commit messages that cite tickets, and who approved. Read-only: Cairn never writes to the
 * forge from here.
 *
 * GitHub pull requests will follow the same shape; until then a GitHub remote is refused clearly.
 */

import type { ChangedFile, DiffLine, MergeRequest } from "@cairn/shared";
import { z } from "zod";
import { GitError } from "./errors";
import { apiBase, getJson, type ProviderOptions, parseOrThrow } from "./providers";
import type { RemoteRepo } from "./remote";

/** Past these, a merge request is too large to review line by line, by Cairn or by a person. */
export const MAX_FILES = 300;
export const MAX_LINES_PER_FILE = 2_000;
const PAGE_SIZE = 100;

const mrSchema = z.object({
  iid: z.number(),
  title: z.string(),
  description: z.string().nullable().optional(),
  source_branch: z.string(),
  target_branch: z.string(),
  updated_at: z.string(),
  web_url: z.string(),
  author: z.object({ username: z.string() }),
});

const diffSchema = z.object({
  new_path: z.string(),
  diff: z.string(),
  deleted_file: z.boolean().optional(),
  too_large: z.boolean().nullable().optional(),
  collapsed: z.boolean().nullable().optional(),
});

const commitSchema = z.object({ message: z.string().optional(), title: z.string() });

const approvalsSchema = z.object({
  approved_by: z.array(z.object({ user: z.object({ username: z.string() }) })).default([]),
});

export interface MergeRequestRef {
  iid: number;
  title: string;
  author: string;
  updatedAt: string;
}

/**
 * Added and removed lines of one file's unified diff, numbered as in the new and the old file.
 * Context lines move both counters; `\ No newline at end of file` is not a line.
 */
export function parseUnifiedDiff(diff: string): Pick<ChangedFile, "added" | "removed"> {
  const added: DiffLine[] = [];
  const removed: DiffLine[] = [];
  let oldLine = 0;
  let newLine = 0;
  for (const raw of diff.split("\n")) {
    const hunk = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(raw);
    if (hunk) {
      oldLine = Number(hunk[1]);
      newLine = Number(hunk[2]);
      continue;
    }
    if (oldLine === 0 && newLine === 0) continue; // before the first hunk: file headers
    if (raw.startsWith("+")) added.push({ line: newLine++, text: raw.slice(1) });
    else if (raw.startsWith("-")) removed.push({ line: oldLine++, text: raw.slice(1) });
    else if (raw.startsWith(" ")) {
      oldLine++;
      newLine++;
    }
  }
  return {
    added: added.slice(0, MAX_LINES_PER_FILE),
    removed: removed.slice(0, MAX_LINES_PER_FILE),
  };
}

function gitlabOnly(remote: RemoteRepo): string {
  if (remote.provider !== "gitlab") {
    throw new GitError("provider_error", "Change control reads GitLab merge requests only for now");
  }
  return `${apiBase(remote)}/projects/${encodeURIComponent(remote.fullPath)}`;
}

/** Open merge requests, the most recently updated first. */
export async function listOpenMergeRequests(
  remote: RemoteRepo,
  token: string | undefined,
  options: ProviderOptions = {},
): Promise<MergeRequestRef[]> {
  const base = gitlabOnly(remote);
  const body = await getJson(
    `${base}/merge_requests?state=opened&order_by=updated_at&sort=desc&per_page=${PAGE_SIZE}`,
    remote,
    token,
    options,
  );
  return parseOrThrow(
    () =>
      z
        .array(mrSchema)
        .parse(body)
        .map((mr) => ({
          iid: mr.iid,
          title: mr.title,
          author: mr.author.username,
          updatedAt: mr.updated_at,
        })),
    remote,
  );
}

/**
 * Everything change control needs about one merge request. Usernames stand for people: the policy
 * gives each username its approver roles.
 */
export async function getMergeRequest(
  remote: RemoteRepo,
  token: string | undefined,
  projectId: string,
  iid: number,
  options: ProviderOptions = {},
): Promise<MergeRequest> {
  const mrUrl = `${gitlabOnly(remote)}/merge_requests/${iid}`;
  const get = (url: string) => getJson(url, remote, token, options);

  const [meta, diffs, commits, approvals] = await Promise.all([
    get(mrUrl),
    readDiffs(mrUrl, get),
    get(`${mrUrl}/commits?per_page=${PAGE_SIZE}`),
    get(`${mrUrl}/approvals`),
  ]);

  return parseOrThrow(() => {
    const mr = mrSchema.parse(meta);
    const files: ChangedFile[] = z
      .array(diffSchema)
      .parse(diffs)
      .filter((d) => !d.too_large && !d.collapsed && d.diff.length > 0)
      .slice(0, MAX_FILES)
      .map((d) => ({ path: d.new_path, ...parseUnifiedDiff(d.diff) }));
    return {
      id: `${projectId}!${mr.iid}`,
      projectId,
      iid: mr.iid,
      authorId: mr.author.username,
      title: mr.title,
      description: mr.description ?? "",
      sourceBranch: mr.source_branch,
      targetBranch: mr.target_branch,
      updatedAt: mr.updated_at,
      url: mr.web_url,
      commitMessages: z
        .array(commitSchema)
        .parse(commits)
        .map((c) => c.message ?? c.title),
      approvals: approvalsSchema.parse(approvals).approved_by.map((a) => a.user.username),
      files,
    };
  }, remote);
}

/**
 * `/diffs` (GitLab 15.7+) pages the files; older instances only have `/changes`, which returns them
 * in one object. Self-managed GitLab in banks often lags, so both are read.
 */
async function readDiffs(mrUrl: string, get: (url: string) => Promise<unknown>): Promise<unknown> {
  try {
    const all: unknown[] = [];
    for (let page = 1; all.length < MAX_FILES; page++) {
      const body = await get(`${mrUrl}/diffs?per_page=${PAGE_SIZE}&page=${page}`);
      const items = Array.isArray(body) ? body : [];
      all.push(...items);
      if (items.length < PAGE_SIZE) break;
    }
    return all;
  } catch (error) {
    if (!(error instanceof GitError && error.code === "not_found")) throw error;
    const body = await get(`${mrUrl}/changes`);
    return (body as { changes?: unknown }).changes ?? [];
  }
}
