import { type Autonomy, MATURITY_LEVELS, type MaturityLevel, type Readiness } from "@cairn/shared";
import { CircleCheck, CircleDashed, CircleX, Lock, MapPin } from "lucide-react";
import { useTranslations } from "next-intl";
import { ProvenanceBadge } from "@/components/badges";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/** Check labels take different arguments per id; every id has its message (catalog test). */
type DynamicT = (key: string, values?: Record<string, number>) => string;

type RungState = "reached" | "current" | "next" | "locked";

const stateOf = (level: MaturityLevel, autonomy: Autonomy): RungState =>
  level === autonomy.level
    ? "current"
    : level < autonomy.level
      ? "reached"
      : level === autonomy.next?.level
        ? "next"
        : "locked";

/**
 * What an AI may be trusted with on this project, as a ladder: the rung it stands on, what each
 * rung allows, and — under the next one — the exact checks that keep it closed. Read top-down,
 * the highest rung first, like a building's floors.
 */
export function AutonomyLadder({
  readiness,
  autonomy,
}: {
  readiness: Readiness;
  autonomy: Autonomy;
}) {
  const t = useTranslations("aiReadiness.ladder");
  const td = useTranslations("domain");
  const check = useTranslations("overview.readiness.check") as unknown as DynamicT;
  const params = new Map(readiness.checks.map((c) => [c.id, c.params] as const));
  const rungs = [...MATURITY_LEVELS].reverse();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          {t("title")}
          <ProvenanceBadge provenance="measured" />
        </CardTitle>
        <CardDescription>
          {t("summary", {
            level: autonomy.level,
            name: td(`maturity.${autonomy.level}`),
          })}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ol className="flex flex-col gap-2">
          {rungs.map((level) => {
            const state = stateOf(level, autonomy);
            return (
              <li
                key={level}
                aria-current={state === "current" ? "step" : undefined}
                className={cn(
                  "flex gap-3 rounded-lg border p-3",
                  state === "current" &&
                    "border-primary-ink/50 bg-primary/5 ring-1 ring-primary-ink/30",
                  state === "next" && "border-dashed border-warning/60",
                  state === "locked" && "opacity-60",
                )}
              >
                <span
                  className={cn(
                    "grid size-8 shrink-0 place-items-center rounded-full font-semibold text-sm tabular-nums",
                    state === "current" || state === "reached"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  {level}
                </span>
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-sm">{td(`maturity.${level}`)}</span>
                    <RungBadge state={state} />
                  </div>
                  <p className="text-muted-foreground text-sm">{td(`maturityUsage.${level}`)}</p>
                  {state === "next" && autonomy.next ? (
                    <div className="mt-1 flex flex-col gap-1.5">
                      <p className="font-medium text-xs">
                        {t("unlock", { count: autonomy.next.blockers.length })}
                      </p>
                      <ul className="flex flex-col gap-1">
                        {autonomy.next.blockers.map((b) => (
                          <li key={b.id} className="flex items-start gap-2 text-sm">
                            {b.status === "fail" ? (
                              <CircleX
                                className="mt-0.5 size-4 shrink-0 text-destructive"
                                aria-hidden
                              />
                            ) : (
                              <CircleDashed
                                className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                                aria-hidden
                              />
                            )}
                            <span className="flex-1">{check(b.id, params.get(b.id))}</span>
                            <span className="shrink-0 text-muted-foreground text-xs">
                              {t(`blocker.${b.status}`)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>
      </CardContent>
    </Card>
  );
}

function RungBadge({ state }: { state: RungState }) {
  const t = useTranslations("aiReadiness.ladder.state");
  const Icon = { reached: CircleCheck, current: MapPin, next: Lock, locked: Lock }[state];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-xs",
        state === "current" ? "font-medium text-primary-ink" : "text-muted-foreground",
      )}
    >
      <Icon className="size-3.5" aria-hidden />
      {t(state)}
    </span>
  );
}
