import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  assertBranch,
  cloneBranch,
  decryptSecret,
  encryptSecret,
  type GitConfig,
  GitError,
  gitEnv,
  inspectRepo,
  loadSecretKey,
  parseHosts,
  parseRepoInput,
  type RemoteRepo,
  redact,
  resolveBranch,
} from "./index";
import { type FakeForge, startFakeForge } from "./testing/fake-forge";

const config = (hosts: string): GitConfig => ({
  hosts: parseHosts(hosts),
  apiTimeoutMs: 5000,
  cloneTimeoutMs: 60_000,
});

async function code(fn: () => Promise<unknown> | unknown): Promise<string> {
  try {
    await fn();
  } catch (error) {
    if (error instanceof GitError) return error.code;
    throw error;
  }
  return "no-error";
}

describe("parseRepoInput", () => {
  const cfg = config("github.com,gitlab.com,git.corp.example:8443");

  it("accepts https, .git, browser and scp-style URLs", () => {
    const expected = { provider: "github", host: "github.com", fullPath: "acme/payments" };
    for (const input of [
      "https://github.com/acme/payments",
      "https://github.com/acme/payments.git",
      "https://github.com/acme/payments/tree/main/src",
      "github.com/acme/payments",
      "git@github.com:acme/payments.git",
    ]) {
      expect(parseRepoInput(input, undefined, cfg)).toMatchObject(expected);
    }
  });

  it("keeps GitLab subgroups and drops the /-/ browser suffix", () => {
    expect(
      parseRepoInput("https://gitlab.com/acme/platform/billing/-/tree/main", undefined, cfg),
    ).toMatchObject({ provider: "gitlab", fullPath: "acme/platform/billing" });
  });

  it("needs the provider for a self-hosted host", async () => {
    expect(
      await code(() => parseRepoInput("https://git.corp.example:8443/a/b", undefined, cfg)),
    ).toBe("invalid_url");
    expect(parseRepoInput("https://git.corp.example:8443/a/b", "gitlab", cfg)).toMatchObject({
      provider: "gitlab",
      host: "git.corp.example:8443",
    });
  });

  it("refuses hosts outside the allowlist (SSRF guard)", async () => {
    expect(await code(() => parseRepoInput("https://evil.example/a/b", "gitlab", cfg))).toBe(
      "host_not_allowed",
    );
    expect(await code(() => parseRepoInput("http://169.254.169.254/a/b", "gitlab", cfg))).toBe(
      "host_not_allowed",
    );
  });

  it("refuses credentials in the URL", async () => {
    expect(
      await code(() => parseRepoInput("https://user:glpat-x@gitlab.com/a/b", undefined, cfg)),
    ).toBe("credentials_in_url");
  });

  it("refuses malformed paths", async () => {
    for (const input of [
      "https://github.com/acme",
      "https://github.com/a/../b",
      "https://github.com/",
    ]) {
      expect(await code(() => parseRepoInput(input, undefined, cfg))).toBe("invalid_url");
    }
    expect(await code(() => parseRepoInput("ftp://github.com/a/b", undefined, cfg))).toBe(
      "invalid_url",
    );
  });
});

describe("assertBranch", () => {
  it("accepts ordinary branch names", () => {
    for (const b of ["main", "release/2.1", "feature/PAY-123_fix", "v1.0.0", "user@fix"]) {
      expect(assertBranch(b)).toBe(b);
    }
  });

  it("refuses option injection and unsafe refs", () => {
    for (const b of [
      "--upload-pack=evil",
      "-x",
      "a..b",
      "a//b",
      "a b",
      "x.lock",
      "x/",
      "",
      "a;rm",
      "a@{1}",
    ]) {
      expect(() => assertBranch(b), b).toThrow(GitError);
    }
  });
});

describe("secrets", () => {
  const key = Buffer.alloc(32, 7);

  it("round-trips and never stores the plaintext", () => {
    const blob = encryptSecret("glpat-secret", key, "gitlab.com/a/b");
    expect(blob).not.toContain("glpat");
    expect(decryptSecret(blob, key, "gitlab.com/a/b")).toBe("glpat-secret");
  });

  it("is bound to its context, key and integrity", () => {
    const blob = encryptSecret("tok", key, "gitlab.com/a/b");
    expect(() => decryptSecret(blob, key, "gitlab.com/a/other")).toThrow();
    expect(() => decryptSecret(blob, Buffer.alloc(32, 8), "gitlab.com/a/b")).toThrow();
    const [v, iv, tag, data] = blob.split(".");
    const bytes = Buffer.from(data ?? "", "base64url");
    bytes[0] = (bytes[0] ?? 0) ^ 0xff;
    const tampered = [v, iv, tag, bytes.toString("base64url")].join(".");
    expect(() => decryptSecret(tampered, key, "gitlab.com/a/b")).toThrow();
  });

  it("uses a fresh IV each time", () => {
    expect(encryptSecret("t", key, "c")).not.toBe(encryptSecret("t", key, "c"));
  });

  it("validates the configured key", async () => {
    expect(await code(() => loadSecretKey({}))).toBe("secret_key_missing");
    expect(await code(() => loadSecretKey({ CAIRN_SECRET_KEY: "c2hvcnQ=" }))).toBe(
      "secret_key_missing",
    );
    expect(loadSecretKey({ CAIRN_SECRET_KEY: key.toString("base64") }).length).toBe(32);
  });

  it("redacts tokens, their base64 and URL userinfo", () => {
    const basic = Buffer.from("oauth2:tok123").toString("base64");
    const out = redact(`fatal: https://oauth2:tok123@host/x Authorization: Basic ${basic} tok123`, [
      "tok123",
      basic,
    ]);
    expect(out).not.toContain("tok123");
    expect(out).not.toContain(basic);
  });
});

describe("gitEnv", () => {
  const remote: RemoteRepo = {
    provider: "gitlab",
    host: "gitlab.com",
    scheme: "https",
    fullPath: "a/b",
  };

  it("does not leak application secrets to git and keeps the token out of argv", () => {
    const { env, secrets } = gitEnv(
      { PATH: "/bin", DATABASE_URL: "postgres://x", CAIRN_SECRET_KEY: "k", LLM_API_KEY: "sk" },
      remote,
      "tok",
    );
    expect(env.PATH).toBe("/bin");
    expect(Object.keys(env)).not.toContain("DATABASE_URL");
    expect(Object.keys(env)).not.toContain("CAIRN_SECRET_KEY");
    expect(Object.keys(env)).not.toContain("LLM_API_KEY");
    expect(env.GIT_CONFIG_VALUE_0).toContain("Authorization: Basic");
    expect(secrets).toContain("tok");
  });

  it("sends no auth header without a token", () => {
    expect(gitEnv({}, remote, undefined).env.GIT_CONFIG_COUNT).toBeUndefined();
  });
});

describe.each(["github", "gitlab"] as const)("against a local %s-style forge", (kind) => {
  const TOKEN = "s3cret-token-value";
  let forge: FakeForge;
  let remote: RemoteRepo;
  const opts = () => ({ timeoutMs: 5000 });

  beforeAll(async () => {
    forge = await startFakeForge({
      kind,
      token: TOKEN,
      repos: [
        {
          fullPath: "acme/payments",
          defaultBranch: "main",
          branches: {
            main: { "pom.xml": "<project/>", "src/App.java": "class App {}" },
            "feature/billing": { Dockerfile: "FROM scratch", "docs/billing.md": "# billing" },
            "release/2.1": { "go.mod": "module x" },
          },
        },
      ],
    });
    remote = { provider: kind, host: forge.host, scheme: "http", fullPath: "acme/payments" };
  }, 60_000);

  afterAll(async () => {
    await forge.stop();
  });

  it("inspects the repository and lists branches with their head commits", async () => {
    const result = await inspectRepo(remote, TOKEN, opts());
    expect(result.repo).toMatchObject({ defaultBranch: "main", isPrivate: true });
    expect(result.branches.map((b) => b.name)).toEqual(["main", "feature/billing", "release/2.1"]);
    expect(result.branches[0]?.isDefault).toBe(true);
    expect(result.branches.every((b) => /^[0-9a-f]{40}$/.test(b.sha))).toBe(true);
  });

  it("resolves a branch containing a slash", async () => {
    const branch = await resolveBranch(remote, TOKEN, "feature/billing", opts());
    expect(branch.name).toBe("feature/billing");
  });

  it("maps provider failures to stable codes", async () => {
    expect(await code(() => inspectRepo(remote, "wrong", opts()))).toBe("unauthorized");
    expect(await code(() => inspectRepo({ ...remote, fullPath: "acme/nope" }, TOKEN, opts()))).toBe(
      "not_found",
    );
    expect(await code(() => resolveBranch(remote, TOKEN, "ghost", opts()))).toBe(
      "branch_not_found",
    );
    expect(await code(() => inspectRepo({ ...remote, host: "127.0.0.1:1" }, TOKEN, opts()))).toBe(
      "unreachable",
    );
  });

  it("really clones the requested branch only, at its head commit", async () => {
    const dest = await mkdtemp(path.join(tmpdir(), "cairn-clone-test-"));
    const target = path.join(dest, "repo");
    try {
      const expected = await resolveBranch(remote, TOKEN, "feature/billing", opts());
      const result = await cloneBranch({
        remote,
        branch: "feature/billing",
        token: TOKEN,
        destDir: target,
        timeoutMs: 30_000,
      });
      expect(result.commitSha).toBe(expected.sha);
      expect(await readFile(path.join(target, "Dockerfile"), "utf8")).toBe("FROM scratch");
      expect(await readFile(path.join(target, "pom.xml"), "utf8")).toBe("<project/>");
      // Token must not be persisted in the clone's configuration.
      const gitConfig = await readFile(path.join(target, ".git", "config"), "utf8");
      expect(gitConfig).not.toContain(TOKEN);
    } finally {
      await rm(dest, { recursive: true, force: true, maxRetries: 3 });
    }
  }, 60_000);

  it("fails with a precise, credential-free error", async () => {
    const dest = await mkdtemp(path.join(tmpdir(), "cairn-clone-test-"));
    try {
      const attempts: Array<[string, string, string | undefined]> = [
        ["unauthorized", "main", "bad-token"],
        ["unauthorized", "main", undefined],
        ["branch_not_found", "ghost", TOKEN],
      ];
      for (const [expected, branch, token] of attempts) {
        try {
          await cloneBranch({
            remote,
            branch,
            token,
            destDir: path.join(dest, branch),
            timeoutMs: 30_000,
          });
          expect.fail("clone should have failed");
        } catch (error) {
          expect(error).toBeInstanceOf(GitError);
          expect((error as GitError).code).toBe(expected);
          expect((error as GitError).message).not.toContain(TOKEN);
          expect((error as GitError).message).not.toContain("bad-token");
        }
      }
      expect(
        await code(() =>
          cloneBranch({ remote, branch: "--upload-pack=x", token: TOKEN, destDir: dest }),
        ),
      ).toBe("invalid_branch");
    } finally {
      await rm(dest, { recursive: true, force: true, maxRetries: 3 });
    }
  }, 90_000);
});
