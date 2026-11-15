import { describe, expect, it } from "vitest";
import { computePortfolio } from "./portfolio";
import { CHECK_IDS, type Readiness, type ReadinessGap } from "./readiness";

function readiness(
  score: number | null,
  verdict: Readiness["verdict"],
  gaps: ReadinessGap[] = [],
  blockers = 0,
): Readiness {
  return {
    score,
    verdict,
    axes: [],
    gaps,
    blockers,
    checks: CHECK_IDS.map((id) => ({
      id,
      axis: "documentation",
      status: blockers > 0 && id === "sec.noSecret" ? "fail" : "pass",
    })),
  };
}

const gap = (
  id: ReadinessGap["id"],
  severity: ReadinessGap["severity"],
  tokensSaved: number | null,
): ReadinessGap => ({ id, severity, tokensSaved, file: null });

describe("computePortfolio", () => {
  const portfolio = computePortfolio([
    { id: "a", readiness: readiness(80, "ready", [gap("ai.ignore", "major", 1000)]) },
    {
      id: "b",
      readiness: readiness(
        40,
        "blocked",
        [gap("sec.hardcoded-secret", "blocker", null), gap("ai.ignore", "critical", 500)],
        1,
      ),
    },
    { id: "c", readiness: readiness(null, "unknown", [gap("doc.readme", "major", null)]) },
  ]);

  it("averages only the projects that have a score", () => {
    expect(portfolio.projects).toBe(3);
    expect(portfolio.averageScore).toBe(60);
  });

  it("counts verdicts, autonomy levels and blocked projects", () => {
    expect(portfolio.byVerdict).toMatchObject({ ready: 1, blocked: 1, unknown: 1, partial: 0 });
    expect(portfolio.byLevel[0]).toBe(1);
    expect(portfolio.byLevel[5]).toBe(2);
    expect(portfolio.blocked).toBe(1);
    expect(portfolio.autonomy.b?.level).toBe(0);
  });

  it("ranks the fix that helps most projects first, at its worst severity, with summed savings", () => {
    expect(portfolio.fixes[0]).toEqual({
      gap: "ai.ignore",
      severity: "critical",
      projects: ["a", "b"],
      tokensSaved: 1500,
    });
  });

  it("keeps the saving unknown when no project measured one", () => {
    expect(portfolio.fixes.find((f) => f.gap === "doc.readme")?.tokensSaved).toBeNull();
  });

  it("ranks by severity between fixes that help as many projects", () => {
    const rest = portfolio.fixes.slice(1).map((f) => f.gap);
    expect(rest).toEqual(["sec.hardcoded-secret", "doc.readme"]);
  });

  it("is empty and has no average for an empty portfolio", () => {
    const empty = computePortfolio([]);
    expect(empty.averageScore).toBeNull();
    expect(empty.fixes).toEqual([]);
  });
});
