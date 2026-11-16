/**
 * Change control: does a merge request deliver what was specified, and did the people accountable
 * for it approve both the specification and the change?
 *
 * Built for the case where a developer edits a payment spec after the business approved it, then
 * ships code that matches the edited text: the code "respects the ticket", yet nobody accountable
 * agreed to it. So every rule compares the change with the spec *as approved*, never as it reads
 * today, and nothing done by the author of the change counts as a review of it.
 *
 * Deterministic and offline: the diff, the ticket history and the approvals are inputs fetched by
 * the caller. The result carries ids, paths and values only; the words live in the catalog
 * (`domain.change.<kind>`).
 */

import { z } from "zod";
import type { Severity } from "./domain";
import { SEVERITIES } from "./domain";
import type { MsgParam } from "./i18n";
import type { TrackerKind } from "./trackers";

/** Who must sign off a critical zone. Not the app roles: a manager may be the business owner. */
export const APPROVER_ROLES = ["business", "techLead", "security"] as const;
export type ApproverRole = (typeof APPROVER_ROLES)[number];

export const CHANGE_VERDICTS = ["pass", "review", "blocked"] as const;
export type ChangeVerdict = (typeof CHANGE_VERDICTS)[number];

export const CHANGE_FINDING_KINDS = [
  "ticket.missing",
  "ticket.unavailable",
  "spec.notApproved",
  "spec.approvedByAuthor",
  "spec.rewrittenByAuthor",
  "spec.changedAfterApproval",
  "zone.notInSpec",
  "approval.missing",
  "approval.self",
  "change.amountNotInSpec",
  "change.amount",
  "change.authorization",
  "change.validationRemoved",
  "change.hardcodedAccount",
] as const;
export type ChangeFindingKind = (typeof CHANGE_FINDING_KINDS)[number];

/** Code an organisation declares sensitive, and who must approve any change to it. */
export interface CriticalZone {
  id: string;
  /** Written by the organisation in its policy: shown as is, never translated. */
  name: string;
  /** Repository path globs: `**` spans folders, `*` stays within one. */
  paths: string[];
  /** Words a spec uses when it legitimately covers this zone ("virement", "payment", "plafond"). */
  keywords: string[];
  requires: ApproverRole[];
}

export interface ChangePolicy {
  zones: CriticalZone[];
  /** Ticket workflow statuses that mean the business approved the spec. */
  approvedStatuses: string[];
  /** Ticket project keys to recognise (`PAY`); empty accepts any key-shaped reference. */
  ticketProjects: string[];
  /**
   * Statuses meaning the work is done, for tools without a workflow category (Trello, Notion).
   * Absent in policies saved before traceability: `DEFAULT_DONE_STATUSES` then applies.
   */
  doneStatuses?: string[];
}

export interface Person {
  id: string;
  roles: ApproverRole[];
}

/** A ticket from the tracker, with the history of its content (description, acceptance criteria). */
export interface Spec {
  key: string;
  status: string;
  /**
   * The text as it stood when approved. Null when nobody approved it. `exact: false` when the tool
   * keeps no old versions: the text is today's, and is trusted only if nobody edited it since.
   */
  approved: { at: string; byId: string; text: string; exact?: boolean } | null;
  /** Edits of the content, oldest first. Status changes and comments are not edits. */
  revisions: { at: string; authorId: string }[];
}

export interface DiffLine {
  line: number;
  text: string;
}

export interface ChangedFile {
  path: string;
  added: DiffLine[];
  removed: DiffLine[];
}

export interface ChangeRequest {
  id: string;
  authorId: string;
  title: string;
  description: string;
  sourceBranch: string;
  commitMessages: string[];
  files: ChangedFile[];
  /** Ids of the people who approved the merge request. */
  approvals: string[];
}

export interface ChangeFinding {
  kind: ChangeFindingKind;
  severity: Severity;
  zone?: string;
  ticket?: string;
  file?: string;
  line?: number;
  params?: Record<string, MsgParam>;
}

export interface ZoneRequirement {
  zone: string;
  role: ApproverRole;
  /** Approvers holding the role, the author excluded. Empty: the requirement is not met. */
  approvedBy: string[];
}

export interface ChangeEvaluation {
  verdict: ChangeVerdict;
  tickets: string[];
  zones: { id: string; files: string[] }[];
  requirements: ZoneRequirement[];
  /** Worst first. */
  findings: ChangeFinding[];
}

export interface ChangeInput {
  change: ChangeRequest;
  policy: ChangePolicy;
  /** The tickets the change references, as fetched; a key absent here could not be read. */
  specs: Map<string, Spec>;
  people: Map<string, Person>;
  /**
   * References found by the connected trackers (`PAY-42`, `#12`, a Trello card…). Without it, the
   * engine looks for Jira-style keys itself.
   */
  tickets?: string[];
}

/* ------------------------------------------------------------------------------------------------
 * Matching helpers
 * --------------------------------------------------------------------------------------------- */

/** Glob over a repository path: `**` any depth (including none), `*` and `?` within one folder. */
export function globToRegExp(glob: string): RegExp {
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i] as string;
    if (c === "*" && glob[i + 1] === "*") {
      i++;
      if (glob[i + 1] === "/") {
        i++;
        re += "(?:.*/)?";
      } else re += ".*";
    } else if (c === "*") re += "[^/]*";
    else if (c === "?") re += "[^/]";
    else re += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${re}$`);
}

/** Look-alikes of ticket keys that are standards, not tickets. */
const NOT_TICKETS = new Set(["UTF", "SHA", "ISO", "RFC", "CVE", "HTTP", "TLS", "AES", "RSA", "MD"]);

/** Ticket keys referenced by the branch, title, description or commits, uppercased and unique. */
export function ticketKeys(change: ChangeRequest, projects: readonly string[]): string[] {
  const texts = [change.sourceBranch, change.title, change.description, ...change.commitMessages];
  const keys = new Set<string>();
  for (const text of texts) {
    for (const m of text.matchAll(/(?<![A-Za-z0-9])([A-Za-z][A-Za-z0-9]{1,9})-(\d+)(?!\d)/g)) {
      const raw = m[1] as string;
      const project = raw.toUpperCase();
      if (NOT_TICKETS.has(project)) continue;
      if (projects.length > 0 && !projects.includes(project)) continue;
      // Without a declared project list, prose only counts keys written in capitals ("PAY-12", not
      // "step-2"); branch names are lowercase by habit, so there any case counts.
      if (projects.length === 0 && text !== change.sourceBranch && raw !== project) continue;
      keys.add(`${project}-${m[2]}`);
    }
  }
  return [...keys];
}

const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/** Lines about money or limits: where a changed number moves what the system lets people do. */
const MONEY_LINE =
  /amount|limit|plafond|montant|threshold|seuil|max|ceiling|\bcap\b|balance|transfer|virement|payment|paiement/i;

/** Numbers in code: `2_000_000L`, `2000000`, `2e6`, `50_000.00`. */
const CODE_NUMBER = /(?<![\w.])(\d[\d_]*(?:\.\d+)?(?:e\d+)?)[lLdDfFmn]?(?![\w.])/g;

export function codeNumbers(text: string): number[] {
  return [...text.matchAll(CODE_NUMBER)].map((m) => Number((m[1] as string).replace(/_/g, "")));
}

const SCALE: Record<string, number> = { k: 1e3, m: 1e6, million: 1e6, millions: 1e6, md: 1e9 };

/**
 * Numbers in prose, the way specs write them: "50 000 €", "2,000,000", "50k", "2 M", "2 millions".
 * A comma or space between groups of three digits is a thousands separator, any other comma a
 * decimal mark.
 */
export function proseNumbers(text: string): number[] {
  const re =
    /(?<![\w.,])(\d{1,3}(?:[   ,.]\d{3})+|\d+)(?:[.,](\d+))?\s?(k|m|md|millions?)?(?![\p{L}\d])/giu;
  const out: number[] = [];
  for (const m of text.matchAll(re)) {
    const whole = Number((m[1] as string).replace(/[   ,.]/g, ""));
    const value = m[2] ? Number(`${whole}.${m[2]}`) : whole;
    const scale = m[3] ? (SCALE[m[3].toLowerCase()] ?? 1) : 1;
    out.push(value * scale);
  }
  return out;
}

const AUTHORIZATION =
  /has(?:Any)?Role|hasAuthority|PreAuthorize|@Secured|RolesAllowed|isAdmin|permitAll|permission|authori[sz]|\bgrant|privilege|allow-?list|whitelist|\bacl\b|\bscopes?\b/i;

const VALIDATION =
  /\bthrow\b|\bassert|validat|@(?:Valid|NotNull|NotBlank|Max|Min|Size|DecimalMax|DecimalMin|Positive)\b|\brequire\(|\bcheck[A-Z(]/;

const IBAN = /\b([A-Z]{2}\d{2}(?: ?[A-Z0-9]{4}){2,7}(?: ?[A-Z0-9]{1,4})?)\b/g;

/** ISO 13616 mod-97 check: rules out the random capitals that merely look like an IBAN. */
export function isIban(candidate: string): boolean {
  const s = candidate.replace(/ /g, "");
  if (s.length < 15 || s.length > 34) return false;
  const moved = `${s.slice(4)}${s.slice(0, 4)}`;
  let rest = 0;
  for (const ch of moved) {
    const digits = /\d/.test(ch) ? ch : String(ch.charCodeAt(0) - 55);
    for (const d of digits) rest = (rest * 10 + Number(d)) % 97;
  }
  return rest === 1;
}

const maskIban = (s: string) => {
  const flat = s.replace(/ /g, "");
  return `${flat.slice(0, 4)}…${flat.slice(-4)}`;
};

/** A line with its numbers blanked: the same skeleton on both sides means a value was edited. */
const skeleton = (text: string) => text.replace(CODE_NUMBER, "#").replace(/\s+/g, " ").trim();

interface AmountChange {
  file: string;
  line: number;
  from: number | null;
  to: number;
}

function amountChanges(file: ChangedFile): AmountChange[] {
  const removed = file.removed.filter((l) => MONEY_LINE.test(l.text));
  const out: AmountChange[] = [];
  for (const added of file.added) {
    if (!MONEY_LINE.test(added.text)) continue;
    const now = codeNumbers(added.text);
    if (now.length === 0) continue;
    const before = removed.find((r) => skeleton(r.text) === skeleton(added.text));
    const was = before ? codeNumbers(before.text) : [];
    now.forEach((to, i) => {
      const from = was[i] ?? null;
      if (from !== to) out.push({ file: file.path, line: added.line, from, to });
    });
  }
  return out;
}

/* ------------------------------------------------------------------------------------------------
 * Evaluation
 * --------------------------------------------------------------------------------------------- */

const RANK = Object.fromEntries(SEVERITIES.map((s, i) => [s, i])) as Record<Severity, number>;

export function evaluateChange({
  change,
  policy,
  specs,
  people,
  tickets: found,
}: ChangeInput): ChangeEvaluation {
  const findings: ChangeFinding[] = [];
  const author = change.authorId;

  const zones = policy.zones
    .map((zone) => {
      const res = zone.paths.map(globToRegExp);
      const files = change.files
        .filter((f) => res.some((re) => re.test(f.path)))
        .map((f) => f.path);
      return { zone, files };
    })
    .filter((z) => z.files.length > 0);
  const zoneOf = new Map<string, string>();
  for (const { zone, files } of zones) for (const f of files) zoneOf.set(f, zone.id);
  const critical = zones.length > 0;
  /** Inside a critical zone a doubt stops the merge; elsewhere it asks for a look. */
  const weigh = (inZone: Severity, outside: Severity) => (critical ? inZone : outside);

  // Tickets and the specs behind them.
  const tickets = found ?? ticketKeys(change, policy.ticketProjects);
  if (tickets.length === 0)
    findings.push({ kind: "ticket.missing", severity: weigh("blocker", "major") });

  const approvedTexts: string[] = [];
  for (const key of tickets) {
    const spec = specs.get(key);
    if (!spec) {
      findings.push({ kind: "ticket.unavailable", severity: "major", ticket: key });
      continue;
    }
    const approved = spec.approved;
    if (!approved || !policy.approvedStatuses.includes(spec.status)) {
      findings.push({
        kind: "spec.notApproved",
        severity: weigh("blocker", "major"),
        ticket: key,
        params: { status: spec.status },
      });
    }
    if (!approved) continue;
    if (approved.byId === author) {
      findings.push({ kind: "spec.approvedByAuthor", severity: "blocker", ticket: key });
    }
    const after = spec.revisions.filter((r) => Date.parse(r.at) > Date.parse(approved.at));
    // Today's text stands for the approved one only when it is exact, or untouched since.
    if (approved.exact !== false || after.length === 0) approvedTexts.push(approved.text);
    if (after.some((r) => r.authorId === author)) {
      findings.push({
        kind: "spec.rewrittenByAuthor",
        severity: "blocker",
        ticket: key,
        params: { count: after.filter((r) => r.authorId === author).length },
      });
    } else if (after.length > 0) {
      findings.push({
        kind: "spec.changedAfterApproval",
        severity: weigh("blocker", "critical"),
        ticket: key,
        params: { count: after.length },
      });
    }
  }
  const approvedFolded = approvedTexts.map(fold);
  const approvedNumbers = new Set(approvedTexts.flatMap(proseNumbers));

  // Zones the approved spec never talks about, and the sign-offs each zone requires.
  const requirements: ZoneRequirement[] = [];
  const approvers = change.approvals.filter((id) => id !== author);
  if (change.approvals.includes(author))
    findings.push({ kind: "approval.self", severity: "major" });
  for (const { zone } of zones) {
    if (
      approvedFolded.length > 0 &&
      !zone.keywords.some((k) => approvedFolded.some((t) => t.includes(fold(k))))
    ) {
      findings.push({ kind: "zone.notInSpec", severity: "critical", zone: zone.id });
    }
    for (const role of zone.requires) {
      const approvedBy = approvers.filter((id) => people.get(id)?.roles.includes(role));
      requirements.push({ zone: zone.id, role, approvedBy });
      if (approvedBy.length === 0) {
        findings.push({
          kind: "approval.missing",
          severity: "blocker",
          zone: zone.id,
          params: { role },
        });
      }
    }
  }

  // What the diff itself changes.
  for (const file of change.files) {
    const zone = zoneOf.get(file.path);
    const inZone = zone !== undefined;
    const at = (line: number) => ({ file: file.path, line, ...(zone ? { zone } : {}) });

    for (const a of amountChanges(file)) {
      const documented = approvedNumbers.has(a.to);
      findings.push({
        kind: documented ? "change.amount" : "change.amountNotInSpec",
        severity: documented ? "minor" : inZone ? "blocker" : "critical",
        ...at(a.line),
        params: a.from === null ? { to: a.to } : { from: a.from, to: a.to },
      });
    }

    const authAdded = file.added.filter((l) => AUTHORIZATION.test(l.text));
    const authRemoved = file.removed.filter((l) => AUTHORIZATION.test(l.text));
    const firstAuth = authAdded[0] ?? authRemoved[0];
    if (firstAuth) {
      findings.push({
        kind: "change.authorization",
        severity: inZone ? "critical" : "major",
        ...at(firstAuth.line),
        params: { added: authAdded.length, removed: authRemoved.length },
      });
    }

    const lostChecks =
      file.removed.filter((l) => VALIDATION.test(l.text)).length -
      file.added.filter((l) => VALIDATION.test(l.text)).length;
    const firstLost = file.removed.find((l) => VALIDATION.test(l.text));
    if (lostChecks > 0 && firstLost) {
      findings.push({
        kind: "change.validationRemoved",
        severity: inZone ? "critical" : "major",
        ...at(firstLost.line),
        params: { count: lostChecks },
      });
    }

    for (const l of file.added) {
      for (const m of l.text.matchAll(IBAN)) {
        if (!isIban(m[1] as string)) continue;
        findings.push({
          kind: "change.hardcodedAccount",
          severity: inZone ? "blocker" : "critical",
          ...at(l.line),
          params: { account: maskIban(m[1] as string) },
        });
      }
    }
  }

  findings.sort((a, b) => RANK[a.severity] - RANK[b.severity]);
  const verdict: ChangeVerdict = findings.some((f) => f.severity === "blocker")
    ? "blocked"
    : findings.some((f) => f.severity !== "minor")
      ? "review"
      : "pass";

  return {
    verdict,
    tickets,
    zones: zones.map(({ zone, files }) => ({ id: zone.id, files })),
    requirements,
    findings,
  };
}

/* ------------------------------------------------------------------------------------------------
 * What the screens receive
 * --------------------------------------------------------------------------------------------- */

/** A merge request as the forge describes it: the engine's input plus where it lives. */
export interface MergeRequest extends ChangeRequest {
  projectId: string;
  /** The number people quote: `!128`. */
  iid: number;
  targetBranch: string;
  updatedAt: string;
  url: string | null;
}

/** A ticket as people read it: the engine's view plus its title and current text. */
export interface SpecView extends Spec {
  /** The tool it was read from; absent for demo data. */
  tracker?: TrackerKind;
  title: string;
  /** The content today, which may differ from `approved.text`. */
  text: string;
  url: string | null;
}

export interface PersonView extends Person {
  name: string;
}

export interface ChangeSummary {
  projectId: string;
  projectName: string;
  iid: number;
  title: string;
  author: string;
  sourceBranch: string;
  targetBranch: string;
  updatedAt: string;
  tickets: string[];
  verdict: ChangeVerdict;
  counts: Record<Severity, number>;
  /** Critical zones touched, by name as the policy writes it. */
  zones: string[];
}

export interface ChangeReview {
  summary: ChangeSummary;
  change: MergeRequest;
  evaluation: ChangeEvaluation;
  specs: SpecView[];
  /** Everyone the page names: author, approvers, spec editors. */
  people: PersonView[];
  /** The policy zones this change touches. */
  zones: CriticalZone[];
}

const VERDICT_RANK: Record<ChangeVerdict, number> = { blocked: 0, review: 1, pass: 2 };

/** Blocked first, then to review, then compliant; the most recent first within each. */
export const byUrgency = (a: ChangeSummary, b: ChangeSummary): number =>
  VERDICT_RANK[a.verdict] - VERDICT_RANK[b.verdict] || b.updatedAt.localeCompare(a.updatedAt);

/** Evaluates a merge request and gathers what its review page shows. */
export function reviewChange(input: {
  change: MergeRequest;
  projectName: string;
  policy: ChangePolicy;
  specs: SpecView[];
  people: PersonView[];
  /** References found by the connected trackers; see `ChangeInput.tickets`. */
  tickets?: string[];
}): ChangeReview {
  const { change, policy } = input;
  const evaluation = evaluateChange({
    change,
    policy,
    specs: new Map(input.specs.map((s) => [s.key, s])),
    people: new Map(input.people.map((p) => [p.id, p])),
    tickets: input.tickets,
  });
  const counts = Object.fromEntries(SEVERITIES.map((s) => [s, 0])) as Record<Severity, number>;
  for (const f of evaluation.findings) counts[f.severity] += 1;
  const touched = new Set(evaluation.zones.map((z) => z.id));
  const zones = policy.zones.filter((z) => touched.has(z.id));
  const nameOf = (id: string) => input.people.find((p) => p.id === id)?.name ?? id;
  return {
    summary: {
      projectId: change.projectId,
      projectName: input.projectName,
      iid: change.iid,
      title: change.title,
      author: nameOf(change.authorId),
      sourceBranch: change.sourceBranch,
      targetBranch: change.targetBranch,
      updatedAt: change.updatedAt,
      tickets: evaluation.tickets,
      verdict: evaluation.verdict,
      counts,
      zones: zones.map((z) => z.name),
    },
    change,
    evaluation,
    specs: input.specs.filter((s) => evaluation.tickets.includes(s.key)),
    people: input.people,
    zones,
  };
}

/* ------------------------------------------------------------------------------------------------
 * Settings, validated wherever they are saved
 * --------------------------------------------------------------------------------------------- */

const ZONE_ID = /^[a-z][a-z0-9-]{0,39}$/;

export const criticalZoneSchema = z.object({
  id: z.string().regex(ZONE_ID),
  name: z.string().trim().min(1).max(80),
  paths: z.array(z.string().trim().min(1).max(200)).min(1).max(50),
  keywords: z.array(z.string().trim().min(1).max(60)).max(50),
  requires: z.array(z.enum(APPROVER_ROLES)).min(1),
});

export const changePolicySchema = z.object({
  zones: z.array(criticalZoneSchema).max(50),
  approvedStatuses: z.array(z.string().trim().min(1).max(60)).min(1).max(20),
  ticketProjects: z.array(z.string().regex(/^[A-Z][A-Z0-9]{1,9}$/)).max(50),
  doneStatuses: z.array(z.string().trim().min(1).max(60)).max(20).optional(),
});

export const personViewSchema = z.object({
  /** The username shared by GitLab and Jira (Data Center), or the Jira account id (Cloud). */
  id: z.string().trim().min(1).max(120),
  name: z.string().trim().min(1).max(120),
  roles: z.array(z.enum(APPROVER_ROLES)),
});

/** A starting policy: no zone, the common approved statuses, every ticket project accepted. */
export const EMPTY_POLICY: ChangePolicy = {
  zones: [],
  approvedStatuses: ["Validé", "Approved", "Ready for development"],
  ticketProjects: [],
};
