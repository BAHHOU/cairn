import type { ChangeRequest, SpecView, TrackerKind } from "@cairn/shared";
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
}

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
    };

export type AdapterOptions = FetchOptions;
