/**
 * Bugzilla bugs as specifications: free, open source, run by many large projects.
 *
 * Commits cite `bug 123` (Bugzilla's own convention), `BZ#123`, or a link to the instance.
 * Approval is a status. The specification is the bug's description, its first comment, which
 * Bugzilla does not let anyone rewrite: the text as approved is the text today. Where comment
 * editing is turned on, its history shows the edit, and the text is then flagged inexact.
 */

import type { ChangeRequest, SpecView, TicketItem } from "@cairn/shared";
import { z } from "zod";
import type { AdapterOptions, TrackerAdapter, TrackerConnection } from "./adapter";
import {
  changeTexts,
  collect,
  escapeRegExp,
  localPart,
  shaped,
  TrackerError,
  trackerCall,
  trimBase,
  utc,
} from "./http";

type BugzillaConnection = Extract<TrackerConnection, { kind: "bugzilla" }>;

/** Statuses that mean delivered in a stock Bugzilla workflow. */
const DONE = ["RESOLVED", "VERIFIED", "CLOSED"];

export function findBugzillaBugs(change: ChangeRequest, baseUrl: string): string[] {
  return collect(
    changeTexts(change),
    [
      /\bbug\s*#?\s*(\d{2,})\b/gi,
      /(?<![\w#])BZ#(\d+)\b/g,
      new RegExp(`${escapeRegExp(trimBase(baseUrl))}/show_bug\\.cgi\\?id=(\\d+)`, "g"),
    ],
    (id) => `BZ#${id}`,
  );
}

const bugs = z.object({
  bugs: z.array(
    z.object({
      id: z.number(),
      summary: z.string(),
      status: z.string(),
      resolution: z.string().nullish(),
      last_change_time: z.string().optional(),
    }),
  ),
});

export function toBugzillaSpec(
  ref: string,
  raw: { bug: unknown; comments: unknown; history: unknown },
  approvedStatuses: readonly string[],
  baseUrl: string,
): SpecView {
  const bug = bugs.parse(raw.bug).bugs[0];
  if (!bug) throw new TrackerError("not_found", "Bugzilla bug not found");
  const comments = z
    .object({
      bugs: z.record(
        z.string(),
        z.object({
          comments: z.array(z.object({ text: z.string(), count: z.number().optional() })),
        }),
      ),
    })
    .parse(raw.comments).bugs[`${bug.id}`]?.comments;
  const changes =
    z
      .object({
        bugs: z.array(
          z.object({
            history: z.array(
              z.object({
                when: z.string(),
                who: z.string(),
                changes: z.array(z.object({ field_name: z.string(), added: z.string().nullish() })),
              }),
            ),
          }),
        ),
      })
      .parse(raw.history)
      .bugs[0]?.history.map((h) => ({ ...h, at: utc(h.when), by: localPart(h.who) ?? h.who }))
      .sort((a, b) => a.at.localeCompare(b.at)) ?? [];
  const approval = changes
    .filter((h) =>
      h.changes.some((c) => c.field_name === "status" && approvedStatuses.includes(c.added ?? "")),
    )
    .at(-1);
  // Edits of the description, where the comment-editing feature is enabled.
  const edits = changes.filter((h) => h.changes.some((c) => c.field_name.startsWith("longdesc")));
  const text = comments?.[0]?.text ?? "";
  const editedAfter = approval ? edits.some((e) => e.at > approval.at) : false;

  return {
    key: ref,
    tracker: "bugzilla",
    title: bug.summary,
    status: bug.resolution ? `${bug.status} ${bug.resolution}` : bug.status,
    url: `${baseUrl}/show_bug.cgi?id=${bug.id}`,
    approved: approval ? { at: approval.at, byId: approval.by, text, exact: !editedAfter } : null,
    text,
    revisions: edits.map((e) => ({ at: e.at, authorId: e.by })),
  };
}

export function bugzillaTracker(
  connection: BugzillaConnection,
  options: AdapterOptions = {},
): TrackerAdapter {
  const base = trimBase(connection.baseUrl);
  const headers = { "x-bugzilla-api-key": connection.token };
  const get = (path: string) =>
    trackerCall("Bugzilla", `${base}/rest${path}`, { headers }, options);

  return {
    kind: "bugzilla",
    find: (change) => findBugzillaBugs(change, base),
    async read(ref, approvedStatuses) {
      const id = /^BZ#(\d+)$/.exec(ref)?.[1];
      if (!id) throw new TrackerError("not_found", `"${ref}" is not a Bugzilla bug`);
      const [bug, comments, history] = await Promise.all([
        get(`/bug/${id}?include_fields=id,summary,status,resolution`),
        get(`/bug/${id}/comment`),
        get(`/bug/${id}/history`),
      ]);
      return shaped("Bugzilla", () =>
        toBugzillaSpec(ref, { bug, comments, history }, approvedStatuses, base),
      );
    },
    async list(scope, query) {
      const product = scope.product?.trim();
      if (!product) throw new TrackerError("not_found", "A Bugzilla product is required");
      const body = await get(
        `/bug?product=${encodeURIComponent(product)}&last_change_time=${encodeURIComponent(query.since)}` +
          `&include_fields=id,summary,status,resolution,last_change_time&limit=${query.limit ?? 100}`,
      );
      return shaped("Bugzilla", () =>
        bugs.parse(body).bugs.map((b): TicketItem => {
          const status = b.resolution ? `${b.status} ${b.resolution}` : b.status;
          return {
            key: `BZ#${b.id}`,
            title: b.summary,
            status,
            // Resolved as anything but fixed (wontfix, duplicate…) is not a delivery.
            done:
              (DONE.includes(b.status) && (!b.resolution || b.resolution === "FIXED")) ||
              query.doneStatuses.includes(b.status),
            tracker: "bugzilla",
            url: `${base}/show_bug.cgi?id=${b.id}`,
            updatedAt: utc(b.last_change_time ?? query.since),
          };
        }),
      );
    },
    async check() {
      const me = await get("/whoami");
      return shaped("Bugzilla", () => {
        const u = z.object({ name: z.string(), real_name: z.string().nullish() }).parse(me);
        return { displayName: u.real_name || u.name };
      });
    },
  };
}
