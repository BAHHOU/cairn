import {
  listTrackerConnections,
  listTrackerLinks,
  saveTraceSnapshot,
  type TrackerLink,
} from "@cairn/db";
import {
  getCommitFiles,
  getMergeRequest,
  getMergeRequestActivity,
  listBranchCommits,
  listMergedMergeRequests,
} from "@cairn/git";
import {
  type ChangeRequest,
  DEFAULT_DONE_STATUSES,
  type DeliveryInput,
  type SpecView,
  summarizeTrace,
  type TicketItem,
  TRACE_WINDOW_DAYS,
  type Traceability,
  traceProject,
} from "@cairn/shared";
import { createTracker, TrackerError } from "@cairn/tracker";
import { context, failureOf, type Live, type Source, sourceOf } from "@/lib/changes/live";
import { readSpecs, toConnection } from "@/lib/changes/trackers";
import { getDb } from "@/lib/import/runtime";

/** Merges read per run: each costs six GitLab calls (meta, diffs, commits, approvals, notes). */
const MERGE_LIMIT = 25;
/** Direct pushes whose diff is read; past it they are still flagged, without their zones. */
const PUSH_LIMIT = 15;

export interface LiveTrace {
  trace: Traceability;
  links: TrackerLink[];
  /** Linked boards that could not be listed, with why. */
  failed: { linkId: string; code: TrackerError["code"] }[];
  branch: string;
}

const firstLine = (message: string) => message.split("\n")[0] ?? message;
const localPart = (email: string) => email.split("@")[0] ?? email;

/** Merges into main and pushes that skipped review, as the engine reads them. */
async function deliveries(source: Source, since: string) {
  const opts = { timeoutMs: source.timeoutMs };
  const merged = await listMergedMergeRequests(
    source.remote,
    source.token,
    { branch: source.branch, since, limit: MERGE_LIMIT },
    opts,
  );
  const merges = await Promise.all(
    merged.map(async (ref) => {
      const [change, activity] = await Promise.all([
        getMergeRequest(source.remote, source.token, source.name, ref.iid, opts),
        getMergeRequestActivity(source.remote, source.token, ref.iid, opts),
      ]);
      return { ref, change, activity };
    }),
  );

  // A commit on main's first-parent line that no merged request accounts for went in directly.
  const known = new Set<string>();
  for (const m of merges) {
    for (const sha of m.ref.shas) known.add(sha);
    for (const c of m.activity.commits) known.add(c.sha);
  }
  const main = await listBranchCommits(
    source.remote,
    source.token,
    { branch: source.branch, since },
    opts,
  );
  const pushes = main.filter((c) => !known.has(c.sha));
  const pushFiles = await Promise.all(
    pushes
      .slice(0, PUSH_LIMIT)
      .map((c) => getCommitFiles(source.remote, source.token, c.sha, opts)),
  );

  const fromMerges = merges.map(({ ref, change, activity }) => ({
    change: change as ChangeRequest,
    build: (tickets: string[]): DeliveryInput => ({
      kind: "merge",
      ref: `!${ref.iid}`,
      sha: ref.shas[0] ?? "",
      title: ref.title,
      authorId: change.authorId,
      at: ref.mergedAt,
      url: ref.url,
      change,
      approvals: activity.approvals,
      commits: activity.commits,
      tickets,
    }),
  }));
  const fromPushes = pushes.map((c, i) => {
    const change: ChangeRequest = {
      id: c.sha,
      authorId: localPart(c.authorEmail),
      title: firstLine(c.message),
      description: c.message,
      sourceBranch: source.branch,
      commitMessages: [c.message],
      files: pushFiles[i] ?? [],
      approvals: [],
    };
    return {
      change,
      build: (tickets: string[]): DeliveryInput => ({
        kind: "push",
        ref: c.sha.slice(0, 8),
        sha: c.sha,
        title: firstLine(c.message),
        authorId: change.authorId,
        at: c.at,
        url: `${source.remote.scheme}://${source.remote.host}/${source.remote.fullPath}/-/commit/${c.sha}`,
        change,
        approvals: [],
        commits: [c],
        tickets,
      }),
    };
  });
  return [...fromMerges, ...fromPushes];
}

/**
 * Traceability of an imported repository over the window: live from GitLab and the trackers, then
 * kept as a snapshot for the overview and the portfolio. Null when the id is not an imported
 * repository this viewer may see.
 */
export async function loadLiveTrace(id: string): Promise<Live<LiveTrace> | null> {
  const source = await sourceOf(id);
  if (source === null) return null;
  if (typeof source === "string") return { ok: false, reason: source };
  const since = new Date(Date.now() - TRACE_WINDOW_DAYS * 86_400_000).toISOString();

  try {
    const ctx = await context(source);
    const doneStatuses = ctx.policy.doneStatuses ?? DEFAULT_DONE_STATUSES;
    const query = { since, doneStatuses };
    const db = getDb();

    // What was asked: the repository's own issues, then every board linked to it.
    const [links, connections] = await Promise.all([
      listTrackerLinks(db, id),
      listTrackerConnections(db),
    ]);
    const failed: LiveTrace["failed"] = [];
    const listings = await Promise.all([
      ctx.adapters[0]?.list?.({}, query).catch(() => [] as TicketItem[]) ?? [],
      ...links.map(async (link) => {
        const row = connections.find((c) => c.id === link.connectionId);
        try {
          if (!row) throw new TrackerError("not_found", "connection removed");
          const adapter = createTracker(toConnection(row), { timeoutMs: source.timeoutMs });
          if (!adapter.list) throw new TrackerError("provider_error", "cannot list");
          return await adapter.list(link.scope, query);
        } catch (error) {
          failed.push({
            linkId: link.id,
            code: error instanceof TrackerError ? error.code : "provider_error",
          });
          return [] as TicketItem[];
        }
      }),
    ]);
    const tickets = [...new Map(listings.flat().map((t) => [t.key, t])).values()];

    // What was delivered, and the specs it cites.
    const found = await deliveries(source, since);
    const read = await Promise.all(
      found.map((d) => readSpecs(d.change, ctx.adapters, ctx.policy.approvedStatuses)),
    );
    const specs = new Map<string, SpecView>();
    for (const r of read) for (const s of r.specs) specs.set(s.key, s);

    const trace = traceProject({
      tickets,
      specs: [...specs.values()],
      deliveries: found.map((d, i) => d.build(read[i]?.tickets ?? [])),
      policy: ctx.policy,
      people: ctx.people,
      since,
    });
    await saveTraceSnapshot(db, id, summarizeTrace(trace)).catch(() => undefined);
    return {
      ok: true,
      connected: ctx.connected,
      value: { trace, links, failed, branch: source.branch },
    };
  } catch (error) {
    return { ok: false, reason: failureOf(error) };
  }
}
