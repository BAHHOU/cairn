import { listTrackerConnections, type StoredTrackerConnection } from "@cairn/db";
import { decryptSecret, encryptSecret, loadSecretKey } from "@cairn/git";
import type { ChangeRequest, SpecView } from "@cairn/shared";
import {
  createTracker,
  type TrackerAdapter,
  type TrackerConnection,
  TrackerError,
} from "@cairn/tracker";
import { getDb } from "@/lib/import/runtime";

/** Each connection's secret is bound to its id: a blob copied onto another row does not decrypt. */
const context = (id: string) => `tracker:${id}`;

export const sealSecret = (id: string, secret: Record<string, string>): string =>
  encryptSecret(JSON.stringify(secret), loadSecretKey(), context(id));

const str = (v: unknown): string | undefined => (typeof v === "string" && v ? v : undefined);
const strings = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];

/** A stored row as a connection the adapters understand. Server only: it holds the secret. */
export function toConnection(row: StoredTrackerConnection): TrackerConnection {
  const secret = JSON.parse(
    decryptSecret(row.secretEnc, loadSecretKey(), context(row.id)),
  ) as Record<string, string>;
  const s = row.settings;
  switch (row.kind) {
    case "jira":
      return {
        kind: "jira",
        baseUrl: str(s.baseUrl) ?? "",
        auth:
          s.edition === "basic"
            ? { kind: "basic", user: str(s.user) ?? "", token: secret.token ?? "" }
            : { kind: "bearer", token: secret.token ?? "" },
        projects: strings(s.projects),
        contentFields: Array.isArray(s.contentFields)
          ? (s.contentFields as { id: string; name: string }[])
          : [],
      };
    case "github":
      return {
        kind: "github",
        apiUrl: str(s.apiUrl) ?? "https://api.github.com",
        token: secret.token ?? "",
        defaultRepo: str(s.defaultRepo),
      };
    case "gitlab":
      return {
        kind: "gitlab",
        baseUrl: str(s.baseUrl) ?? "https://gitlab.com",
        project: str(s.project) ?? "",
        token: secret.token,
      };
    case "linear":
      return { kind: "linear", apiKey: secret.apiKey ?? "", teams: strings(s.teams) };
    case "trello":
      return { kind: "trello", key: str(s.key) ?? "", token: secret.token ?? "" };
    case "notion":
      return {
        kind: "notion",
        token: secret.token ?? "",
        statusProperty: str(s.statusProperty),
        approvedAtProperty: str(s.approvedAtProperty),
        approverProperty: str(s.approverProperty),
      };
    case "taiga":
      return {
        kind: "taiga",
        baseUrl: str(s.baseUrl) ?? "https://api.taiga.io",
        project: str(s.project) ?? "",
        username: str(s.username) ?? "",
        password: secret.password ?? "",
      };
    case "gitea":
      return {
        kind: "gitea",
        baseUrl: str(s.baseUrl) ?? "",
        token: secret.token ?? "",
        defaultRepo: str(s.defaultRepo),
      };
    case "bugzilla":
    case "mantis":
      return { kind: row.kind, baseUrl: str(s.baseUrl) ?? "", token: secret.token ?? "" };
    case "azure":
      return { kind: "azure", orgUrl: str(s.orgUrl) ?? "", token: secret.token ?? "" };
    case "youtrack":
      return {
        kind: "youtrack",
        baseUrl: str(s.baseUrl) ?? "",
        token: secret.token ?? "",
        projects: strings(s.projects),
      };
    case "openproject":
    case "redmine":
      return { kind: row.kind, baseUrl: str(s.baseUrl) ?? "", token: secret.token ?? "" };
    case "asana":
    case "clickup":
    case "shortcut":
      return { kind: row.kind, token: secret.token ?? "" };
    case "plane":
      return {
        kind: "plane",
        baseUrl: str(s.baseUrl) ?? "https://api.plane.so",
        workspace: str(s.workspace) ?? "",
        token: secret.token ?? "",
        projects: strings(s.projects),
      };
    case "monday":
      return {
        kind: "monday",
        token: secret.token ?? "",
        statusProperty: str(s.statusProperty),
        approvedAtProperty: str(s.approvedAtProperty),
        approverProperty: str(s.approverProperty),
      };
    default:
      throw new TrackerError("provider_error", `${row.kind} is not connectable yet`);
  }
}

/**
 * The trackers to read a repository's specifications from: its own GitLab issues first (no setup
 * needed, the repository token reads them), then every connection the organisation added.
 */
export async function trackersFor(
  repoIssues: Extract<TrackerConnection, { kind: "gitlab" }> | null,
  timeoutMs: number,
): Promise<TrackerAdapter[]> {
  const stored = await listTrackerConnections(getDb());
  const adapters: TrackerAdapter[] = [];
  if (repoIssues) adapters.push(createTracker(repoIssues, { timeoutMs }));
  for (const row of stored) {
    try {
      adapters.push(createTracker(toConnection(row), { timeoutMs }));
    } catch {
      // A connection that cannot be decrypted (key rotated) is skipped, not fatal for the page.
    }
  }
  return adapters;
}

/**
 * References in a merge request and the specs behind them. Each reference belongs to the first
 * tracker that claims it, so `ENG-12` is not read from both Jira and Linear. A ticket that cannot be
 * read is left out of `specs`: the engine then reports it as unavailable.
 */
export async function readSpecs(
  change: ChangeRequest,
  adapters: TrackerAdapter[],
  approvedStatuses: readonly string[],
): Promise<{ tickets: string[]; specs: SpecView[] }> {
  const owner = new Map<string, TrackerAdapter>();
  for (const adapter of adapters) {
    for (const ref of adapter.find(change)) if (!owner.has(ref)) owner.set(ref, adapter);
  }
  const specs = await Promise.all(
    [...owner].map(([ref, adapter]) =>
      adapter.read(ref, approvedStatuses).catch((error: unknown) => {
        if (error instanceof TrackerError) return null;
        throw error;
      }),
    ),
  );
  return {
    tickets: [...owner.keys()],
    specs: specs.filter((s): s is SpecView => s !== null),
  };
}
