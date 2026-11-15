/**
 * GitHub Issues as specifications. Free for everyone, so often the only tracker an individual has.
 *
 * Approval is a label (the policy's approved names, such as `approved`), and the moment it was
 * added comes from the issue timeline. GitHub keeps every version of an issue's body
 * (`userContentEdits`), so the text as approved is rebuilt exactly; only GraphQL exposes it.
 */

import type { ChangeRequest, SpecView } from "@cairn/shared";
import { z } from "zod";
import type { AdapterOptions, TrackerAdapter, TrackerConnection } from "./adapter";
import { shaped, TrackerError, trackerCall, utc } from "./http";

type GitHubConnection = Extract<TrackerConnection, { kind: "github" }>;

const REPO = "[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+";

/** `owner/repo#12`, `https://github.com/owner/repo/issues/12`, and a bare `#12` in the default repo. */
export function findGitHubIssues(change: ChangeRequest, defaultRepo?: string): string[] {
  const texts = [change.title, change.description, ...change.commitMessages];
  const refs = new Set<string>();
  for (const text of texts) {
    for (const m of text.matchAll(new RegExp(`github\\.com/(${REPO})/issues/(\\d+)`, "g"))) {
      refs.add(`${m[1]}#${m[2]}`);
    }
    for (const m of text.matchAll(new RegExp(`(?<![\\w/.])(${REPO})#(\\d+)\\b`, "g"))) {
      refs.add(`${m[1]}#${m[2]}`);
    }
    if (defaultRepo) {
      for (const m of text.matchAll(/(?<![\w/#&])#(\d+)\b/g)) refs.add(`${defaultRepo}#${m[1]}`);
    }
  }
  return [...refs];
}

const QUERY = `query($owner: String!, $name: String!, $number: Int!) {
  repository(owner: $owner, name: $name) {
    issue(number: $number) {
      title body url state createdAt
      labels(first: 50) { nodes { name } }
      userContentEdits(first: 100) { nodes { editedAt editor { login } diff } }
      timelineItems(first: 100, itemTypes: [LABELED_EVENT]) {
        nodes { ... on LabeledEvent { createdAt actor { login } label { name } } }
      }
    }
  }
}`;

const login = z.object({ login: z.string() }).nullable().optional();

const answer = z.object({
  data: z.object({
    repository: z
      .object({
        issue: z
          .object({
            title: z.string(),
            body: z.string(),
            url: z.string(),
            state: z.string(),
            createdAt: z.string(),
            labels: z.object({ nodes: z.array(z.object({ name: z.string() })) }),
            userContentEdits: z
              .object({
                nodes: z.array(
                  z.object({ editedAt: z.string(), editor: login, diff: z.string().nullable() }),
                ),
              })
              .nullable(),
            timelineItems: z.object({
              nodes: z.array(
                z
                  .object({
                    createdAt: z.string(),
                    actor: login,
                    label: z.object({ name: z.string() }),
                  })
                  .partial(),
              ),
            }),
          })
          .nullable(),
      })
      .nullable(),
  }),
});

export function toGitHubSpec(
  ref: string,
  raw: unknown,
  approvedStatuses: readonly string[],
): SpecView {
  const issue = answer.parse(raw).data.repository?.issue;
  if (!issue) throw new TrackerError("not_found", `Issue ${ref} not found`);

  const approvedLabel = issue.labels.nodes.find((l) => approvedStatuses.includes(l.name))?.name;
  const approval = issue.timelineItems.nodes
    .filter((e) => e.createdAt && e.label && approvedStatuses.includes(e.label.name))
    .map((e) => ({ at: utc(e.createdAt as string), by: e.actor?.login ?? "unknown" }))
    .sort((a, b) => a.at.localeCompare(b.at))
    .at(-1);

  // Every saved version of the body, oldest first; the first is the text as created.
  const created = utc(issue.createdAt);
  const versions = (issue.userContentEdits?.nodes ?? [])
    .map((e) => ({ at: utc(e.editedAt), by: e.editor?.login ?? "unknown", text: e.diff }))
    .sort((a, b) => a.at.localeCompare(b.at));
  const revisions = versions
    .filter((v) => v.at > created)
    .map((v) => ({ at: v.at, authorId: v.by }));

  let approved: SpecView["approved"] = null;
  if (approval && approvedLabel) {
    const atApproval = versions.filter((v) => v.at <= approval.at).at(-1);
    approved =
      versions.length === 0
        ? { at: approval.at, byId: approval.by, text: issue.body, exact: true }
        : atApproval?.text != null
          ? { at: approval.at, byId: approval.by, text: atApproval.text, exact: true }
          : { at: approval.at, byId: approval.by, text: issue.body, exact: false };
  }

  return {
    key: ref,
    tracker: "github",
    title: issue.title,
    status: approvedLabel ?? issue.state.toLowerCase(),
    url: issue.url,
    approved,
    text: issue.body,
    revisions,
  };
}

const graphqlUrl = (apiUrl: string) => {
  const base = apiUrl.replace(/\/+$/, "");
  return base === "https://api.github.com" ? `${base}/graphql` : base.replace(/\/v3$/, "/graphql");
};

export function githubTracker(
  connection: GitHubConnection,
  options: AdapterOptions = {},
): TrackerAdapter {
  const headers = {
    authorization: `Bearer ${connection.token}`,
    "content-type": "application/json",
  };
  const graphql = (query: string, variables: Record<string, unknown>) =>
    trackerCall(
      "GitHub",
      graphqlUrl(connection.apiUrl),
      { method: "POST", headers, body: JSON.stringify({ query, variables }) },
      options,
    );

  return {
    kind: "github",
    find: (change) => findGitHubIssues(change, connection.defaultRepo),
    async read(ref, approvedStatuses) {
      const m = new RegExp(`^(${REPO})#(\\d+)$`).exec(ref);
      if (!m) throw new TrackerError("not_found", `"${ref}" is not a GitHub issue`);
      const [owner, name] = (m[1] as string).split("/");
      const raw = await graphql(QUERY, { owner, name, number: Number(m[2]) });
      return shaped("GitHub", () => toGitHubSpec(ref, raw, approvedStatuses));
    },
    async check() {
      const raw = await graphql("query { viewer { login name } }", {});
      return shaped("GitHub", () => {
        const v = z
          .object({
            data: z.object({
              viewer: z.object({ login: z.string(), name: z.string().nullable() }),
            }),
          })
          .parse(raw).data.viewer;
        return { displayName: v.name ?? v.login };
      });
    },
  };
}
