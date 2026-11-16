/**
 * Redmine issues as specifications: free, open source, self-hosted by many public bodies.
 *
 * Commits cite issues the way Redmine reads them (`refs #12`, `fixes #12`), as `RM#12`, or by
 * link to the instance. Approval is a status. Journals keep the old description on every edit, so
 * the text as approved is rebuilt exactly.
 */

import type { ChangeRequest, SpecView, TicketItem } from "@cairn/shared";
import { z } from "zod";
import type { AdapterOptions, TrackerAdapter, TrackerConnection } from "./adapter";
import {
  changeTexts,
  collect,
  day,
  escapeRegExp,
  shaped,
  TrackerError,
  trackerCall,
  trimBase,
  utc,
} from "./http";

type RedmineConnection = Extract<TrackerConnection, { kind: "redmine" }>;

/** Redmine's own commit keywords, `RM#12`, and links to this instance → `RM#12`. */
export function findRedmineIssues(change: ChangeRequest, baseUrl: string): string[] {
  return collect(
    changeTexts(change),
    [
      /\b(?:refs|references|issueid|fixes|fixed|closes|closed)\s*:?\s*#(\d+)\b/gi,
      /(?<![\w#])RM#(\d+)\b/g,
      new RegExp(`${escapeRegExp(trimBase(baseUrl))}/issues/(\\d+)\\b`, "g"),
    ],
    (id) => `RM#${id}`,
  );
}

const statuses = z.object({
  issue_statuses: z.array(
    z.object({ id: z.number(), name: z.string(), is_closed: z.boolean().optional() }),
  ),
});

const issue = z.object({
  issue: z.object({
    id: z.number(),
    subject: z.string(),
    description: z.string().nullish(),
    status: z.object({ id: z.number(), name: z.string() }),
    journals: z
      .array(
        z.object({
          created_on: z.string(),
          user: z.object({ name: z.string() }).nullish(),
          details: z.array(
            z.object({
              property: z.string(),
              name: z.string(),
              old_value: z.string().nullish(),
              new_value: z.string().nullish(),
            }),
          ),
        }),
      )
      .default([]),
  }),
});

export function toRedmineSpec(
  ref: string,
  raw: { issue: unknown; statuses: unknown },
  approvedStatuses: readonly string[],
  baseUrl: string,
): SpecView {
  const i = issue.parse(raw.issue).issue;
  const nameOf = new Map(
    statuses.parse(raw.statuses).issue_statuses.map((s) => [`${s.id}`, s.name]),
  );
  const changes = i.journals
    .map((j) => ({ ...j, at: utc(j.created_on), by: j.user?.name ?? "unknown" }))
    .sort((a, b) => a.at.localeCompare(b.at))
    .flatMap((j) =>
      j.details.filter((d) => d.property === "attr").map((d) => ({ ...d, at: j.at, by: j.by })),
    );
  const approval = changes
    .filter(
      (d) =>
        d.name === "status_id" && approvedStatuses.includes(nameOf.get(d.new_value ?? "") ?? ""),
    )
    .at(-1);
  const edits = changes.filter((d) => d.name === "description");
  const text = i.description ?? "";

  let approved: SpecView["approved"] = null;
  if (approval) {
    let then = text;
    for (const e of [...edits].reverse()) {
      if (e.at <= approval.at) break;
      then = e.old_value ?? "";
    }
    approved = { at: approval.at, byId: approval.by, text: then, exact: true };
  }

  return {
    key: ref,
    tracker: "redmine",
    title: i.subject,
    status: i.status.name,
    url: `${baseUrl}/issues/${i.id}`,
    approved,
    text,
    revisions: edits.map((e) => ({ at: e.at, authorId: e.by })),
  };
}

export function redmineTracker(
  connection: RedmineConnection,
  options: AdapterOptions = {},
): TrackerAdapter {
  const base = trimBase(connection.baseUrl);
  const headers = { "x-redmine-api-key": connection.token };
  const get = (path: string) => trackerCall("Redmine", `${base}${path}`, { headers }, options);

  return {
    kind: "redmine",
    find: (change) => findRedmineIssues(change, base),
    async read(ref, approvedStatuses) {
      const id = /^RM#(\d+)$/.exec(ref)?.[1];
      if (!id) throw new TrackerError("not_found", `"${ref}" is not a Redmine issue`);
      const [i, s] = await Promise.all([
        get(`/issues/${id}.json?include=journals`),
        get("/issue_statuses.json"),
      ]);
      return shaped("Redmine", () =>
        toRedmineSpec(ref, { issue: i, statuses: s }, approvedStatuses, base),
      );
    },
    async list(scope, query) {
      const project = scope.project?.trim();
      if (!project) throw new TrackerError("not_found", "A Redmine project is required");
      const [body, s] = await Promise.all([
        get(
          `/issues.json?project_id=${encodeURIComponent(project)}&status_id=*` +
            `&updated_on=${encodeURIComponent(`>=${day(query.since)}`)}` +
            `&sort=updated_on:desc&limit=${Math.min(query.limit ?? 100, 100)}`,
        ),
        get("/issue_statuses.json"),
      ]);
      return shaped("Redmine", () => {
        const closed = new Set(
          statuses
            .parse(s)
            .issue_statuses.filter((x) => x.is_closed)
            .map((x) => x.id),
        );
        return z
          .object({
            issues: z.array(
              z.object({
                id: z.number(),
                subject: z.string(),
                status: z.object({ id: z.number(), name: z.string() }),
                updated_on: z.string(),
              }),
            ),
          })
          .parse(body)
          .issues.map(
            (i): TicketItem => ({
              key: `RM#${i.id}`,
              title: i.subject,
              status: i.status.name,
              done: closed.has(i.status.id) || query.doneStatuses.includes(i.status.name),
              tracker: "redmine",
              url: `${base}/issues/${i.id}`,
              updatedAt: utc(i.updated_on),
            }),
          );
      });
    },
    async check() {
      const me = await get("/users/current.json");
      return shaped("Redmine", () => {
        const u = z
          .object({
            user: z.object({
              login: z.string(),
              firstname: z.string().optional(),
              lastname: z.string().optional(),
            }),
          })
          .parse(me).user;
        return { displayName: [u.firstname, u.lastname].filter(Boolean).join(" ") || u.login };
      });
    },
  };
}
