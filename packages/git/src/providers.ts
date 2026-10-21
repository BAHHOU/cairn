import { z } from "zod";
import { GitError } from "./errors";
import type { RemoteRepo } from "./remote";

export interface RepoInfo {
  name: string;
  fullPath: string;
  webUrl: string;
  defaultBranch: string;
  isPrivate: boolean;
}

export interface BranchInfo {
  name: string;
  sha: string;
  isDefault: boolean;
  isProtected: boolean;
}

export interface InspectResult {
  repo: RepoInfo;
  branches: BranchInfo[];
  /** True when the repository has more branches than we listed. A branch can still be typed. */
  truncated: boolean;
}

export interface ProviderOptions {
  fetch?: typeof fetch;
  timeoutMs?: number;
}

const PAGE_SIZE = 100;
const MAX_PAGES = 5;

const githubRepo = z.object({
  name: z.string(),
  full_name: z.string(),
  html_url: z.string(),
  default_branch: z.string(),
  private: z.boolean(),
});
const githubBranch = z.object({
  name: z.string(),
  commit: z.object({ sha: z.string() }),
  protected: z.boolean().optional(),
});

const gitlabRepo = z.object({
  name: z.string(),
  path_with_namespace: z.string(),
  web_url: z.string(),
  default_branch: z.string().nullable().optional(),
  visibility: z.string().optional(),
});
const gitlabBranch = z.object({
  name: z.string(),
  commit: z.object({ id: z.string() }),
  default: z.boolean().optional(),
  protected: z.boolean().optional(),
});

function apiBase(remote: RemoteRepo): string {
  if (remote.provider === "github") {
    return remote.host === "github.com"
      ? "https://api.github.com"
      : `${remote.scheme}://${remote.host}/api/v3`;
  }
  return `${remote.scheme}://${remote.host}/api/v4`;
}

function headers(remote: RemoteRepo, token: string | undefined): Record<string, string> {
  const base: Record<string, string> = { "User-Agent": "cairn", Accept: "application/json" };
  if (remote.provider === "github") {
    base.Accept = "application/vnd.github+json";
    base["X-GitHub-Api-Version"] = "2022-11-28";
    if (token) base.Authorization = `Bearer ${token}`;
  } else if (token) {
    base["PRIVATE-TOKEN"] = token;
  }
  return base;
}

async function getJson(
  url: string,
  remote: RemoteRepo,
  token: string | undefined,
  options: ProviderOptions,
): Promise<unknown> {
  const doFetch = options.fetch ?? fetch;
  let response: Response;
  try {
    response = await doFetch(url, {
      headers: headers(remote, token),
      redirect: "error",
      signal: AbortSignal.timeout(options.timeoutMs ?? 15_000),
    });
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    if (name === "TimeoutError" || name === "AbortError") {
      throw new GitError("timeout", `${remote.host} did not answer in time`);
    }
    const cause = error instanceof Error && error.cause instanceof Error ? error.cause.message : "";
    throw new GitError("unreachable", `Cannot reach ${remote.host}${cause ? ` (${cause})` : ""}`);
  }

  if (response.ok) {
    return response.json();
  }
  switch (response.status) {
    case 401:
      throw new GitError("unauthorized", "The access token was refused");
    case 403:
      if (response.headers.get("x-ratelimit-remaining") === "0") {
        throw new GitError("rate_limited", `${remote.host} rate limit reached`);
      }
      throw new GitError("unauthorized", "The access token lacks the required permissions");
    case 404:
      throw new GitError("not_found", "Repository not found, or the token cannot see it");
    case 429:
      throw new GitError("rate_limited", `${remote.host} rate limit reached`);
    case 407:
      throw new GitError("unreachable", "The corporate proxy requires authentication (407)");
    default:
      throw new GitError("provider_error", `${remote.host} answered HTTP ${response.status}`);
  }
}

const encodePath = (value: string) => value.split("/").map(encodeURIComponent).join("/");

function repoUrls(remote: RemoteRepo) {
  const base = apiBase(remote);
  if (remote.provider === "github") {
    const repo = `${base}/repos/${encodePath(remote.fullPath)}`;
    return {
      repo,
      branches: (page: number) => `${repo}/branches?per_page=${PAGE_SIZE}&page=${page}`,
      branch: (name: string) => `${repo}/branches/${encodePath(name)}`,
    };
  }
  const repo = `${base}/projects/${encodeURIComponent(remote.fullPath)}`;
  return {
    repo,
    branches: (page: number) => `${repo}/repository/branches?per_page=${PAGE_SIZE}&page=${page}`,
    branch: (name: string) => `${repo}/repository/branches/${encodeURIComponent(name)}`,
  };
}

function toBranch(remote: RemoteRepo, raw: unknown, defaultBranch: string | undefined): BranchInfo {
  if (remote.provider === "github") {
    const b = githubBranch.parse(raw);
    return {
      name: b.name,
      sha: b.commit.sha,
      isDefault: b.name === defaultBranch,
      isProtected: b.protected ?? false,
    };
  }
  const b = gitlabBranch.parse(raw);
  return {
    name: b.name,
    sha: b.commit.id,
    isDefault: b.default ?? b.name === defaultBranch,
    isProtected: b.protected ?? false,
  };
}

function parseOrThrow<T>(fn: () => T, remote: RemoteRepo): T {
  try {
    return fn();
  } catch {
    throw new GitError("provider_error", `Unexpected answer from ${remote.host}`);
  }
}

/** Real call to the provider: proves the token works and the repository exists. */
export async function getRepoInfo(
  remote: RemoteRepo,
  token: string | undefined,
  options: ProviderOptions = {},
): Promise<RepoInfo> {
  const body = await getJson(repoUrls(remote).repo, remote, token, options);
  return parseOrThrow((): RepoInfo => {
    if (remote.provider === "github") {
      const r = githubRepo.parse(body);
      return {
        name: r.name,
        fullPath: r.full_name,
        webUrl: r.html_url,
        defaultBranch: r.default_branch,
        isPrivate: r.private,
      };
    }
    const r = gitlabRepo.parse(body);
    return {
      name: r.name,
      fullPath: r.path_with_namespace,
      webUrl: r.web_url,
      defaultBranch: r.default_branch ?? "",
      isPrivate: r.visibility !== undefined && r.visibility !== "public",
    };
  }, remote);
}

/** Repository info plus its branches (first 500). */
export async function inspectRepo(
  remote: RemoteRepo,
  token: string | undefined,
  options: ProviderOptions = {},
): Promise<InspectResult> {
  const urls = repoUrls(remote);
  const repo = await getRepoInfo(remote, token, options);

  const branches: BranchInfo[] = [];
  let truncated = false;
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const pageBody = await getJson(urls.branches(page), remote, token, options);
    const items = parseOrThrow(() => z.array(z.unknown()).parse(pageBody), remote);
    for (const item of items) {
      branches.push(parseOrThrow(() => toBranch(remote, item, repo.defaultBranch), remote));
    }
    if (items.length < PAGE_SIZE) break;
    if (page === MAX_PAGES) truncated = true;
  }

  branches.sort(
    (a, b) => Number(b.isDefault) - Number(a.isDefault) || a.name.localeCompare(b.name),
  );
  return { repo, branches, truncated };
}

/** Resolves one branch to its current head commit. Used again at import time: the client is never trusted. */
export async function resolveBranch(
  remote: RemoteRepo,
  token: string | undefined,
  branch: string,
  options: ProviderOptions = {},
): Promise<BranchInfo> {
  const urls = repoUrls(remote);
  try {
    const body = await getJson(urls.branch(branch), remote, token, options);
    return parseOrThrow(() => toBranch(remote, body, undefined), remote);
  } catch (error) {
    if (error instanceof GitError && error.code === "not_found") {
      // The repository was reachable a moment ago (inspectRepo), so a 404 here means the branch is gone.
      throw new GitError(
        "branch_not_found",
        `Branch "${branch}" does not exist in this repository`,
      );
    }
    throw error;
  }
}
