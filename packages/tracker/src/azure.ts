/**
 * Azure Boards work items as specifications (free for small teams).
 *
 * Merge requests cite `AB#123`, the mention Azure Boards itself recognises, or a work item link.
 * Approval is a workflow state. Every revision of a work item is a full snapshot of its fields, so
 * the text as approved is the snapshot at the approval: exact.
 */

import type { ChangeRequest, SpecView, TicketItem } from "@cairn/shared";
import { z } from "zod";
import type { AdapterOptions, TrackerAdapter, TrackerConnection } from "./adapter";
import {
  changeTexts,
  collect,
  day,
  htmlText,
  localPart,
  shaped,
  TrackerError,
  trackerCall,
  trimBase,
  utc,
} from "./http";

type AzureConnection = Extract<TrackerConnection, { kind: "azure" }>;

const VERSION = "api-version=7.1";

/** `AB#123` and `…/_workitems/edit/123` → `AB#123`. */
export function findAzureWorkItems(change: ChangeRequest): string[] {
  return collect(
    changeTexts(change),
    [/(?<![\w#])AB#(\d+)\b/g, /\/_workitems\/edit\/(\d+)\b/g],
    (id) => `AB#${id}`,
  );
}

const person = z.object({ uniqueName: z.string().optional(), displayName: z.string() }).nullish();
const who = (p: z.infer<typeof person>) => localPart(p?.uniqueName) ?? p?.displayName ?? "unknown";

const revisions = z.object({
  value: z.array(
    z.object({
      rev: z.number(),
      fields: z
        .object({
          "System.Title": z.string(),
          "System.State": z.string(),
          "System.TeamProject": z.string().optional(),
          "System.Description": z.string().nullish(),
          "Microsoft.VSTS.Common.AcceptanceCriteria": z.string().nullish(),
          "System.ChangedDate": z.string(),
          "System.ChangedBy": person,
        })
        .passthrough(),
    }),
  ),
});

type Revision = z.infer<typeof revisions>["value"][number];

/** The description and the acceptance criteria: what the business asked for. */
const specText = (r: Revision) =>
  [
    htmlText(r.fields["System.Description"]),
    htmlText(r.fields["Microsoft.VSTS.Common.AcceptanceCriteria"]),
  ]
    .filter(Boolean)
    .join("\n\n");

export function toAzureSpec(
  ref: string,
  raw: unknown,
  approvedStatuses: readonly string[],
  orgUrl: string,
): SpecView {
  const revs = [...revisions.parse(raw).value].sort((a, b) => a.rev - b.rev);
  const current = revs.at(-1);
  if (!current) throw new TrackerError("not_found", "Azure Boards work item not found");
  const approvedAt = (r: Revision) => approvedStatuses.includes(r.fields["System.State"]);
  // The last time the item entered an approved state; its snapshot is the text as approved.
  const approval = revs
    .filter((r, i) => approvedAt(r) && !(i > 0 && approvedAt(revs[i - 1] as Revision)))
    .at(-1);
  const edits = revs.filter((r, i) => i > 0 && specText(r) !== specText(revs[i - 1] as Revision));
  const id = ref.replace(/^AB#/, "");
  const project = current.fields["System.TeamProject"];

  return {
    key: ref,
    tracker: "azure",
    title: current.fields["System.Title"],
    status: current.fields["System.State"],
    url: `${orgUrl}/${project ? `${encodeURIComponent(project)}/` : ""}_workitems/edit/${id}`,
    approved: approval
      ? {
          at: utc(approval.fields["System.ChangedDate"]),
          byId: who(approval.fields["System.ChangedBy"]),
          text: specText(approval),
          exact: true,
        }
      : null,
    text: specText(current),
    revisions: edits.map((r) => ({
      at: utc(r.fields["System.ChangedDate"]),
      authorId: who(r.fields["System.ChangedBy"]),
    })),
  };
}

export function azureTracker(
  connection: AzureConnection,
  options: AdapterOptions = {},
): TrackerAdapter {
  const org = trimBase(connection.orgUrl);
  // A personal access token goes as the password of an empty user.
  const headers = {
    authorization: `Basic ${Buffer.from(`:${connection.token}`).toString("base64")}`,
    "content-type": "application/json",
  };
  const call = (url: string, body?: unknown) =>
    trackerCall(
      "Azure Boards",
      url,
      body === undefined ? { headers } : { method: "POST", headers, body: JSON.stringify(body) },
      options,
    );

  return {
    kind: "azure",
    find: findAzureWorkItems,
    async read(ref, approvedStatuses) {
      const id = /^AB#(\d+)$/.exec(ref)?.[1];
      if (!id) throw new TrackerError("not_found", `"${ref}" is not an Azure Boards work item`);
      const raw = await call(`${org}/_apis/wit/workitems/${id}/revisions?$top=200&${VERSION}`);
      return shaped("Azure Boards", () => toAzureSpec(ref, raw, approvedStatuses, org));
    },
    async list(scope, query) {
      const project = scope.project?.trim();
      if (!project) throw new TrackerError("not_found", "An Azure DevOps project is required");
      const limit = Math.min(query.limit ?? 100, 200);
      const found = await call(
        `${org}/${encodeURIComponent(project)}/_apis/wit/wiql?$top=${limit}&${VERSION}`,
        {
          query:
            "SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = @project " +
            `AND [System.ChangedDate] >= '${day(query.since)}' ORDER BY [System.ChangedDate] DESC`,
        },
      );
      const ids = shaped("Azure Boards", () =>
        z
          .object({ workItems: z.array(z.object({ id: z.number() })) })
          .parse(found)
          .workItems.map((w) => w.id)
          .slice(0, limit),
      );
      if (ids.length === 0) return [];
      const items = await call(
        `${org}/_apis/wit/workitems?ids=${ids.join(",")}` +
          `&fields=System.Title,System.State,System.ChangedDate,System.TeamProject&${VERSION}`,
      );
      return shaped("Azure Boards", () =>
        z
          .object({
            value: z.array(
              z.object({
                id: z.number(),
                fields: z.object({
                  "System.Title": z.string(),
                  "System.State": z.string(),
                  "System.ChangedDate": z.string(),
                }),
              }),
            ),
          })
          .parse(items)
          .value.map(
            (w): TicketItem => ({
              key: `AB#${w.id}`,
              title: w.fields["System.Title"],
              status: w.fields["System.State"],
              done: query.doneStatuses.includes(w.fields["System.State"]),
              tracker: "azure",
              url: `${org}/${encodeURIComponent(project)}/_workitems/edit/${w.id}`,
              updatedAt: utc(w.fields["System.ChangedDate"]),
            }),
          ),
      );
    },
    async check() {
      const me = await call(`${org}/_apis/connectionData`);
      return shaped("Azure Boards", () => ({
        displayName: z
          .object({ authenticatedUser: z.object({ providerDisplayName: z.string() }) })
          .parse(me).authenticatedUser.providerDisplayName,
      }));
    },
  };
}
