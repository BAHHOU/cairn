import type { ChangeVerdict, GateStatus, Severity } from "@cairn/shared";

/**
 * What a component says decides its colour, in every theme:
 *
 * - **block**: stop, nothing ships. Solid dark red, white text: the strongest signal on a page.
 * - **critical**: serious, to fix first. Red tint.
 * - **attention**: worth a look. Orange tint.
 * - **safe**: checked and fine. Green tint.
 * - **info**: context, no judgement. Blue tint.
 * - **neutral**: minor, or not judged. Grey.
 *
 * The brand colour never carries one of these meanings.
 */
export type Message = "block" | "critical" | "attention" | "safe" | "info" | "neutral";

/** A pill or badge for each message. */
export const MESSAGE_PILL: Record<Message, string> = {
  block: "bg-critical text-critical-foreground",
  critical: "bg-destructive/12 text-destructive",
  attention: "bg-warning/18 text-warning-ink",
  safe: "bg-success/12 text-success",
  info: "bg-info/12 text-info",
  neutral: "bg-muted text-muted-foreground",
};

/** Text and icons alone. */
export const MESSAGE_TEXT: Record<Message, string> = {
  block: "text-critical dark:text-destructive",
  critical: "text-destructive",
  attention: "text-warning-ink",
  safe: "text-success",
  info: "text-info",
  neutral: "text-muted-foreground",
};

export const SEVERITY_MESSAGE: Record<Severity, Message> = {
  blocker: "block",
  critical: "critical",
  major: "attention",
  minor: "neutral",
};

export const VERDICT_MESSAGE: Record<ChangeVerdict, Message> = {
  blocked: "block",
  review: "attention",
  pass: "safe",
};

export const GATE_MESSAGE: Record<GateStatus, Message> = {
  failed: "block",
  warning: "attention",
  passed: "safe",
};

export const SEVERITY_PILL: Record<Severity, string> = {
  blocker: MESSAGE_PILL.block,
  critical: MESSAGE_PILL.critical,
  major: MESSAGE_PILL.attention,
  minor: MESSAGE_PILL.neutral,
};
