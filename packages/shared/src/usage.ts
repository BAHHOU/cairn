import { z } from "zod";

/** Where a number comes from. Every metric must carry one of these. */
export const PROVENANCES = ["measured", "declared", "estimated"] as const;
export type Provenance = (typeof PROVENANCES)[number];
export const provenanceSchema = z.enum(PROVENANCES);

/**
 * Usage counter sent by a gateway, a tool or the platform itself.
 * There is deliberately NO user field: usage is never attributed to a person.
 */
export const usageEventSchema = z.object({
  source: z.enum(["gateway", "telemetry", "provider-report", "git-signal", "estimate", "platform"]),
  tool: z.string().min(1).max(64),
  model: z.string().min(1).max(128),
  team: z.string().min(1).max(64),
  repo: z.string().max(256).optional(),
  ticket: z.string().max(64).optional(),
  ts: z.iso.datetime(),
  tokensIn: z.number().int().nonnegative(),
  tokensOut: z.number().int().nonnegative(),
  cached: z.number().int().nonnegative().optional(),
  durationMs: z.number().int().nonnegative().optional(),
  outcome: z.enum(["ok", "error", "blocked"]).optional(),
});
export type UsageEvent = z.infer<typeof usageEventSchema>;

const SOURCE_PROVENANCE: Record<UsageEvent["source"], Provenance> = {
  gateway: "measured",
  telemetry: "measured",
  platform: "measured",
  "provider-report": "declared",
  "git-signal": "declared",
  estimate: "estimated",
};

export function provenanceOf(source: UsageEvent["source"]): Provenance {
  return SOURCE_PROVENANCE[source];
}
