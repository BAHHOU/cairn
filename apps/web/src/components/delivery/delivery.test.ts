import {
  blockingAccesses,
  deliveryBoard,
  deliveryRisks,
  filledPhases,
  formatMinutes,
  leadTimeTo,
  setupEffort,
  stepsOfPhase,
} from "@cairn/shared";
import { describe, expect, it } from "vitest";
import { QIS_DELIVERY } from "../../lib/api/delivery-data";
import { QIS_ONBOARDING } from "../../lib/api/onboarding-data";

const pipeline = QIS_DELIVERY;
const onboarding = QIS_ONBOARDING;

describe("delivery board", () => {
  it("separates the shared CI from the per-environment lanes", () => {
    const board = deliveryBoard(pipeline);
    expect(board.ci.every((s) => !s.envId)).toBe(true);
    expect(board.lanes.map((l) => l.env.id)).toEqual(["env-dev", "env-hom", "env-prod"]);
  });

  it("orders lanes by rank rather than by position in the array", () => {
    const shuffled = {
      ...pipeline,
      environments: [...pipeline.environments].reverse(),
    };
    expect(deliveryBoard(shuffled).lanes.map((l) => l.env.rank)).toEqual([0, 1, 2]);
  });

  it("accumulates machine time: production costs everything before it", () => {
    const board = deliveryBoard(pipeline);
    const [dev, hom, prod] = board.lanes;
    if (!dev || !hom || !prod) throw new Error("expected three lanes");
    expect(dev.leadTimeMin).toBeGreaterThan(board.ciMinutes);
    expect(hom.leadTimeMin).toBeGreaterThan(dev.leadTimeMin);
    expect(prod.leadTimeMin).toBeGreaterThan(hom.leadTimeMin);
  });

  it("never folds the approval wait into the machine time", () => {
    const board = deliveryBoard(pipeline);
    const prod = board.lanes[2];
    if (!prod) throw new Error("expected a production lane");
    const machine = pipeline.stages.reduce((sum, s) => sum + s.durationP50Min, 0);
    expect(prod.leadTimeMin).toBe(machine);
    expect(prod.waitMin).toBeGreaterThan(0);
  });

  it("counts no wait for an environment that needs no approval", () => {
    const dev = deliveryBoard(pipeline).lanes[0];
    if (!dev) throw new Error("expected a dev lane");
    expect(dev.env.approval.required).toBe(false);
    expect(dev.waitMin).toBe(0);
  });

  it("answers the lead time of a named environment, and null for an unknown one", () => {
    expect(leadTimeTo(pipeline, "env-prod")).toBeGreaterThan(0);
    expect(leadTimeTo(pipeline, "env-inexistant")).toBeNull();
  });
});

describe("delivery risks", () => {
  const risks = deliveryRisks(pipeline);
  const ids = risks.map((r) => r.id);

  it("flags a security stage that cannot fail the build", () => {
    expect(ids).toContain("risk-nonblocking-s-sast");
  });

  it("flags real data sitting behind no blocking security stage", () => {
    expect(ids).toContain("risk-data-env-prod");
  });

  it("flags a manual gate nobody owns, and spares the one that is owned", () => {
    expect(ids).toContain("risk-approval-env-hom");
    expect(ids).not.toContain("risk-approval-env-prod");
  });

  it("flags a deployment nobody verifies, and spares the ones that are verified", () => {
    expect(ids).toContain("risk-verify-env-dev");
    expect(ids).not.toContain("risk-verify-env-hom");
    expect(ids).not.toContain("risk-verify-env-prod");
  });

  it("says nothing about a rollback that has been rehearsed", () => {
    expect(ids).not.toContain("risk-rollback-untested");
  });

  it("notices when the waiting outweighs the whole technical chain", () => {
    expect(ids).toContain("risk-wait-dominates");
  });

  it("sorts the worst first", () => {
    const rank = { blocker: 0, critical: 1, major: 2, minor: 3 } as const;
    const ranks = risks.map((r) => rank[r.severity]);
    expect([...ranks].sort((a, b) => a - b)).toEqual(ranks);
  });

  it("points every finding at a file", () => {
    for (const risk of risks) expect(risk.sources.length).toBeGreaterThan(0);
  });

  it("stays quiet on a chain that breaks none of the rules", () => {
    const clean = {
      ...pipeline,
      stages: pipeline.stages.map((s) => ({ ...s, blocking: true })),
      environments: pipeline.environments.map((e) => ({
        ...e,
        dataKind: "synthetic" as const,
        approval: e.approval.required
          ? { ...e.approval, who: "Quelqu'un", waitP50Min: 5 }
          : e.approval,
      })),
    };
    // dev still has no verify stage, which is the only remaining finding.
    expect(deliveryRisks(clean).map((r) => r.id)).toEqual(["risk-verify-env-dev"]);
  });
});

describe("formatMinutes", () => {
  it("keeps minutes below an hour", () => {
    expect(formatMinutes(45)).toBe("45 min");
  });

  it("drops the minutes when there are none", () => {
    expect(formatMinutes(120)).toBe("2 h");
  });

  it("pads so that hours line up in a column", () => {
    expect(formatMinutes(125)).toBe("2 h 05");
  });
});

describe("onboarding effort", () => {
  it("never adds keyboard time and calendar waiting together", () => {
    const effort = setupEffort(onboarding);
    expect(effort.handsOnMin).toBeGreaterThan(0);
    expect(effort.waitingDays).toBeGreaterThan(0);
  });

  it("leaves optional steps out unless asked", () => {
    const required = setupEffort(onboarding).handsOnMin;
    const all = setupEffort(onboarding, { includeOptional: true }).handsOnMin;
    expect(all).toBeGreaterThan(required);
  });

  it("takes the slowest access, not the sum: requests are filed in parallel", () => {
    const slowest = Math.max(...onboarding.accesses.map((a) => a.leadTimeDays));
    expect(setupEffort(onboarding).waitingDays).toBe(slowest);
  });
});

describe("onboarding ordering", () => {
  it("lists blocking accesses slowest first", () => {
    const days = blockingAccesses(onboarding).map((a) => a.leadTimeDays);
    expect([...days].sort((a, b) => b - a)).toEqual(days);
  });

  it("keeps only the accesses that actually stop the work", () => {
    expect(blockingAccesses(onboarding).every((a) => a.blocking)).toBe(true);
  });

  it("reports only phases that have steps", () => {
    const phases = filledPhases(onboarding);
    expect(phases.length).toBeGreaterThan(0);
    for (const phase of phases) expect(stepsOfPhase(onboarding, phase).length).toBeGreaterThan(0);
  });

  it("puts the configuration before the services it is needed by", () => {
    const phases = filledPhases(onboarding);
    expect(phases.indexOf("configuration")).toBeLessThan(phases.indexOf("services"));
  });

  it("ends with the verification, whatever order the steps were declared in", () => {
    const phases = filledPhases(onboarding);
    expect(phases[phases.length - 1]).toBe("verification");
  });

  it("accounts for every step exactly once across the phases", () => {
    const counted = filledPhases(onboarding).flatMap((p) => stepsOfPhase(onboarding, p));
    expect(counted.map((s) => s.id).sort()).toEqual(onboarding.steps.map((s) => s.id).sort());
  });
});

describe("onboarding seed integrity", () => {
  it("gives every step something to recognise success by", () => {
    for (const step of onboarding.steps) {
      expect(step.expect.length).toBeGreaterThan(0);
      expect(step.durationMin).toBeGreaterThan(0);
    }
  });

  it("cites a file for every step and prerequisite", () => {
    for (const step of onboarding.steps) expect(step.sources.length).toBeGreaterThan(0);
    for (const prereq of onboarding.prereqs) expect(prereq.sources.length).toBeGreaterThan(0);
  });

  it("gives every known failure both a cause and a fix", () => {
    for (const pitfall of onboarding.pitfalls) {
      expect(pitfall.symptom.length).toBeGreaterThan(0);
      expect(pitfall.cause.length).toBeGreaterThan(0);
      expect(pitfall.fix.length).toBeGreaterThan(0);
    }
  });

  it("names a maintainer, so the page has somebody to be wrong at", () => {
    expect(onboarding.maintainer.length).toBeGreaterThan(0);
  });
});
