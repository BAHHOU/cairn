/**
 * OpenProject work packages as specifications: free, open source, self-hosted.
 *
 * Merge requests cite `OP#123`, as OpenProject's own GitHub and GitLab integrations read them, or a
 * work package link. Approval is a status. The activity log says who changed the description and
 * when, but its API does not return the old text: the text as approved is today's, flagged inexact.
 */

import type { ChangeRequest, SpecView, TicketItem } from "@cairn/shared";
import { z } from "zod";
import type { AdapterOptions, TrackerAdapter, TrackerConnection } from "./adapter";
import { changeTexts, collect, shaped, TrackerError, trackerCall, trimBase, utc } from "./http";

type OpenProjectConnection = Extract<TrackerConnection, { kind: "openproject" }>;

/** `OP#123` and `…/work_packages/123` → `OP#123`. */
export function findWorkPackages(change: ChangeRequest): string[] {
  return collect(
    changeTexts(change),
    [/(?<![\w#])OP#(\d+)\b/g, /\/work_packages\/(\d+)\b/g],
    (id) => `OP#${id}`,
  );
}

const workPackage = z.object({
  id: z.number(),
  subject: z.string(),
  description: z.object({ raw: z.string().nullish() }).nullish(),
  updatedAt: z.string(),
  _links: z.object({ status: z.object({ title: z.string() }) }),
});

const activities = z.object({
  _embedded: z.object({
    elements: z.array(
      z.object({
        createdAt: z.string(),
        details: z.array(z.object({ raw: z.string().nullish() })).default([]),
        _links: z.object({ user: z.object({ title: z.string().nullish() }).nullish() }),
      }),
    ),
  }),
});

/** "**Status** changed from *New* to *Approved*" → "Approved"; formatting marks are dropped. */
const plainDetail = (raw: string) => raw.replace(/[*_]/g, "").trim();
const statusTo = (raw: string) =>
  /^Status (?:changed from .+ to|set to) (.+)$/i.exec(plainDetail(raw))?.[1]?.trim();
const describesEdit = (raw: string) => /^Description (?:changed|set)/i.test(plainDetail(raw));

export function toOpenProjectSpec(
  ref: string,
  raw: { workPackage: unknown; activities: unknown },
  approvedStatuses: readonly string[],
  baseUrl: string,
): SpecView {
  const wp = workPackage.parse(raw.workPackage);
  const history = activities
    .parse(raw.activities)
    ._embedded.elements.map((a) => ({
      at: utc(a.createdAt),
      by: a._links.user?.title ?? "unknown",
      details: a.details.map((d) => d.raw ?? ""),
    }))
    .sort((a, b) => a.at.localeCompare(b.at));
  const approval = history
    .filter((a) => a.details.some((d) => approvedStatuses.includes(statusTo(d) ?? "")))
    .at(-1);
  const text = wp.description?.raw ?? "";

  return {
    key: ref,
    tracker: "openproject",
    title: wp.subject,
    status: wp._links.status.title,
    url: `${baseUrl}/work_packages/${wp.id}`,
    approved: approval ? { at: approval.at, byId: approval.by, text, exact: false } : null,
    text,
    revisions: history
      .filter((a) => a.details.some(describesEdit))
      .map((a) => ({ at: a.at, authorId: a.by })),
  };
}

export function openprojectTracker(
  connection: OpenProjectConnection,
  options: AdapterOptions = {},
): TrackerAdapter {
  const base = trimBase(connection.baseUrl);
  // An API key goes as the password of the user named "apikey".
  const headers = {
    authorization: `Basic ${Buffer.from(`apikey:${connection.token}`).toString("base64")}`,
  };
  const get = (path: string) =>
    trackerCall("OpenProject", `${base}/api/v3${path}`, { headers }, options);

  return {
    kind: "openproject",
    find: findWorkPackages,
    async read(ref, approvedStatuses) {
      const id = /^OP#(\d+)$/.exec(ref)?.[1];
      if (!id) throw new TrackerError("not_found", `"${ref}" is not an OpenProject work package`);
      const [wp, a] = await Promise.all([
        get(`/work_packages/${id}`),
        get(`/work_packages/${id}/activities`),
      ]);
      return shaped("OpenProject", () =>
        toOpenProjectSpec(ref, { workPackage: wp, activities: a }, approvedStatuses, base),
      );
    },
    async list(scope, query) {
      const project = scope.project?.trim();
      if (!project) throw new TrackerError("not_found", "An OpenProject project is required");
      // Empty filters include closed work packages; the default lists open ones only.
      const body = await get(
        `/projects/${encodeURIComponent(project)}/work_packages?filters=${encodeURIComponent("[]")}` +
          `&sortBy=${encodeURIComponent('[["updatedAt","desc"]]')}&pageSize=${query.limit ?? 100}`,
      );
      return shaped("OpenProject", () =>
        z
          .object({ _embedded: z.object({ elements: z.array(workPackage) }) })
          .parse(body)
          ._embedded.elements.filter((wp) => utc(wp.updatedAt) >= query.since)
          .map((wp): TicketItem => {
            const status = wp._links.status.title;
            return {
              key: `OP#${wp.id}`,
              title: wp.subject,
              status,
              done: query.doneStatuses.includes(status),
              tracker: "openproject",
              url: `${base}/work_packages/${wp.id}`,
              updatedAt: utc(wp.updatedAt),
            };
          }),
      );
    },
    async check() {
      const me = await get("/users/me");
      return shaped("OpenProject", () => ({
        displayName: z.object({ name: z.string() }).parse(me).name,
      }));
    },
  };
}
