import type { Role } from "./roles";
import type { Provenance } from "./usage";

export const AXES = [
  "documentation",
  "aiContext",
  "localStart",
  "configuration",
  "security",
] as const;
export type Axis = (typeof AXES)[number];

export type MaturityLevel = 0 | 1 | 2 | 3 | 4 | 5;

/** Names and recommended AI usage per level: `domain.maturity` and `domain.maturityUsage`. */
export const MATURITY_LEVELS = [0, 1, 2, 3, 4, 5] as const satisfies readonly MaturityLevel[];

export type GateStatus = "passed" | "warning" | "failed";
export type Severity = "blocker" | "critical" | "major" | "minor";
export const SEVERITIES = ["blocker", "critical", "major", "minor"] as const;

export type IssueType =
  | "context-leak"
  | "doc-drift"
  | "token-hog"
  | "ambiguity"
  | "broken-onboarding";

/** The person looking at the screen. Resolved from the session, never from the client. */
export interface Viewer {
  name: string;
  role: Role;
  team: string;
}

export interface Project {
  id: string;
  name: string;
  team: string;
  tech: string[];
  provider: "GitLab" | "GitHub" | "Azure DevOps";
  score: number;
  axes: Record<Axis, number>;
  maturity: MaturityLevel;
  /** Last six monthly scores, oldest first. */
  trend: number[];
  openIssues: number;
  gate: GateStatus;
  lastScan: string;
}

export interface Issue {
  id: string;
  projectId: string;
  projectName: string;
  rule: string;
  type: IssueType;
  severity: Severity;
  path: string;
  line?: number;
  title: string;
  why: string;
  effortMin: number;
  fixable: boolean;
  /** Hidden from the developer role: the server never sends it. */
  wastedTokensMonth?: number;
}

export interface OrgOverview {
  projectCount: number;
  avgScore: number;
  scoreTrend: number[];
  avgMaturity: number;
  gates: Record<GateStatus, number>;
  maturityDistribution: [number, number, number, number, number, number];
  issuesBySeverity: Record<Severity, number>;
  priorities: Project[];
  nextAction: Issue | null;
}

export interface TokenProjectRow {
  projectId: string;
  projectName: string;
  team: string;
  tokens: number;
  wasteShare: number;
}

export interface TokenSummary {
  scope: "org" | "team";
  label: string;
  consumed: number;
  quota: number;
  projection: number;
  /** Only present for roles allowed to see money. */
  euros?: number;
  provenance: Record<Provenance, number>;
  /** Last six months, oldest first. */
  monthly: number[];
  byProject: TokenProjectRow[];
}
