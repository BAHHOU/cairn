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

export const AXIS_LABEL: Record<Axis, string> = {
  documentation: "Documentation",
  aiContext: "Contexte IA",
  localStart: "Démarrage local",
  configuration: "Configuration",
  security: "Sécurité du contexte",
};

export type MaturityLevel = 0 | 1 | 2 | 3 | 4 | 5;

export const MATURITY_NAMES = [
  "Non préparé",
  "Assisté",
  "Guidé",
  "Contexte maîtrisé",
  "Prêt pour agents",
  "Optimisé",
] as const;

export const MATURITY_USAGE = [
  "Questions en chat uniquement, pas de génération de code sur les modules sensibles",
  "Chat et complétion en ligne",
  "Chat avec contexte de fichiers, petites modifications",
  "Mode agent sur des tâches petites et bien définies",
  "Mode agent sur des tâches normales, revue selon le risque",
  "Agents autonomes avec budgets et garde-fous",
] as const;

export type GateStatus = "passed" | "warning" | "failed";
export type Severity = "blocker" | "critical" | "major" | "minor";
export const SEVERITIES = ["blocker", "critical", "major", "minor"] as const;

export type IssueType =
  | "context-leak"
  | "doc-drift"
  | "token-hog"
  | "ambiguity"
  | "broken-onboarding";

export const ISSUE_TYPE_LABEL: Record<IssueType, string> = {
  "context-leak": "Fuite de contexte",
  "doc-drift": "Dérive documentaire",
  "token-hog": "Gouffre à tokens",
  ambiguity: "Ambiguïté",
  "broken-onboarding": "Démarrage cassé",
};

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
