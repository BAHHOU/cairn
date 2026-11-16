import {
  type DeliveryInput,
  type MergeRequest,
  type TicketItem,
  TRACE_WINDOW_DAYS,
  type Traceability,
  traceProject,
} from "@cairn/shared";
import { DEMO_CHANGES, DEMO_PEOPLE, DEMO_POLICY, DEMO_SPECS } from "@/lib/api/change-data";

/**
 * Traceability, demo data (fictitious). The demo merge requests of change control, read as merged
 * into main, plus what only traceability catches: an agent's change nobody reviewed, a hotfix
 * pushed straight to main, tickets the business closed that never shipped.
 */

const NOW = "2026-11-06T12:00:00Z";
const SINCE = new Date(Date.parse(NOW) - TRACE_WINDOW_DAYS * 86_400_000).toISOString();

const commit = (sha: string, at: string, message: string, authorName = "Dev") => ({
  sha,
  at,
  authorName,
  authorEmail: `${authorName.toLowerCase().replace(/\s+/g, ".")}@demo.bank`,
  message,
});

/** A demo merge request as merged an hour after its last update, approved before. */
function merged(change: MergeRequest): DeliveryInput {
  const at = new Date(Date.parse(change.updatedAt) + 3_600_000).toISOString();
  const approvedAt = new Date(Date.parse(change.updatedAt) - 3_600_000).toISOString();
  const writtenAt = new Date(Date.parse(change.updatedAt) - 7_200_000).toISOString();
  return {
    kind: "merge",
    ref: `!${change.iid}`,
    sha: `${change.iid}`.padStart(8, "a"),
    title: change.title,
    authorId: change.authorId,
    at,
    url: null,
    change,
    approvals: change.approvals.map((by) => ({ by, at: approvedAt })),
    commits: [
      commit(`c${change.iid}a`, writtenAt, change.commitMessages[0] ?? change.title),
      // !128 got one more commit after its approval: the limit raised once reviewers had looked.
      ...(change.iid === 128
        ? [commit("c128b", change.updatedAt, "PAY-42 plafond pro à 2 000 000")]
        : []),
    ],
    tickets: DEMO_SPECS.map((s) => s.key).filter((k) =>
      `${change.title} ${change.description} ${change.sourceBranch}`.toUpperCase().includes(k),
    ),
  };
}

const AGENT_CHANGE: MergeRequest = {
  id: "qis-dist-cms!140",
  projectId: "qis-dist-cms",
  iid: 140,
  authorId: "a.martin",
  title: "Simplifier la validation des bénéficiaires",
  description: "Refactoring proposé par l'agent.",
  sourceBranch: "claude/simplify-beneficiary-check",
  targetBranch: "main",
  updatedAt: "2026-11-05T15:00:00Z",
  url: null,
  commitMessages: ["Simplifier la validation\n\nCo-authored-by: Claude <noreply@anthropic.com>"],
  approvals: [],
  files: [
    {
      path: "src/main/java/bank/payment/BeneficiaryCheck.java",
      added: [{ line: 40, text: "return true;" }],
      removed: [{ line: 40, text: "if (!iban.isValid()) throw new InvalidBeneficiary();" }],
    },
  ],
};

const DIRECT_PUSH: DeliveryInput = {
  kind: "push",
  ref: "9f3c2e1a",
  sha: "9f3c2e1a7b",
  title: "fix plafond urgent",
  authorId: "n.faure",
  at: "2026-11-05T22:40:00Z",
  url: null,
  approvals: [],
  commits: [commit("9f3c2e1a7b", "2026-11-05T22:40:00Z", "fix plafond urgent", "Nicolas Faure")],
  tickets: [],
  change: {
    id: "9f3c2e1a7b",
    authorId: "n.faure",
    title: "fix plafond urgent",
    description: "",
    sourceBranch: "main",
    commitMessages: ["fix plafond urgent"],
    approvals: [],
    files: [
      {
        path: "src/main/java/bank/payment/TransferLimits.java",
        added: [{ line: 12, text: "static final long PRO_LIMIT = 5_000_000;" }],
        removed: [{ line: 12, text: "static final long PRO_LIMIT = 50_000;" }],
      },
    ],
  },
};

const ticket = (key: string, title: string, status: string, done: boolean): TicketItem => ({
  key,
  title,
  status,
  done,
  tracker: "jira",
  url: null,
  updatedAt: "2026-11-01T10:00:00Z",
});

/** Extras by demo project; projects not listed get the merges of their own only. */
const EXTRAS: Record<string, { deliveries: DeliveryInput[]; tickets: TicketItem[] }> = {
  "qis-dist-cms": {
    deliveries: [merged(AGENT_CHANGE)],
    tickets: [
      ticket("PAY-42", "Plafond des virements pour les comptes professionnels", "Livré", true),
      ticket("PAY-63", "Double validation au-delà de 100 000 €", "Livré", true),
    ],
  },
  "qis-job": {
    deliveries: [DIRECT_PUSH],
    tickets: [ticket("PAY-71", "Relance automatique des virements rejetés", "Terminé", true)],
  },
  "treso-api": {
    deliveries: [],
    tickets: [ticket("TRE-25", "Journal d'audit des habilitations", "Done", true)],
  },
};

export function demoTrace(projectId: string): Traceability {
  const extra = EXTRAS[projectId] ?? { deliveries: [], tickets: [] };
  return traceProject({
    tickets: extra.tickets,
    specs: DEMO_SPECS,
    deliveries: [
      ...DEMO_CHANGES.filter((c) => c.projectId === projectId).map(merged),
      ...extra.deliveries,
    ],
    policy: DEMO_POLICY,
    people: DEMO_PEOPLE,
    since: SINCE,
  });
}

/** Demo projects that have something to trace, for the portfolio. */
export const DEMO_TRACED = [
  ...new Set([...DEMO_CHANGES.map((c) => c.projectId), ...Object.keys(EXTRAS)]),
];
