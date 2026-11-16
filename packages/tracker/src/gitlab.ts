/**
 * GitLab Issues as specifications, read with the repository's own token: an individual on GitLab
 * gets change control without connecting anything else.
 *
 * Approval is a label (added at a known moment, by a known user: resource label events). GitLab
 * Free records who edited a description and when (system notes) but not the old text, so the text
 * as approved is today's, flagged inexact: change control then refuses it as proof once edited.
 */

import type { ChangeRequest, SpecView, TicketItem } from "@cairn/shared";
import { z } from "zod";
import type { AdapterOptions, TrackerAdapter, TrackerConnection } from "./adapter";
import { shaped, TrackerError, trackerCall, utc } from "./http";

type GitLabConnection = Extract<TrackerConnection, { kind: "gitlab" }>;

const PATH = "[A-Za-z0-9_.-]+(?:/[A-Za-z0-9_.-]+)+";

/**
 * `#12` (this project), `group/project#12`, and issue links. Refs to this project are shown as
 * `#12`, as GitLab itself writes them.
 */
export function findGitLabIssues(change: ChangeRequest, project: string): string[] {
  const texts = [change.title, change.description, ...change.commitMessages];
  const refs = new Set<string>();
  const add = (path: string, iid: string) =>
    refs.add(path === project ? `#${iid}` : `${path}#${iid}`);
  for (const text of texts) {
    for (const m of text.matchAll(new RegExp(`https?://[^/\\s]+/(${PATH})/-/issues/(\\d+)`, "g"))) {
      add(m[1] as string, m[2] as string);
    }
    for (const m of text.matchAll(new RegExp(`(?<![\\w/.])(${PATH})#(\\d+)\\b`, "g"))) {
      add(m[1] as string, m[2] as string);
    }
    for (const m of text.matchAll(/(?<![\w/#&!])#(\d+)\b/g)) add(project, m[1] as string);
  }
  return [...refs];
}

const issueSchema = z.object({
  title: z.string(),
  description: z.string().nullable(),
  state: z.string(),
  labels: z.array(z.string()),
  web_url: z.string(),
});
const labelEvents = z.array(
  z.object({
    created_at: z.string(),
    action: z.string(),
    user: z.object({ username: z.string() }).nullable(),
    label: z.object({ name: z.string() }).nullable(),
  }),
);
const notes = z.array(
  z.object({
    body: z.string(),
    system: z.boolean(),
    created_at: z.string(),
    author: z.object({ username: z.string() }),
  }),
);

export function toGitLabSpec(
  ref: string,
  raw: { issue: unknown; labels: unknown; notes: unknown },
  approvedStatuses: readonly string[],
): SpecView {
  const issue = issueSchema.parse(raw.issue);
  const approvedLabel = issue.labels.find((l) => approvedStatuses.includes(l));
  const approval = labelEvents
    .parse(raw.labels)
    .filter((e) => e.action === "add" && e.label && approvedStatuses.includes(e.label.name))
    .map((e) => ({ at: utc(e.created_at), by: e.user?.username ?? "unknown" }))
    .sort((a, b) => a.at.localeCompare(b.at))
    .at(-1);
  const revisions = notes
    .parse(raw.notes)
    .filter((n) => n.system && /^changed the description/.test(n.body))
    .map((n) => ({ at: utc(n.created_at), authorId: n.author.username }))
    .sort((a, b) => a.at.localeCompare(b.at));
  const text = issue.description ?? "";

  return {
    key: ref,
    tracker: "gitlab",
    title: issue.title,
    status: approvedLabel ?? issue.state,
    url: issue.web_url,
    approved:
      approval && approvedLabel ? { at: approval.at, byId: approval.by, text, exact: false } : null,
    text,
    revisions,
  };
}

export function gitlabTracker(
  connection: GitLabConnection,
  options: AdapterOptions = {},
): TrackerAdapter {
  const api = `${connection.baseUrl.replace(/\/+$/, "")}/api/v4`;
  const headers: Record<string, string> = connection.token
    ? { "private-token": connection.token }
    : {};
  const get = (path: string) => trackerCall("GitLab", `${api}${path}`, { headers }, options);

  return {
    kind: "gitlab",
    find: (change) => findGitLabIssues(change, connection.project),
    async read(ref, approvedStatuses) {
      const m = /^(?:(.+))?#(\d+)$/.exec(ref);
      if (!m) throw new TrackerError("not_found", `"${ref}" is not a GitLab issue`);
      const issueUrl = `/projects/${encodeURIComponent(m[1] ?? connection.project)}/issues/${m[2]}`;
      const [issue, labels, history] = await Promise.all([
        get(issueUrl),
        get(`${issueUrl}/resource_label_events?per_page=100`),
        get(`${issueUrl}/notes?per_page=100&sort=asc`),
      ]);
      return shaped("GitLab", () =>
        toGitLabSpec(ref, { issue, labels, notes: history }, approvedStatuses),
      );
    },
    async list(scope, query) {
      const project = scope.project || connection.project;
      const body = await get(
        `/projects/${encodeURIComponent(project)}/issues?scope=all&updated_after=${encodeURIComponent(query.since)}` +
          `&order_by=updated_at&sort=desc&per_page=${Math.min(query.limit ?? 100, 100)}`,
      );
      return shaped("GitLab", () =>
        z
          .array(
            z.object({
              iid: z.number(),
              title: z.string(),
              state: z.string(),
              labels: z.array(z.string()),
              web_url: z.string(),
              updated_at: z.string(),
            }),
          )
          .parse(body)
          .map((i): TicketItem => {
            const doneLabel = i.labels.find((l) => query.doneStatuses.includes(l));
            return {
              key: project === connection.project ? `#${i.iid}` : `${project}#${i.iid}`,
              title: i.title,
              status: doneLabel ?? i.state,
              done: i.state === "closed" || doneLabel !== undefined,
              tracker: "gitlab",
              url: i.web_url,
              updatedAt: utc(i.updated_at),
            };
          }),
      );
    },
    async check() {
      const me = await get("/user");
      return shaped("GitLab", () => ({
        displayName: z.object({ name: z.string() }).parse(me).name,
      }));
    },
  };
}
