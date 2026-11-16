/**
 * Trello cards as specifications: free, and the board many individuals plan with.
 *
 * Approval is moving the card into a list the policy names ("Validé", "Ready"). Trello keeps the
 * previous description on every edit (`updateCard` actions carry `old.desc`), so the text as
 * approved is rebuilt exactly, by undoing later edits newest first. Cards are cited by link.
 */

import type { ChangeRequest, SpecView, TicketItem } from "@cairn/shared";
import { z } from "zod";
import type { AdapterOptions, TrackerAdapter, TrackerConnection } from "./adapter";
import { shaped, TrackerError, trackerCall, utc } from "./http";

type TrelloConnection = Extract<TrackerConnection, { kind: "trello" }>;

const API = "https://api.trello.com/1";

/** `https://trello.com/c/AbCd1234/...` → `trello:AbCd1234`. */
export function findTrelloCards(change: ChangeRequest): string[] {
  const texts = [change.title, change.description, ...change.commitMessages];
  const refs = new Set<string>();
  for (const text of texts) {
    for (const m of text.matchAll(/trello\.com\/c\/([A-Za-z0-9]{8})\b/g))
      refs.add(`trello:${m[1]}`);
  }
  return [...refs];
}

const card = z.object({
  name: z.string(),
  desc: z.string(),
  url: z.string(),
  list: z.object({ name: z.string() }).optional(),
});

const actions = z.array(
  z.object({
    type: z.string(),
    date: z.string(),
    memberCreator: z.object({ username: z.string() }).nullable().optional(),
    data: z
      .object({
        old: z.object({ desc: z.string().optional() }).partial().optional(),
        listAfter: z.object({ name: z.string() }).optional(),
        list: z.object({ name: z.string() }).optional(),
      })
      .partial(),
  }),
);

export function toTrelloSpec(
  ref: string,
  raw: { card: unknown; actions: unknown },
  approvedStatuses: readonly string[],
): SpecView {
  const c = card.parse(raw.card);
  const history = actions
    .parse(raw.actions)
    .map((a) => ({ ...a, date: utc(a.date), by: a.memberCreator?.username ?? "unknown" }))
    .sort((a, b) => a.date.localeCompare(b.date));
  const intoApproved = (a: (typeof history)[number]) =>
    (a.type === "updateCard" &&
      a.data.listAfter &&
      approvedStatuses.includes(a.data.listAfter.name)) ||
    (a.type === "createCard" && a.data.list && approvedStatuses.includes(a.data.list.name));
  const approval = history.filter(intoApproved).at(-1);
  const edits = history.filter((a) => a.type === "updateCard" && a.data.old?.desc !== undefined);

  let approved: SpecView["approved"] = null;
  if (approval && c.list && approvedStatuses.includes(c.list.name)) {
    let text = c.desc;
    for (const e of [...edits].reverse()) {
      if (e.date <= approval.date) break;
      text = e.data.old?.desc ?? "";
    }
    approved = { at: approval.date, byId: approval.by, text, exact: true };
  }

  return {
    key: ref,
    tracker: "trello",
    title: c.name,
    status: c.list?.name ?? "",
    url: c.url,
    approved,
    text: c.desc,
    revisions: edits.map((e) => ({ at: e.date, authorId: e.by })),
  };
}

export function trelloTracker(
  connection: TrelloConnection,
  options: AdapterOptions = {},
): TrackerAdapter {
  // The OAuth header keeps the key and token out of URLs, and so out of proxy logs.
  const headers = {
    authorization: `OAuth oauth_consumer_key="${connection.key}", oauth_token="${connection.token}"`,
  };
  const get = (path: string) => trackerCall("Trello", `${API}${path}`, { headers }, options);
  return {
    kind: "trello",
    find: findTrelloCards,
    async read(ref, approvedStatuses) {
      const id = /^trello:([A-Za-z0-9]{8})$/.exec(ref)?.[1];
      if (!id) throw new TrackerError("not_found", `"${ref}" is not a Trello card`);
      const [c, a] = await Promise.all([
        get(`/cards/${id}?fields=name,desc,url&list=true`),
        get(`/cards/${id}/actions?filter=updateCard,createCard&limit=1000`),
      ]);
      return shaped("Trello", () => toTrelloSpec(ref, { card: c, actions: a }, approvedStatuses));
    },
    async list(scope, query) {
      const board = /^[A-Za-z0-9]{8,24}$/.exec(scope.board ?? "")?.[0];
      if (!board) throw new TrackerError("not_found", "A Trello board id is required");
      const [lists, cards] = await Promise.all([
        get(`/boards/${board}/lists?fields=name&filter=all`),
        get(`/boards/${board}/cards/all?fields=name,shortLink,url,dateLastActivity,idList`),
      ]);
      return shaped("Trello", () => {
        const names = new Map(
          z
            .array(z.object({ id: z.string(), name: z.string() }))
            .parse(lists)
            .map((l) => [l.id, l.name]),
        );
        return z
          .array(
            z.object({
              name: z.string(),
              shortLink: z.string(),
              url: z.string(),
              dateLastActivity: z.string(),
              idList: z.string(),
            }),
          )
          .parse(cards)
          .filter((c) => utc(c.dateLastActivity) >= query.since)
          .slice(0, query.limit ?? 100)
          .map((c): TicketItem => {
            const status = names.get(c.idList) ?? "";
            return {
              key: `trello:${c.shortLink}`,
              title: c.name,
              status,
              done: query.doneStatuses.includes(status),
              tracker: "trello",
              url: c.url,
              updatedAt: utc(c.dateLastActivity),
            };
          });
      });
    },
    async check() {
      const me = await get("/members/me?fields=fullName,username");
      return shaped("Trello", () => {
        const m = z.object({ fullName: z.string().optional(), username: z.string() }).parse(me);
        return { displayName: m.fullName || m.username };
      });
    },
  };
}
