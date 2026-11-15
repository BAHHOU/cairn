import { describe, expect, it } from "vitest";
import type { DeliveryView, PipelineJobView, TopologyNode } from "./guide";
import { computeHealth, type HealthArea, type HealthInput } from "./health";
import type { Readiness } from "./readiness";
import type { ScanReport } from "./scan";

function readiness(overrides: Partial<Readiness> = {}): Readiness {
  return {
    score: 80,
    verdict: "ready",
    axes: [
      { axis: "documentation", score: 80, passed: 4, evaluated: 5, total: 7 },
      { axis: "localStart", score: 100, passed: 4, evaluated: 4, total: 4 },
    ],
    checks: [],
    gaps: [],
    blockers: 0,
    ...overrides,
  };
}

const report = (archNodes = 4, archViolations = 0) =>
  ({ counts: { archNodes, archViolations } }) as ScanReport;

function job(overrides: Partial<PipelineJobView> = {}): PipelineJobView {
  return {
    name: "job",
    stage: "test",
    role: "test",
    tools: [],
    trigger: "auto",
    conditions: [],
    blocking: true,
    needs: [],
    artifacts: [],
    reportsTests: false,
    pushes: [],
    flags: [],
    variables: [],
    ...overrides,
  } as PipelineJobView;
}

function delivery(
  jobs: PipelineJobView[],
  extra: Partial<DeliveryView> = {},
  nodes: Partial<TopologyNode>[] = [],
): DeliveryView {
  return {
    path: ".gitlab-ci.yml",
    provider: "gitlab",
    stages: [{ name: "all", jobs }],
    images: [],
    variables: [],
    environments: [],
    mergeRequestPipelines: true,
    includes: [],
    deploysToEnvironment: false,
    findings: [],
    counts: { jobs: jobs.length, manual: 0, nonBlocking: 0, images: 0 },
    topology: { nodes: nodes as TopologyNode[], edges: [], gaps: [] },
    ...extra,
  };
}

const COMPLETE = [job(), job({ role: "security", name: "sast" })];
const INFRA: Partial<TopologyNode>[] = [{ id: "k", role: "cluster", basis: "found" }];

function input(overrides: Partial<HealthInput> = {}): HealthInput {
  return {
    readiness: readiness(),
    report: report(),
    delivery: delivery(COMPLETE, {}, INFRA),
    guidesScanned: true,
    ...overrides,
  };
}

const signal = (i: HealthInput, area: HealthArea) =>
  computeHealth(i).signals.find((s) => s.area === area);

describe("computeHealth", () => {
  it("is healthy when every area it can see is good", () => {
    const brief = computeHealth(input());
    expect(brief.verdict).toBe("healthy");
    expect(brief.signals.map((s) => s.light)).toEqual(Array(6).fill("good"));
    expect(brief.notChecked.length).toBeGreaterThan(0);
  });

  it("is not safe as soon as a secret is committed, whatever the rest says", () => {
    const brief = computeHealth(
      input({ readiness: readiness({ blockers: 2, verdict: "blocked" }) }),
    );
    expect(brief.verdict).toBe("notSafe");
    expect(signal(input({ readiness: readiness({ blockers: 2 }) }), "security")).toMatchObject({
      light: "risk",
      reason: "secrets",
      params: { count: 2 },
    });
  });

  it("reads a missing pipeline as a risk only when the guides ran", () => {
    expect(signal(input({ delivery: null }), "delivery")).toMatchObject({
      light: "risk",
      reason: "noPipeline",
    });
    expect(signal(input({ delivery: null, guidesScanned: false }), "delivery")).toMatchObject({
      light: "unknown",
      reason: "rescan",
    });
  });

  it("flags a pipeline without tests before anything else", () => {
    const d = delivery([job({ role: "build" })]);
    expect(signal(input({ delivery: d }), "delivery")).toMatchObject({
      light: "risk",
      reason: "noTests",
    });
  });

  it("counts a job that publishes test reports as testing", () => {
    const d = delivery([job({ role: "build", reportsTests: true }), job({ role: "security" })]);
    expect(signal(input({ delivery: d }), "delivery")?.reason).toBe("complete");
  });

  it("asks to watch a pipeline without a security scan", () => {
    const d = delivery([job()]);
    expect(signal(input({ delivery: d }), "delivery")).toMatchObject({
      light: "watch",
      reason: "noSecurityScan",
    });
  });

  it("says infrastructure is described, never that it is secure", () => {
    expect(signal(input(), "infrastructure")).toMatchObject({
      light: "good",
      reason: "described",
      params: { count: 1 },
    });
  });

  it("warns when a pipeline deploys but nothing describes where", () => {
    const d = delivery(COMPLETE, { deploysToEnvironment: true });
    expect(signal(input({ delivery: d }), "infrastructure")).toMatchObject({
      light: "watch",
      reason: "notAsCode",
    });
  });

  it("does not count inferred or missing topology as described infrastructure", () => {
    const d = delivery(COMPLETE, {}, [
      { id: "a", role: "cluster", basis: "inferred" },
      { id: "b", role: "infrastructure", basis: "missing" },
    ]);
    expect(signal(input({ delivery: d }), "infrastructure")?.light).toBe("unknown");
  });

  it("does not turn green on a structure of one or two parts", () => {
    expect(signal(input({ report: report(1) }), "architecture")).toMatchObject({
      light: "unknown",
      reason: "tooFew",
      params: { count: 1 },
    });
    expect(signal(input({ report: report(3) }), "architecture")?.light).toBe("good");
  });

  it("keeps an unmapped architecture unknown and a violated one on watch", () => {
    expect(signal(input({ report: report(0) }), "architecture")?.light).toBe("unknown");
    expect(signal(input({ report: report(4, 3) }), "architecture")).toMatchObject({
      light: "watch",
      params: { count: 3 },
    });
  });

  it("grades knowledge from documentation and local start only", () => {
    const r = readiness({
      axes: [
        { axis: "documentation", score: 40, passed: 2, evaluated: 5, total: 7 },
        { axis: "localStart", score: 60, passed: 3, evaluated: 5, total: 4 },
        { axis: "security", score: 0, passed: 0, evaluated: 3, total: 3 },
      ],
    });
    expect(signal(input({ readiness: r }), "knowledge")).toMatchObject({
      light: "watch",
      reason: "partial",
      params: { score: 50 },
    });
  });

  it("does not call a brief of unknowns healthy", () => {
    const brief = computeHealth({
      readiness: readiness({ verdict: "unknown", score: null, axes: [] }),
      report: report(0),
      delivery: null,
      guidesScanned: false,
    });
    expect(brief.verdict).toBe("unknown");
  });
});
