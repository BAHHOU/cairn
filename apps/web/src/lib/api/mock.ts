import {
  type CairnApi,
  can,
  computeBlastRadius,
  type Issue,
  type OrgOverview,
  type Project,
  SEVERITIES,
  type Severity,
  type TokenSummary,
  type Viewer,
} from "@cairn/shared";
import { ARCHITECTURES } from "./architecture-data";
import {
  EURO_PER_MILLION_TOKENS,
  ISSUES,
  MONTH_DAY,
  MONTH_DAYS,
  ORG_MONTHLY,
  PROJECTS,
  TEAM_QUOTA,
  TOKENS,
} from "./mock-data";

const SEVERITY_RANK: Record<Severity, number> = { blocker: 0, critical: 1, major: 2, minor: 3 };

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/**
 * Demo implementation. It applies the same visibility rules the real server will apply,
 * so the UI can be validated with testers before any backend exists.
 */
export function createMockApi(viewer: Viewer): CairnApi {
  const seesAllTeams = can(viewer.role, "see.allTeams");
  const seesTokens = can(viewer.role, "see.tokens");
  const seesEuros = can(viewer.role, "see.euros");

  const scopedRaw = PROJECTS.filter((p) => seesAllTeams || p.team === viewer.team);
  const scopedIds = new Set(scopedRaw.map((p) => p.id));

  const scopedIssues = ISSUES.filter((i) => scopedIds.has(i.projectId));
  const issuesFor = (projectId: string) => scopedIssues.filter((i) => i.projectId === projectId);

  const projects: Project[] = scopedRaw.map((p) => ({ ...p, openIssues: issuesFor(p.id).length }));

  /** The developer role never receives token figures. */
  const present = (i: Issue): Issue => {
    if (seesTokens) return i;
    const { wastedTokensMonth: _hidden, ...rest } = i;
    return rest;
  };

  return {
    async overview(): Promise<OrgOverview> {
      const trend = Array.from({ length: 6 }, (_, k) =>
        Math.round(avg(projects.map((p) => p.trend[k] ?? 0))),
      );
      const gates = { passed: 0, warning: 0, failed: 0 };
      const maturityDistribution: OrgOverview["maturityDistribution"] = [0, 0, 0, 0, 0, 0];
      for (const p of projects) {
        gates[p.gate] += 1;
        maturityDistribution[p.maturity] += 1;
      }
      const issuesBySeverity = Object.fromEntries(SEVERITIES.map((s) => [s, 0])) as Record<
        Severity,
        number
      >;
      for (const i of scopedIssues) issuesBySeverity[i.severity] += 1;

      const next = scopedIssues
        .filter((i) => i.fixable)
        .sort(
          (a, b) =>
            SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || a.effortMin - b.effortMin,
        )[0];

      return {
        projectCount: projects.length,
        avgScore: Math.round(avg(projects.map((p) => p.score))),
        scoreTrend: trend,
        avgMaturity: Math.round(avg(projects.map((p) => p.maturity)) * 10) / 10,
        gates,
        maturityDistribution,
        issuesBySeverity,
        priorities: [...projects].sort((a, b) => a.score - b.score).slice(0, 4),
        nextAction: next ? present(next) : null,
      };
    },

    projects: {
      async list() {
        return projects;
      },
      async get(id) {
        return projects.find((p) => p.id === id) ?? null;
      },
      /** Scoped like everything else: a graph the viewer may not see does not exist. */
      async architecture(id) {
        if (!scopedIds.has(id)) return null;
        return ARCHITECTURES[id] ?? null;
      },
      async blastRadius(id, nodeId) {
        const graph = scopedIds.has(id) ? ARCHITECTURES[id] : undefined;
        if (!graph) return null;
        const radius = computeBlastRadius(graph, nodeId);
        /** Only surface issues the viewer is allowed to see. */
        const visible = new Set(scopedIssues.map((i) => i.id));
        return {
          ...radius,
          impactedIssueIds: radius.impactedIssueIds.filter((i) => visible.has(i)),
        };
      },
    },

    issues: {
      async list(filter) {
        return scopedIssues
          .filter((i) => !filter?.projectId || i.projectId === filter.projectId)
          .filter((i) => !filter?.severity || i.severity === filter.severity)
          .sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity])
          .map(present);
      },
    },

    tokens: {
      async summary(): Promise<TokenSummary | null> {
        if (!seesTokens) return null;
        const rows = projects.map((p) => ({
          projectId: p.id,
          projectName: p.name,
          team: p.team,
          tokens: TOKENS[p.id]?.tokens ?? 0,
          wasteShare: TOKENS[p.id]?.wasteShare ?? 0,
        }));
        const consumed = rows.reduce((s, r) => s + r.tokens, 0);
        const orgConsumed = Object.values(TOKENS).reduce((s, t) => s + t.tokens, 0);
        const teams = new Set(projects.map((p) => p.team));
        const quota = [...teams].reduce((s, t) => s + (TEAM_QUOTA[t] ?? 0), 0);
        const ratio = orgConsumed ? consumed / orgConsumed : 0;
        return {
          scope: seesAllTeams ? "org" : "team",
          label: seesAllTeams ? "Toutes les équipes" : viewer.team,
          consumed,
          quota,
          projection: Math.round((consumed * MONTH_DAYS) / MONTH_DAY),
          ...(seesEuros
            ? {
                euros: Math.round(
                  ((consumed * MONTH_DAYS) / MONTH_DAY / 1_000_000) * EURO_PER_MILLION_TOKENS,
                ),
              }
            : {}),
          provenance: { measured: 52, declared: 31, estimated: 17 },
          monthly: ORG_MONTHLY.map((m) => Math.round(m * ratio)),
          byProject: rows.sort((a, b) => b.tokens - a.tokens),
        };
      },
    },
  };
}
