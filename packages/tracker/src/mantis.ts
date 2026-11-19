/**
 * MantisBT issues as specifications: free, open source, self-hosted.
 *
 * Commits cite `issue #123` or `bug #123` (MantisBT's Source integration), `MT#123`, or a link to
 * the instance. Approval is a status. The issue history says who changed the description and
 * when, not what it said through the API: the text as approved is today's, flagged inexact.
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

type MantisConnection = Extract<TrackerConnection, { kind: "mantis" }>;

const DONE = ["resolved", "closed"];

export function findMantisIssues(change: ChangeRequest, baseUrl: string): string[] {
  return collect(
    changeTexts(change),
    [
      /\b(?:issue|bug)\s*#(\d+)\b/gi,
      /(?<![\w#])MT#(\d+)\b/g,
      new RegExp(`${escapeRegExp(trimBase(baseUrl))}/view\\.php\\?id=(\\d+)`, "g"),
    ],
    (id) => `MT#${id}`,
  );
}

const status = z.object({ name: z.string(), label: z.string().optional() });
const value = z.object({ name: z.string().optional(), label: z.string().optional() }).passthrough();

const issue = z.object({
  id: z.number(),
  summary: z.string(),
  description: z.string().nullish(),
  status,
  updated_at: z.string(),
  history: z
    .array(
      z.object({
        created_at: z.string(),
        user: z.object({ name: z.string() }).nullish(),
        field: z.object({ name: z.string() }).nullish(),
        type: z.object({ name: z.string() }).nullish(),
        new_value: z.union([value, z.string(), z.number()]).nullish(),
      }),
    )
    .default([]),
});

/** A status by its internal name or by the label people see. */
const named = (v: unknown, list: readonly string[]) =>
  typeof v === "object" && v !== null
    ? list.includes((v as { name?: string }).name ?? "") ||
      list.includes((v as { label?: string }).label ?? "")
    : false;

export function toMantisSpec(
  ref: string,
  raw: unknown,
  approvedStatuses: readonly string[],
  baseUrl: string,
): SpecView {
  const i = z.object({ issues: z.array(issue) }).parse(raw).issues[0];
  if (!i) throw new TrackerError("not_found", "MantisBT issue not found");
  const events = i.history
    .map((h) => ({ ...h, at: utc(h.created_at), by: h.user?.name ?? "unknown" }))
    .sort((a, b) => a.at.localeCompare(b.at));
  const approval = events
    .filter((h) => h.field?.name === "status" && named(h.new_value, approvedStatuses))
    .at(-1);
  const text = i.description ?? "";

  return {
    key: ref,
    tracker: "mantis",
    title: i.summary,
    status: i.status.label ?? i.status.name,
    url: `${baseUrl}/view.php?id=${i.id}`,
    approved: approval ? { at: approval.at, byId: approval.by, text, exact: false } : null,
    text,
    revisions: events
      .filter((h) => h.type?.name === "description-updated" || h.field?.name === "description")
      .map((h) => ({ at: h.at, authorId: h.by })),
  };
}

export function mantisTracker(
  connection: MantisConnection,
  options: AdapterOptions = {},
): TrackerAdapter {
  const base = trimBase(connection.baseUrl);
  const headers = { authorization: connection.token };
  const get = (path: string) =>
    trackerCall("MantisBT", `${base}/api/rest${path}`, { headers }, options);

  return {
    kind: "mantis",
    find: (change) => findMantisIssues(change, base),
    async read(ref, approvedStatuses) {
      const id = /^MT#(\d+)$/.exec(ref)?.[1];
      if (!id) throw new TrackerError("not_found", `"${ref}" is not a MantisBT issue`);
      const raw = await get(`/issues/${id}`);
      return shaped("MantisBT", () => toMantisSpec(ref, raw, approvedStatuses, base));
    },
    async list(scope, query) {
      const project = /^\d+$/.exec(scope.project?.trim() ?? "")?.[0];
      if (!project) throw new TrackerError("not_found", "A MantisBT project id is required");
      const body = await get(
        `/issues?project_id=${project}&page_size=${Math.min(query.limit ?? 100, 100)}&page=1`,
      );
      return shaped("MantisBT", () =>
        z
          .object({ issues: z.array(issue.omit({ history: true, description: true })) })
          .parse(body)
          .issues.filter((i) => utc(i.updated_at) >= query.since)
          .map((i): TicketItem => {
            const label = i.status.label ?? i.status.name;
            return {
              key: `MT#${i.id}`,
              title: i.summary,
              status: label,
              done: DONE.includes(i.status.name) || named(i.status, query.doneStatuses),
              tracker: "mantis",
              url: `${base}/view.php?id=${i.id}`,
              updatedAt: utc(i.updated_at),
            };
          }),
      );
    },
    async check() {
      const me = await get("/users/me");
      return shaped("MantisBT", () => {
        const u = z.object({ name: z.string(), real_name: z.string().nullish() }).parse(me);
        return { displayName: u.real_name || u.name };
      });
    },
  };
}
