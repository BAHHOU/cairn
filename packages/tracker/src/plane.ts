/**
 * Plane work items as specifications: free, open source, cloud or self-hosted.
 *
 * `WEB-12` keys (project identifier and sequence). Approval is a state. Plane's activity log says
 * who changed the description and when; the text as approved is today's, flagged inexact.
 */

import { type SpecView, type TicketItem, ticketKeys } from "@cairn/shared";
import { z } from "zod";
import type { AdapterOptions, TrackerAdapter, TrackerConnection } from "./adapter";
import { htmlText, shaped, TrackerError, trackerCall, trimBase, utc } from "./http";

type PlaneConnection = Extract<TrackerConnection, { kind: "plane" }>;

const state = z.object({ name: z.string(), group: z.string().optional() });

const workItem = z.object({
  id: z.string(),
  project: z.string(),
  name: z.string(),
  sequence_id: z.number(),
  description_html: z.string().nullish(),
  description_stripped: z.string().nullish(),
  updated_at: z.string(),
  state: z.union([state, z.string()]).nullish(),
});

const activities = z.object({
  results: z.array(
    z.object({
      created_at: z.string(),
      field: z.string().nullish(),
      new_value: z.string().nullish(),
      actor_detail: z
        .object({ display_name: z.string().nullish(), email: z.string().nullish() })
        .nullish(),
    }),
  ),
});

const stateName = (s: z.infer<typeof workItem>["state"]) =>
  s && typeof s === "object" ? s.name : "";

/** The web app's address: Plane Cloud serves its API and its app from different hosts. */
const appUrl = (base: string) => base.replace("://api.plane.so", "://app.plane.so");

export function toPlaneSpec(
  ref: string,
  raw: { item: unknown; activities: unknown },
  approvedStatuses: readonly string[],
  link: string,
): SpecView {
  const item = workItem.parse(raw.item);
  const history = activities
    .parse(raw.activities)
    .results.map((a) => ({
      ...a,
      at: utc(a.created_at),
      by: a.actor_detail?.email?.split("@")[0] ?? a.actor_detail?.display_name ?? "unknown",
    }))
    .sort((a, b) => a.at.localeCompare(b.at));
  const approval = history
    .filter((a) => a.field === "state" && approvedStatuses.includes(a.new_value ?? ""))
    .at(-1);
  const text = item.description_stripped ?? htmlText(item.description_html);

  return {
    key: ref,
    tracker: "plane",
    title: item.name,
    status: stateName(item.state),
    url: link,
    approved: approval ? { at: approval.at, byId: approval.by, text, exact: false } : null,
    text,
    revisions: history
      .filter((a) => a.field === "description")
      .map((a) => ({ at: a.at, authorId: a.by })),
  };
}

export function planeTracker(
  connection: PlaneConnection,
  options: AdapterOptions = {},
): TrackerAdapter {
  const base = trimBase(connection.baseUrl);
  const ws = encodeURIComponent(connection.workspace);
  const headers = { "x-api-key": connection.token };
  const get = (path: string) => trackerCall("Plane", `${base}/api/v1${path}`, { headers }, options);
  const link = (project: string, id: string) =>
    `${appUrl(base)}/${ws}/projects/${project}/issues/${id}`;

  return {
    kind: "plane",
    find: (change) => ticketKeys(change, connection.projects ?? []),
    async read(ref, approvedStatuses) {
      if (!/^[A-Z][A-Z0-9]{0,11}-\d+$/.test(ref)) {
        throw new TrackerError("not_found", `"${ref}" is not a Plane work item`);
      }
      const item = await get(`/workspaces/${ws}/issues/${ref}/?expand=state`);
      const { id, project } = shaped("Plane", () => workItem.parse(item));
      const a = await get(`/workspaces/${ws}/projects/${project}/issues/${id}/activities/`);
      return shaped("Plane", () =>
        toPlaneSpec(ref, { item, activities: a }, approvedStatuses, link(project, id)),
      );
    },
    async list(scope, query) {
      const project = /^[0-9a-f-]{36}$/i.exec(scope.project?.trim() ?? "")?.[0];
      if (!project) throw new TrackerError("not_found", "A Plane project id is required");
      const [p, body] = await Promise.all([
        get(`/workspaces/${ws}/projects/${project}/`),
        get(
          `/workspaces/${ws}/projects/${project}/issues/?expand=state&order_by=-updated_at` +
            `&per_page=${Math.min(query.limit ?? 100, 100)}`,
        ),
      ]);
      return shaped("Plane", () => {
        const identifier = z.object({ identifier: z.string() }).parse(p).identifier;
        return z
          .object({ results: z.array(workItem) })
          .parse(body)
          .results.filter((i) => utc(i.updated_at) >= query.since)
          .map((i): TicketItem => {
            const status = stateName(i.state);
            const group = i.state && typeof i.state === "object" ? i.state.group : undefined;
            return {
              key: `${identifier}-${i.sequence_id}`,
              title: i.name,
              status,
              done: group === "completed" || query.doneStatuses.includes(status),
              tracker: "plane",
              url: link(project, i.id),
              updatedAt: utc(i.updated_at),
            };
          });
      });
    },
    async check() {
      const me = await get("/users/me/");
      return shaped("Plane", () => {
        const u = z
          .object({ display_name: z.string().nullish(), email: z.string().nullish() })
          .parse(me);
        return { displayName: u.display_name || u.email || "Plane" };
      });
    },
  };
}
