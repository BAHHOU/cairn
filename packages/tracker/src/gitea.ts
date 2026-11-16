/**
 * Gitea and Forgejo issues (Codeberg included) as specifications: free, open source, self-hosted.
 *
 * Approval is a label; the issue timeline says who added it and when. Neither keeps the history
 * of an issue's text through its API, only its last update, which comments also move: an issue
 * touched after approval counts as edited. Cairn would rather ask for a look than vouch for it.
 */

import type { ChangeRequest, SpecView, TicketItem } from "@cairn/shared";
import { z } from "zod";
import type { AdapterOptions, TrackerAdapter, TrackerConnection } from "./adapter";
import {
  changeTexts,
  collect,
  escapeRegExp,
  shaped,
  TrackerError,
  trackerCall,
  trimBase,
  utc,
} from "./http";

type GiteaConnection = Extract<TrackerConnection, { kind: "gitea" }>;

const REPO = "[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+";

/** Issue links to this instance, and a bare `#12` in the default repository → `owner/repo#12`. */
export function findGiteaIssues(change: ChangeRequest, baseUrl: string, defaultRepo?: string) {
  const texts = changeTexts(change).slice(1);
  const links = collect(
    texts,
    [new RegExp(`${escapeRegExp(trimBase(baseUrl))}/(${REPO}/issues/\\d+)`, "g")],
    (path) => path.replace("/issues/", "#"),
  );
  const bare = defaultRepo
    ? collect(texts, [/(?<![\w/#&])#(\d+)\b/g], (n) => `${defaultRepo}#${n}`)
    : [];
  return [...new Set([...links, ...bare])];
}

const issue = z.object({
  number: z.number(),
  title: z.string(),
  body: z.string().nullish(),
  state: z.string(),
  html_url: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
  labels: z.array(z.object({ name: z.string() })).default([]),
  pull_request: z.unknown().optional(),
});

const timeline = z.array(
  z.object({
    type: z.string(),
    body: z.string().nullish(),
    created_at: z.string(),
    user: z.object({ login: z.string() }).nullish(),
    label: z.object({ name: z.string() }).nullish(),
  }),
);

/** An update this close to the approval is the label itself. */
const SAME_EDIT_MS = 5_000;

export function toGiteaSpec(
  ref: string,
  raw: { issue: unknown; timeline: unknown },
  approvedStatuses: readonly string[],
): SpecView {
  const i = issue.parse(raw.issue);
  const approvedLabel = i.labels.find((l) => approvedStatuses.includes(l.name))?.name;
  // A label event's body is "1" when the label was added, empty when removed.
  const approval = timeline
    .parse(raw.timeline ?? [])
    .filter((e) => e.type === "label" && e.body === "1" && approvedStatuses.includes(e.label?.name ?? ""))
    .map((e) => ({ at: utc(e.created_at), by: e.user?.login ?? "unknown" }))
    .sort((a, b) => a.at.localeCompare(b.at))
    .at(-1);
  const text = i.body ?? "";
  const updated = utc(i.updated_at);
  const floor = Date.parse(approval?.at ?? utc(i.created_at)) + SAME_EDIT_MS;

  return {
    key: ref,
    tracker: "gitea",
    title: i.title,
    status: approvedLabel ?? i.state,
    url: i.html_url,
    approved:
      approval && approvedLabel ? { at: approval.at, byId: approval.by, text, exact: false } : null,
    text,
    revisions: Date.parse(updated) > floor ? [{ at: updated, authorId: "unknown" }] : [],
  };
}

export function giteaTracker(
  connection: GiteaConnection,
  options: AdapterOptions = {},
): TrackerAdapter {
  const base = trimBase(connection.baseUrl);
  const headers = { authorization: `token ${connection.token}` };
  const get = (path: string) =>
    trackerCall("Gitea", `${base}/api/v1${path}`, { headers }, options);

  return {
    kind: "gitea",
    find: (change) => findGiteaIssues(change, base, connection.defaultRepo),
    async read(ref, approvedStatuses) {
      const m = new RegExp(`^(${REPO})#(\\d+)$`).exec(ref);
      if (!m) throw new TrackerError("not_found", `"${ref}" is not a Gitea issue`);
      const path = `/repos/${m[1]}/issues/${m[2]}`;
      const [i, t] = await Promise.all([get(path), get(`${path}/timeline?limit=100`)]);
      return shaped("Gitea", () => toGiteaSpec(ref, { issue: i, timeline: t }, approvedStatuses));
    },
    async list(scope, query) {
      const repo = new RegExp(`^${REPO}$`).exec(scope.repo?.trim() ?? "")?.[0];
      if (!repo) throw new TrackerError("not_found", "A Gitea owner/repository is required");
      const body = await get(
        `/repos/${repo}/issues?state=all&type=issues&since=${encodeURIComponent(query.since)}` +
          `&limit=${Math.min(query.limit ?? 50, 50)}`,
      );
      return shaped("Gitea", () =>
        z
          .array(issue)
          .parse(body)
          .filter((i) => i.pull_request == null)
          .map((i): TicketItem => {
            const doneLabel = i.labels.find((l) => query.doneStatuses.includes(l.name))?.name;
            return {
              key: `${repo}#${i.number}`,
              title: i.title,
              status: doneLabel ?? i.state,
              done: i.state === "closed" || doneLabel !== undefined,
              tracker: "gitea",
              url: i.html_url,
              updatedAt: utc(i.updated_at),
            };
          }),
      );
    },
    async check() {
      const me = await get("/user");
      return shaped("Gitea", () => {
        const u = z.object({ login: z.string(), full_name: z.string().nullish() }).parse(me);
        return { displayName: u.full_name || u.login };
      });
    },
  };
}
