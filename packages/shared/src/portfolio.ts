/**
 * AI readiness across many projects: where the portfolio stands and which fixes pay off most.
 *
 * Only projects with a readiness score count in the average — an unscanned project is not a zero.
 * Fixes are grouped by gap id, so one instruction ("add an ignore file") that unblocks twelve
 * projects ranks above twelve unrelated fixes; its token saving is the sum of the measured ones.
 */

import { type Autonomy, computeAutonomy } from "./autonomy";
import { MATURITY_LEVELS, type MaturityLevel, SEVERITIES, type Severity } from "./domain";
import type { GapId, Readiness, Verdict } from "./readiness";

export const VERDICTS = [
  "ready",
  "partial",
  "notReady",
  "blocked",
  "unknown",
] as const satisfies readonly Verdict[];

export interface PortfolioProject {
  id: string;
  readiness: Readiness;
}

export interface PortfolioFix {
  gap: GapId;
  /** The worst severity this gap has in any project. */
  severity: Severity;
  projects: string[];
  /** Sum of the measured savings; null when no project has an honest figure. */
  tokensSaved: number | null;
}

export interface PortfolioReadiness {
  projects: number;
  /** Mean of the projects that have a score. Null when none has. */
  averageScore: number | null;
  byVerdict: Record<Verdict, number>;
  byLevel: Record<MaturityLevel, number>;
  /** Projects with a committed secret. */
  blocked: number;
  autonomy: Record<string, Autonomy>;
  /** Fixes ranked by the number of projects they help, then severity, then tokens saved. */
  fixes: PortfolioFix[];
}

const zeroes = <K extends string | number>(keys: readonly K[]) =>
  Object.fromEntries(keys.map((k) => [k, 0])) as Record<K, number>;

const SEVERITY_RANK = Object.fromEntries(SEVERITIES.map((s, i) => [s, i])) as Record<
  Severity,
  number
>;

export function computePortfolio(entries: PortfolioProject[]): PortfolioReadiness {
  const byVerdict = zeroes(VERDICTS);
  const byLevel = zeroes(MATURITY_LEVELS);
  const autonomy: Record<string, Autonomy> = {};
  const fixes = new Map<GapId, PortfolioFix>();

  for (const { id, readiness } of entries) {
    byVerdict[readiness.verdict] += 1;
    const a = computeAutonomy(readiness);
    autonomy[id] = a;
    byLevel[a.level] += 1;
    for (const gap of readiness.gaps) {
      const fix = fixes.get(gap.id) ?? {
        gap: gap.id,
        severity: gap.severity,
        projects: [],
        tokensSaved: null,
      };
      if (!fix.projects.includes(id)) fix.projects.push(id);
      if (SEVERITY_RANK[gap.severity] < SEVERITY_RANK[fix.severity]) fix.severity = gap.severity;
      if (gap.tokensSaved !== null) fix.tokensSaved = (fix.tokensSaved ?? 0) + gap.tokensSaved;
      fixes.set(gap.id, fix);
    }
  }

  const scores = entries.map((e) => e.readiness.score).filter((s): s is number => s !== null);
  return {
    projects: entries.length,
    averageScore:
      scores.length > 0 ? Math.round(scores.reduce((s, v) => s + v, 0) / scores.length) : null,
    byVerdict,
    byLevel,
    blocked: entries.filter((e) => e.readiness.blockers > 0).length,
    autonomy,
    fixes: [...fixes.values()].sort(
      (a, b) =>
        b.projects.length - a.projects.length ||
        SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
        (b.tokensSaved ?? 0) - (a.tokensSaved ?? 0),
    ),
  };
}
