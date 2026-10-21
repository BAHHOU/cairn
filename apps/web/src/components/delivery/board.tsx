import {
  type ArchSource,
  DELIVERY_DATA_KIND_LABEL,
  DELIVERY_STAGE_KIND_LABEL,
  type DeliveryEnvironment,
  type DeliveryStage,
  formatMinutes,
} from "@cairn/shared";
import { CircleCheck, CircleDashed, Clock, Hand, Lock, ShieldAlert, Timer } from "lucide-react";
import { Badge } from "@/components/ui/badge";

/**
 * The pieces of the delivery board.
 *
 * Server components with no interactivity: this page answers a question ("what
 * stands between my commit and production") rather than hosting a tool, so it
 * costs no JavaScript.
 */

/** Where a fact came from. Repeated everywhere, because an unsourced claim is a rumour. */
export function Source({ sources }: { sources: ArchSource[] }) {
  const first = sources[0];
  if (!first) return null;
  return (
    <p className="break-words font-mono text-[11px] text-muted-foreground">
      {first.path}
      {first.line ? `:${first.line}` : ""}
      {first.note ? <span className="font-sans italic"> — {first.note}</span> : null}
    </p>
  );
}

const DATA_VARIANT: Record<
  DeliveryEnvironment["dataKind"],
  "secondary" | "warning" | "destructive"
> = {
  synthetic: "secondary",
  anonymised: "warning",
  production: "destructive",
};

/**
 * One pipeline step.
 *
 * The blocking flag is the only thing rendered in colour, because it is the only
 * thing that changes what the step *means*: a check that cannot fail the build is
 * a report, and calling it a gate would be the lie this whole page exists to avoid.
 */
export function StageRow({ stage }: { stage: DeliveryStage }) {
  return (
    <li className="flex flex-col gap-1.5 rounded-lg border bg-background/60 p-3">
      <div className="flex items-start justify-between gap-3">
        <span className="flex items-start gap-2 font-medium text-sm">
          {stage.blocking ? (
            <CircleCheck className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden />
          ) : (
            <CircleDashed className="mt-0.5 size-3.5 shrink-0 text-warning" aria-hidden />
          )}
          {stage.label}
        </span>
        <span className="flex shrink-0 items-center gap-1 text-muted-foreground text-xs tabular-nums">
          <Timer className="size-3" aria-hidden />
          {stage.durationP50Min} min
          {stage.durationP90Min ? (
            <span className="text-muted-foreground/70">· p90 {stage.durationP90Min}</span>
          ) : null}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant="outline">{DELIVERY_STAGE_KIND_LABEL[stage.kind]}</Badge>
        {stage.trigger === "manual" ? (
          <Badge variant="warning">
            <Hand className="size-3" aria-hidden /> Manuel
          </Badge>
        ) : null}
        {!stage.blocking ? <Badge variant="warning">N'arrête pas la chaîne</Badge> : null}
      </div>

      {stage.condition ? <p className="text-muted-foreground text-xs">{stage.condition}</p> : null}
      <Source sources={stage.sources} />
    </li>
  );
}

/**
 * The gate in front of an environment.
 *
 * A strip across the top of the column rather than a column of its own: the
 * waiting is not a property of the environment, it is what happens instead of
 * progress, and it belongs between the previous step and this one.
 */
function GateStrip({ env }: { env: DeliveryEnvironment }) {
  if (!env.approval.required) {
    return (
      <p className="flex min-h-14 items-center gap-2 border-b bg-muted/30 px-4 py-2 text-muted-foreground text-xs">
        <CircleCheck className="size-3.5 shrink-0 text-primary" aria-hidden />
        Sans validation — la chaîne continue toute seule
      </p>
    );
  }

  const wait = env.approval.waitP50Min;
  return (
    // Stacked rather than wrapped: an approver with a long title must not push one
    // column's content lower than its neighbours'.
    <div className="flex min-h-14 flex-col justify-center gap-0.5 border-warning/40 border-b bg-warning/10 px-4 py-2 text-xs">
      <span className="flex items-center gap-2 font-medium">
        <Lock className="size-3.5 shrink-0 text-warning" aria-hidden />
        {env.approval.who ?? <span className="text-destructive">Personne de nommé</span>}
      </span>
      {wait ? (
        <span className="flex items-center gap-1 pl-5 text-muted-foreground tabular-nums">
          <Clock className="size-3" aria-hidden />
          {formatMinutes(wait)} d'attente observée
        </span>
      ) : null}
    </div>
  );
}

/** An environment column: the gate in front of it, what runs there, on what data. */
export function EnvironmentCard({
  env,
  stages,
  leadTimeMin,
  waitMin,
  nodeLabels,
  architectureHref,
}: {
  env: DeliveryEnvironment;
  stages: DeliveryStage[];
  leadTimeMin: number;
  waitMin: number;
  nodeLabels: Record<string, string>;
  architectureHref: (nodeId: string) => string;
}) {
  return (
    <section className="flex min-w-0 flex-col overflow-hidden rounded-xl border bg-card">
      <GateStrip env={env} />

      <div className="flex flex-1 flex-col gap-3 p-4">
        <header className="flex flex-col gap-2">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="font-semibold text-base">{env.label}</h3>
            {env.replicas ? (
              <span className="text-muted-foreground text-xs tabular-nums">
                {env.replicas} réplique{env.replicas > 1 ? "s" : ""}
              </span>
            ) : null}
          </div>

          <Badge variant={DATA_VARIANT[env.dataKind]}>
            {env.dataKind === "production" ? <ShieldAlert className="size-3" aria-hidden /> : null}
            {DELIVERY_DATA_KIND_LABEL[env.dataKind]}
          </Badge>

          {env.current ? (
            <p className="break-words text-muted-foreground text-xs">
              Tourne en <span className="font-mono">{env.current.version}</span>
            </p>
          ) : null}
        </header>

        {/* The two clocks, side by side and never summed into one reassuring number. */}
        <dl className="grid grid-cols-2 gap-3 rounded-lg bg-muted/40 px-3 py-2">
          <div className="flex min-w-0 flex-col">
            <dt className="text-[11px] text-muted-foreground">Machine</dt>
            <dd className="font-semibold text-sm tabular-nums">{formatMinutes(leadTimeMin)}</dd>
          </div>
          <div className="flex min-w-0 flex-col">
            <dt className="text-[11px] text-muted-foreground">Attente</dt>
            <dd
              className={
                waitMin > leadTimeMin
                  ? "font-semibold text-destructive text-sm tabular-nums"
                  : "font-semibold text-sm tabular-nums"
              }
            >
              {waitMin === 0 ? "—" : formatMinutes(waitMin)}
            </dd>
          </div>
        </dl>

        {stages.length ? (
          <ul className="flex flex-col gap-2">
            {stages.map((s) => (
              <StageRow key={s.id} stage={s} />
            ))}
          </ul>
        ) : null}

        <div className="mt-auto flex flex-col gap-1.5 pt-2">
          <span className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
            Ce qui y tourne
          </span>
          <div className="flex flex-wrap gap-1.5">
            {env.deploysNodeIds.map((nodeId) => {
              const label = nodeLabels[nodeId];
              if (!label) return null;
              return (
                <a
                  key={nodeId}
                  href={architectureHref(nodeId)}
                  className="rounded-md border px-2 py-0.5 text-xs hover:border-primary hover:text-primary"
                >
                  {label}
                </a>
              );
            })}
          </div>
          <Source sources={env.sources} />
        </div>
      </div>
    </section>
  );
}
