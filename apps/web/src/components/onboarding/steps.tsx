import type { SetupAccess, SetupPitfall, SetupPrereq, SetupStep } from "@cairn/shared";
import { CalendarClock, CircleAlert, Timer } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { CommandBlock } from "./command-block";

/** Where the instruction came from. Same discipline as the architecture view. */
function Source({ sources }: { sources: SetupStep["sources"] }) {
  const first = sources[0];
  if (!first) return null;
  return (
    <p className="font-mono text-[11px] text-muted-foreground">
      {first.path}
      {first.line ? `:${first.line}` : ""}
      {first.note ? <span className="font-sans italic"> — {first.note}</span> : null}
    </p>
  );
}

/**
 * One numbered step.
 *
 * `expect` is given as much room as the command, deliberately: the question a
 * newcomer cannot answer alone is not "what do I type" but "did that work". A
 * guide that lists commands without their successful output leaves them guessing
 * whether a warning they do not understand is fatal.
 */
export function StepCard({ step, index }: { step: SetupStep; index: number }) {
  return (
    <li className="flex gap-3">
      <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border bg-card font-medium text-xs tabular-nums">
        {index}
      </span>

      <div className="flex min-w-0 flex-1 flex-col gap-2 pb-6">
        <div className="flex flex-wrap items-center gap-2">
          <h4 className="font-medium text-sm">{step.title}</h4>
          <span className="flex items-center gap-1 text-muted-foreground text-xs tabular-nums">
            <Timer className="size-3" aria-hidden />
            {step.durationMin} min
          </span>
          {step.optional ? <Badge variant="secondary">Facultatif</Badge> : null}
        </div>

        <p className="text-muted-foreground text-sm">{step.explanation}</p>

        {step.command ? <CommandBlock command={step.command} shell={step.shell} /> : null}

        <p className="text-sm">
          <span className="text-muted-foreground">Vous devez voir : </span>
          {step.expect}
        </p>

        <Source sources={step.sources} />
      </div>
    </li>
  );
}

export function PrereqRow({ prereq }: { prereq: SetupPrereq }) {
  return (
    <li className="flex flex-col gap-1.5 border-border/60 border-b py-3 last:border-0">
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="font-medium text-sm">{prereq.label}</span>
        <span className="font-mono text-xs">{prereq.version}</span>
        {prereq.required ? null : <Badge variant="secondary">Facultatif</Badge>}
      </div>
      <CommandBlock command={prereq.check} />
      {prereq.install ? <p className="text-muted-foreground text-xs">{prereq.install}</p> : null}
      <Source sources={prereq.sources} />
    </li>
  );
}

/**
 * An access request.
 *
 * Shown with its lead time in days, and sorted so the slowest comes first. This
 * is the only part of the page that cannot be derived from the repository, and
 * also the part that decides whether the first week is one day of work or five.
 */
export function AccessRow({ access }: { access: SetupAccess }) {
  return (
    <li className="flex flex-col gap-1 border-border/60 border-b py-3 last:border-0">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-sm">{access.label}</span>
        <Badge variant={access.blocking ? "warning" : "secondary"}>
          <CalendarClock className="size-3" aria-hidden />
          {access.leadTimeDays} j
        </Badge>
        {access.blocking ? <Badge variant="destructive">Bloquant</Badge> : null}
      </div>
      <p className="text-muted-foreground text-sm">{access.why}</p>
      <p className="text-xs">
        <span className="text-muted-foreground">À demander à : </span>
        {access.askWho}
      </p>
    </li>
  );
}

/**
 * A known failure.
 *
 * Written symptom-first, in the words that appear on the screen, so it can be
 * matched by someone who has no idea yet what the cause might be. Sorting these
 * by cause would be tidier and useless.
 */
export function PitfallCard({ pitfall }: { pitfall: SetupPitfall }) {
  return (
    <article className="flex flex-col gap-2 rounded-lg border border-warning/40 bg-warning/5 p-3">
      <p className="flex items-start gap-2 font-mono text-xs leading-relaxed">
        <CircleAlert className="mt-0.5 size-3.5 shrink-0 text-warning" aria-hidden />
        {pitfall.symptom}
      </p>
      <p className="text-muted-foreground text-sm">{pitfall.cause}</p>
      <p className="text-sm">{pitfall.fix}</p>
      {pitfall.command ? <CommandBlock command={pitfall.command} /> : null}
      <Source sources={pitfall.sources} />
    </article>
  );
}
