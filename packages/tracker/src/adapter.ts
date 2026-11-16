import type { ChangeRequest, SpecView, TicketItem, TrackerKind } from "@cairn/shared";
import type { FetchOptions } from "./http";

/** Every tracker, seen the same way by change control. */
export interface TrackerAdapter {
  kind: TrackerKind;
  /**
   * The references to this tool in a merge request (branch, title, description, commits), as
   * stable ids that are also the ticket keys shown to people: `PAY-42`, `#12`, `owner/repo#12`…
   */
  find(change: ChangeRequest): string[];
  /** One ticket as a specification: its text as approved and today, who approved and edited it. */
  read(ref: string, approvedStatuses: readonly string[]): Promise<SpecView>;
  /** Proves the credentials work: who the tool says they belong to. */
  check(): Promise<{ displayName: string }>;
  /**
   * The tickets of one board updated since a date, keyed as `find` keys them, for traceability.
   * Absent for tools that cannot list yet. `scope` is the board as `BOARD_SCOPE` describes it.
   */
  list?(scope: BoardScope, query: ListQuery): Promise<TicketItem[]>;
}

/** Where a project's tickets live in one tool: a JQL query, a board, a database. */
export type BoardScope = Record<string, string>;

export interface ListQuery {
  /** ISO date: tickets updated before it are left out. */
  since: string;
  /** Statuses meaning done, for tools without a workflow category. */
  doneStatuses: readonly string[];
  /** Upper bound on tickets returned. */
  limit?: number;
}

/** The scope field each tool needs to list a project's tickets. */
export const BOARD_SCOPE = {
  jira: "jql",
  trello: "board",
  notion: "database",
  gitlab: "project",
  github: "repo",
  linear: "team",
  taiga: "project",
  gitea: "repo",
  bugzilla: "product",
  mantis: "project",
  azure: "project",
  youtrack: "query",
  openproject: "project",
  redmine: "project",
  asana: "project",
  clickup: "list",
  shortcut: "query",
  plane: "project",
  monday: "board",
} as const;

/** Non-secret settings and the secret of each kind of connection, as stored and decrypted. */
export type TrackerConnection =
  | {
      kind: "jira";
      baseUrl: string;
      auth: { kind: "basic"; user: string; token: string } | { kind: "bearer"; token: string };
      /** Custom fields that are part of a spec, such as acceptance criteria. */
      contentFields?: { id: string; name: string }[];
      /** Project keys to recognise; empty recognises any key. */
      projects?: string[];
    }
  | {
      kind: "github";
      /** `https://api.github.com`, or `https://host/api/v3` for GitHub Enterprise Server. */
      apiUrl: string;
      token: string;
      /** `owner/repo` that a bare `#12` refers to. */
      defaultRepo?: string;
    }
  | {
      kind: "gitlab";
      baseUrl: string;
      token: string | undefined;
      /** `group/project` that a bare `#12` refers to. */
      project: string;
    }
  | { kind: "linear"; apiKey: string; teams?: string[] }
  | { kind: "trello"; key: string; token: string }
  | {
      kind: "notion";
      token: string;
      /** Database properties: the status, and optionally the approval date and the approver. */
      statusProperty?: string;
      approvedAtProperty?: string;
      approverProperty?: string;
    }
  | {
      kind: "azure";
      /** `https://dev.azure.com/<organisation>`, or a server's collection URL. */
      orgUrl: string;
      token: string;
    }
  | { kind: "youtrack"; baseUrl: string; token: string; projects?: string[] }
  | { kind: "openproject"; baseUrl: string; token: string }
  | { kind: "redmine"; baseUrl: string; token: string }
  | { kind: "asana"; token: string }
  | {
      kind: "taiga";
      /** `https://api.taiga.io`, or a self-hosted instance. */
      baseUrl: string;
      /** Taiga has no personal tokens: Cairn signs in with an account, read-only by role. */
      username: string;
      password: string;
      /** The project slug `TG-123` refers to. */
      project: string;
    }
  | {
      kind: "gitea";
      baseUrl: string;
      token: string;
      /** `owner/repo` that a bare `#12` refers to. */
      defaultRepo?: string;
    }
  | { kind: "bugzilla"; baseUrl: string; token: string }
  | { kind: "mantis"; baseUrl: string; token: string }
  | { kind: "clickup"; token: string }
  | { kind: "shortcut"; token: string }
  | {
      kind: "plane";
      /** `https://api.plane.so`, or a self-hosted instance. */
      baseUrl: string;
      workspace: string;
      token: string;
      projects?: string[];
    }
  | {
      kind: "monday";
      token: string;
      /** Board columns, by title: the status, and optionally the approval date and the approver. */
      statusProperty?: string;
      approvedAtProperty?: string;
      approverProperty?: string;
    };

export type AdapterOptions = FetchOptions;
