import type { ArchProvenance, ArchSource } from "./architecture";
import type { Severity } from "./domain";
import { type Msg, msg } from "./i18n";

/**
 * The delivery chain: what happens to a commit between a developer's machine and
 * production.
 *
 * This is deliberately *not* modelled as another projection of the architecture
 * graph. The architecture answers "what talks to what"; a pipeline answers "what
 * happens next, who is allowed to let it happen, and how long it takes". Those are
 * different shapes, and folding a sequence with gates into a node/edge graph loses
 * exactly the parts a reader came for — the waiting, the approvals, the rollback.
 *
 * What the two models share is identity: every environment names the architecture
 * nodes it deploys, so you can walk from "production" straight into the diagram.
 */

export const DELIVERY_STAGE_KINDS = [
  "build",
  "test",
  "quality",
  "security",
  "package",
  "deploy",
  "verify",
] as const;
export type DeliveryStageKind = (typeof DELIVERY_STAGE_KINDS)[number];

export const DELIVERY_TRIGGERS = ["auto", "manual", "scheduled"] as const;
export type DeliveryTrigger = (typeof DELIVERY_TRIGGERS)[number];

/** What a given environment runs on. The difference between the three matters a lot. */
export const DELIVERY_DATA_KINDS = ["synthetic", "anonymised", "production"] as const;
export type DeliveryDataKind = (typeof DELIVERY_DATA_KINDS)[number];

export interface DeliveryStage {
  id: string;
  label: string;
  kind: DeliveryStageKind;
  trigger: DeliveryTrigger;
  /** Set when the stage targets an environment; empty for the shared CI part. */
  envId?: string;
  /** Median wall-clock minutes. The number people plan with. */
  durationP50Min: number;
  /** The slow day. Omitted when we have no measurement rather than guessed. */
  durationP90Min?: number;
  /**
   * Whether a failure actually stops the chain. A quality stage that reports and
   * lets the pipeline through is a decoration, and the view says so.
   */
  blocking: boolean;
  /** e.g. "uniquement sur main". */
  condition?: string;
  provenance: ArchProvenance;
  sources: ArchSource[];
}

export interface DeliveryApproval {
  required: boolean;
  /** Named role or team. Null when the gate exists but nobody owns it. */
  who?: string;
  /** Observed median minutes between "ready" and someone actually clicking. */
  waitP50Min?: number;
  note?: string;
}

export interface DeliveryEnvironment {
  id: string;
  label: string;
  /** 0 is closest to the developer. Ordering is data, not array position. */
  rank: number;
  url?: string;
  replicas?: number;
  dataKind: DeliveryDataKind;
  approval: DeliveryApproval;
  /** Architecture node ids running here, so the diagram is one click away. */
  deploysNodeIds: string[];
  /** What is actually running right now, when we know it. */
  current?: { version: string; deployedAt: string };
  provenance: ArchProvenance;
  sources: ArchSource[];
}

export interface DeliveryRollback {
  how: string;
  durationMin: number;
  /** Date of the last real rehearsal. Absent means never tested, and we say it. */
  testedAt?: string;
  provenance: ArchProvenance;
  sources: ArchSource[];
}

export interface DeliveryPipeline {
  projectId: string;
  repoId: string;
  provider: string;
  commit: string;
  generatedAt: string;
  stages: DeliveryStage[];
  environments: DeliveryEnvironment[];
  rollback: DeliveryRollback;
}

/** One column of the dev→prod board: an environment and the stages that feed it. */
export interface DeliveryLane {
  env: DeliveryEnvironment;
  stages: DeliveryStage[];
  /** Cumulative median minutes of machine time from commit to this environment. */
  leadTimeMin: number;
  /** Cumulative median minutes spent waiting for a human to approve. */
  waitMin: number;
}

export interface DeliveryBoard {
  /** Stages shared by every environment, in declared order. */
  ci: DeliveryStage[];
  ciMinutes: number;
  lanes: DeliveryLane[];
}

const byRank = (a: DeliveryEnvironment, b: DeliveryEnvironment) => a.rank - b.rank;

/**
 * Turn the pipeline into the board the page draws.
 *
 * Two clocks, never added together. `leadTimeMin` is machine time and accumulates:
 * reaching production means paying for CI, then dev, then homologation, then
 * production — nobody asks "how long is the prod deploy", they ask "how long until
 * my fix is in front of a user". `waitMin` is the time the chain spends stopped,
 * waiting for somebody to click approve. Folding the second into the first would
 * produce one reassuring number that describes neither.
 */
export function deliveryBoard(pipeline: DeliveryPipeline): DeliveryBoard {
  const ci = pipeline.stages.filter((s) => !s.envId);
  const ciMinutes = ci.reduce((sum, s) => sum + s.durationP50Min, 0);

  const envs = [...pipeline.environments].sort(byRank);
  const lanes: DeliveryLane[] = [];
  let running = ciMinutes;
  let waiting = 0;

  for (const env of envs) {
    const stages = pipeline.stages.filter((s) => s.envId === env.id);
    running += stages.reduce((sum, s) => sum + s.durationP50Min, 0);
    if (env.approval.required) waiting += env.approval.waitP50Min ?? 0;
    lanes.push({ env, stages, leadTimeMin: running, waitMin: waiting });
  }

  return { ci, ciMinutes, lanes };
}

/** Minutes from commit to the given environment, or null when it is unknown. */
export function leadTimeTo(pipeline: DeliveryPipeline, envId: string): number | null {
  return deliveryBoard(pipeline).lanes.find((l) => l.env.id === envId)?.leadTimeMin ?? null;
}

/** Kinds of delivery risk. Sentences: `domain.deliveryRisk.<kind>.title` and `.detail`. */
export const DELIVERY_RISK_KINDS = [
  "approval",
  "waitDominates",
  "nonBlocking",
  "realData",
  "rollbackUntested",
  "noVerify",
] as const;
export type DeliveryRiskKind = (typeof DELIVERY_RISK_KINDS)[number];

/** Params whose name ends in `Min` are durations in minutes, formatted in the viewer's language. */
const risk = (kind: DeliveryRiskKind, params?: Msg["params"]) => ({
  kind,
  title: msg(`domain.deliveryRisk.${kind}.title`, params),
  detail: msg(`domain.deliveryRisk.${kind}.detail`, params),
});

export interface DeliveryRisk {
  id: string;
  kind: DeliveryRiskKind;
  severity: Severity;
  title: Msg;
  detail: Msg;
  /** Where to go and look. A finding without a location is an opinion. */
  sources: ArchSource[];
}

const PROD_LIKE: readonly DeliveryDataKind[] = ["production"];

/**
 * Observations about the chain, derived from the pipeline itself.
 *
 * Every rule here is something a reader could verify by opening the file we point
 * at. Nothing is scored, nothing is weighted into a grade: a delivery chain is not
 * improved by being given a mark out of ten, it is improved by someone reading one
 * of these sentences and disagreeing with it out loud.
 */
export function deliveryRisks(pipeline: DeliveryPipeline): DeliveryRisk[] {
  const risks: DeliveryRisk[] = [];
  const envs = [...pipeline.environments].sort(byRank);

  // A gate nobody owns is a gate that gets clicked by whoever is least busy.
  for (const env of envs) {
    if (env.approval.required && !env.approval.who) {
      risks.push({
        id: `risk-approval-${env.id}`,
        severity: "major",
        ...risk("approval", { env: env.label }),
        sources: env.sources,
      });
    }
  }

  // When the wait dwarfs the pipeline, optimising the pipeline is the wrong project.
  const board = deliveryBoard(pipeline);
  const last = board.lanes[board.lanes.length - 1];
  if (last && last.waitMin > last.leadTimeMin) {
    risks.push({
      id: "risk-wait-dominates",
      severity: "major",
      ...risk("waitDominates", {
        env: last.env.label,
        machineMin: last.leadTimeMin,
        waitMin: last.waitMin,
      }),
      sources: last.env.sources,
    });
  }

  // A check that reports without blocking teaches the team to ignore it.
  for (const stage of pipeline.stages) {
    if (!stage.blocking && (stage.kind === "quality" || stage.kind === "security")) {
      risks.push({
        id: `risk-nonblocking-${stage.id}`,
        severity: stage.kind === "security" ? "critical" : "major",
        ...risk("nonBlocking", { stage: stage.label }),
        sources: stage.sources,
      });
    }
  }

  // Real data behind no security stage is the combination that ends up in the press.
  const securityBefore = new Set<string>();
  {
    let seen = false;
    for (const stage of pipeline.stages) {
      if (stage.kind === "security" && stage.blocking) seen = true;
      if (stage.envId && seen) securityBefore.add(stage.envId);
    }
  }
  for (const env of envs) {
    if (PROD_LIKE.includes(env.dataKind) && !securityBefore.has(env.id)) {
      risks.push({
        id: `risk-data-${env.id}`,
        severity: "critical",
        ...risk("realData", { env: env.label }),
        sources: env.sources,
      });
    }
  }

  // A rollback that has never been rehearsed is a paragraph, not a procedure.
  if (!pipeline.rollback.testedAt) {
    risks.push({
      id: "risk-rollback-untested",
      severity: "major",
      ...risk("rollbackUntested", { durationMin: pipeline.rollback.durationMin }),
      sources: pipeline.rollback.sources,
    });
  }

  // Nothing watches the deployment it just made.
  for (const env of envs) {
    const stages = pipeline.stages.filter((s) => s.envId === env.id);
    const deploys = stages.some((s) => s.kind === "deploy");
    const verifies = stages.some((s) => s.kind === "verify");
    if (deploys && !verifies) {
      risks.push({
        id: `risk-verify-${env.id}`,
        severity: "minor",
        ...risk("noVerify", { env: env.label }),
        sources: env.sources,
      });
    }
  }

  const rank: Record<Severity, number> = { blocker: 0, critical: 1, major: 2, minor: 3 };
  return risks.sort((a, b) => rank[a.severity] - rank[b.severity] || a.id.localeCompare(b.id));
}
