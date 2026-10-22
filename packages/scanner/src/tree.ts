import { execFile } from "node:child_process";
import { createHash } from "node:crypto";

export interface TreeEntry {
  path: string;
  /** Git blob hash. */
  sha: string;
  bytes: number;
}

export interface Tree {
  commit: string;
  entries: TreeEntry[];
}

function git(bin: string, cwd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      bin,
      ["-c", "core.quotepath=false", ...args],
      { cwd, maxBuffer: 256 * 1024 * 1024, windowsHide: true, encoding: "utf8" },
      (error, stdout) => (error ? reject(error) : resolve(stdout)),
    );
  });
}

/**
 * The files of the checked-out commit with their size and blob hash, straight from git: no file is
 * read. This is what makes an incremental scan cheap: two commits are compared hash against hash.
 * Symlinks and submodules are left out, the tree comes from an untrusted repository.
 */
export async function listTree(root: string, gitBin = "git"): Promise<Tree> {
  const commit = (await git(gitBin, root, ["rev-parse", "HEAD"])).trim();
  const raw = await git(gitBin, root, ["ls-tree", "-r", "-l", "-z", "HEAD"]);
  const entries: TreeEntry[] = [];
  for (const record of raw.split("\0")) {
    if (!record) continue;
    const tab = record.indexOf("\t");
    if (tab < 0) continue;
    const meta = record.slice(0, tab).trim().split(/\s+/);
    const [mode, type, sha, size] = meta;
    if (type !== "blob" || mode === "120000" || !sha) continue;
    entries.push({ path: record.slice(tab + 1), sha, bytes: Number(size) || 0 });
  }
  entries.sort((a, b) => a.path.localeCompare(b.path));
  return { commit, entries };
}

/** The hash git gives a blob. Lets tests and fixtures build entries without a repository. */
export const gitBlobSha = (content: string | Buffer): string => {
  const body = typeof content === "string" ? Buffer.from(content) : content;
  return createHash("sha1").update(`blob ${body.length}\0`).update(body).digest("hex");
};
