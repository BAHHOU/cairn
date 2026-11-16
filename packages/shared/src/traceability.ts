/**
 * Traceability: what the business asked for, against what reached the main branch.
 *
 * Change control judges one merge request before it lands. Traceability looks back over a window
 * of the main branch, the reference of what is delivered by developers and AI agents alike, and
 * answers four questions:
 *
 * - **Shipped without request:** code on main that no approved ticket asked for (no ticket, a
 *   ticket nobody approved, a direct push, a merge change control had blocked).
 * - **Requested, not shipped:** tickets the tracker calls done that never reached main.
 * - **Changed after review:** commits added after the last approval, a spec edited after it was
 *   approved or after the code shipped.
 * - **AI-agent changes:** code written by an agent with no human review, or touching a critical
 *   zone without the human sign-offs the policy requires.
 *
 * Business-logic attacks live in that gap: a limit raised in code that no business owner asked for,
 * an agent "fixing" a validation away. Deterministic and offline like the rest of change control:
 * the caller fetches tickets, merges and commits; this module only compares them.
 */

import {
  type ChangeFinding,
  type ChangePolicy,
  type ChangeRequest,
  type ChangeVerdict,
  evaluateChange,
  type Person,
  type SpecView,
} from "./change-control";
import { SEVERITIES, type Severity } from "./domain";
import type { MsgParam } from "./i18n";
import type { TrackerKind } from "./trackers";

/** How far back the main branch is read. */
export const TRACE_WINDOW_DAYS = 30;

/** Statuses meaning "done" when a tool has no workflow category of its own (Trello, Notion). */
export const DEFAULT_DONE_STATUSES = [
  "Done",
  "Closed",
  "Resolved",
  "Released",
  "Terminé",
  "Fermé",
  "Livré",
  "En production",
];

export const TRACE_CATEGORIES = [
  "unrequested",
  "notShipped",
  "changedAfterReview",
  "agent",
] as const;
export type TraceCategory = (typeof TRACE_CATEGORIES)[number];

export const TRACE_FINDING_KINDS = [
  "trace.noTicket",
  "trace.directPush",
  "trace.specNotApproved",
  "trace.mergedBlocked",
  "trace.doneNotShipped",
  "trace.commitsAfterApproval",
  "trace.specEditedAfterApproval",
  "trace.specEditedAfterDelivery",
  "trace.agentNoHumanReview",
  "trace.agentCriticalZone",
] as const;
export type TraceFindingKind = (typeof TRACE_FINDING_KINDS)[number];

export const TRACE_CATEGORY_OF: Record<TraceFindingKind, TraceCategory> = {
  "trace.noTicket": "unrequested",
  "trace.directPush": "unrequested",
  "trace.specNotApproved": "unrequested",
  "trace.mergedBlocked": "unrequested",
  "trace.doneNotShipped": "notShipped",
  "trace.commitsAfterApproval": "changedAfterReview",
  "trace.specEditedAfterApproval": "changedAfterReview",
  "trace.specEditedAfterDelivery": "changedAfterReview",
  "trace.agentNoHumanReview": "agent",
  "trace.agentCriticalZone": "agent",
};

/* ------------------------------------------------------------------------------------------------
 * Inputs
 * --------------------------------------------------------------------------------------------- */

/** A ticket as a board lists it: enough to know it exists and whether the business calls it done. */
export interface TicketItem {
  /** The same key the adapters find in merge requests: `PAY-42`, `#12`, `trello:AbCd1234`… */
  key: string;
  title: string;
  status: string;
  done: boolean;
  tracker?: TrackerKind;
  url: string | null;
  updatedAt: string;
}

export interface CommitInfo {
  sha: string;
  at: string;
  authorName: string;
  authorEmail: string;
  message: string;
}

/** One change that reached the main branch: a merged merge request, or a commit pushed directly. */
export interface DeliveryInput {
  kind: "merge" | "push";
  /** `!128` for a merge request, the short sha for a push. */
  ref: string;
  sha: string;
  title: string;
  authorId: string;
  /** When it reached main. */
  at: string;
  url: string | null;
  /** Diff, messages and approver ids, as change control reads a merge request. */
  change: ChangeRequest;
  /** Who approved, and when. Empty for a direct push. */
  approvals: { by: string; at: string }[];
  commits: CommitInfo[];
  /** The ticket references the connected trackers found in it. */
  tickets: string[];
}

export interface TraceInput {
  /** Tickets listed from the project's boards, over the window. */
  tickets: TicketItem[];
  /** Specs read for the tickets the deliveries reference. */
  specs: SpecView[];
  deliveries: DeliveryInput[];
  policy: ChangePolicy;
  people: Person[];
  /** Start of the window, ISO. */
  since: string;
}

/* ------------------------------------------------------------------------------------------------
 * AI agents
 * --------------------------------------------------------------------------------------------- */

export interface AgentSignal {
  /** The agent, as people name it. Data, not UI text. */
  agent: string;
  /** Where it was seen. */
  via: "coAuthor" | "author" | "branch";
}

/** Coding agents and the identities they sign with. Checked on names, e-mails and trailers only. */
const AGENTS: [string, RegExp][] = [
  ["Claude", /\bclaude\b|anthropic/i],
  ["GitHub Copilot", /copilot/i],
  ["Cursor", /\bcursor(?:[-\s]?agent)?\b|cursor\.(?:com|sh)/i],
  ["OpenAI Codex", /\bcodex\b|openai/i],
  ["Devin", /\bdevin\b/i],
  ["Gemini", /\bgemini\b|\bjules\b/i],
  ["Amazon Q", /amazon[\s-]?q\b|codewhisperer/i],
  ["Windsurf", /windsurf|codeium/i],
  ["Aider", /\baider\b/i],
  ["Tabnine", /tabnine/i],
];

const BRANCH_AGENT = /^(claude|copilot|cursor|codex|devin|jules|aider|windsurf)[/_-]/i;

const agentIn = (text: string): string | null =>
  AGENTS.find(([, re]) => re.test(text))?.[0] ?? null;

/**
 * Whether an AI agent wrote a change: a `Co-authored-by` trailer naming one, an agent account as
 * author, or a branch the agent tooling names. Never the body of a message: "fix Copilot config"
 * is a human writing about a tool.
 */
export function detectAgent(input: {
  authorName?: string;
  authorEmail?: string;
  branch?: string;
  messages: string[];
}): AgentSignal | null {
  for (const message of input.messages) {
    for (const m of message.matchAll(/^co-authored-by:\s*(.+)$/gim)) {
      const agent = agentIn(m[1] as string);
      if (agent) return { agent, via: "coAuthor" };
    }
  }
  const identity = `${input.authorName ?? ""} ${input.authorEmail ?? ""}`;
  const byAuthor = agentIn(identity);
  if (byAuthor) return { agent: byAuthor, via: "author" };
  const branch = input.branch ? BRANCH_AGENT.exec(input.branch) : null;
  if (branch)
    return { agent: agentIn(branch[1] as string) ?? (branch[1] as string), via: "branch" };
  return null;
}

/* ------------------------------------------------------------------------------------------------
 * Output
 * --------------------------------------------------------------------------------------------- */

export interface TraceFinding {
  kind: TraceFindingKind;
  category: TraceCategory;
  severity: Severity;
  ticket?: string;
  /** The delivery's ref (`!128`, a short sha). */
  delivery?: string;
  params?: Record<string, MsgParam>;
}

export interface DeliverySummary {
  kind: "merge" | "push";
  ref: string;
  sha: string;
  title: string;
  authorId: string;
  at: string;
  url: string | null;
  agent: AgentSignal | null;
  /** Change control's verdict on the merge request as merged; null for a direct push. */
  verdict: ChangeVerdict | null;
  /** Critical zones touched, by id. */
  zones: string[];
}

export type TraceState = "shipped" | "notShipped" | "unrequested";

export interface TraceRow {
  /** The ticket key, or the delivery ref when nothing asked for it. */
  key: string;
  ticket: {
    key: string;
    title: string;
    status: string;
    done: boolean;
    tracker?: TrackerKind;
    url: string | null;
    approved: boolean;
  } | null;
  deliveries: DeliverySummary[];
  /** Worst first. */
  findings: TraceFinding[];
  state: TraceState;
}

export interface Traceability {
  since: string;
  /** Worst rows first. */
  rows: TraceRow[];
  /** Rows with at least one finding of each category. */
  counts: Record<TraceCategory, number>;
  severities: Record<Severity, number>;
  totals: { tickets: number; deliveries: number; agentDeliveries: number };
}

/** What overview and portfolio pages keep of a run: no ticket text, no diff. */
export interface TraceSummary {
  since: string;
  counts: Record<TraceCategory, number>;
  severities: Record<Severity, number>;
  totals: Traceability["totals"];
}

export const summarizeTrace = (t: Traceability): TraceSummary => ({
  since: t.since,
  counts: t.counts,
  severities: t.severities,
  totals: t.totals,
});

/* ------------------------------------------------------------------------------------------------
 * Engine
 * --------------------------------------------------------------------------------------------- */

const RANK = Object.fromEntries(SEVERITIES.map((s, i) => [s, i])) as Record<Severity, number>;
const worst = (a: TraceFinding, b: TraceFinding) => RANK[a.severity] - RANK[b.severity];

function finding(
  kind: TraceFindingKind,
  severity: Severity,
  extra: Omit<TraceFinding, "kind" | "category" | "severity"> = {},
): TraceFinding {
  return { kind, category: TRACE_CATEGORY_OF[kind], severity, ...extra };
}

/** The findings of one delivery, and its summary. */
function traceDelivery(
  d: DeliveryInput,
  specs: Map<string, SpecView>,
  input: TraceInput,
  people: Map<string, Person>,
): { summary: DeliverySummary; findings: TraceFinding[] } {
  const evaluation = evaluateChange({
    change: d.change,
    policy: input.policy,
    specs,
    people,
    tickets: d.tickets,
  });
  const zones = evaluation.zones.map((z) => z.id);
  const critical = zones.length > 0;
  const raise: Severity = critical ? "critical" : "major";
  const findings: TraceFinding[] = [];
  const at = { delivery: d.ref };

  // Shipped without request.
  if (d.kind === "push") {
    findings.push(finding("trace.directPush", critical ? "blocker" : "critical", at));
  } else if (d.tickets.length === 0) {
    findings.push(finding("trace.noTicket", critical ? "blocker" : "major", at));
  }
  for (const key of d.tickets) {
    const spec = specs.get(key);
    if (spec && spec.approved === null) {
      findings.push(finding("trace.specNotApproved", raise, { ...at, ticket: key }));
    }
  }
  if (d.kind === "merge" && d.tickets.length > 0 && evaluation.verdict === "blocked") {
    const blockers = evaluation.findings.filter((f) => f.severity === "blocker").length;
    findings.push(
      finding("trace.mergedBlocked", "critical", { ...at, params: { count: blockers } }),
    );
  }

  // Changed after review: commits after the last approval, specs edited behind the code.
  const humanApprovals = d.approvals.filter((a) => a.by !== d.authorId && agentIn(a.by) === null);
  const lastApproval = humanApprovals
    .map((a) => a.at)
    .sort()
    .at(-1);
  if (lastApproval) {
    const late = d.commits.filter((c) => c.at > lastApproval).length;
    if (late > 0) {
      findings.push(
        finding("trace.commitsAfterApproval", raise, { ...at, params: { count: late } }),
      );
    }
  }
  const editedAfterApproval = new Set(
    evaluation.findings
      .filter((f: ChangeFinding) =>
        ["spec.changedAfterApproval", "spec.rewrittenByAuthor"].includes(f.kind),
      )
      .map((f) => f.ticket)
      .filter((t): t is string => t !== undefined),
  );
  for (const key of editedAfterApproval) {
    findings.push(finding("trace.specEditedAfterApproval", raise, { ...at, ticket: key }));
  }
  for (const key of d.tickets) {
    const after = specs.get(key)?.revisions.filter((r) => r.at > d.at) ?? [];
    if (after.length > 0) {
      findings.push(
        finding("trace.specEditedAfterDelivery", "major", {
          ...at,
          ticket: key,
          params: { count: after.length },
        }),
      );
    }
  }

  // AI agents: a human must have reviewed, and critical zones need their human sign-offs.
  const agent =
    detectAgent({
      authorName: d.authorId,
      branch: d.change.sourceBranch,
      messages: d.commits.map((c) => c.message).concat(d.change.commitMessages),
    }) ??
    d.commits
      .map((c) =>
        detectAgent({ authorName: c.authorName, authorEmail: c.authorEmail, messages: [] }),
      )
      .find((s) => s !== null) ??
    null;
  if (agent) {
    if (humanApprovals.length === 0) {
      findings.push(
        finding("trace.agentNoHumanReview", critical ? "blocker" : "critical", {
          ...at,
          params: { agent: agent.agent },
        }),
      );
    } else if (evaluation.requirements.some((r) => r.approvedBy.length === 0)) {
      findings.push(
        finding("trace.agentCriticalZone", "blocker", {
          ...at,
          params: { agent: agent.agent, zone: zones[0] ?? "" },
        }),
      );
    }
  }

  return {
    summary: {
      kind: d.kind,
      ref: d.ref,
      sha: d.sha,
      title: d.title,
      authorId: d.authorId,
      at: d.at,
      url: d.url,
      agent,
      verdict: d.kind === "merge" ? evaluation.verdict : null,
      zones,
    },
    findings,
  };
}

/**
 * The request ↔ delivery matrix of one repository over the window. Rows are tickets (shipped or
 * not) and the deliveries no ticket asked for; the worst come first.
 */
export function traceProject(input: TraceInput): Traceability {
  const specs = new Map(input.specs.map((s) => [s.key, s]));
  const people = new Map(input.people.map((p) => [p.id, p]));
  const listed = new Map(input.tickets.map((t) => [t.key, t]));
  const rows = new Map<string, TraceRow>();

  const ticketRow = (key: string): TraceRow => {
    let row = rows.get(key);
    if (!row) {
      const item = listed.get(key);
      const spec = specs.get(key);
      row = {
        key,
        ticket:
          item || spec
            ? {
                key,
                title: item?.title ?? spec?.title ?? key,
                status: item?.status ?? spec?.status ?? "",
                done: item?.done ?? false,
                tracker: item?.tracker ?? spec?.tracker,
                url: item?.url ?? spec?.url ?? null,
                approved: spec ? spec.approved !== null : false,
              }
            : { key, title: key, status: "", done: false, url: null, approved: false },
        deliveries: [],
        findings: [],
        state: "shipped",
      };
      rows.set(key, row);
    }
    return row;
  };

  let agentDeliveries = 0;
  for (const d of input.deliveries) {
    const { summary, findings } = traceDelivery(d, specs, input, people);
    if (summary.agent) agentDeliveries += 1;
    if (d.tickets.length === 0) {
      rows.set(d.ref, {
        key: d.ref,
        ticket: null,
        deliveries: [summary],
        findings,
        state: "unrequested",
      });
      continue;
    }
    // A delivery citing several tickets appears under each; its own findings go to the first.
    d.tickets.forEach((key, i) => {
      const row = ticketRow(key);
      row.deliveries.push(summary);
      const mine = findings.filter((f) => f.ticket === key || (i === 0 && f.ticket === undefined));
      row.findings.push(...mine);
    });
  }

  for (const t of input.tickets) {
    if (!t.done || rows.has(t.key)) continue;
    rows.set(t.key, {
      key: t.key,
      ticket: {
        key: t.key,
        title: t.title,
        status: t.status,
        done: true,
        tracker: t.tracker,
        url: t.url,
        approved: specs.get(t.key)?.approved != null,
      },
      deliveries: [],
      findings: [finding("trace.doneNotShipped", "major", { ticket: t.key })],
      state: "notShipped",
    });
  }

  const all = [...rows.values()];
  for (const row of all) row.findings.sort(worst);
  const rowRank = (r: TraceRow) =>
    r.findings[0] ? RANK[r.findings[0].severity] : SEVERITIES.length;
  const lastAt = (r: TraceRow) =>
    r.deliveries
      .map((d) => d.at)
      .sort()
      .at(-1) ?? "";
  all.sort((a, b) => rowRank(a) - rowRank(b) || lastAt(b).localeCompare(lastAt(a)));

  const counts = Object.fromEntries(TRACE_CATEGORIES.map((c) => [c, 0])) as Record<
    TraceCategory,
    number
  >;
  const severities = Object.fromEntries(SEVERITIES.map((s) => [s, 0])) as Record<Severity, number>;
  for (const row of all) {
    for (const c of new Set(row.findings.map((f) => f.category))) counts[c] += 1;
    for (const f of row.findings) severities[f.severity] += 1;
  }

  return {
    since: input.since,
    rows: all,
    counts,
    severities,
    totals: {
      tickets: all.filter((r) => r.ticket !== null).length,
      deliveries: input.deliveries.length,
      agentDeliveries,
    },
  };
}
