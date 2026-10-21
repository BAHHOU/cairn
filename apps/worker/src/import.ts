import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  claimImport,
  type Db,
  getPreviousFileIndex,
  markImportDone,
  markImportFailed,
  markImportScanning,
  recordImportAudit,
  saveScan,
} from "@cairn/db";
import {
  cloneBranch,
  decryptSecret,
  findHost,
  type GitConfig,
  GitError,
  type GitErrorCode,
  isGitError,
  type ProviderKind,
  redact,
} from "@cairn/git";
import { detectStack, listTree, scanRepository } from "@cairn/scanner";

export interface ImportDeps {
  db: Db;
  key: Buffer;
  config: GitConfig;
  log: { info: (o: object, m: string) => void; error: (o: object, m: string) => void };
  /** Where temporary working copies live. Defaults to the OS temp directory. */
  workRoot?: string;
}

export type ImportOutcome = "done" | "failed" | "skipped";

/**
 * One import run: claim -> clone one branch -> scan -> persist -> always delete the working copy.
 * Failures are recorded on the run (never thrown): retrying a bad token or a missing branch is useless.
 */
export async function processImport(deps: ImportDeps, importId: string): Promise<ImportOutcome> {
  const { db, key, config, log } = deps;

  const claimed = await claimImport(db, importId);
  if (!claimed) {
    log.info({ importId }, "import skipped: already claimed or finished");
    return "skipped";
  }

  const { repository } = claimed;
  const workdir = await mkdtemp(path.join(deps.workRoot ?? tmpdir(), "cairn-import-"));
  let token: string | undefined;

  try {
    const host = findHost(config, repository.host);
    if (!host)
      throw new GitError(
        "host_not_allowed",
        `Host "${repository.host}" is no longer allowed (GIT_HOSTS)`,
      );

    if (repository.credentialEnc) {
      token = decryptSecret(
        repository.credentialEnc,
        key,
        `${repository.host}/${repository.fullPath}`,
      );
    }

    const result = await cloneBranch(
      {
        remote: {
          provider: repository.provider as ProviderKind,
          host: host.host,
          scheme: host.scheme,
          fullPath: repository.fullPath,
        },
        branch: repository.branch,
        token,
        destDir: path.join(workdir, "repo"),
        timeoutMs: config.cloneTimeoutMs,
      },
      process.env,
    );
    await markImportScanning(db, importId, result.commitSha);

    const repoDir = path.join(workdir, "repo");
    const facts = await detectStack(repoDir);

    // The scan is the point of the import, but a bug in it must not hide a successful clone:
    // the run stays "done" and the failure is recorded next to it.
    let scanSummary: Record<string, unknown> = {};
    try {
      const tree = await listTree(repoDir);
      const previous = await getPreviousFileIndex(db, repository.id);
      const scan = await scanRepository({
        repositoryId: repository.id,
        repoName: repository.fullPath,
        provider: repository.provider,
        commit: tree.commit,
        entries: tree.entries,
        read: (file) => readFile(path.join(repoDir, file)),
        ...(previous ? { previous } : {}),
      });
      await saveScan(db, {
        repositoryId: repository.id,
        importId,
        commitSha: tree.commit,
        report: scan.report,
        architecture: scan.architecture,
        codeGraph: scan.codeGraph,
        fileIndex: scan.files,
      });
      scanSummary = {
        scanMs: scan.report.durationMs,
        scanMode: scan.report.incremental.mode,
        filesAnalysed: scan.report.incremental.analysed,
        filesReused: scan.report.incremental.reused,
        archNodes: scan.report.counts.archNodes,
        codeNodes: scan.report.counts.codeNodes,
        findings: scan.report.findings.length,
      };
    } catch (scanError) {
      const reason = redact(scanError instanceof Error ? scanError.message : String(scanError), [
        token,
      ]);
      log.error({ importId, error: reason }, "scan failed");
      await recordImportAudit(db, importId, "repo.scan.failed", { reason: reason.slice(0, 200) });
    }

    await markImportDone(db, importId, { commitSha: result.commitSha, facts });
    await recordImportAudit(db, importId, "repo.import.done", {
      commitSha: result.commitSha,
      cloneMs: result.durationMs,
      fileCount: facts.fileCount,
      ...scanSummary,
    });
    log.info({ importId, commitSha: result.commitSha, facts, ...scanSummary }, "import done");
    return "done";
  } catch (error) {
    const failure: { code: GitErrorCode; message: string } = isGitError(error)
      ? { code: error.code, message: error.message }
      : { code: "internal", message: "Unexpected error while importing (see worker logs)" };
    failure.message = redact(failure.message, [token]);

    log.error(
      {
        importId,
        code: failure.code,
        error: redact(error instanceof Error ? error.message : String(error), [token]),
      },
      "import failed",
    );
    await markImportFailed(db, importId, failure);
    await recordImportAudit(db, importId, "repo.import.failed", { code: failure.code });
    return "failed";
  } finally {
    await rm(workdir, { recursive: true, force: true, maxRetries: 3 }).catch(() => undefined);
  }
}
