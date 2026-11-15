import { describe, expect, it } from "vitest";
import type { DocsView, OnboardingView } from "./guide";
import {
  computeReadiness,
  HUGE_FILE_TOKENS,
  INSTRUCTION_TOKEN_BUDGET,
  type ReadinessInput,
  tokensByKind,
  topWithOther,
} from "./readiness";
import type { ScanReport } from "./scan";

function report(
  overrides: Partial<ScanReport["stats"]> = {},
  findings: ScanReport["findings"] = [],
) {
  return {
    schemaVersion: 1,
    commit: "abc",
    generatedAt: "2026-10-23T10:00:00.000Z",
    durationMs: 1200,
    findings,
    incremental: { mode: "full", previousCommit: null, reused: 0, analysed: 10, removed: 0 },
    counts: {
      archNodes: 3,
      archEdges: 2,
      archViolations: 0,
      codeNodes: 5,
      codeEdges: 4,
      unreadable: 0,
    },
    stats: {
      files: 10,
      lines: 1000,
      bytes: 40_000,
      tokens: 10_000,
      tokensAiRelevant: 9_000,
      tokensNoise: 1_000,
      byKind: [
        { kind: "data", files: 2, bytes: 4000, tokens: 1000 },
        { kind: "source", files: 8, bytes: 36_000, tokens: 9000 },
        { kind: "binary", files: 1, bytes: 9000, tokens: 0 },
      ],
      byLanguage: [],
      modules: [],
      largest: [{ path: "src/App.java", bytes: 8000, tokens: 2000, kind: "source" }],
      noise: [{ path: "data/seed.json", bytes: 4000, tokens: 1000, kind: "data" }],
      structure: {
        javaTypes: 0,
        controllers: 0,
        endpoints: 0,
        services: 0,
        repositories: 0,
        entities: 0,
        schedulers: 0,
        listeners: 0,
        angularComponents: 0,
        testFiles: 0,
        sourceFiles: 8,
      },
      ...overrides,
    },
  } satisfies ScanReport;
}

const ALL_COVERAGE = ["readme", "install", "build", "run", "tests", "architecture"];

function docs(present: string[], extra: Partial<DocsView> = {}): DocsView {
  return {
    files: [{ path: "README.md", kind: "readme", words: 300, headings: 4, tokens: 400 }],
    outline: null,
    coverage: ALL_COVERAGE.map((id) => ({
      id,
      label: id,
      present: present.includes(id),
      ...(present.includes(id) ? { evidence: { path: "README.md", line: 1 } } : {}),
      hint: "",
    })),
    drift: [],
    ai: [
      { label: "AGENTS.md", path: "AGENTS.md", present: false },
      { label: "CLAUDE.md", path: "CLAUDE.md", present: false },
    ],
    stats: {
      files: 1,
      words: 300,
      tokens: 400,
      tokenShare: 0.04,
      modulesWithReadme: 1,
      modules: 1,
    },
    ...extra,
  };
}

const onboarding = (extra: Partial<OnboardingView> = {}): OnboardingView => ({
  readme: { path: "README.md" },
  tools: [
    { id: "java", label: "Java", version: "21", basis: "pinned", source: { path: "pom.xml" } },
  ],
  steps: [
    {
      id: "s1",
      phase: "build",
      title: "Build",
      commands: ["mvn package"],
      source: { path: "README.md", line: 10 },
    },
  ],
  warnings: [],
  localPaths: [],
  urls: [],
  secretsToObtain: [],
  findings: [],
  ...extra,
});

const input = (overrides: Partial<ReadinessInput> = {}): ReadinessInput => ({
  report: report(),
  docs: docs(ALL_COVERAGE),
  onboarding: onboarding(),
  aiIgnoreFiles: [".aiignore"],
  ...overrides,
});

const check = (r: ReturnType<typeof computeReadiness>, id: string) =>
  r.checks.find((c) => c.id === id)?.status;

describe("computeReadiness", () => {
  it("scores each axis as the share of evaluated checks that pass", () => {
    const r = computeReadiness(input());
    const doc = r.axes.find((a) => a.axis === "documentation");
    expect(doc).toMatchObject({ evaluated: 7, passed: 7, score: 100 });
    // No instruction file: one AI-context check fails, the length check cannot be evaluated.
    const ai = r.axes.find((a) => a.axis === "aiContext");
    expect(ai).toMatchObject({ total: 5, evaluated: 4, passed: 3, score: 75 });
    expect(check(r, "ai.instructionsShort")).toBe("unknown");
  });

  it("gives no score to an axis the scan cannot evaluate", () => {
    const r = computeReadiness(input({ docs: null, onboarding: null }));
    expect(r.axes.find((a) => a.axis === "documentation")?.score).toBeNull();
    expect(r.axes.find((a) => a.axis === "localStart")?.score).toBeNull();
    expect(r.axes.find((a) => a.axis === "configuration")).toMatchObject({ score: null, total: 0 });
    // Security is always evaluated from the findings, so the overall score still exists.
    expect(r.score).not.toBeNull();
  });

  it("averages only the axes that have a score", () => {
    const r = computeReadiness(input());
    const scored = r.axes.filter((a) => a.score !== null).map((a) => a.score as number);
    expect(r.score).toBe(Math.round(scored.reduce((s, v) => s + v, 0) / scored.length));
  });

  it("never treats a missing file index as a missing ignore file", () => {
    const r = computeReadiness(input({ aiIgnoreFiles: null }));
    expect(check(r, "ai.ignore")).toBe("unknown");
    expect(r.gaps.some((g) => g.id === "ai.ignore")).toBe(false);
  });

  it("blocks the verdict on a committed secret and puts it first", () => {
    const r = computeReadiness(
      input({
        report: report({}, [
          { rule: "hardcoded-secret", path: "src/app.yml", line: 4, key: "password" },
        ]),
      }),
    );
    expect(r.verdict).toBe("blocked");
    expect(r.blockers).toBe(1);
    expect(r.gaps[0]).toMatchObject({
      id: "sec.hardcoded-secret",
      severity: "blocker",
      file: { path: "src/app.yml", line: 4 },
    });
  });

  it("estimates the tokens an ignore file saves as the noise tokens", () => {
    const r = computeReadiness(input({ aiIgnoreFiles: [] }));
    expect(r.gaps.find((g) => g.id === "ai.ignore")).toMatchObject({
      tokensSaved: 1000,
      file: { path: ".aiignore", create: true },
    });
  });

  it("flags permanent instructions over the budget with the excess as savings", () => {
    const long = INSTRUCTION_TOKEN_BUDGET + 300;
    const r = computeReadiness(
      input({
        docs: docs(ALL_COVERAGE, {
          ai: [{ label: "AGENTS.md", path: "AGENTS.md", present: true }],
          files: [{ path: "AGENTS.md", kind: "other", words: 900, headings: 3, tokens: long }],
        }),
      }),
    );
    expect(check(r, "ai.instructions")).toBe("pass");
    expect(r.gaps.find((g) => g.id === "ai.instructionsShort")).toMatchObject({
      tokensSaved: 300,
      file: { path: "AGENTS.md" },
    });
  });

  it("counts only readable, non-noise files as too large", () => {
    const r = computeReadiness(
      input({
        report: report({
          largest: [
            { path: "data/dump.json", bytes: 900_000, tokens: HUGE_FILE_TOKENS * 5, kind: "data" },
            { path: "src/Big.java", bytes: 100_000, tokens: HUGE_FILE_TOKENS + 1, kind: "source" },
          ],
        }),
      }),
    );
    expect(r.gaps.find((g) => g.id === "ai.hugeFiles")).toMatchObject({
      tokensSaved: HUGE_FILE_TOKENS + 1,
      params: { count: 1 },
    });
  });

  it("groups missing quick-start sections into one action on the README", () => {
    const r = computeReadiness(input({ docs: docs(["readme", "tests", "architecture"]) }));
    expect(r.gaps.find((g) => g.id === "doc.quickStart")).toMatchObject({
      params: { count: 3 },
      file: { path: "README.md" },
    });
  });

  it("sorts gaps by severity, then by tokens saved", () => {
    const r = computeReadiness(input({ aiIgnoreFiles: [], docs: docs([]) }));
    const ranks = { blocker: 0, critical: 1, major: 2, minor: 3 };
    const order = r.gaps.map((g) => ranks[g.severity]);
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it("is deterministic", () => {
    expect(computeReadiness(input())).toEqual(computeReadiness(input()));
  });
});

describe("token aggregations", () => {
  it("keeps the fixed kind order and drops kinds without tokens", () => {
    expect(tokensByKind(report()).map((k) => k.kind)).toEqual(["source", "data"]);
    expect(tokensByKind(report()).find((k) => k.kind === "data")?.noise).toBe(true);
  });

  it("folds everything past the limit into one bucket", () => {
    const items = [5, 1, 4, 2, 3].map((tokens) => ({ tokens }));
    const { top, otherTokens, otherCount } = topWithOther(items, 3);
    expect(top.map((t) => t.tokens)).toEqual([5, 4, 3]);
    expect(otherTokens).toBe(3);
    expect(otherCount).toBe(2);
  });
});
