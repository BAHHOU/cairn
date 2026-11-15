/**
 * How much of the work an AI can be trusted with on a project, and what unlocks more.
 *
 * The level is not derived from the readiness score: a project at 90 % with a committed secret
 * must not reach any level. Each level is a gate of named checks, and a project stands on the
 * highest level whose gates, and every gate below, all pass. A check the scan could not evaluate
 * keeps its gate closed — "not evaluated" is never "fine" — and is reported as such, so the way up
 * is always a list of concrete checks. Labels: `domain.maturity.<level>` and
 * `domain.maturityUsage.<level>`; check labels are the readiness ones.
 */

import type { MaturityLevel } from "./domain";
import type { CheckId, CheckStatus, Readiness } from "./readiness";

type GatedLevel = Exclude<MaturityLevel, 0>;

/**
 * What each level adds, in climbing order. Together they cover every readiness check, so the top
 * level means every check passes.
 */
export const AUTONOMY_GATES: Record<GatedLevel, readonly CheckId[]> = {
  // Nothing in the code that must not be sent to an AI provider.
  1: ["sec.noSecret", "sec.noPrivateKey", "sec.noToken"],
  // The AI can find its way: an entry point, and not mostly noise to read.
  2: ["doc.readme", "ai.noise"],
  // The project briefs the AI itself and keeps junk out of its context.
  3: ["ai.instructions", "ai.instructionsShort", "ai.ignore"],
  // An agent can build, run the tests and trust what the docs say.
  4: ["doc.build", "doc.tests", "local.steps", "local.tools", "doc.noDrift"],
  // Everything else: reproducible setup, documented architecture, no oversized files.
  5: [
    "doc.install",
    "doc.run",
    "doc.architecture",
    "ai.noHugeFiles",
    "local.pinned",
    "local.noMachinePaths",
  ],
};

const GATED_LEVELS: GatedLevel[] = [1, 2, 3, 4, 5];

export interface AutonomyBlocker {
  id: CheckId;
  /** `fail` must be fixed; `unknown` must be made visible to the scan (or the project re-scanned). */
  status: Exclude<CheckStatus, "pass">;
}

export interface Autonomy {
  level: MaturityLevel;
  /** The level just above and what keeps it closed. Null at the top. */
  next: { level: GatedLevel; blockers: AutonomyBlocker[] } | null;
}

export function computeAutonomy(readiness: Readiness): Autonomy {
  const status = new Map(readiness.checks.map((c) => [c.id, c.status] as const));
  const blockersOf = (level: GatedLevel): AutonomyBlocker[] =>
    AUTONOMY_GATES[level].flatMap((id) => {
      const s = status.get(id) ?? "unknown";
      return s === "pass" ? [] : [{ id, status: s }];
    });

  let level: MaturityLevel = 0;
  for (const candidate of GATED_LEVELS) {
    const blockers = blockersOf(candidate);
    if (blockers.length > 0) return { level, next: { level: candidate, blockers } };
    level = candidate;
  }
  return { level, next: null };
}
