/**
 * The health brief: one verdict and one traffic light per area, for someone who does not read code.
 *
 * It is a reading of what the scan measured, nothing more. An area the scan could not see is
 * `unknown`, never `good`; a light never claims more than its reason says (infrastructure written
 * as code is "described", not "secure"). What Cairn cannot check at all is listed in `NOT_CHECKED`
 * so the brief never reads as a clean bill of health. Ids and numbers only: the words live in the
 * message catalog (`health.*`).
 */

import type { DeliveryView } from "./guide";
import type { Readiness } from "./readiness";
import type { ScanReport } from "./scan";

export const HEALTH_AREAS = [
  "security",
  "aiReadiness",
  "architecture",
  "delivery",
  "infrastructure",
  "knowledge",
] as const;
export type HealthArea = (typeof HEALTH_AREAS)[number];

export const HEALTH_LIGHTS = ["good", "watch", "risk", "unknown"] as const;
export type HealthLight = (typeof HEALTH_LIGHTS)[number];

/** Who should act on an area. Labels: `health.owner.<owner>`. */
export const HEALTH_OWNERS = ["security", "developer", "ops", "lead"] as const;
export type HealthOwner = (typeof HEALTH_OWNERS)[number];

/** Labels: `health.verdict.<verdict>.title` and `.message`. */
export const HEALTH_VERDICTS = ["notSafe", "atRisk", "watch", "healthy", "unknown"] as const;
export type HealthVerdict = (typeof HEALTH_VERDICTS)[number];

/** Reasons per area. Sentences: `health.reason.<area>.<reason>`. */
export const HEALTH_REASONS = {
  security: ["secrets", "noSecrets"],
  aiReadiness: ["ready", "partial", "notReady", "blocked", "unknown"],
  architecture: ["violations", "mapped", "tooFew", "notMapped"],
  delivery: ["noPipeline", "noTests", "findings", "noSecurityScan", "complete", "rescan"],
  infrastructure: ["described", "notAsCode", "none", "rescan"],
  knowledge: ["good", "partial", "poor", "unknown"],
} as const satisfies Record<HealthArea, readonly string[]>;
export type HealthReasons = { [A in HealthArea]: (typeof HEALTH_REASONS)[A][number] };

export type HealthSignal = {
  [A in HealthArea]: {
    area: A;
    light: HealthLight;
    reason: HealthReasons[A];
    owner: HealthOwner;
    params?: Record<string, number>;
  };
}[HealthArea];

/** What the scan does not look at yet. Labels: `health.notChecked.<id>`. */
export const NOT_CHECKED = [
  "dependencies",
  "accessControl",
  "dataModel",
  "infraSecurity",
  "runtime",
] as const;
export type NotCheckedId = (typeof NOT_CHECKED)[number];

export interface HealthBrief {
  verdict: HealthVerdict;
  signals: HealthSignal[];
  notChecked: readonly NotCheckedId[];
}

export interface HealthInput {
  readiness: Readiness;
  report: ScanReport;
  delivery: DeliveryView | null;
  /**
   * Whether the scan ran the guides. Before they existed `delivery` was always null, so a missing
   * pipeline only means "no pipeline" when this is true.
   */
  guidesScanned: boolean;
}

/**
 * Below this many parts the scan has not really decomposed the project: one box says nothing about
 * its structure, so the light stays unknown rather than green.
 */
export const MIN_ARCH_PARTS = 3;

/** A knowledge score at or above this is good, at or above `KNOWLEDGE_PARTIAL` is partial. */
export const KNOWLEDGE_GOOD = 75;
export const KNOWLEDGE_PARTIAL = 50;

/** Topology roles that stand for infrastructure the repository describes. */
const INFRA_ROLES = new Set(["infrastructure", "cluster", "deploy", "workload", "gitops"]);

export function computeHealth(input: HealthInput): HealthBrief {
  const signals: HealthSignal[] = [
    security(input),
    aiReadiness(input),
    architecture(input),
    delivery(input),
    infrastructure(input),
    knowledge(input),
  ];
  return { verdict: verdictOf(signals), signals, notChecked: NOT_CHECKED };
}

function verdictOf(signals: HealthSignal[]): HealthVerdict {
  const light = (area: HealthArea) => signals.find((s) => s.area === area)?.light;
  if (light("security") === "risk") return "notSafe";
  if (signals.some((s) => s.light === "risk")) return "atRisk";
  if (signals.some((s) => s.light === "watch")) return "watch";
  // "Healthy" needs most areas actually seen: a brief of unknowns is not good news.
  const known = signals.filter((s) => s.light !== "unknown").length;
  return known * 2 > signals.length ? "healthy" : "unknown";
}

function security({ readiness }: HealthInput): HealthSignal {
  return readiness.blockers > 0
    ? {
        area: "security",
        light: "risk",
        reason: "secrets",
        owner: "security",
        params: { count: readiness.blockers },
      }
    : { area: "security", light: "good", reason: "noSecrets", owner: "security" };
}

const READINESS_LIGHT: Record<Readiness["verdict"], HealthLight> = {
  ready: "good",
  partial: "watch",
  notReady: "risk",
  blocked: "risk",
  unknown: "unknown",
};

function aiReadiness({ readiness }: HealthInput): HealthSignal {
  return {
    area: "aiReadiness",
    light: READINESS_LIGHT[readiness.verdict],
    reason: readiness.verdict,
    owner: "developer",
    params: { score: readiness.score ?? 0 },
  };
}

function architecture({ report }: HealthInput): HealthSignal {
  const { archNodes, archViolations } = report.counts;
  if (archNodes === 0) {
    return { area: "architecture", light: "unknown", reason: "notMapped", owner: "developer" };
  }
  if (archViolations === 0 && archNodes < MIN_ARCH_PARTS) {
    return {
      area: "architecture",
      light: "unknown",
      reason: "tooFew",
      owner: "developer",
      params: { count: archNodes },
    };
  }
  return archViolations > 0
    ? {
        area: "architecture",
        light: "watch",
        reason: "violations",
        owner: "developer",
        params: { count: archViolations },
      }
    : {
        area: "architecture",
        light: "good",
        reason: "mapped",
        owner: "developer",
        params: { count: archNodes },
      };
}

function delivery({ delivery: view, guidesScanned }: HealthInput): HealthSignal {
  if (!view) {
    return guidesScanned
      ? { area: "delivery", light: "risk", reason: "noPipeline", owner: "ops" }
      : { area: "delivery", light: "unknown", reason: "rescan", owner: "ops" };
  }
  const jobs = view.stages.flatMap((s) => s.jobs);
  if (!jobs.some((j) => j.role === "test" || j.reportsTests)) {
    return { area: "delivery", light: "risk", reason: "noTests", owner: "ops" };
  }
  const serious = view.findings.filter(
    (f) => f.severity === "blocker" || f.severity === "critical",
  ).length;
  if (serious > 0) {
    return {
      area: "delivery",
      light: "watch",
      reason: "findings",
      owner: "ops",
      params: { count: serious },
    };
  }
  if (!jobs.some((j) => j.role === "security")) {
    return { area: "delivery", light: "watch", reason: "noSecurityScan", owner: "ops" };
  }
  return {
    area: "delivery",
    light: "good",
    reason: "complete",
    owner: "ops",
    params: { count: jobs.length },
  };
}

function infrastructure({ delivery: view, guidesScanned }: HealthInput): HealthSignal {
  const topology = view?.topology;
  if (!topology) {
    // No pipeline at all is a delivery problem; here it only means nothing describes the runtime.
    return guidesScanned && !view
      ? { area: "infrastructure", light: "unknown", reason: "none", owner: "ops" }
      : { area: "infrastructure", light: "unknown", reason: "rescan", owner: "ops" };
  }
  const described = topology.nodes.filter(
    (n) => n.basis === "found" && INFRA_ROLES.has(n.role),
  ).length;
  if (described > 0) {
    return {
      area: "infrastructure",
      light: "good",
      reason: "described",
      owner: "ops",
      params: { count: described },
    };
  }
  return view.deploysToEnvironment
    ? { area: "infrastructure", light: "watch", reason: "notAsCode", owner: "ops" }
    : { area: "infrastructure", light: "unknown", reason: "none", owner: "ops" };
}

function knowledge({ readiness }: HealthInput): HealthSignal {
  const scores = readiness.axes
    .filter((a) => a.axis === "documentation" || a.axis === "localStart")
    .map((a) => a.score)
    .filter((s): s is number => s !== null);
  if (scores.length === 0) {
    return { area: "knowledge", light: "unknown", reason: "unknown", owner: "lead" };
  }
  const score = Math.round(scores.reduce((s, v) => s + v, 0) / scores.length);
  const [light, reason]: [HealthLight, HealthReasons["knowledge"]] =
    score >= KNOWLEDGE_GOOD
      ? ["good", "good"]
      : score >= KNOWLEDGE_PARTIAL
        ? ["watch", "partial"]
        : ["risk", "poor"];
  return { area: "knowledge", light, reason, owner: "lead", params: { score } };
}
