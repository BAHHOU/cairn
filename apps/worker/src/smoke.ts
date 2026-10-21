import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  cloneBranch,
  inspectRepo,
  loadGitConfig,
  type ProviderKind,
  parseRepoInput,
  resolveBranch,
} from "@cairn/git";
import { detectStack } from "@cairn/scanner";

/**
 * Connectivity check that needs no database: verifies the host, the token and the branch against
 * the real provider, then clones it. Token comes from GIT_TOKEN so it never lands in shell history.
 *
 *   GIT_TOKEN=... pnpm --filter @cairn/worker smoke gitlab https://gitlab.corp/group/project main
 */
const [provider, url, branch] = process.argv.slice(2);
if (!provider || !url) {
  console.error("usage: smoke <github|gitlab> <repo-url> [branch]");
  process.exit(2);
}

const config = loadGitConfig();
const token = process.env.GIT_TOKEN || undefined;
const remote = parseRepoInput(url, provider as ProviderKind, config);

console.log(`1/3 provider API: ${remote.scheme}://${remote.host} (${remote.provider})`);
const info = await inspectRepo(remote, token, { timeoutMs: config.apiTimeoutMs });
console.log(
  `    ${info.repo.fullPath} default=${info.repo.defaultBranch} private=${info.repo.isPrivate}`,
);
console.log(`    ${info.branches.length}${info.truncated ? "+" : ""} branches`);

const wanted = branch ?? info.repo.defaultBranch;
const head = await resolveBranch(remote, token, wanted, { timeoutMs: config.apiTimeoutMs });
console.log(`2/3 branch ${wanted} -> ${head.sha}`);

const dir = await mkdtemp(path.join(tmpdir(), "cairn-smoke-"));
try {
  const result = await cloneBranch({
    remote,
    branch: wanted,
    token,
    destDir: path.join(dir, "repo"),
    timeoutMs: config.cloneTimeoutMs,
  });
  const facts = await detectStack(path.join(dir, "repo"));
  console.log(`3/3 cloned ${result.commitSha} in ${result.durationMs} ms`);
  console.log(
    `    ${facts.fileCount} files, technologies: ${facts.technologies.join(", ") || "none"}`,
  );
} finally {
  await rm(dir, { recursive: true, force: true, maxRetries: 3 });
}
