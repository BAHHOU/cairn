/**
 * monday.com items as specifications (free for two seats).
 *
 * Items are cited by link. As with Notion, monday.com's API is a weak witness: the item's last
 * update only. Approval is a status column; its date and approver come from optional columns.
 * The spec is the item's long-text columns. When the item changed after the approval date, the
 * text as approved is unknown.
 */

import type { ChangeRequest, SpecView, TicketItem } from "@cairn/shared";
import { z } from "zod";
import type { AdapterOptions, TrackerAdapter, TrackerConnection } from "./adapter";
import { changeTexts, collect, shaped, TrackerError, trackerCall, utc } from "./http";

type MondayConnection = Extract<TrackerConnection, { kind: "monday" }>;

const ENDPOINT = "https://api.monday.com/v2";
const API_VERSION = "2024-10";

/** `….monday.com/boards/<board>/pulses/<item>` (any view) → `monday:<item>`. */
export function findMondayItems(change: ChangeRequest): string[] {
  return collect(
    changeTexts(change),
    [/monday\.com\/boards\/\d+(?:\/views\/\d+)?\/pulses\/(\d+)/g],
    (id) => `monday:${id}`,
  );
}

const ITEM_FIELDS =
  "id name url created_at updated_at column_values { type text column { title } }";

const item = z.object({
  id: z.string(),
  name: z.string(),
  url: z.string(),
  created_at: z.string().nullish(),
  updated_at: z.string(),
  column_values: z.array(
    z.object({
      type: z.string(),
      text: z.string().nullish(),
      column: z.object({ title: z.string() }),
    }),
  ),
});
type Item = z.infer<typeof item>;

const column = (i: Item, title: string | undefined) =>
  title ? (i.column_values.find((c) => c.column.title === title)?.text ?? "") : "";

export function toMondaySpec(
  ref: string,
  raw: unknown,
  approvedStatuses: readonly string[],
  connection: Pick<MondayConnection, "statusProperty" | "approvedAtProperty" | "approverProperty">,
): SpecView {
  const i = z.object({ data: z.object({ items: z.array(item) }) }).parse(raw).data.items[0];
  if (!i) throw new TrackerError("not_found", "monday.com item not found");
  const status = column(i, connection.statusProperty ?? "Status");
  const text = i.column_values
    .filter((c) => c.type === "long_text" && c.text)
    .map((c) => c.text)
    .join("\n\n");
  const approvedDay = column(i, connection.approvedAtProperty);
  const created = utc(i.created_at ?? i.updated_at);
  // A date-only approval covers that whole day, as for Notion.
  const approvedAt = approvedDay
    ? utc(/T|\d:\d/.test(approvedDay) ? approvedDay : `${approvedDay.slice(0, 10)}T23:59:59Z`)
    : created;
  const lastEdit = utc(i.updated_at);

  return {
    key: ref,
    tracker: "monday",
    title: i.name,
    status,
    url: i.url,
    approved: approvedStatuses.includes(status)
      ? {
          at: approvedAt,
          byId: column(i, connection.approverProperty).split(",")[0]?.trim() || "unknown",
          text,
          exact: false,
        }
      : null,
    text,
    revisions: lastEdit > created ? [{ at: lastEdit, authorId: "unknown" }] : [],
  };
}

export function mondayTracker(
  connection: MondayConnection,
  options: AdapterOptions = {},
): TrackerAdapter {
  const headers = {
    authorization: connection.token,
    "api-version": API_VERSION,
    "content-type": "application/json",
  };
  const graphql = (query: string, variables: Record<string, unknown> = {}) =>
    trackerCall(
      "monday.com",
      ENDPOINT,
      { method: "POST", headers, body: JSON.stringify({ query, variables }) },
      options,
    );

  return {
    kind: "monday",
    find: findMondayItems,
    async read(ref, approvedStatuses) {
      const id = /^monday:(\d+)$/.exec(ref)?.[1];
      if (!id) throw new TrackerError("not_found", `"${ref}" is not a monday.com item`);
      const raw = await graphql(`query($ids: [ID!]) { items(ids: $ids) { ${ITEM_FIELDS} } }`, {
        ids: [id],
      });
      return shaped("monday.com", () => toMondaySpec(ref, raw, approvedStatuses, connection));
    },
    async list(scope, query) {
      const board = /^\d+$/.exec(scope.board?.trim() ?? "")?.[0];
      if (!board) throw new TrackerError("not_found", "A monday.com board id is required");
      const raw = await graphql(
        `query($ids: [ID!], $limit: Int!) { boards(ids: $ids) { items_page(limit: $limit) { items { ${ITEM_FIELDS} } } } }`,
        { ids: [board], limit: Math.min(query.limit ?? 100, 500) },
      );
      return shaped("monday.com", () =>
        z
          .object({
            data: z.object({
              boards: z.array(z.object({ items_page: z.object({ items: z.array(item) }) })),
            }),
          })
          .parse(raw)
          .data.boards.flatMap((b) => b.items_page.items)
          .filter((i) => utc(i.updated_at) >= query.since)
          .map((i): TicketItem => {
            const status = column(i, connection.statusProperty ?? "Status");
            return {
              key: `monday:${i.id}`,
              title: i.name,
              status,
              done: query.doneStatuses.includes(status),
              tracker: "monday",
              url: i.url,
              updatedAt: utc(i.updated_at),
            };
          }),
      );
    },
    async check() {
      const raw = await graphql("query { me { name } }");
      return shaped("monday.com", () => ({
        displayName: z.object({ data: z.object({ me: z.object({ name: z.string() }) }) }).parse(raw)
          .data.me.name,
      }));
    },
  };
}
