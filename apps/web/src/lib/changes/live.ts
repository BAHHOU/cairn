import { getChangeControlSettings, getRepositorySource } from "@cairn/db";
import {
  decryptSecret,
  findHost,
  getMergeRequest,
  isGitError,
  listOpenMergeRequests,
  loadGitConfig,
  loadSecretKey,
  type ProviderKind,
  type RemoteRepo,
} from "@cairn/git";
import { byUrgency, type ChangeReview, type ChangeSummary, can, reviewChange } from "@cairn/shared";
import { getDb, isImportConfigured } from "@/lib/import/runtime";
import { getViewer } from "@/lib/session";
import { readSpecs, trackersFor } from "./trackers";

/**
 * Change control on an imported repository: its open merge requests read from GitLab, their
 * tickets from the repository's issues and every connected tracker, evaluated with the organisation's policy. Live on every page load (read-only
 * calls, a few per merge request); the token never leaves the server.
 */

/** Why live data is missing; rendered as `changeControl.live.<reason>`. */
export type LiveFailure =
  | "unsupported"
  | "hostNotAllowed"
  | "unauthorized"
  | "unreachable"
  | "providerError";

export type Live<T> =
  /** `connected`: trackers beyond the repository's own issues, which are always read. */
  { ok: true; value: T; connected: number } | { ok: false; reason: LiveFailure };

/** How many open merge requests the list evaluates: each one costs four GitLab calls. */
const LIST_LIMIT = 20;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface Source {
  remote: RemoteRepo;
  token: string | undefined;
  name: string;
  /** The main branch: what is delivered, the reference for traceability. */
  branch: string;
  timeoutMs: number;
}

/** The repository as a forge remote, for viewers allowed to see every team. Null: not visible. */
export async function sourceOf(id: string): Promise<Source | LiveFailure | null> {
  if (!UUID.test(id) || !isImportConfigured()) return null;
  const viewer = await getViewer();
  if (!can(viewer.role, "see.allTeams")) return null;
  const repo = await getRepositorySource(getDb(), id);
  if (!repo) return null;
  if (repo.provider !== "gitlab") return "unsupported";
  const config = loadGitConfig();
  const host = findHost(config, repo.host);
  if (!host) return "hostNotAllowed";
  const token = repo.credentialEnc
    ? decryptSecret(repo.credentialEnc, loadSecretKey(), `${repo.host}/${repo.fullPath}`)
    : undefined;
  return {
    remote: {
      provider: repo.provider as ProviderKind,
      host: host.host,
      scheme: host.scheme,
      fullPath: repo.fullPath,
    },
    token,
    name: repo.fullPath,
    branch: repo.defaultBranch,
    timeoutMs: config.apiTimeoutMs,
  };
}

export function failureOf(error: unknown): LiveFailure {
  if (isGitError(error)) {
    if (error.code === "unauthorized" || error.code === "not_found") return "unauthorized";
    if (error.code === "unreachable" || error.code === "timeout") return "unreachable";
  }
  return "providerError";
}

/** The policy, people and trackers a repository's changes are judged with. */
export async function context(source: Source) {
  const settings = await getChangeControlSettings(getDb());
  const repoIssues = {
    kind: "gitlab" as const,
    baseUrl: `${source.remote.scheme}://${source.remote.host}`,
    project: source.remote.fullPath,
    token: source.token,
  };
  const adapters = await trackersFor(repoIssues, source.timeoutMs);
  return { ...settings, adapters, connected: adapters.length - 1 };
}

async function review(
  id: string,
  source: Source,
  ctx: Awaited<ReturnType<typeof context>>,
  iid: number,
) {
  const change = await getMergeRequest(source.remote, source.token, id, iid, {
    timeoutMs: source.timeoutMs,
  });
  const { tickets, specs } = await readSpecs(change, ctx.adapters, ctx.policy.approvedStatuses);
  return reviewChange({
    change,
    projectName: source.name,
    policy: ctx.policy,
    specs,
    people: ctx.people,
    tickets,
  });
}

export async function loadLiveReview(id: string, iid: number): Promise<Live<ChangeReview> | null> {
  const source = await sourceOf(id);
  if (source === null) return null;
  if (typeof source === "string") return { ok: false, reason: source };
  try {
    const ctx = await context(source);
    return { ok: true, connected: ctx.connected, value: await review(id, source, ctx, iid) };
  } catch (error) {
    if (isGitError(error) && error.code === "not_found") return null;
    return { ok: false, reason: failureOf(error) };
  }
}

export async function loadLiveChanges(id: string): Promise<Live<ChangeSummary[]> | null> {
  const source = await sourceOf(id);
  if (source === null) return null;
  if (typeof source === "string") return { ok: false, reason: source };
  try {
    const ctx = await context(source);
    const refs = await listOpenMergeRequests(source.remote, source.token, {
      timeoutMs: source.timeoutMs,
    });
    const reviews = await Promise.all(
      refs.slice(0, LIST_LIMIT).map((ref) => review(id, source, ctx, ref.iid)),
    );
    return {
      ok: true,
      connected: ctx.connected,
      value: reviews.map((r) => r.summary).sort(byUrgency),
    };
  } catch (error) {
    return { ok: false, reason: failureOf(error) };
  }
}
