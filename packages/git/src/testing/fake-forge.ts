import { execFile, spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const exec = promisify(execFile);

export interface ForgeRepo {
  /** `owner/repo` (GitHub) or `group/project` (GitLab). */
  fullPath: string;
  defaultBranch: string;
  /** branch name -> files (path -> content). Non-default branches start from the default branch. */
  branches: Record<string, Record<string, string>>;
}

export interface FakeForgeOptions {
  kind: "github" | "gitlab";
  repos: ForgeRepo[];
  /** When set, every API and git request must present it. */
  token?: string;
  port?: number;
  root?: string;
}

export interface FakeForge {
  /** `127.0.0.1:port`: the value to put in GIT_HOSTS as `http://127.0.0.1:port`. */
  host: string;
  url: string;
  stop(): Promise<void>;
}

const IDENTITY = ["-c", "user.name=Cairn Test", "-c", "user.email=test@cairn.local"];

async function git(cwd: string, ...args: string[]) {
  await exec("git", [...IDENTITY, ...args], { cwd, windowsHide: true });
}

async function seed(root: string, repo: ForgeRepo): Promise<void> {
  const bare = path.join(root, `${repo.fullPath}.git`);
  await mkdir(bare, { recursive: true });
  await git(bare, "init", "--bare", "--quiet", "-b", repo.defaultBranch);

  const work = await mkdtemp(path.join(tmpdir(), "cairn-seed-"));
  try {
    await git(work, "init", "--quiet", "-b", repo.defaultBranch);
    const names = [
      repo.defaultBranch,
      ...Object.keys(repo.branches).filter((b) => b !== repo.defaultBranch),
    ];
    for (const name of names) {
      if (name !== repo.defaultBranch)
        await git(work, "checkout", "--quiet", "-B", name, repo.defaultBranch);
      for (const [file, content] of Object.entries(repo.branches[name] ?? {})) {
        const target = path.join(work, file);
        await mkdir(path.dirname(target), { recursive: true });
        await writeFile(target, content);
      }
      await git(work, "add", "-A");
      await git(work, "commit", "--quiet", "--allow-empty", "-m", `seed ${name}`);
    }
    await git(work, "push", "--quiet", bare, "--all");
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

async function headOf(root: string, repo: ForgeRepo, branch: string): Promise<string | undefined> {
  try {
    const { stdout } = await exec("git", ["rev-parse", `refs/heads/${branch}`], {
      cwd: path.join(root, `${repo.fullPath}.git`),
      windowsHide: true,
    });
    return stdout.trim();
  } catch {
    return undefined;
  }
}

function authorized(req: IncomingMessage, token: string | undefined): boolean {
  if (!token) return true;
  const auth = req.headers.authorization ?? "";
  if (auth === `Bearer ${token}`) return true;
  if (req.headers["private-token"] === token) return true;
  if (auth.startsWith("Basic ")) {
    const decoded = Buffer.from(auth.slice(6), "base64").toString("utf8");
    return decoded.slice(decoded.indexOf(":") + 1) === token;
  }
  return false;
}

function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}

function cgi(root: string, req: IncomingMessage, url: URL, body: Buffer, res: ServerResponse) {
  const child = spawn("git", ["http-backend"], {
    env: {
      ...process.env,
      GIT_PROJECT_ROOT: root,
      GIT_HTTP_EXPORT_ALL: "1",
      REQUEST_METHOD: req.method ?? "GET",
      PATH_INFO: decodeURIComponent(url.pathname),
      QUERY_STRING: url.search.slice(1),
      CONTENT_TYPE: req.headers["content-type"] ?? "",
      CONTENT_LENGTH: String(body.length),
      HTTP_GIT_PROTOCOL: String(req.headers["git-protocol"] ?? ""),
      HTTP_CONTENT_ENCODING: String(req.headers["content-encoding"] ?? ""),
      REMOTE_ADDR: "127.0.0.1",
    },
    windowsHide: true,
  });
  const out: Buffer[] = [];
  child.stdout.on("data", (c: Buffer) => out.push(c));
  child.on("close", () => {
    const all = Buffer.concat(out);
    let split = all.indexOf("\r\n\r\n");
    let gap = 4;
    if (split < 0) {
      split = all.indexOf("\n\n");
      gap = 2;
    }
    if (split < 0) {
      res.writeHead(500);
      res.end("bad cgi output");
      return;
    }
    const headers: Record<string, string> = {};
    let status = 200;
    for (const line of all.subarray(0, split).toString("utf8").split(/\r?\n/)) {
      const i = line.indexOf(":");
      if (i < 0) continue;
      const name = line.slice(0, i).trim().toLowerCase();
      const value = line.slice(i + 1).trim();
      if (name === "status") status = Number.parseInt(value, 10);
      else headers[name] = value;
    }
    res.writeHead(status, headers);
    res.end(all.subarray(split + gap));
  });
  child.stdin.end(body);
}

/** A local stand-in for GitHub/GitLab: REST API subset plus real git smart-HTTP via `git http-backend`. */
export async function startFakeForge(options: FakeForgeOptions): Promise<FakeForge> {
  const root = options.root ?? (await mkdtemp(path.join(tmpdir(), "cairn-forge-")));
  for (const repo of options.repos) await seed(root, repo);
  const byPath = new Map(options.repos.map((r) => [r.fullPath, r]));

  const apiPrefix = options.kind === "github" ? "/api/v3/repos/" : "/api/v4/projects/";

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://localhost");
      if (!authorized(req, options.token)) {
        res.writeHead(401, { "www-authenticate": 'Basic realm="fake-forge"' });
        res.end("unauthorized");
        return;
      }

      if (url.pathname.startsWith(apiPrefix)) {
        const rest = url.pathname.slice(apiPrefix.length);
        let repo: ForgeRepo | undefined;
        let tail = "";
        if (options.kind === "github") {
          const [owner, name, ...more] = rest.split("/");
          repo = byPath.get(`${owner}/${name}`);
          tail = `/${more.join("/")}`;
        } else {
          const [enc, ...more] = rest.split("/");
          repo = byPath.get(decodeURIComponent(enc ?? ""));
          tail = `/${more.join("/")}`;
        }
        if (!repo) return json(res, 404, { message: "Not Found" });

        const branchNames = Object.keys(repo.branches);
        const branchJson = async (name: string) => {
          const sha = await headOf(root, repo, name);
          if (!sha) return undefined;
          return options.kind === "github"
            ? { name, commit: { sha }, protected: name === repo.defaultBranch }
            : { name, commit: { id: sha }, default: name === repo.defaultBranch, protected: false };
        };

        if (tail === "/") {
          const origin = `http://${req.headers.host}`;
          return json(
            res,
            200,
            options.kind === "github"
              ? {
                  name: repo.fullPath.split("/")[1],
                  full_name: repo.fullPath,
                  html_url: `${origin}/${repo.fullPath}`,
                  default_branch: repo.defaultBranch,
                  private: Boolean(options.token),
                }
              : {
                  name: repo.fullPath.split("/").pop(),
                  path_with_namespace: repo.fullPath,
                  web_url: `${origin}/${repo.fullPath}`,
                  default_branch: repo.defaultBranch,
                  visibility: options.token ? "private" : "public",
                },
          );
        }
        const listPath = options.kind === "github" ? "/branches" : "/repository/branches";
        if (tail === listPath) {
          const all = await Promise.all(branchNames.map(branchJson));
          return json(res, 200, all.filter(Boolean));
        }
        if (tail.startsWith(`${listPath}/`)) {
          const name = decodeURIComponent(tail.slice(listPath.length + 1));
          const one = await branchJson(name);
          return one ? json(res, 200, one) : json(res, 404, { message: "Branch not found" });
        }
        return json(res, 404, { message: "Not Found" });
      }

      const body = await readBody(req);
      cgi(root, req, url, body, res);
    } catch (error) {
      res.writeHead(500);
      res.end(String(error));
    }
  });

  await new Promise<void>((resolve) => server.listen(options.port ?? 0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;

  return {
    host: `127.0.0.1:${port}`,
    url: `http://127.0.0.1:${port}`,
    stop: async () => {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      if (!options.root) await rm(root, { recursive: true, force: true });
    },
  };
}
