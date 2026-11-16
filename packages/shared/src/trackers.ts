/**
 * Project-management tools Cairn reads specifications from, and what each one can prove.
 *
 * Change control is only as strong as the history a tool keeps. Some keep every version of a
 * ticket's text (the approved wording can be rebuilt), some only say who edited it and when, some
 * only the last edit. Cairn says which, per tool, instead of pretending they are equal: the
 * catalog drives both the checks and what the integrations page promises.
 *
 * Brand names are proper nouns and stay as written; everything else is in `integrations.*`.
 */

export const TRACKER_KINDS = [
  "jira",
  "github",
  "gitlab",
  "linear",
  "trello",
  "notion",
  "taiga",
  "gitea",
  "bugzilla",
  "mantis",
  "azure",
  "youtrack",
  "openproject",
  "redmine",
  "asana",
  "clickup",
  "shortcut",
  "plane",
  "monday",
] as const;
export type TrackerKind = (typeof TRACKER_KINDS)[number];

/** How much of a ticket's past the tool exposes, strongest first. */
export const SPEC_EVIDENCE = ["fullHistory", "editors", "lastEdit"] as const;
export type SpecEvidence = (typeof SPEC_EVIDENCE)[number];

/** What "approved" means in the tool: a workflow status, a label, a list or board column, a field. */
export const APPROVAL_SIGNALS = ["workflow", "label", "list", "property"] as const;
export type ApprovalSignal = (typeof APPROVAL_SIGNALS)[number];

/** How a merge request cites a ticket: `PAY-42`, `#12`, or a link to the card or page. */
export const REFERENCE_STYLES = ["key", "number", "link"] as const;
export type ReferenceStyle = (typeof REFERENCE_STYLES)[number];

export interface TrackerInfo {
  name: string;
  /** Connectable today, or announced. */
  status: "live" | "planned";
  /** Usable at no cost by an individual or a small team. */
  free: boolean;
  /** Open source, self-hostable. */
  openSource: boolean;
  evidence: SpecEvidence;
  approval: ApprovalSignal;
  reference: ReferenceStyle;
}

export const TRACKERS: Record<TrackerKind, TrackerInfo> = {
  jira: {
    name: "Jira",
    status: "live",
    free: true,
    openSource: false,
    evidence: "fullHistory",
    approval: "workflow",
    reference: "key",
  },
  github: {
    name: "GitHub Issues",
    status: "live",
    free: true,
    openSource: false,
    evidence: "fullHistory",
    approval: "label",
    reference: "number",
  },
  gitlab: {
    name: "GitLab Issues",
    status: "live",
    free: true,
    openSource: true,
    evidence: "editors",
    approval: "label",
    reference: "number",
  },
  linear: {
    name: "Linear",
    status: "live",
    free: true,
    openSource: false,
    evidence: "editors",
    approval: "workflow",
    reference: "key",
  },
  trello: {
    name: "Trello",
    status: "live",
    free: true,
    openSource: false,
    evidence: "fullHistory",
    approval: "list",
    reference: "link",
  },
  notion: {
    name: "Notion",
    status: "live",
    free: true,
    openSource: false,
    evidence: "lastEdit",
    approval: "property",
    reference: "link",
  },
  taiga: {
    name: "Taiga",
    status: "live",
    free: true,
    openSource: true,
    evidence: "fullHistory",
    approval: "workflow",
    reference: "key",
  },
  gitea: {
    name: "Gitea / Forgejo",
    status: "live",
    free: true,
    openSource: true,
    evidence: "lastEdit",
    approval: "label",
    reference: "number",
  },
  bugzilla: {
    name: "Bugzilla",
    status: "live",
    free: true,
    openSource: true,
    evidence: "fullHistory",
    approval: "workflow",
    reference: "number",
  },
  mantis: {
    name: "MantisBT",
    status: "live",
    free: true,
    openSource: true,
    evidence: "editors",
    approval: "workflow",
    reference: "number",
  },
  azure: {
    name: "Azure Boards",
    status: "live",
    free: true,
    openSource: false,
    evidence: "fullHistory",
    approval: "workflow",
    reference: "number",
  },
  youtrack: {
    name: "YouTrack",
    status: "live",
    free: true,
    openSource: false,
    evidence: "fullHistory",
    approval: "workflow",
    reference: "key",
  },
  openproject: {
    name: "OpenProject",
    status: "live",
    free: true,
    openSource: true,
    evidence: "editors",
    approval: "workflow",
    reference: "number",
  },
  redmine: {
    name: "Redmine",
    status: "live",
    free: true,
    openSource: true,
    evidence: "fullHistory",
    approval: "workflow",
    reference: "number",
  },
  asana: {
    name: "Asana",
    status: "live",
    free: true,
    openSource: false,
    evidence: "editors",
    approval: "property",
    reference: "link",
  },
  clickup: {
    name: "ClickUp",
    status: "live",
    free: true,
    openSource: false,
    evidence: "lastEdit",
    approval: "workflow",
    reference: "link",
  },
  shortcut: {
    name: "Shortcut",
    status: "live",
    free: true,
    openSource: false,
    evidence: "editors",
    approval: "workflow",
    reference: "key",
  },
  plane: {
    name: "Plane",
    status: "live",
    free: true,
    openSource: true,
    evidence: "editors",
    approval: "workflow",
    reference: "key",
  },
  monday: {
    name: "monday.com",
    status: "live",
    free: true,
    openSource: false,
    evidence: "lastEdit",
    approval: "property",
    reference: "link",
  },
};
