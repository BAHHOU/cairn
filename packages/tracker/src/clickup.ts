/**
 * ClickUp tasks as specifications (free plan).
 *
 * Merge requests cite `CU-<id>`, as ClickUp's own Git integrations read them, or a task link.
 * Approval is a status. ClickUp's API says when a task entered each status, not who moved it, and
 * of the description only its last update: Cairn knows when, not who nor what, and says so.
 */

import type { ChangeRequest, SpecView, TicketItem } from "@cairn/shared";
import { z } from "zod";
import type { AdapterOptions, TrackerAdapter, TrackerConnection } from "./adapter";
import { changeTexts, collect, shaped, TrackerError, trackerCall } from "./http";

type ClickUpConnection = Extract<TrackerConnection, { kind: "clickup" }>;

const API = "https://api.clickup.com/api/v2";

/** `CU-86abc12` and `app.clickup.com/t/86abc12` → `CU-86abc12`. */
export function findClickUpTasks(change: ChangeRequest): string[] {
  return collect(
    changeTexts(change),
    [/(?<![\w-])CU-([a-z0-9]{6,12})\b/gi, /app\.clickup\.com\/t\/(?:\d+\/)?([a-z0-9]{6,12})\b/gi],
    (id) => `CU-${id.toLowerCase()}`,
  );
}

const ms = (v: string | number) => new Date(Number(v)).toISOString();
/** ClickUp lowercases status names; policies write them as people do. */
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const among = (status: string, list: readonly string[]) => list.some((s) => same(s, status));

const task = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullish(),
  text_content: z.string().nullish(),
  url: z.string(),
  date_created: z.union([z.string(), z.number()]),
  date_updated: z.union([z.string(), z.number()]),
  status: z.object({ status: z.string(), type: z.string().optional() }),
});

const since = z.object({
  status: z.string(),
  total_time: z.object({ since: z.union([z.string(), z.number()]) }),
});
const timeInStatus = z.object({
  current_status: since.nullish(),
  status_history: z.array(since).default([]),
});

/** An edit within this long of the approval is the approval itself: the status change updates the task. */
const SAME_EDIT_MS = 5_000;

export function toClickUpSpec(
  ref: string,
  raw: { task: unknown; timeInStatus: unknown },
  approvedStatuses: readonly string[],
): SpecView {
  const t = task.parse(raw.task);
  const times = timeInStatus.parse(raw.timeInStatus);
  const approvedAt = [
    ...times.status_history,
    ...(times.current_status ? [times.current_status] : []),
  ]
    .filter((s) => among(s.status, approvedStatuses))
    .map((s) => ms(s.total_time.since))
    .sort()
    .at(-1);
  const text = t.text_content ?? t.description ?? "";
  const updated = ms(t.date_updated);
  const floor = Date.parse(approvedAt ?? ms(t.date_created)) + SAME_EDIT_MS;

  return {
    key: ref,
    tracker: "clickup",
    title: t.name,
    status: t.status.status,
    url: t.url,
    approved: approvedAt ? { at: approvedAt, byId: "unknown", text, exact: false } : null,
    text,
    revisions: Date.parse(updated) > floor ? [{ at: updated, authorId: "unknown" }] : [],
  };
}

export function clickupTracker(
  connection: ClickUpConnection,
  options: AdapterOptions = {},
): TrackerAdapter {
  const headers = { authorization: connection.token };
  const get = (path: string) => trackerCall("ClickUp", `${API}${path}`, { headers }, options);

  return {
    kind: "clickup",
    find: findClickUpTasks,
    async read(ref, approvedStatuses) {
      const id = /^CU-([a-z0-9]+)$/i.exec(ref)?.[1];
      if (!id) throw new TrackerError("not_found", `"${ref}" is not a ClickUp task`);
      const [t, s] = await Promise.all([get(`/task/${id}`), get(`/task/${id}/time_in_status`)]);
      return shaped("ClickUp", () =>
        toClickUpSpec(ref, { task: t, timeInStatus: s }, approvedStatuses),
      );
    },
    async list(scope, query) {
      const list = /^\d+$/.exec(scope.list?.trim() ?? "")?.[0];
      if (!list) throw new TrackerError("not_found", "A ClickUp list id is required");
      const body = await get(
        `/list/${list}/task?include_closed=true&subtasks=true&order_by=updated` +
          `&date_updated_gt=${Date.parse(query.since)}&page=0`,
      );
      return shaped("ClickUp", () =>
        z
          .object({ tasks: z.array(task) })
          .parse(body)
          .tasks.slice(0, query.limit ?? 100)
          .map(
            (t): TicketItem => ({
              key: `CU-${t.id.toLowerCase()}`,
              title: t.name,
              status: t.status.status,
              done:
                t.status.type === "closed" ||
                t.status.type === "done" ||
                among(t.status.status, query.doneStatuses),
              tracker: "clickup",
              url: t.url,
              updatedAt: ms(t.date_updated),
            }),
          ),
      );
    },
    async check() {
      const me = await get("/user");
      return shaped("ClickUp", () => ({
        displayName: z.object({ user: z.object({ username: z.string() }) }).parse(me).user.username,
      }));
    },
  };
}
