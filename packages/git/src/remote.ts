import { findHost, type GitConfig } from "./config";
import { GitError } from "./errors";

export const PROVIDERS = ["github", "gitlab"] as const;
export type ProviderKind = (typeof PROVIDERS)[number];

export interface RemoteRepo {
  provider: ProviderKind;
  /** `host` or `host:port`, always one of the configured allowlisted hosts. */
  host: string;
  scheme: "https" | "http";
  /** `owner/repo` on GitHub, `group[/subgroup...]/project` on GitLab. Never ends with `.git`. */
  fullPath: string;
}

const SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const BRANCH = /^[A-Za-z0-9._][A-Za-z0-9._/@+=,-]*$/;

/** Hosts whose provider is not ambiguous. Self-hosted instances need the provider to be chosen. */
export function guessProvider(host: string): ProviderKind | undefined {
  if (host === "github.com") return "github";
  if (host === "gitlab.com") return "gitlab";
  return undefined;
}

/** A branch name that is safe to hand to git as an argument (no option injection, no traversal). */
export function assertBranch(branch: string): string {
  const name = branch.trim();
  const invalid =
    name.length === 0 ||
    name.length > 200 ||
    !BRANCH.test(name) ||
    name.includes("..") ||
    name.includes("//") ||
    name.includes("@{") ||
    name.endsWith("/") ||
    name.endsWith(".") ||
    name.endsWith(".lock");
  if (invalid)
    throw new GitError("invalid_branch", `Invalid branch name: "${branch.slice(0, 80)}"`);
  return name;
}

/**
 * Accepts `https://host/group/repo(.git)`, `host/group/repo` and `git@host:group/repo.git`, plus
 * browser URLs (`/-/tree/...`, `/tree/...`). Credentials inside the URL are refused: they would end
 * up in logs, process listings and `.git/config`.
 */
export function parseRepoInput(
  input: string,
  provider: ProviderKind | undefined,
  config: GitConfig,
): RemoteRepo {
  const raw = input.trim();
  if (!raw) throw new GitError("invalid_url", "Repository URL is empty");

  let host: string;
  let path: string;

  const scp = /^[\w.-]+@([\w.-]+(?::\d+)?)[:/](.+)$/.exec(raw);
  if (scp && !raw.includes("://")) {
    host = scp[1] ?? "";
    path = scp[2] ?? "";
  } else {
    let url: URL;
    try {
      url = new URL(raw.includes("://") ? raw : `https://${raw}`);
    } catch {
      throw new GitError("invalid_url", "Repository URL is not valid");
    }
    if (url.username || url.password) {
      throw new GitError("credentials_in_url", "Remove credentials from the repository URL");
    }
    if (url.protocol !== "https:" && url.protocol !== "http:" && url.protocol !== "ssh:") {
      throw new GitError("invalid_url", `Unsupported protocol: ${url.protocol}`);
    }
    host = url.host;
    path = url.pathname;
  }

  const allowed = findHost(config, host);
  if (!allowed) {
    throw new GitError(
      "host_not_allowed",
      `Host "${host}" is not in the allowed Git hosts (GIT_HOSTS)`,
    );
  }

  const kind = guessProvider(allowed.host) ?? provider;
  if (!kind) throw new GitError("invalid_url", "Choose the provider for this host");

  let segments = path.split("/").filter(Boolean);
  const dash = segments.indexOf("-");
  if (dash >= 0) segments = segments.slice(0, dash);
  if (kind === "github") segments = segments.slice(0, 2);
  const last = segments.length - 1;
  if (last >= 0) segments[last] = (segments[last] ?? "").replace(/\.git$/i, "");

  if (segments.length < 2 || segments.some((s) => !SEGMENT.test(s))) {
    throw new GitError(
      "invalid_url",
      kind === "github"
        ? "Expected https://host/owner/repository"
        : "Expected https://host/group/project",
    );
  }

  return {
    provider: kind,
    host: allowed.host,
    scheme: allowed.scheme,
    fullPath: segments.join("/"),
  };
}

export function cloneUrl(remote: RemoteRepo): string {
  return `${remote.scheme}://${remote.host}/${remote.fullPath}.git`;
}

export function webUrl(remote: RemoteRepo): string {
  return `${remote.scheme}://${remote.host}/${remote.fullPath}`;
}
