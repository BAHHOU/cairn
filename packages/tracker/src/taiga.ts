/**
 * Taiga user stories and issues as specifications: free, open source, cloud or self-hosted.
 *
 * Merge requests cite `TG-123`, as Taiga's own GitHub and GitLab integrations read them; the
 * number is a reference within the connection's project. Approval is a status. Taiga's history
 * keeps the description before and after each edit, so the text as approved is rebuilt exactly.
 * Taiga has no personal tokens: Cairn signs in with an account and keeps the session in memory.
 */

import type { ChangeRequest, SpecView, TicketItem } from "@cairn/shared";
import { z } from "zod";
import type { AdapterOptions, TrackerAdapter, TrackerConnection } from "./adapter";
import { changeTexts, collect, shaped, TrackerError, trackerCall, trimBase, utc } from "./http";

type TaigaConnection = Extract<TrackerConnection, { kind: "taiga" }>;

/** `TG-123` (also `#TG-123`, `TG-123 #closed`) → `TG-123`. */
export function findTaigaRefs(change: ChangeRequest): string[] {
  return collect(changeTexts(change), [/(?<![\w-])TG-(\d+)\b/gi], (ref) => `TG-${ref}`);
}

/** The web app's address: Taiga Cloud serves its API and its app from different hosts. */
const appUrl = (base: string) => base.replace("://api.taiga.io", "://tree.taiga.io");

const item = z.object({
  id: z.number(),
  ref: z.number(),
  subject: z.string(),
  description: z.string().nullish(),
  is_closed: z.boolean().optional(),
  modified_date: z.string(),
  status_extra_info: z.object({ name: z.string(), is_closed: z.boolean().optional() }).nullish(),
});

const history = z.array(
  z.object({
    created_at: z.string(),
    user: z.object({ username: z.string().nullish(), name: z.string().nullish() }).nullish(),
    diff: z
      .object({ description: z.tuple([z.string().nullish(), z.string().nullish()]).optional() })
      .passthrough()
      .nullish(),
    values_diff: z
      .object({ status: z.tuple([z.string().nullish(), z.string().nullish()]).optional() })
      .passthrough()
      .nullish(),
  }),
);

export function toTaigaSpec(
  ref: string,
  raw: { item: unknown; history: unknown },
  approvedStatuses: readonly string[],
  link: string,
): SpecView {
  const i = item.parse(raw.item);
  const events = history
    .parse(raw.history)
    .map((h) => ({
      ...h,
      at: utc(h.created_at),
      by: h.user?.username ?? h.user?.name ?? "unknown",
    }))
    .sort((a, b) => a.at.localeCompare(b.at));
  const approval = events
    .filter((e) => approvedStatuses.includes(e.values_diff?.status?.[1] ?? ""))
    .at(-1);
  const edits = events.filter((e) => e.diff?.description !== undefined);
  const text = i.description ?? "";

  let approved: SpecView["approved"] = null;
  if (approval) {
    let then = text;
    let exact = true;
    for (const e of [...edits].reverse()) {
      if (e.at <= approval.at) break;
      const before = e.diff?.description?.[0];
      if (before === undefined) exact = false;
      then = before ?? "";
    }
    approved = { at: approval.at, byId: approval.by, text: exact ? then : text, exact };
  }

  return {
    key: ref,
    tracker: "taiga",
    title: i.subject,
    status: i.status_extra_info?.name ?? "",
    url: link,
    approved,
    text,
    revisions: edits.map((e) => ({ at: e.at, authorId: e.by })),
  };
}

export function taigaTracker(
  connection: TaigaConnection,
  options: AdapterOptions = {},
): TrackerAdapter {
  const base = trimBase(connection.baseUrl);
  const api = `${base}/api/v1`;
  let session: Promise<string> | null = null;

  const signIn = async () => {
    const body = await trackerCall(
      "Taiga",
      `${api}/auth`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type: "normal",
          username: connection.username,
          password: connection.password,
        }),
      },
      options,
    );
    return shaped("Taiga", () => z.object({ auth_token: z.string() }).parse(body).auth_token);
  };
  const get = async (path: string, extra: Record<string, string> = {}) => {
    session ??= signIn();
    const token = await session.catch((error) => {
      session = null;
      throw error;
    });
    return trackerCall(
      "Taiga",
      `${api}${path}`,
      { headers: { authorization: `Bearer ${token}`, ...extra } },
      options,
    );
  };
  const slug = encodeURIComponent(connection.project);

  return {
    kind: "taiga",
    find: findTaigaRefs,
    async read(ref, approvedStatuses) {
      const n = /^TG-(\d+)$/.exec(ref)?.[1];
      if (!n) throw new TrackerError("not_found", `"${ref}" is not a Taiga reference`);
      const resolved = await get(`/resolver?project=${slug}&ref=${n}`);
      const target = shaped("Taiga", () =>
        z.object({ us: z.number().optional(), issue: z.number().optional() }).parse(resolved),
      );
      const [kind, path, id] = target.us
        ? (["userstory", "userstories", target.us] as const)
        : target.issue
          ? (["issue", "issues", target.issue] as const)
          : [];
      if (!kind) throw new TrackerError("not_found", `${ref} is not a Taiga story or issue`);
      const [i, h] = await Promise.all([get(`/${path}/${id}`), get(`/history/${kind}/${id}`)]);
      const link = `${appUrl(base)}/project/${slug}/${kind === "userstory" ? "us" : "issue"}/${n}`;
      return shaped("Taiga", () =>
        toTaigaSpec(ref, { item: i, history: h }, approvedStatuses, link),
      );
    },
    async list(scope, query) {
      const project = scope.project?.trim() || connection.project;
      if (project !== connection.project) {
        throw new TrackerError("not_found", `This Taiga connection reads ${connection.project}`);
      }
      const p = await get(`/projects/by_slug?slug=${slug}`);
      const projectId = shaped("Taiga", () => z.object({ id: z.number() }).parse(p).id);
      const body = await get(`/userstories?project=${projectId}`, {
        "x-disable-pagination": "True",
      });
      return shaped("Taiga", () =>
        z
          .array(item)
          .parse(body)
          .filter((s) => utc(s.modified_date) >= query.since)
          .sort((a, b) => b.modified_date.localeCompare(a.modified_date))
          .slice(0, query.limit ?? 100)
          .map((s): TicketItem => {
            const status = s.status_extra_info?.name ?? "";
            return {
              key: `TG-${s.ref}`,
              title: s.subject,
              status,
              done: s.is_closed === true || query.doneStatuses.includes(status),
              tracker: "taiga",
              url: `${appUrl(base)}/project/${slug}/us/${s.ref}`,
              updatedAt: utc(s.modified_date),
            };
          }),
      );
    },
    async check() {
      const me = await get("/users/me");
      return shaped("Taiga", () => {
        const u = z.object({ username: z.string(), full_name: z.string().nullish() }).parse(me);
        return { displayName: u.full_name || u.username };
      });
    },
  };
}
