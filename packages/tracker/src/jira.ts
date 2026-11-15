/**
 * Jira tickets read for change control: the content as approved and as it reads today, who
 * approved it and who edited it since. Read-only, through REST API v2, which Jira Cloud and
 * Jira Data Center (the self-hosted edition banks run) both serve.
 *
 * The approved text is rebuilt from the changelog: start from today's content and undo, newest
 * first, every edit made after the last transition into an approved status. Nothing is trusted
 * from the ticket's own wording ("approved", a label…): only workflow history counts.
 */

import { type ChangeRequest, type SpecView, ticketKeys } from "@cairn/shared";
import { z } from "zod";
import type { AdapterOptions, TrackerAdapter } from "./adapter";
import { type FetchOptions, TrackerError, trackerCall, utc } from "./http";

export interface JiraConnection {
  /** `https://jira.example.com` (Data Center) or `https://example.atlassian.net` (Cloud). */
  baseUrl: string;
  /** Cloud: e-mail and API token. Data Center: a personal access token. */
  auth: { kind: "basic"; user: string; token: string } | { kind: "bearer"; token: string };
}

export interface JiraOptions {
  /**
   * Fields that make up the specification. Description by default; acceptance criteria usually live
   * in a custom field: give its id (to read it) and its name (as the changelog writes it).
   */
  contentFields?: { id: string; name: string }[];
  /** Workflow statuses meaning the business approved the ticket. */
  approvedStatuses: string[];
  fetch?: typeof fetch;
  timeoutMs?: number;
}

const DEFAULT_FIELDS = [{ id: "description", name: "description" }];

const person = z
  .object({
    name: z.string().optional(),
    accountId: z.string().optional(),
    emailAddress: z.string().optional(),
  })
  .nullable()
  .optional();

const issueSchema = z.object({
  key: z.string(),
  fields: z
    .object({
      summary: z.string(),
      status: z.object({ name: z.string() }),
    })
    .catchall(z.unknown()),
  changelog: z
    .object({
      histories: z.array(
        z.object({
          created: z.string(),
          author: person,
          items: z.array(
            z.object({
              field: z.string(),
              fromString: z.string().nullable().optional(),
              toString: z.string().nullable().optional(),
            }),
          ),
        }),
      ),
    })
    .optional(),
});

/**
 * Who did it, as an id the policy can map to a person: the Data Center username, else the part of
 * the e-mail before "@", else the Cloud account id.
 */
const idOf = (p: z.infer<typeof person>): string =>
  p?.name ?? p?.emailAddress?.split("@")[0] ?? p?.accountId ?? "unknown";

/** Jira text fields come back as strings in v2 (wiki markup); anything else is not content. */
const textOf = (value: unknown): string => (typeof value === "string" ? value : "");

export function toSpec(raw: unknown, options: JiraOptions, url: string | null = null): SpecView {
  const issue = issueSchema.parse(raw);
  const fields = options.contentFields ?? DEFAULT_FIELDS;
  const contentNames = new Set(fields.map((f) => f.name.toLowerCase()));
  // Jira writes local offsets ("+0100"): normalised to UTC, so order and comparisons hold.
  const histories = (issue.changelog?.histories ?? [])
    .map((h) => ({ ...h, created: utc(h.created) }))
    .sort((a, b) => a.created.localeCompare(b.created));

  const current = Object.fromEntries(
    fields.map((f) => [f.name.toLowerCase(), textOf(issue.fields[f.id])]),
  );
  const join = (values: Record<string, string>) =>
    fields
      .map((f) => values[f.name.toLowerCase()] ?? "")
      .filter((v) => v.length > 0)
      .join("\n\n");

  const revisions = histories
    .filter((h) => h.items.some((i) => contentNames.has(i.field.toLowerCase())))
    .map((h) => ({ at: h.created, authorId: idOf(h.author) }));

  // The last time the ticket entered an approved status.
  const approval = histories
    .filter((h) =>
      h.items.some(
        (i) =>
          i.field.toLowerCase() === "status" && options.approvedStatuses.includes(i.toString ?? ""),
      ),
    )
    .at(-1);

  let approved: SpecView["approved"] = null;
  if (approval) {
    const atApproval = { ...current };
    for (const h of [...histories].reverse()) {
      if (h.created <= approval.created) break;
      for (const item of h.items) {
        const name = item.field.toLowerCase();
        if (contentNames.has(name)) atApproval[name] = item.fromString ?? "";
      }
    }
    approved = {
      at: approval.created,
      byId: idOf(approval.author),
      text: join(atApproval),
      exact: true,
    };
  }

  return {
    key: issue.key,
    tracker: "jira",
    title: issue.fields.summary,
    status: issue.fields.status.name,
    url,
    approved,
    text: join(current),
    revisions,
  };
}

function authorization(auth: JiraConnection["auth"]): string {
  return auth.kind === "basic"
    ? `Basic ${Buffer.from(`${auth.user}:${auth.token}`).toString("base64")}`
    : `Bearer ${auth.token}`;
}

const baseOf = (connection: JiraConnection) => connection.baseUrl.replace(/\/+$/, "");

const jiraGet = (
  connection: JiraConnection,
  path: string,
  options: FetchOptions,
  notFound: string,
) =>
  trackerCall(
    "Jira",
    `${baseOf(connection)}${path}`,
    { headers: { authorization: authorization(connection.auth) } },
    options,
    notFound,
  );

/** Reads one ticket and its history. */
export async function getSpec(
  connection: JiraConnection,
  key: string,
  options: JiraOptions,
): Promise<SpecView> {
  if (!/^[A-Z][A-Z0-9]{1,9}-\d+$/.test(key)) {
    throw new TrackerError("not_found", `"${key}" is not a ticket key`);
  }
  const fields = [
    "summary",
    "status",
    ...(options.contentFields ?? DEFAULT_FIELDS).map((f) => f.id),
  ];
  const body = await jiraGet(
    connection,
    `/rest/api/2/issue/${key}?fields=${fields.join(",")}&expand=changelog`,
    options,
    `Ticket ${key} not found`,
  );
  try {
    return toSpec(body, options, `${baseOf(connection)}/browse/${key}`);
  } catch {
    throw new TrackerError("provider_error", "Unexpected answer from Jira");
  }
}

/** Proves the URL and credentials work: who Jira says the token belongs to. */
export async function checkConnection(
  connection: JiraConnection,
  options: FetchOptions = {},
): Promise<{ displayName: string }> {
  const body = await jiraGet(connection, "/rest/api/2/myself", options, "Not a Jira REST API");
  const parsed = z.object({ displayName: z.string() }).safeParse(body);
  if (!parsed.success) throw new TrackerError("provider_error", "Unexpected answer from Jira");
  return parsed.data;
}

/** Jira as a change-control tracker: `PAY-42` keys, workflow approval, full history. */
export function jiraTracker(
  connection: JiraConnection & {
    contentFields?: { id: string; name: string }[];
    projects?: string[];
  },
  options: AdapterOptions = {},
): TrackerAdapter {
  return {
    kind: "jira",
    find: (change: ChangeRequest) => ticketKeys(change, connection.projects ?? []),
    read: (key, approvedStatuses) =>
      getSpec(connection, key, {
        ...options,
        approvedStatuses: [...approvedStatuses],
        contentFields: [...DEFAULT_FIELDS, ...(connection.contentFields ?? [])],
      }),
    check: () => checkConnection(connection, options),
  };
}
