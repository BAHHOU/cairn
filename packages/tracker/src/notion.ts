/**
 * Notion pages as specifications: free, and where many individuals and startups write them.
 *
 * Notion's API is the weakest witness: no page history, only the last edit and who made it.
 * Approval is a database property (a status such as "Validé"); its date and approver come from
 * optional properties. When the page was edited after that date, the text as approved is unknown.
 * Without an approval date, nothing proves the text was not changed since, so the last edit counts
 * as one: Cairn would rather ask for a look than vouch for a page it cannot date.
 */

import type { ChangeRequest, SpecView, TicketItem } from "@cairn/shared";
import { z } from "zod";
import type { AdapterOptions, TrackerAdapter, TrackerConnection } from "./adapter";
import { localPart, shaped, TrackerError, trackerCall, utc } from "./http";

type NotionConnection = Extract<TrackerConnection, { kind: "notion" }>;

const API = "https://api.notion.com/v1";
const VERSION = "2022-06-28";

/** Page links (`notion.so/...-<32 hex>`, dashed ids too) → `notion:<32 hex>`. */
export function findNotionPages(change: ChangeRequest): string[] {
  const texts = [change.title, change.description, ...change.commitMessages];
  const refs = new Set<string>();
  for (const text of texts) {
    for (const m of text.matchAll(
      /notion\.(?:so|site)\/\S*?([0-9a-f]{32}|[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})\b/gi,
    )) {
      refs.add(`notion:${(m[1] as string).replace(/-/g, "").toLowerCase()}`);
    }
  }
  return [...refs];
}

const richText = z.array(z.object({ plain_text: z.string() }));
const plain = (rt: z.infer<typeof richText> | undefined) =>
  (rt ?? []).map((t) => t.plain_text).join("");

const page = z.object({
  url: z.string(),
  created_time: z.string(),
  last_edited_time: z.string(),
  created_by: z.object({ id: z.string() }),
  last_edited_by: z.object({ id: z.string() }),
  properties: z.record(z.string(), z.object({ type: z.string() }).catchall(z.unknown())),
});

const blocks = z.object({
  results: z.array(z.object({ type: z.string() }).catchall(z.unknown())),
});

/** The text of a status or select property, whichever the database uses. */
function optionName(prop: Record<string, unknown> | undefined): string | undefined {
  const value = prop?.[prop.type as string] as { name?: string } | null | undefined;
  return value?.name;
}

export function toNotionSpec(
  ref: string,
  raw: { page: unknown; blocks: unknown },
  approvedStatuses: readonly string[],
  connection: Pick<NotionConnection, "statusProperty" | "approvedAtProperty" | "approverProperty">,
): SpecView {
  const p = page.parse(raw.page);
  const props = p.properties;
  const titleProp = Object.values(props).find((v) => v.type === "title");
  const title = plain(richText.optional().parse(titleProp?.title));
  const status = optionName(props[connection.statusProperty ?? "Status"]) ?? "";

  const text = blocks
    .parse(raw.blocks)
    .results.map((b) =>
      plain(
        richText
          .optional()
          .catch([])
          .parse((b[b.type] as { rich_text?: unknown })?.rich_text),
      ),
    )
    .filter(Boolean)
    .join("\n");

  const dateProp = connection.approvedAtProperty ? props[connection.approvedAtProperty] : undefined;
  const approvedDay = (dateProp?.date as { start?: string } | null | undefined)?.start;
  const approverProp = connection.approverProperty ? props[connection.approverProperty] : undefined;
  const approver = (
    approverProp?.people as { id: string; person?: { email?: string } }[] | undefined
  )?.[0];

  // A date-only approval covers that whole day: edits made the same day are not counted against it.
  const approvedAt = approvedDay
    ? utc(/T/.test(approvedDay) ? approvedDay : `${approvedDay}T23:59:59Z`)
    : utc(p.created_time);
  const lastEdit = { at: utc(p.last_edited_time), authorId: p.last_edited_by.id };

  return {
    key: ref,
    tracker: "notion",
    title,
    status,
    url: p.url,
    approved: approvedStatuses.includes(status)
      ? {
          at: approvedAt,
          byId: localPart(approver?.person?.email) ?? approver?.id ?? "unknown",
          text,
          exact: false,
        }
      : null,
    text,
    revisions: lastEdit.at > utc(p.created_time) ? [lastEdit] : [],
  };
}

export function notionTracker(
  connection: NotionConnection,
  options: AdapterOptions = {},
): TrackerAdapter {
  const headers = { authorization: `Bearer ${connection.token}`, "notion-version": VERSION };
  const get = (path: string) => trackerCall("Notion", `${API}${path}`, { headers }, options);
  const post = (path: string, body: unknown) =>
    trackerCall(
      "Notion",
      `${API}${path}`,
      {
        method: "POST",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify(body),
      },
      options,
    );
  return {
    kind: "notion",
    find: findNotionPages,
    async read(ref, approvedStatuses) {
      const id = /^notion:([0-9a-f]{32})$/.exec(ref)?.[1];
      if (!id) throw new TrackerError("not_found", `"${ref}" is not a Notion page`);
      const [pg, bl] = await Promise.all([
        get(`/pages/${id}`),
        get(`/blocks/${id}/children?page_size=100`),
      ]);
      return shaped("Notion", () =>
        toNotionSpec(ref, { page: pg, blocks: bl }, approvedStatuses, connection),
      );
    },
    async list(scope, query) {
      const raw = (scope.database ?? "").replace(/-/g, "").toLowerCase();
      const database = /^[0-9a-f]{32}$/.exec(raw)?.[0];
      if (!database) throw new TrackerError("not_found", "A Notion database id is required");
      const body = await post(`/databases/${database}/query`, {
        filter: { timestamp: "last_edited_time", last_edited_time: { on_or_after: query.since } },
        sorts: [{ timestamp: "last_edited_time", direction: "descending" }],
        page_size: Math.min(query.limit ?? 100, 100),
      });
      return shaped("Notion", () =>
        z
          .object({ results: z.array(page.extend({ id: z.string() })) })
          .parse(body)
          .results.map((p): TicketItem => {
            const titleProp = Object.values(p.properties).find((v) => v.type === "title");
            const status = optionName(p.properties[connection.statusProperty ?? "Status"]) ?? "";
            return {
              key: `notion:${p.id.replace(/-/g, "").toLowerCase()}`,
              title: plain(richText.optional().parse(titleProp?.title)),
              status,
              done: query.doneStatuses.includes(status),
              tracker: "notion",
              url: p.url,
              updatedAt: utc(p.last_edited_time),
            };
          }),
      );
    },
    async check() {
      const me = await get("/users/me");
      return shaped("Notion", () => ({
        displayName: z.object({ name: z.string().nullable() }).parse(me).name ?? "Notion",
      }));
    },
  };
}
