export interface GitHost {
  /** Lowercase `host` or `host:port`. */
  host: string;
  scheme: "https" | "http";
}

export interface GitConfig {
  hosts: GitHost[];
  apiTimeoutMs: number;
  cloneTimeoutMs: number;
}

const DEFAULT_HOSTS = "github.com,gitlab.com";

/**
 * `GIT_HOSTS` is the egress allowlist: a comma-separated list of the only Git hosts Cairn may
 * contact. Bare entries are HTTPS. Plain HTTP must be requested explicitly (`http://host:port`)
 * and is meant for local development only.
 */
export function parseHosts(raw: string): GitHost[] {
  const hosts: GitHost[] = [];
  for (const entry of raw.split(",")) {
    const value = entry.trim();
    if (!value) continue;
    const url = new URL(value.includes("://") ? value : `https://${value}`);
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      throw new Error(`GIT_HOSTS: unsupported scheme in "${value}"`);
    }
    hosts.push({
      host: url.host.toLowerCase(),
      scheme: url.protocol === "http:" ? "http" : "https",
    });
  }
  return hosts;
}

export function loadGitConfig(env: Record<string, string | undefined> = process.env): GitConfig {
  return {
    hosts: parseHosts(env.GIT_HOSTS || DEFAULT_HOSTS),
    apiTimeoutMs: Number(env.GIT_API_TIMEOUT_MS) || 15_000,
    cloneTimeoutMs: Number(env.GIT_CLONE_TIMEOUT_MS) || 300_000,
  };
}

export function findHost(config: GitConfig, host: string): GitHost | undefined {
  const wanted = host.toLowerCase();
  return config.hosts.find((h) => h.host === wanted);
}
