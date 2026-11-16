/**
 * YouTrack issues as specifications (free for small teams, cloud or self-hosted).
 *
 * `PAY-42` keys. Approval is a value of the State field. YouTrack's activity stream keeps the
 * description before and after each edit, so the text as approved is rebuilt exactly, by undoing
 * later edits newest first.
 */

import { type SpecView, type TicketItem, ticketKeys } from "@cairn/shared";
import { z } from "zod";
import type { AdapterOptions, TrackerAdapter, TrackerConnection } from "./adapter";
import { day, shaped, TrackerError, trackerCall, trimBase, utc } from "./http";

type YouTrackConnection = Extract<TrackerConnection, { kind: "youtrack" }>;

const STATE = "State";

const customFields = z.array(
  z.object({
    name: z.string(),
    value: z
      .union([
        z.object({ name: z.string().nullish() }),
        z.array(z.unknown()),
        z.string(),
        z.number(),
      ])
      .nullish(),
  }),
);
const stateOf = (fields: z.infer<typeof customFields>) => {
  const v = fields.find((f) => f.name === STATE)?.value;
  return v && typeof v === "object" && !Array.isArray(v) ? (v.name ?? "") : "";
};

const issue = z.object({
  idReadable: z.string(),
  summary: z.string(),
  description: z.string().nullish(),
  customFields,
});

/** `added` and `removed` are text for a description, and a list of values for a field. */
const changeValue = z
  .union([z.string(), z.array(z.object({ name: z.string().nullish() })), z.null()])
  .optional();
const activities = z.array(
  z.object({
    timestamp: z.number(),
    author: z.object({ login: z.string().nullish(), name: z.string().nullish() }).nullish(),
    category: z.object({ id: z.string() }),
    field: z.object({ name: z.string() }).nullish(),
    added: changeValue,
    removed: changeValue,
  }),
);

const names = (v: z.infer<typeof changeValue>) =>
  Array.isArray(v) ? v.map((x) => x.name ?? "") : [];

export function toYouTrackSpec(
  raw: { issue: unknown; activities: unknown },
  approvedStatuses: readonly string[],
  baseUrl: string,
): SpecView {
  const i = issue.parse(raw.issue);
  const history = activities
    .parse(raw.activities)
    .map((a) => ({
      ...a,
      at: new Date(a.timestamp).toISOString(),
      by: a.author?.login ?? a.author?.name ?? "unknown",
    }))
    .sort((a, b) => a.at.localeCompare(b.at));
  const approval = history
    .filter(
      (a) =>
        a.category.id === "CustomFieldCategory" &&
        a.field?.name === STATE &&
        names(a.added).some((n) => approvedStatuses.includes(n)),
    )
    .at(-1);
  const edits = history.filter((a) => a.category.id === "DescriptionCategory");
  const text = i.description ?? "";

  let approved: SpecView["approved"] = null;
  if (approval) {
    let then = text;
    for (const e of [...edits].reverse()) {
      if (e.at <= approval.at) break;
      then = typeof e.removed === "string" ? e.removed : "";
    }
    approved = { at: approval.at, byId: approval.by, text: then, exact: true };
  }

  return {
    key: i.idReadable,
    tracker: "youtrack",
    title: i.summary,
    status: stateOf(i.customFields),
    url: `${baseUrl}/issue/${i.idReadable}`,
    approved,
    text,
    revisions: edits.map((e) => ({ at: e.at, authorId: e.by })),
  };
}

export function youtrackTracker(
  connection: YouTrackConnection,
  options: AdapterOptions = {},
): TrackerAdapter {
  const base = trimBase(connection.baseUrl);
  const headers = { authorization: `Bearer ${connection.token}` };
  const get = (path: string) => trackerCall("YouTrack", `${base}/api${path}`, { headers }, options);
  const FIELDS = "idReadable,summary,description,updated,resolved,customFields(name,value(name))";

  return {
    kind: "youtrack",
    find: (change) => ticketKeys(change, connection.projects ?? []),
    async read(ref, approvedStatuses) {
      if (!/^[A-Za-z][A-Za-z0-9_]*-\d+$/.test(ref)) {
        throw new TrackerError("not_found", `"${ref}" is not a YouTrack issue`);
      }
      const [i, a] = await Promise.all([
        get(`/issues/${ref}?fields=${FIELDS}`),
        get(
          `/issues/${ref}/activities?categories=DescriptionCategory,CustomFieldCategory` +
            "&fields=timestamp,author(login,name),category(id),field(name),added(name),removed(name)&$top=500",
        ),
      ]);
      return shaped("YouTrack", () =>
        toYouTrackSpec({ issue: i, activities: a }, approvedStatuses, base),
      );
    },
    async list(scope, query) {
      const search = `${scope.query ?? ""} updated: ${day(query.since)} .. Today`.trim();
      const body = await get(
        `/issues?query=${encodeURIComponent(search)}&fields=${FIELDS}&$top=${query.limit ?? 100}`,
      );
      return shaped("YouTrack", () =>
        z
          .array(issue.extend({ updated: z.number(), resolved: z.number().nullish() }))
          .parse(body)
          .map((i): TicketItem => {
            const status = stateOf(i.customFields);
            return {
              key: i.idReadable,
              title: i.summary,
              status,
              done: i.resolved != null || query.doneStatuses.includes(status),
              tracker: "youtrack",
              url: `${base}/issue/${i.idReadable}`,
              updatedAt: utc(new Date(i.updated).toISOString()),
            };
          }),
      );
    },
    async check() {
      const me = await get("/users/me?fields=login,fullName");
      return shaped("YouTrack", () => {
        const m = z.object({ login: z.string(), fullName: z.string().nullish() }).parse(me);
        return { displayName: m.fullName || m.login };
      });
    },
  };
}
