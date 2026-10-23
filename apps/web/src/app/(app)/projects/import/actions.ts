"use server";

import {
  createImport,
  createRescan,
  ImportConflictError,
  markImportFailed,
  ProjectExistsError,
  sendImportJob,
} from "@cairn/db";
import {
  assertBranch,
  type BranchInfo,
  encryptSecret,
  getRepoInfo,
  inspectRepo,
  isGitError,
  loadGitConfig,
  loadSecretKey,
  PROVIDERS,
  type ProviderKind,
  parseRepoInput,
  type RepoInfo,
  resolveBranch,
} from "@cairn/git";
import { z } from "zod";
import type { ImportErrorCode } from "@/lib/import/messages";
import { ForbiddenError, getDb, getQueue, requireImporter } from "@/lib/import/runtime";

export interface ActionFailure {
  ok: false;
  /** Rendered as `importErrors.<code>` in the viewer's language. */
  code: ImportErrorCode;
  /** Technical detail that is safe to show (never contains a credential). */
  detail?: string;
  /** Set when an import is already running for the same repository and branch. */
  importId?: string;
}

export type InspectOutcome =
  | {
      ok: true;
      provider: ProviderKind;
      host: string;
      repo: RepoInfo;
      branches: BranchInfo[];
      truncated: boolean;
    }
  | ActionFailure;

export type StartOutcome = { ok: true; importId: string } | ActionFailure;

const sourceSchema = z.object({
  provider: z.enum(PROVIDERS),
  url: z.string().trim().min(1).max(300),
  token: z
    .string()
    .trim()
    .max(500)
    .optional()
    .transform((v) => v || undefined),
});

const startSchema = sourceSchema.extend({
  branch: z.string().trim().min(1).max(200),
  team: z
    .string()
    .trim()
    .regex(/^[\p{L}\p{N}][\p{L}\p{N} ._-]{1,59}$/u, "invalid_team"),
});

function failure(error: unknown): ActionFailure {
  if (error instanceof ForbiddenError) {
    return { ok: false, code: "forbidden" };
  }
  if (error instanceof z.ZodError) {
    // A schema message is a code ("invalid_team") when the field has a dedicated explanation.
    const custom = error.issues[0]?.message;
    return { ok: false, code: custom === "invalid_team" ? "invalid_team" : "invalid_input" };
  }
  if (isGitError(error)) {
    // The translated message already says it all for the others; the detail would only repeat it.
    const informative = ["unreachable", "provider_error", "clone_failed"].includes(error.code);
    return { ok: false, code: error.code, detail: informative ? error.message : undefined };
  }
  console.error("[import] unexpected error", error instanceof Error ? error.message : "unknown");
  return { ok: false, code: "internal" };
}

/**
 * Step 1: real call to the provider (token, repository, branches). Nothing is stored.
 * Input is a FormData on purpose: `next dev` prints plain-object action arguments to the
 * terminal, which would show the access token.
 */
export async function inspectRepositoryAction(form: FormData): Promise<InspectOutcome> {
  try {
    await requireImporter();
    const { provider, url, token } = sourceSchema.parse(Object.fromEntries(form));
    const config = loadGitConfig();
    const remote = parseRepoInput(url, provider, config);
    const result = await inspectRepo(remote, token, { timeoutMs: config.apiTimeoutMs });
    if (result.branches.length === 0) {
      return { ok: false, code: "empty_repository" };
    }
    return { ok: true, provider: remote.provider, host: remote.host, ...result };
  } catch (error) {
    return failure(error);
  }
}

/**
 * Scans an already imported repository again, with the credential stored at import time. Files
 * whose hash did not change are not read again: only the commits since the last scan cost time.
 */
export async function rescanRepositoryAction(repositoryId: string): Promise<StartOutcome> {
  try {
    const viewer = await requireImporter();
    const id = z.string().uuid().parse(repositoryId);
    const db = getDb();
    const { importId } = await createRescan(db, id, viewer.name);
    try {
      await sendImportJob(await getQueue(), importId);
    } catch (error) {
      console.error(
        "[import] queue unavailable",
        error instanceof Error ? error.message : "unknown",
      );
      await markImportFailed(db, importId, {
        code: "internal",
        message: "The job queue was unavailable when the rescan was requested",
      });
      return { ok: false, code: "queue_unavailable", importId };
    }
    return { ok: true, importId };
  } catch (error) {
    if (error instanceof ImportConflictError) {
      return { ok: false, code: "rescan_conflict", importId: error.importId };
    }
    return failure(error);
  }
}

/**
 * Step 2: everything is re-verified server-side (the browser is not trusted), then the request is
 * recorded and queued. The worker does the actual clone.
 */
export async function startImportAction(form: FormData): Promise<StartOutcome> {
  try {
    const viewer = await requireImporter();
    const data = startSchema.parse(Object.fromEntries(form));
    const config = loadGitConfig();
    const remote = parseRepoInput(data.url, data.provider, config);
    const branch = assertBranch(data.branch);

    const repo = await getRepoInfo(remote, data.token, { timeoutMs: config.apiTimeoutMs });
    const head = await resolveBranch(remote, data.token, branch, {
      timeoutMs: config.apiTimeoutMs,
    });

    // The provider's canonical path (case, renames) is what identifies the project from now on.
    const fullPath = repo.fullPath;
    const credentialEnc = data.token
      ? encryptSecret(data.token, loadSecretKey(), `${remote.host}/${fullPath}`)
      : null;

    const db = getDb();
    const { importId } = await createImport(db, {
      team: data.team,
      provider: remote.provider,
      host: remote.host,
      fullPath,
      name: branch === repo.defaultBranch ? fullPath : `${fullPath}@${branch}`,
      webUrl: repo.webUrl,
      branch,
      defaultBranch: repo.defaultBranch || branch,
      credentialEnc,
      requestedSha: head.sha,
      requestedBy: viewer.name,
    });

    try {
      await sendImportJob(await getQueue(), importId);
    } catch (error) {
      console.error(
        "[import] queue unavailable",
        error instanceof Error ? error.message : "unknown",
      );
      await markImportFailed(db, importId, {
        code: "internal",
        message: "The job queue was unavailable when the import was requested",
      });
      return { ok: false, code: "queue_unavailable", importId };
    }
    return { ok: true, importId };
  } catch (error) {
    if (error instanceof ImportConflictError) {
      return { ok: false, code: "import_conflict", importId: error.importId };
    }
    if (error instanceof ProjectExistsError) {
      return { ok: false, code: "exists" };
    }
    return failure(error);
  }
}
