/**
 * Linear issues as specifications (free plan for small teams). `ENG-123` keys, approval is a
 * workflow state, and the issue history says who changed the description and when, not what it
 * said: the text as approved is today's, flagged inexact.
 */

import { type SpecView, type TicketItem, ticketKeys } from "@cairn/shared";
import { z } from "zod";
import type { AdapterOptions, TrackerAdapter, TrackerConnection } from "./adapter";
import { localPart, shaped, TrackerError, trackerCall, utc } from "./http";

type LinearConnection = Extract<TrackerConnection, { kind: "linear" }>;

const ENDPOINT = "https://api.linear.app/graphql";

const QUERY = `query($id: String!) {
  issue(id: $id) {
    identifier title description url
    state { name }
    history(first: 100) {
      nodes { createdAt updatedDescription actor { name email } toState { name } }
    }
  }
}`;

const LIST_QUERY = `query($team: String!, $since: DateTimeOrDuration!, $first: Int!) {
  issues(first: $first, orderBy: updatedAt,
         filter: { team: { key: { eq: $team } }, updatedAt: { gte: $since } }) {
    nodes { identifier title url updatedAt state { name type } }
  }
}`;

const actor = z.object({ name: z.string(), email: z.string().nullable().optional() }).nullable();

const answer = z.object({
  data: z.object({
    issue: z
      .object({
        identifier: z.string(),
        title: z.string(),
        description: z.string().nullable(),
        url: z.string(),
        state: z.object({ name: z.string() }),
        history: z.object({
          nodes: z.array(
            z.object({
              createdAt: z.string(),
              updatedDescription: z.boolean().nullable().optional(),
              actor: actor.optional(),
              toState: z.object({ name: z.string() }).nullable().optional(),
            }),
          ),
        }),
      })
      .nullable(),
  }),
});

const who = (a: z.infer<typeof actor> | undefined) => localPart(a?.email) ?? a?.name ?? "unknown";

export function toLinearSpec(raw: unknown, approvedStatuses: readonly string[]): SpecView {
  const issue = answer.parse(raw).data.issue;
  if (!issue) throw new TrackerError("not_found", "Linear issue not found");
  const history = [...issue.history.nodes]
    .map((h) => ({ ...h, createdAt: utc(h.createdAt) }))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const approval = history
    .filter((h) => h.toState && approvedStatuses.includes(h.toState.name))
    .at(-1);
  const text = issue.description ?? "";
  return {
    key: issue.identifier,
    tracker: "linear",
    title: issue.title,
    status: issue.state.name,
    url: issue.url,
    approved: approval
      ? { at: approval.createdAt, byId: who(approval.actor), text, exact: false }
      : null,
    text,
    revisions: history
      .filter((h) => h.updatedDescription)
      .map((h) => ({ at: h.createdAt, authorId: who(h.actor) })),
  };
}

export function linearTracker(
  connection: LinearConnection,
  options: AdapterOptions = {},
): TrackerAdapter {
  // Personal API keys go as they are; OAuth tokens would carry "Bearer".
  const headers = { authorization: connection.apiKey, "content-type": "application/json" };
  const graphql = (query: string, variables: Record<string, unknown>) =>
    trackerCall(
      "Linear",
      ENDPOINT,
      { method: "POST", headers, body: JSON.stringify({ query, variables }) },
      options,
    );
  return {
    kind: "linear",
    find: (change) => ticketKeys(change, connection.teams ?? []),
    async read(ref, approvedStatuses) {
      const raw = await graphql(QUERY, { id: ref });
      return shaped("Linear", () => toLinearSpec(raw, approvedStatuses));
    },
    async list(scope, query) {
      const team = /^[A-Z][A-Z0-9]{1,9}$/.exec(scope.team?.trim().toUpperCase() ?? "")?.[0];
      if (!team) throw new TrackerError("not_found", "A Linear team key is required");
      const raw = await graphql(LIST_QUERY, {
        team,
        since: query.since,
        first: Math.min(query.limit ?? 100, 250),
      });
      return shaped("Linear", () =>
        z
          .object({
            data: z.object({
              issues: z.object({
                nodes: z.array(
                  z.object({
                    identifier: z.string(),
                    title: z.string(),
                    url: z.string(),
                    updatedAt: z.string(),
                    state: z.object({ name: z.string(), type: z.string() }),
                  }),
                ),
              }),
            }),
          })
          .parse(raw)
          .data.issues.nodes.map(
            (i): TicketItem => ({
              key: i.identifier,
              title: i.title,
              status: i.state.name,
              done: i.state.type === "completed" || query.doneStatuses.includes(i.state.name),
              tracker: "linear",
              url: i.url,
              updatedAt: utc(i.updatedAt),
            }),
          ),
      );
    },
    async check() {
      const raw = await graphql("query { viewer { name } }", {});
      return shaped("Linear", () => ({
        displayName: z
          .object({ data: z.object({ viewer: z.object({ name: z.string() }) }) })
          .parse(raw).data.viewer.name,
      }));
    },
  };
}
