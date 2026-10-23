import type { ArchProvenance, ArchSource } from "./architecture";

/**
 * Getting a new developer to a running local instance.
 *
 * The expensive part of a first week is almost never the commands — those are in
 * the README. It is the waiting: an access request nobody told you to file on
 * Monday, a proxy that fails in a way no error message explains, a step that works
 * for everyone who already has the cache warm. So this model carries three things
 * a README usually leaves out: how long each step really takes, which accesses
 * must be requested before anything else, and the failures that are known to
 * happen with their fix.
 *
 * Each step cites the file it was derived from, for the same reason the
 * architecture does: a setup guide that drifts from the repository is worse than
 * no guide, because it is believed.
 */

/**
 * Canonical order, and it is a dependency order rather than a tidy one: the
 * configuration comes before the services because a migration cannot run until
 * the build tool knows where to fetch from. Sections rendered out of this order
 * would read fine and fail on the first machine that followed them.
 */
export const SETUP_PHASES = [
  "prerequis",
  "acces",
  "recuperation",
  "configuration",
  "services",
  "execution",
  "verification",
] as const;
export type SetupPhase = (typeof SETUP_PHASES)[number];

export const SETUP_SHELLS = ["pwsh", "bash", "any"] as const;
export type SetupShell = (typeof SETUP_SHELLS)[number];

export interface SetupPrereq {
  id: string;
  label: string;
  /** The version the repository actually pins, not the latest release. */
  version: string;
  /** Command that prints the installed version. */
  check: string;
  install?: string;
  required: boolean;
  provenance: ArchProvenance;
  sources: ArchSource[];
}

export interface SetupStep {
  id: string;
  phase: SetupPhase;
  title: string;
  command?: string;
  shell?: SetupShell;
  /** Why this step exists. A command without a reason is a ritual. */
  explanation: string;
  /** What the screen looks like when it worked. */
  expect: string;
  /** Honest wall-clock minutes on a cold machine, cache included. */
  durationMin: number;
  optional?: boolean;
  provenance: ArchProvenance;
  sources: ArchSource[];
}

/**
 * Access requests, which are the real critical path.
 *
 * Deliberately `declared`: no scanner can read a lead time out of a repository.
 * Someone has to say it, and the page says who said it.
 */
export interface SetupAccess {
  id: string;
  label: string;
  askWho: string;
  /** Working days between the request and the access actually working. */
  leadTimeDays: number;
  why: string;
  /** True when nothing can run locally without it. */
  blocking: boolean;
}

export interface SetupPitfall {
  id: string;
  /** What the developer sees, in their words, so they can match it to their screen. */
  symptom: string;
  cause: string;
  fix: string;
  command?: string;
  sources: ArchSource[];
}

export interface ProjectOnboarding {
  projectId: string;
  repoId: string;
  cloneUrl: string;
  /** Who to ask when the page is wrong. A document without an owner rots. */
  maintainer: string;
  generatedAt: string;
  prereqs: SetupPrereq[];
  accesses: SetupAccess[];
  steps: SetupStep[];
  pitfalls: SetupPitfall[];
  /** Issue ids deliberately kept small and local, for a first contribution. */
  firstIssueIds: string[];
}

/**
 * The honest total.
 *
 * Commands and waiting are not the same currency, so they are never added up into
 * one reassuring number: `handsOnMin` is time at the keyboard, `waitingDays` is the
 * calendar. A page that says "setup : 45 minutes" while an MQ access takes three
 * days has told the truth about the wrong thing.
 */
export function setupEffort(
  onboarding: ProjectOnboarding,
  options: { includeOptional?: boolean } = {},
): { handsOnMin: number; waitingDays: number } {
  const includeOptional = options.includeOptional ?? false;
  const handsOnMin = onboarding.steps
    .filter((s) => includeOptional || !s.optional)
    .reduce((sum, s) => sum + s.durationMin, 0);

  // Requests are filed in parallel, so the calendar cost is the slowest one, not the sum.
  const waitingDays = onboarding.accesses.reduce((max, a) => Math.max(max, a.leadTimeDays), 0);

  return { handsOnMin, waitingDays };
}

/** Accesses that stop everything, slowest first: that is the order to file them in. */
export function blockingAccesses(onboarding: ProjectOnboarding): SetupAccess[] {
  return onboarding.accesses
    .filter((a) => a.blocking)
    .sort((a, b) => b.leadTimeDays - a.leadTimeDays || a.label.localeCompare(b.label));
}

/** Steps of one phase, in declared order. */
export function stepsOfPhase(onboarding: ProjectOnboarding, phase: SetupPhase): SetupStep[] {
  return onboarding.steps.filter((s) => s.phase === phase);
}

/** Phases that actually have content, in canonical order. Empty sections are noise. */
export function filledPhases(onboarding: ProjectOnboarding): SetupPhase[] {
  return SETUP_PHASES.filter((p) => onboarding.steps.some((s) => s.phase === p));
}

/**
 * The first-day plan: file the slow requests, then do the work that needs no access.
 *
 * Expressed as a derived list rather than written by hand, so it cannot contradict
 * the steps above it.
 */
export interface FirstDayPlan {
  /** File these before touching anything else. */
  requestNow: SetupAccess[];
  /** Everything that runs without waiting for an access. */
  doNow: SetupStep[];
  /** Blocked until the requests land. */
  blocked: SetupStep[];
}

export function firstDayPlan(onboarding: ProjectOnboarding): FirstDayPlan {
  const blockers = blockingAccesses(onboarding);
  // Without a blocking access, the services and the run are the parts that fail.
  const blockedPhases: readonly SetupPhase[] = blockers.length
    ? ["services", "execution", "verification"]
    : [];

  const doNow = onboarding.steps.filter(
    (s) => !s.optional && !blockedPhases.includes(s.phase) && s.phase !== "acces",
  );
  const blocked = onboarding.steps.filter((s) => blockedPhases.includes(s.phase));

  return { requestNow: blockers, doNow, blocked };
}
