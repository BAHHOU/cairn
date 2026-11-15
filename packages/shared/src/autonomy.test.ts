import { describe, expect, it } from "vitest";
import { AUTONOMY_GATES, computeAutonomy } from "./autonomy";
import { CHECK_IDS, type CheckId, type CheckStatus, type Readiness } from "./readiness";

function readiness(statuses: Partial<Record<CheckId, CheckStatus>> = {}): Readiness {
  return {
    score: 80,
    verdict: "ready",
    axes: [],
    gaps: [],
    blockers: 0,
    // Every check passes unless told otherwise; the axis does not matter to the ladder.
    checks: CHECK_IDS.map((id) => ({ id, axis: "documentation", status: statuses[id] ?? "pass" })),
  };
}

describe("computeAutonomy", () => {
  it("gates every readiness check exactly once", () => {
    const gated = Object.values(AUTONOMY_GATES).flat();
    expect([...gated].sort()).toEqual([...CHECK_IDS].sort());
  });

  it("reaches the top only when every check passes", () => {
    expect(computeAutonomy(readiness())).toEqual({ level: 5, next: null });
  });

  it("stays at level 0 with a committed secret, whatever else passes", () => {
    const a = computeAutonomy(readiness({ "sec.noToken": "fail" }));
    expect(a.level).toBe(0);
    expect(a.next).toEqual({ level: 1, blockers: [{ id: "sec.noToken", status: "fail" }] });
  });

  it("stops at the first closed gate even when higher gates would pass", () => {
    const a = computeAutonomy(readiness({ "ai.instructions": "fail" }));
    expect(a.level).toBe(2);
    expect(a.next?.level).toBe(3);
  });

  it("keeps a gate closed on a check the scan could not evaluate, and says so", () => {
    const a = computeAutonomy(readiness({ "doc.tests": "unknown", "doc.build": "fail" }));
    expect(a.level).toBe(3);
    expect(a.next?.blockers).toEqual([
      { id: "doc.build", status: "fail" },
      { id: "doc.tests", status: "unknown" },
    ]);
  });

  it("treats a check missing from the readiness as not evaluated", () => {
    const r = readiness();
    r.checks = r.checks.filter((c) => c.id !== "doc.readme");
    expect(computeAutonomy(r).next?.blockers).toEqual([{ id: "doc.readme", status: "unknown" }]);
  });
});
