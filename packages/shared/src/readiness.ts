/**
 * AI readiness of an imported repository, computed from the scan alone.
 *
 * Every axis is the share of its checks that pass, over the checks the scan could evaluate: a check
 * without data is `unknown`, never counted as a failure, and an axis without any evaluated check has
 * no score at all. Nothing is weighted by opinion, nothing is extrapolated. The result carries ids
 * and values only; the words live in the message catalog (`readiness.*`).
 */

import type { Axis, Severity } from "./domain";
import type { DocsView, GuideSource, OnboardingView } from "./guide";
import {
  AI_NOISE_KINDS,
  FILE_KINDS,
  type FileKind,
  type FindingRule,
  type ScanReport,
} from "./scan";

/** Permanent instructions are read on every request: past this, they cost more than they guide. */
export const INSTRUCTION_TOKEN_BUDGET = 500;
/** Above this share of estimated tokens in data and generated files, an agent mostly reads noise. */
export const NOISE_SHARE_MAX = 0.2;
/** A readable file this large cannot be loaded whole into a working context. */
export const HUGE_FILE_TOKENS = 20_000;
export const VERDICT_READY = 75;
export const VERDICT_PARTIAL = 50;

/** Files AI assistants read to know what to leave out of their context. */
export const AI_IGNORE_FILES = [
  ".aiignore",
  ".aiexclude",
  ".cursorignore",
  ".copilotignore",
  ".claudeignore",
  ".codeiumignore",
] as const;

/** POSIX regex over repository paths, for the database lookup of `AI_IGNORE_FILES`. */
export const AI_IGNORE_PATTERN = `(^|/)(${AI_IGNORE_FILES.map((f) => f.replace(".", "\\.")).join("|")})$`;

/** Instruction files an assistant loads on every request (directories of rules are not counted). */
const PERMANENT_INSTRUCTIONS = ["AGENTS.md", "CLAUDE.md", ".github/copilot-instructions.md"];

export const CHECK_IDS = [
  "doc.readme",
  "doc.install",
  "doc.build",
  "doc.run",
  "doc.tests",
  "doc.architecture",
  "doc.noDrift",
  "ai.instructions",
  "ai.instructionsShort",
  "ai.ignore",
  "ai.noise",
  "ai.noHugeFiles",
  "local.steps",
  "local.tools",
  "local.pinned",
  "local.noMachinePaths",
  "sec.noSecret",
  "sec.noPrivateKey",
  "sec.noToken",
] as const;
export type CheckId = (typeof CHECK_IDS)[number];

export type CheckStatus = "pass" | "fail" | "unknown";

export interface ReadinessCheck {
  id: CheckId;
  axis: Axis;
  status: CheckStatus;
  params?: Record<string, number>;
  /** The file that proves the check, or that must change. */
  evidence?: GuideSource;
}

export interface AxisScore {
  axis: Axis;
  /** 0 to 100, or null when the scan could evaluate none of the axis checks. */
  score: number | null;
  passed: number;
  evaluated: number;
  total: number;
}

export const GAP_IDS = [
  "sec.hardcoded-secret",
  "sec.private-key",
  "sec.access-token",
  "ai.ignore",
  "ai.noise",
  "ai.instructions",
  "ai.instructionsShort",
  "ai.hugeFiles",
  "doc.readme",
  "doc.quickStart",
  "doc.drift",
  "doc.tests",
  "doc.architecture",
  "local.machinePaths",
  "local.pinned",
] as const;
export type GapId = (typeof GAP_IDS)[number];

export interface ReadinessGap {
  id: GapId;
  severity: Severity;
  /** Estimated tokens an agent stops paying once fixed. Null when no honest figure exists. */
  tokensSaved: number | null;
  /** Where to act. `create` when the file does not exist yet. */
  file: { path: string; line?: number; create?: boolean } | null;
  params?: Record<string, number>;
}

export type Verdict = "ready" | "partial" | "notReady" | "blocked" | "unknown";

export interface Readiness {
  /** Mean of the axes that have a score. Null when none has. */
  score: number | null;
  verdict: Verdict;
  axes: AxisScore[];
  checks: ReadinessCheck[];
  /** What to fix first: severity, then tokens saved. */
  gaps: ReadinessGap[];
  /** Secrets, private keys and tokens committed to the repository. */
  blockers: number;
}

export interface ReadinessInput {
  report: ScanReport;
  docs: DocsView | null;
  onboarding: OnboardingView | null;
  /** AI ignore files present in the scanned tree. Null when the file index was not available. */
  aiIgnoreFiles: string[] | null;
}

const AXIS_ORDER: Axis[] = [
  "documentation",
  "aiContext",
  "localStart",
  "configuration",
  "security",
];
const SEVERITY_RANK: Record<Severity, number> = { blocker: 0, critical: 1, major: 2, minor: 3 };
const SECRET_CHECK: Record<FindingRule, CheckId> = {
  "hardcoded-secret": "sec.noSecret",
  "private-key": "sec.noPrivateKey",
  "access-token": "sec.noToken",
};

const status = (known: boolean, ok: boolean): CheckStatus =>
  known ? (ok ? "pass" : "fail") : "unknown";

export function computeReadiness(input: ReadinessInput): Readiness {
  const { report, docs, onboarding, aiIgnoreFiles } = input;
  const { stats } = report;
  const checks: ReadinessCheck[] = [];
  const add = (check: ReadinessCheck) => checks.push(check);

  /* ---- documentation ---- */
  const coverage = new Map((docs?.coverage ?? []).map((c) => [c.id, c] as const));
  for (const [id, coverageId] of [
    ["doc.readme", "readme"],
    ["doc.install", "install"],
    ["doc.build", "build"],
    ["doc.run", "run"],
    ["doc.tests", "tests"],
    ["doc.architecture", "architecture"],
  ] as const) {
    const item = coverage.get(coverageId);
    add({
      id,
      axis: "documentation",
      status: status(Boolean(item), Boolean(item?.present)),
      ...(item?.evidence ? { evidence: item.evidence } : {}),
    });
  }
  const drift = docs?.drift ?? [];
  const firstDrift = drift.find((d) => d.source)?.source;
  add({
    id: "doc.noDrift",
    axis: "documentation",
    // With no document at all there is nothing to contradict: the check says nothing.
    status: status(Boolean(docs && docs.stats.files > 0), drift.length === 0),
    params: { count: drift.length },
    ...(firstDrift ? { evidence: firstDrift } : {}),
  });

  /* ---- AI context ---- */
  const presentInstructions = (docs?.ai ?? []).filter(
    (f) => f.present && PERMANENT_INSTRUCTIONS.includes(f.path),
  );
  add({
    id: "ai.instructions",
    axis: "aiContext",
    status: status(
      Boolean(docs),
      (docs?.ai ?? []).some((f) => f.present),
    ),
  });
  const instructionFiles = presentInstructions.map((f) => ({
    path: f.path,
    tokens: docs?.files.find((d) => d.path === f.path)?.tokens,
  }));
  const instructionTokens = instructionFiles.every((f) => f.tokens !== undefined)
    ? instructionFiles.reduce((sum, f) => sum + (f.tokens ?? 0), 0)
    : null;
  add({
    id: "ai.instructionsShort",
    axis: "aiContext",
    status: status(
      instructionFiles.length > 0 && instructionTokens !== null,
      (instructionTokens ?? 0) <= INSTRUCTION_TOKEN_BUDGET,
    ),
    params: { tokens: instructionTokens ?? 0, budget: INSTRUCTION_TOKEN_BUDGET },
  });
  const ignore = aiIgnoreFiles?.[0];
  add({
    id: "ai.ignore",
    axis: "aiContext",
    status: status(aiIgnoreFiles !== null, Boolean(ignore)),
    ...(ignore ? { evidence: { path: ignore } } : {}),
  });
  const noiseShare = stats.tokens > 0 ? stats.tokensNoise / stats.tokens : 0;
  add({
    id: "ai.noise",
    axis: "aiContext",
    status: status(stats.tokens > 0, noiseShare <= NOISE_SHARE_MAX),
    params: { pct: Math.round(noiseShare * 100), max: Math.round(NOISE_SHARE_MAX * 100) },
  });
  const huge = stats.largest.filter(
    (f) => !AI_NOISE_KINDS.includes(f.kind) && f.tokens > HUGE_FILE_TOKENS,
  );
  add({
    id: "ai.noHugeFiles",
    axis: "aiContext",
    status: status(stats.files > 0, huge.length === 0),
    params: { count: huge.length, max: HUGE_FILE_TOKENS },
    ...(huge[0] ? { evidence: { path: huge[0].path } } : {}),
  });

  /* ---- local start ---- */
  const steps = onboarding?.steps.length ?? 0;
  const tools = onboarding?.tools ?? [];
  add({
    id: "local.steps",
    axis: "localStart",
    status: status(Boolean(onboarding), steps > 0),
    params: { count: steps },
  });
  add({
    id: "local.tools",
    axis: "localStart",
    status: status(Boolean(onboarding), tools.length > 0),
    params: { count: tools.length },
  });
  add({
    id: "local.pinned",
    axis: "localStart",
    status: status(
      tools.length > 0,
      tools.some((t) => t.basis === "pinned"),
    ),
  });
  const machinePaths = onboarding?.localPaths ?? [];
  add({
    id: "local.noMachinePaths",
    axis: "localStart",
    status: status(Boolean(onboarding?.readme), machinePaths.length === 0),
    params: { count: machinePaths.length },
    ...(machinePaths[0] ? { evidence: machinePaths[0].source } : {}),
  });

  /* ---- context security: the findings are always evaluated ---- */
  for (const [rule, id] of Object.entries(SECRET_CHECK) as [FindingRule, CheckId][]) {
    const found = report.findings.filter((f) => f.rule === rule);
    const first = found[0];
    add({
      id,
      axis: "security",
      status: found.length === 0 ? "pass" : "fail",
      params: { count: found.length },
      ...(first
        ? { evidence: { path: first.path, ...(first.line ? { line: first.line } : {}) } }
        : {}),
    });
  }

  /* ---- scores ---- */
  const axes: AxisScore[] = AXIS_ORDER.map((axis) => {
    const own = checks.filter((c) => c.axis === axis);
    const evaluated = own.filter((c) => c.status !== "unknown");
    const passed = evaluated.filter((c) => c.status === "pass").length;
    return {
      axis,
      score: evaluated.length > 0 ? Math.round((passed / evaluated.length) * 100) : null,
      passed,
      evaluated: evaluated.length,
      total: own.length,
    };
  });
  const scored = axes.filter((a) => a.score !== null).map((a) => a.score as number);
  const score =
    scored.length > 0 ? Math.round(scored.reduce((s, v) => s + v, 0) / scored.length) : null;
  const blockers = report.findings.length;
  const verdict: Verdict =
    blockers > 0
      ? "blocked"
      : score === null
        ? "unknown"
        : score >= VERDICT_READY
          ? "ready"
          : score >= VERDICT_PARTIAL
            ? "partial"
            : "notReady";

  return { score, verdict, axes, checks, gaps: gapsOf(input, checks, huge), blockers };
}

function gapsOf(
  input: ReadinessInput,
  checks: ReadinessCheck[],
  huge: ScanReport["stats"]["largest"],
): ReadinessGap[] {
  const { report, docs } = input;
  const { stats } = report;
  const failed = (id: CheckId) => checks.find((c) => c.id === id)?.status === "fail";
  const check = (id: CheckId) => checks.find((c) => c.id === id);
  const at = (source: GuideSource | undefined) =>
    source ? { path: source.path, ...(source.line ? { line: source.line } : {}) } : null;
  const readmePath = docs?.coverage.find((c) => c.id === "readme")?.evidence?.path ?? "README.md";
  const gaps: ReadinessGap[] = [];

  for (const [rule, id] of Object.entries(SECRET_CHECK) as [FindingRule, CheckId][]) {
    const c = check(id);
    if (c?.status === "fail") {
      gaps.push({
        id: `sec.${rule}`,
        severity: "blocker",
        tokensSaved: null,
        file: at(c.evidence),
        params: { count: c.params?.count ?? 0 },
      });
    }
  }

  const noise = stats.tokensNoise > 0 ? stats.tokensNoise : null;
  if (failed("ai.ignore")) {
    gaps.push({
      id: "ai.ignore",
      severity: noise ? "critical" : "major",
      tokensSaved: noise,
      file: { path: ".aiignore", create: true },
    });
  } else if (failed("ai.noise")) {
    // An ignore file exists (or could not be checked) and the noise is still there to read.
    const first = stats.noise[0];
    gaps.push({
      id: "ai.noise",
      severity: "major",
      tokensSaved: noise,
      file: first ? { path: first.path } : null,
      params: { pct: check("ai.noise")?.params?.pct ?? 0 },
    });
  }

  if (failed("ai.instructions")) {
    gaps.push({
      id: "ai.instructions",
      severity: "major",
      tokensSaved: null,
      file: { path: "AGENTS.md", create: true },
    });
  }
  const short = check("ai.instructionsShort");
  if (short?.status === "fail") {
    const tokens = short.params?.tokens ?? 0;
    const longest = (docs?.files ?? [])
      .filter((f) => PERMANENT_INSTRUCTIONS.includes(f.path))
      .sort((a, b) => b.tokens - a.tokens)[0];
    gaps.push({
      id: "ai.instructionsShort",
      severity: "major",
      tokensSaved: tokens - INSTRUCTION_TOKEN_BUDGET,
      file: longest ? { path: longest.path } : null,
      params: { tokens, budget: INSTRUCTION_TOKEN_BUDGET },
    });
  }
  if (huge.length > 0) {
    gaps.push({
      id: "ai.hugeFiles",
      severity: "major",
      tokensSaved: huge.reduce((s, f) => s + f.tokens, 0),
      file: { path: (huge[0] as (typeof huge)[number]).path },
      params: { count: huge.length },
    });
  }

  if (failed("doc.readme")) {
    gaps.push({
      id: "doc.readme",
      severity: "critical",
      tokensSaved: null,
      file: { path: "README.md", create: true },
    });
  } else {
    const missing = (["doc.install", "doc.build", "doc.run"] as const).filter(failed).length;
    if (missing > 0) {
      gaps.push({
        id: "doc.quickStart",
        severity: "major",
        tokensSaved: null,
        file: { path: readmePath },
        params: { count: missing },
      });
    }
  }
  const drift = check("doc.noDrift");
  if (drift?.status === "fail") {
    gaps.push({
      id: "doc.drift",
      severity: "major",
      tokensSaved: null,
      file: at(drift.evidence),
      params: { count: drift.params?.count ?? 0 },
    });
  }
  if (failed("doc.tests") && !failed("doc.readme")) {
    gaps.push({
      id: "doc.tests",
      severity: "minor",
      tokensSaved: null,
      file: { path: readmePath },
    });
  }
  if (failed("doc.architecture")) {
    gaps.push({
      id: "doc.architecture",
      severity: "minor",
      tokensSaved: null,
      file: { path: "docs/ARCHITECTURE.md", create: true },
    });
  }
  const paths = check("local.noMachinePaths");
  if (paths?.status === "fail") {
    gaps.push({
      id: "local.machinePaths",
      severity: "minor",
      tokensSaved: null,
      file: at(paths.evidence),
      params: { count: paths.params?.count ?? 0 },
    });
  }
  if (failed("local.pinned")) {
    gaps.push({
      id: "local.pinned",
      severity: "minor",
      tokensSaved: null,
      file: { path: readmePath },
    });
  }

  return gaps.sort(
    (a, b) =>
      SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
      (b.tokensSaved ?? -1) - (a.tokensSaved ?? -1),
  );
}

/** Tokens by kind, in the fixed order of `FILE_KINDS`, without empty kinds. */
export function tokensByKind(
  report: ScanReport,
): { kind: FileKind; tokens: number; files: number; noise: boolean }[] {
  return report.stats.byKind
    .filter((k) => k.tokens > 0)
    .sort((a, b) => FILE_KINDS.indexOf(a.kind) - FILE_KINDS.indexOf(b.kind))
    .map((k) => ({
      kind: k.kind,
      tokens: k.tokens,
      files: k.files,
      noise: AI_NOISE_KINDS.includes(k.kind),
    }));
}

/** The largest `limit` entries by tokens, the rest folded into one `other` bucket. */
export function topWithOther<T extends { tokens: number }>(
  items: T[],
  limit: number,
): { top: T[]; otherTokens: number; otherCount: number } {
  const sorted = [...items].sort((a, b) => b.tokens - a.tokens);
  const rest = sorted.slice(limit);
  return {
    top: sorted.slice(0, limit),
    otherTokens: rest.reduce((s, x) => s + x.tokens, 0),
    otherCount: rest.length,
  };
}
