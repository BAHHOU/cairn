/**
 * Shortcut stories as specifications (free for small teams).
 *
 * Merge requests cite `sc-123`, as Shortcut's own Git integrations read them, or a story link.
 * Approval is a workflow state. The story history says who changed the description and when; the
 * text as approved is today's, flagged inexact.
 */

import type { ChangeRequest, SpecView, TicketItem } from "@cairn/shared";
import { z } from "zod";
import type { AdapterOptions, TrackerAdapter, TrackerConnection } from "./adapter";
import {
  changeTexts,
  collect,
  day,
  localPart,
  shaped,
  TrackerError,
  trackerCall,
  utc,
} from "./http";

type ShortcutConnection = Extract<TrackerConnection, { kind: "shortcut" }>;

const API = "https://api.app.shortcut.com/api/v3";

/** `sc-123`, `[sc-123]` and `app.shortcut.com/<ws>/story/123` → `sc-123`. */
export function findShortcutStories(change: ChangeRequest): string[] {
  return collect(
    changeTexts(change),
    [/(?<![\w-])sc-(\d+)\b/gi, /app\.shortcut\.com\/[^/\s]+\/story\/(\d+)/g],
    (id) => `sc-${id}`,
  );
}

const workflows = z.array(
  z.object({ states: z.array(z.object({ id: z.number(), name: z.string() })) }),
);
const stateNames = (raw: unknown) =>
  new Map(workflows.parse(raw).flatMap((w) => w.states.map((s) => [s.id, s.name] as const)));

const members = z.array(
  z.object({
    id: z.string(),
    profile: z.object({ mention_name: z.string(), email_address: z.string().nullish() }),
  }),
);

const story = z.object({
  id: z.number(),
  name: z.string(),
  description: z.string().nullish(),
  app_url: z.string(),
  workflow_state_id: z.number(),
  updated_at: z.string(),
  completed: z.boolean().optional(),
});

const history = z.array(
  z.object({
    changed_at: z.string(),
    member_id: z.string().nullish(),
    actions: z.array(
      z.object({
        entity_type: z.string(),
        changes: z
          .object({
            workflow_state_id: z.object({ new: z.number().nullish() }).optional(),
            description: z.unknown().optional(),
          })
          .passthrough()
          .optional(),
      }),
    ),
  }),
);

export function toShortcutSpec(
  ref: string,
  raw: { story: unknown; history: unknown; workflows: unknown; members: unknown },
  approvedStatuses: readonly string[],
): SpecView {
  const s = story.parse(raw.story);
  const names = stateNames(raw.workflows);
  const people = new Map(
    members
      .parse(raw.members)
      .map((m) => [m.id, localPart(m.profile.email_address) ?? m.profile.mention_name]),
  );
  const events = history
    .parse(raw.history)
    .map((h) => ({
      at: utc(h.changed_at),
      by: people.get(h.member_id ?? "") ?? "unknown",
      changes: h.actions.filter((a) => a.entity_type === "story").map((a) => a.changes ?? {}),
    }))
    .sort((a, b) => a.at.localeCompare(b.at));
  const approval = events
    .filter((e) =>
      e.changes.some((c) =>
        approvedStatuses.includes(names.get(c.workflow_state_id?.new ?? -1) ?? ""),
      ),
    )
    .at(-1);
  const text = s.description ?? "";

  return {
    key: ref,
    tracker: "shortcut",
    title: s.name,
    status: names.get(s.workflow_state_id) ?? "",
    url: s.app_url,
    approved: approval ? { at: approval.at, byId: approval.by, text, exact: false } : null,
    text,
    revisions: events
      .filter((e) => e.changes.some((c) => c.description !== undefined))
      .map((e) => ({ at: e.at, authorId: e.by })),
  };
}

export function shortcutTracker(
  connection: ShortcutConnection,
  options: AdapterOptions = {},
): TrackerAdapter {
  const headers = { "shortcut-token": connection.token };
  const get = (path: string) => trackerCall("Shortcut", `${API}${path}`, { headers }, options);

  return {
    kind: "shortcut",
    find: findShortcutStories,
    async read(ref, approvedStatuses) {
      const id = /^sc-(\d+)$/.exec(ref)?.[1];
      if (!id) throw new TrackerError("not_found", `"${ref}" is not a Shortcut story`);
      const [s, h, w, m] = await Promise.all([
        get(`/stories/${id}`),
        get(`/stories/${id}/history`),
        get("/workflows"),
        get("/members"),
      ]);
      return shaped("Shortcut", () =>
        toShortcutSpec(ref, { story: s, history: h, workflows: w, members: m }, approvedStatuses),
      );
    },
    async list(scope, query) {
      const search = `${scope.query ?? ""} updated:${day(query.since)}..*`.trim();
      const [body, w] = await Promise.all([
        get(`/search/stories?query=${encodeURIComponent(search)}&page_size=25&detail=slim`),
        get("/workflows"),
      ]);
      return shaped("Shortcut", () => {
        const names = stateNames(w);
        return z
          .object({ data: z.array(story) })
          .parse(body)
          .data.slice(0, query.limit ?? 100)
          .map((s): TicketItem => {
            const status = names.get(s.workflow_state_id) ?? "";
            return {
              key: `sc-${s.id}`,
              title: s.name,
              status,
              done: s.completed === true || query.doneStatuses.includes(status),
              tracker: "shortcut",
              url: s.app_url,
              updatedAt: utc(s.updated_at),
            };
          });
      });
    },
    async check() {
      const me = await get("/member");
      return shaped("Shortcut", () => {
        const m = z.object({ name: z.string().nullish(), mention_name: z.string() }).parse(me);
        return { displayName: m.name || m.mention_name };
      });
    },
  };
}
