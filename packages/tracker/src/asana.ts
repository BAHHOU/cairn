/**
 * Asana tasks as specifications (free for small teams).
 *
 * Tasks are cited by link. Approval is a value of a custom field ("Validé") or a section the task
 * moves into ("Ready"), whichever the team uses. The task's stories say who edited the notes and
 * when, not what they said: the text as approved is today's, flagged inexact.
 */

import type { ChangeRequest, SpecView, TicketItem } from "@cairn/shared";
import { z } from "zod";
import type { AdapterOptions, TrackerAdapter, TrackerConnection } from "./adapter";
import { changeTexts, collect, localPart, shaped, TrackerError, trackerCall, utc } from "./http";

type AsanaConnection = Extract<TrackerConnection, { kind: "asana" }>;

const API = "https://app.asana.com/api/1.0";

/** Task links, old (`/0/<project>/<task>`) and new (`/1/<ws>/…/task/<task>`) → `asana:<task>`. */
export function findAsanaTasks(change: ChangeRequest): string[] {
  return collect(
    changeTexts(change),
    [/app\.asana\.com\/0\/\d+\/(\d+)/g, /app\.asana\.com\/1\/\d+\/(?:[a-z]+\/\d+\/)*task\/(\d+)/g],
    (id) => `asana:${id}`,
  );
}

const task = z.object({
  gid: z.string(),
  name: z.string(),
  notes: z.string().nullish(),
  permalink_url: z.string(),
  completed: z.boolean(),
  modified_at: z.string().optional(),
  memberships: z.array(z.object({ section: z.object({ name: z.string() }).nullish() })).default([]),
  custom_fields: z
    .array(z.object({ name: z.string(), display_value: z.string().nullish() }))
    .default([]),
});

const stories = z.object({
  data: z.array(
    z.object({
      created_at: z.string(),
      resource_subtype: z.string(),
      created_by: z.object({ name: z.string().nullish(), email: z.string().nullish() }).nullish(),
      new_enum_value: z.object({ name: z.string() }).nullish(),
      new_section: z.object({ name: z.string() }).nullish(),
    }),
  ),
});

type Task = z.infer<typeof task>;

/** An approved field value when there is one, else the task's section. */
function statusOf(t: Task, approvedStatuses: readonly string[]): string {
  const field = t.custom_fields.find((f) => approvedStatuses.includes(f.display_value ?? ""));
  return field?.display_value ?? t.memberships[0]?.section?.name ?? "";
}

export function toAsanaSpec(
  ref: string,
  raw: { task: unknown; stories: unknown },
  approvedStatuses: readonly string[],
): SpecView {
  const t = z.object({ data: task }).parse(raw.task).data;
  const history = stories
    .parse(raw.stories)
    .data.map((s) => ({
      ...s,
      at: utc(s.created_at),
      by: localPart(s.created_by?.email) ?? s.created_by?.name ?? "unknown",
    }))
    .sort((a, b) => a.at.localeCompare(b.at));
  const approval = history
    .filter(
      (s) =>
        approvedStatuses.includes(s.new_enum_value?.name ?? "") ||
        approvedStatuses.includes(s.new_section?.name ?? ""),
    )
    .at(-1);
  const text = t.notes ?? "";

  return {
    key: ref,
    tracker: "asana",
    title: t.name,
    status: statusOf(t, approvedStatuses),
    url: t.permalink_url,
    approved: approval ? { at: approval.at, byId: approval.by, text, exact: false } : null,
    text,
    revisions: history
      .filter((s) => s.resource_subtype === "notes_changed")
      .map((s) => ({ at: s.at, authorId: s.by })),
  };
}

export function asanaTracker(
  connection: AsanaConnection,
  options: AdapterOptions = {},
): TrackerAdapter {
  const headers = { authorization: `Bearer ${connection.token}` };
  const get = (path: string) => trackerCall("Asana", `${API}${path}`, { headers }, options);
  const TASK_FIELDS =
    "name,notes,permalink_url,completed,modified_at,memberships.section.name,custom_fields.name,custom_fields.display_value";

  return {
    kind: "asana",
    find: findAsanaTasks,
    async read(ref, approvedStatuses) {
      const gid = /^asana:(\d+)$/.exec(ref)?.[1];
      if (!gid) throw new TrackerError("not_found", `"${ref}" is not an Asana task`);
      const [t, s] = await Promise.all([
        get(`/tasks/${gid}?opt_fields=${TASK_FIELDS}`),
        get(
          `/tasks/${gid}/stories?limit=100&opt_fields=created_at,resource_subtype,created_by.name,` +
            "created_by.email,new_enum_value.name,new_section.name",
        ),
      ]);
      return shaped("Asana", () => toAsanaSpec(ref, { task: t, stories: s }, approvedStatuses));
    },
    async list(scope, query) {
      const project = /^\d+$/.exec(scope.project?.trim() ?? "")?.[0];
      if (!project) throw new TrackerError("not_found", "An Asana project id is required");
      const body = await get(
        `/tasks?project=${project}&modified_since=${encodeURIComponent(query.since)}` +
          `&limit=${Math.min(query.limit ?? 100, 100)}&opt_fields=${TASK_FIELDS}`,
      );
      return shaped("Asana", () =>
        z
          .object({ data: z.array(task) })
          .parse(body)
          .data.map((t): TicketItem => {
            const status = statusOf(t, query.doneStatuses);
            return {
              key: `asana:${t.gid}`,
              title: t.name,
              status: t.completed && !status ? "Completed" : status,
              done: t.completed || query.doneStatuses.includes(status),
              tracker: "asana",
              url: t.permalink_url,
              updatedAt: utc(t.modified_at ?? query.since),
            };
          }),
      );
    },
    async check() {
      const me = await get("/users/me?opt_fields=name");
      return shaped("Asana", () => ({
        displayName: z.object({ data: z.object({ name: z.string() }) }).parse(me).data.name,
      }));
    },
  };
}
