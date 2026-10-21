import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  auditEvents,
  createDb,
  createImport,
  createRescan,
  type Db,
  failStaleImports,
  getImportView,
  getLatestScan,
  ImportConflictError,
  repositories,
  repositoryImports,
  teams,
} from "@cairn/db";
import { encryptSecret, parseHosts, resolveBranch } from "@cairn/git";
import { type FakeForge, startFakeForge } from "@cairn/git/testing";
import { eq, like } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { processImport } from "./import";

try {
  process.loadEnvFile(path.join(import.meta.dirname, "../../../.env"));
} catch {
  // No .env: the suite is skipped unless DATABASE_URL is provided.
}

const TOKEN = "glpat-integration-token";
const KEY = Buffer.alloc(32, 9);

describe.skipIf(!process.env.DATABASE_URL)(
  "repository import: real Postgres + real git over HTTP",
  () => {
    let db: Db;
    let forge: FakeForge;
    let workRoot: string;
    let remote: { provider: "gitlab"; host: string; scheme: "http"; fullPath: string };
    const team = `it-${Math.random().toString(36).slice(2, 8)}`;
    const silent = { info: () => undefined, error: () => undefined };
    const deps = () => ({
      db,
      key: KEY,
      config: {
        hosts: parseHosts(`http://${forge.host}`),
        apiTimeoutMs: 5000,
        cloneTimeoutMs: 60_000,
      },
      log: silent,
      workRoot,
    });

    async function request(branch: string, token: string | undefined, fullPath = "acme/payments") {
      const { sha } = await resolveBranch({ ...remote, fullPath }, TOKEN, branch).catch(() => ({
        sha: "unknown",
      }));
      return createImport(db, {
        team,
        provider: "gitlab",
        host: forge.host,
        fullPath,
        name: branch === "main" ? fullPath : `${fullPath}@${branch}`,
        webUrl: `${forge.url}/${fullPath}`,
        branch,
        defaultBranch: "main",
        credentialEnc: token ? encryptSecret(token, KEY, `${forge.host}/${fullPath}`) : null,
        requestedSha: sha,
        requestedBy: "Claire Dubois",
      });
    }

    beforeAll(async () => {
      db = createDb();
      workRoot = await mkdtemp(path.join(tmpdir(), "cairn-it-work-"));
      forge = await startFakeForge({
        kind: "gitlab",
        token: TOKEN,
        repos: [
          {
            fullPath: "acme/payments",
            defaultBranch: "main",
            branches: {
              main: { "pom.xml": "<project/>" },
              "feature/billing": { Dockerfile: "FROM scratch", ".gitlab-ci.yml": "stages: []" },
            },
          },
        ],
      });
      remote = { provider: "gitlab", host: forge.host, scheme: "http", fullPath: "acme/payments" };
    }, 60_000);

    afterAll(async () => {
      await db.delete(repositories).where(eq(repositories.host, forge.host));
      await db.delete(teams).where(eq(teams.name, team));
      await db.delete(auditEvents).where(like(auditEvents.target, `${forge.host}/%`));
      await db.pool.end();
      await forge.stop();
      await rm(workRoot, { recursive: true, force: true, maxRetries: 3 });
    });

    it("imports the requested branch: real clone, real scan, persisted result", async () => {
      const { importId } = await request("feature/billing", TOKEN);
      expect((await getImportView(db, importId))?.status).toBe("queued");

      expect(await processImport(deps(), importId)).toBe("done");

      const view = await getImportView(db, importId);
      const head = await resolveBranch(remote, TOKEN, "feature/billing");
      expect(view).toMatchObject({ status: "done", commitSha: head.sha, requestedSha: head.sha });
      expect(view?.repository).toMatchObject({ branch: "feature/billing", team, host: forge.host });
      expect(view?.facts?.technologies).toEqual(["ci", "docker", "java-maven"]);
      expect(view?.finishedAt).not.toBeNull();
      // The scan is stored next to the run: numbers, architecture and code map of this commit.
      const scan = await getLatestScan(db, view?.repository.id ?? "");
      expect(scan?.commitSha).toBe(head.sha);
      expect(scan?.report.stats.files).toBe(3);
      expect(scan?.report.incremental.mode).toBe("full");
      expect(scan?.architecture.nodes.some((n) => n.kind === "pipeline")).toBe(true);
      // The working copy never outlives the run.
      expect(await readdir(workRoot)).toEqual([]);
    }, 60_000);

    it("re-scans with the stored credential and only reads what changed", async () => {
      const repo = (
        await db.select().from(repositories).where(eq(repositories.host, forge.host))
      ).find((r) => r.branch === "feature/billing");
      expect(repo).toBeDefined();
      const { importId } = await createRescan(db, repo?.id ?? "", "Claire Dubois");
      expect(await processImport(deps(), importId)).toBe("done");
      const scan = await getLatestScan(db, repo?.id ?? "");
      expect(scan?.importId).toBe(importId);
      expect(scan?.report.incremental).toMatchObject({ mode: "incremental", analysed: 0, reused: 3 });
    }, 60_000);

    it("stores the token only encrypted and writes an audit trail without any secret", async () => {
      const rows = await db.select().from(repositories).where(eq(repositories.host, forge.host));
      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) {
        expect(row.credentialEnc).toMatch(/^v1\./);
        expect(row.credentialEnc).not.toContain(TOKEN);
      }
      const audit = await db
        .select()
        .from(auditEvents)
        .where(like(auditEvents.target, `${forge.host}/%`));
      expect(audit.map((a) => a.action)).toEqual(
        expect.arrayContaining(["repo.import.requested", "repo.import.done"]),
      );
      expect(JSON.stringify(audit)).not.toContain(TOKEN);
    });

    it("ignores a run that was already processed", async () => {
      const { importId } = await request("main", TOKEN);
      expect(await processImport(deps(), importId)).toBe("done");
      expect(await processImport(deps(), importId)).toBe("skipped");
    }, 60_000);

    it("records a precise failure for a refused token, without leaking it", async () => {
      const { importId } = await request("main", "wrong-token-value", "acme/payments");
      // Same repository row: it was just imported, so this run is the only active one.
      expect(await processImport(deps(), importId)).toBe("failed");
      const view = await getImportView(db, importId);
      expect(view).toMatchObject({ status: "failed", errorCode: "unauthorized" });
      expect(view?.errorMessage).not.toContain("wrong-token-value");
      expect(view?.commitSha).toBeNull();
    }, 60_000);

    it("fails when the branch disappeared between request and clone", async () => {
      const { importId, repositoryId } = await request("feature/billing", TOKEN);
      await db
        .update(repositories)
        .set({ branch: "ghost" })
        .where(eq(repositories.id, repositoryId));
      expect(await processImport(deps(), importId)).toBe("failed");
      expect((await getImportView(db, importId))?.errorCode).toBe("branch_not_found");
      await db
        .update(repositories)
        .set({ branch: "feature/billing" })
        .where(eq(repositories.id, repositoryId));
    }, 60_000);

    it("refuses a second import while one is queued for the same repository and branch", async () => {
      const first = await request("main", TOKEN);
      await expect(request("main", TOKEN)).rejects.toBeInstanceOf(ImportConflictError);
      await processImport(deps(), first.importId);
    }, 60_000);

    it("re-checks the host allowlist in the worker", async () => {
      const { importId } = await request("main", TOKEN);
      const outcome = await processImport(
        {
          ...deps(),
          config: { hosts: parseHosts("github.com"), apiTimeoutMs: 1, cloneTimeoutMs: 1 },
        },
        importId,
      );
      expect(outcome).toBe("failed");
      expect((await getImportView(db, importId))?.errorCode).toBe("host_not_allowed");
    });

    it("marks runs stuck in cloning as interrupted", async () => {
      const { importId } = await request("main", TOKEN);
      await db
        .update(repositoryImports)
        .set({ status: "cloning", startedAt: new Date(Date.now() - 3_600_000) })
        .where(eq(repositoryImports.id, importId));
      expect(await failStaleImports(db, 15 * 60_000)).toBeGreaterThanOrEqual(1);
      expect((await getImportView(db, importId))?.errorCode).toBe("interrupted");
    });
  },
);
