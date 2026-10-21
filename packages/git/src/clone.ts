import { execFile } from "node:child_process";
import { redact } from "./credentials";
import { GitError } from "./errors";
import { assertBranch, cloneUrl, type RemoteRepo } from "./remote";

export interface CloneOptions {
  remote: RemoteRepo;
  branch: string;
  /** Personal access token. Optional for public repositories. */
  token?: string;
  /** Must not exist yet or be empty. The caller owns cleanup. */
  destDir: string;
  timeoutMs?: number;
  gitBin?: string;
}

export interface CloneResult {
  /** The commit actually checked out: the head of the branch at clone time. */
  commitSha: string;
  durationMs: number;
}

/** Variables git genuinely needs (proxy, TLS, Windows profile). Everything else is withheld. */
const PASSTHROUGH = [
  "PATH",
  "Path",
  "SystemRoot",
  "SYSTEMROOT",
  "HOME",
  "USERPROFILE",
  "TEMP",
  "TMP",
  "TMPDIR",
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "NO_PROXY",
  "http_proxy",
  "https_proxy",
  "no_proxy",
  "GIT_SSL_CAINFO",
  "GIT_SSL_NO_VERIFY",
  "SSL_CERT_FILE",
  "SSL_CERT_DIR",
] as const;

/**
 * The child process never inherits DATABASE_URL, CAIRN_SECRET_KEY or any LLM key. The token is
 * given to git through GIT_CONFIG_* environment variables, never through argv (visible in process
 * listings) and never inside the URL (persisted in .git/config).
 */
export function gitEnv(
  base: Record<string, string | undefined>,
  remote: RemoteRepo,
  token: string | undefined,
): { env: Record<string, string>; secrets: string[] } {
  const env: Record<string, string> = {
    GIT_TERMINAL_PROMPT: "0",
    GCM_INTERACTIVE: "never",
    GIT_ASKPASS: "",
  };
  for (const name of PASSTHROUGH) {
    const value = base[name];
    if (value !== undefined) env[name] = value;
  }
  const secrets: string[] = [];
  if (token) {
    const user = remote.provider === "github" ? "x-access-token" : "oauth2";
    const basic = Buffer.from(`${user}:${token}`).toString("base64");
    env.GIT_CONFIG_COUNT = "1";
    env.GIT_CONFIG_KEY_0 = "http.extraHeader";
    env.GIT_CONFIG_VALUE_0 = `Authorization: Basic ${basic}`;
    secrets.push(token, basic);
  }
  return { env, secrets };
}

function run(
  bin: string,
  args: string[],
  options: { cwd?: string; env: Record<string, string>; timeoutMs: number },
): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      bin,
      args,
      {
        cwd: options.cwd,
        env: options.env as NodeJS.ProcessEnv,
        timeout: options.timeoutMs,
        killSignal: "SIGKILL",
        maxBuffer: 1024 * 1024,
        windowsHide: true,
      },
      (error, stdout, stderr) => {
        if (!error) return resolve(stdout);
        const failure = error as NodeJS.ErrnoException & { killed?: boolean };
        if (failure.code === "ENOENT") {
          return reject(
            new GitError("git_missing", "The git executable was not found on this machine"),
          );
        }
        const text = `${stderr}\n${failure.message}`;
        const wrapped = new Error(text) as Error & { timedOut?: boolean };
        wrapped.timedOut = failure.killed === true;
        reject(wrapped);
      },
    );
  });
}

function classify(raw: string, timedOut: boolean, secrets: string[]): GitError {
  const text = redact(raw, secrets);
  const tail = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(-4)
    .join(" | ")
    .slice(0, 400);
  if (timedOut) return new GitError("timeout", "The clone took too long and was stopped");
  if (/Remote branch .* not found/i.test(text)) {
    return new GitError("branch_not_found", "The branch does not exist in this repository");
  }
  if (
    /Authentication failed|could not read Username|Invalid username or password|Access denied|error: (401|403)|returned error: (401|403)/i.test(
      text,
    )
  ) {
    return new GitError("unauthorized", "The access token was refused by the Git server");
  }
  if (/Repository not found|returned error: 404|error: 404/i.test(text)) {
    return new GitError("not_found", "Repository not found, or the token cannot see it");
  }
  if (
    /Could not resolve host|Failed to connect|Connection (refused|timed out|reset)|\b407\b|SSL certificate|unable to access/i.test(
      text,
    )
  ) {
    return new GitError("unreachable", `The Git server could not be reached: ${tail}`);
  }
  return new GitError("clone_failed", `git clone failed: ${tail}`);
}

/**
 * Shallow, single-branch, hook-free, submodule-free clone of one branch into `destDir`.
 * The repository is untrusted input: nothing from it is ever executed.
 */
export async function cloneBranch(
  options: CloneOptions,
  baseEnv: Record<string, string | undefined> = process.env,
): Promise<CloneResult> {
  const branch = assertBranch(options.branch);
  const bin = options.gitBin ?? "git";
  const timeoutMs = options.timeoutMs ?? 300_000;
  const { env, secrets } = gitEnv(baseEnv, options.remote, options.token);
  const started = Date.now();

  const args = [
    "-c",
    "credential.helper=",
    "-c",
    "init.templateDir=",
    "-c",
    "core.fsmonitor=false",
    "-c",
    "core.symlinks=false",
    "-c",
    "core.protectNTFS=true",
    "-c",
    "core.protectHFS=true",
    "-c",
    "transfer.fsckObjects=true",
    "-c",
    "protocol.allow=never",
    "-c",
    "protocol.https.allow=always",
    ...(options.remote.scheme === "http" ? ["-c", "protocol.http.allow=always"] : []),
    "clone",
    "--quiet",
    "--depth",
    "1",
    "--single-branch",
    "--no-tags",
    "--branch",
    branch,
    "--",
    cloneUrl(options.remote),
    options.destDir,
  ];

  try {
    await run(bin, args, { env, timeoutMs });
  } catch (error) {
    if (error instanceof GitError) throw error;
    const failure = error as Error & { timedOut?: boolean };
    throw classify(failure.message, failure.timedOut === true, secrets);
  }

  const head = await run(bin, ["rev-parse", "HEAD"], {
    cwd: options.destDir,
    env,
    timeoutMs: 30_000,
  }).catch((error: Error) => {
    throw classify(error.message, false, secrets);
  });
  const commitSha = head.trim();
  if (!/^[0-9a-f]{40,64}$/.test(commitSha)) {
    throw new GitError("clone_failed", "git did not report a valid commit");
  }
  return { commitSha, durationMs: Date.now() - started };
}
