import { CHANGE_VERDICTS, type ChangeSummary, type ChangeVerdict } from "@cairn/shared";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { KpiCard } from "@/components/page";
import { Card } from "@/components/ui/card";
import { useFormat } from "@/i18n/format";
import { cn } from "@/lib/utils";
import { ChangeList } from "./change-list";

/** Tabs read from what needs action to what does not, like the list itself. */
const URGENCY = ["blocked", "review", "pass"] as const satisfies readonly ChangeVerdict[];

export type VerdictFilter = ChangeVerdict | "all";

export const parseVerdictFilter = (value: string | string[] | undefined): VerdictFilter =>
  typeof value === "string" && (CHANGE_VERDICTS as readonly string[]).includes(value)
    ? (value as ChangeVerdict)
    : "all";

/**
 * The queue a reviewer works through: the figures that matter, tabs per verdict with their counts
 * (GitLab's Open / Merged / All), then the list. The filter is in the URL, so a link to "the
 * blocked ones" can be shared.
 */
export function ChangeQueue({
  changes,
  filter,
  basePath,
  showProject,
}: {
  changes: ChangeSummary[];
  filter: VerdictFilter;
  basePath: string;
  showProject: boolean;
}) {
  const t = useTranslations("changeControl");
  const fmt = useFormat();
  const count = (v: ChangeVerdict) => changes.filter((c) => c.verdict === v).length;
  const blocked = count("blocked");
  const zones = changes.filter((c) => c.zones.length > 0).length;
  const shown = filter === "all" ? changes : changes.filter((c) => c.verdict === filter);
  const tabs: { id: VerdictFilter; n: number }[] = [
    { id: "all", n: changes.length },
    ...URGENCY.map((v) => ({ id: v, n: count(v) })),
  ];

  return (
    <>
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label={t("kpi.label")}>
        <KpiCard
          label={t("kpi.open")}
          value={fmt.number(changes.length)}
          hint={t("kpi.openHint")}
        />
        <KpiCard
          label={t("kpi.blocked")}
          value={
            <span className={cn(blocked > 0 && "text-destructive")}>{fmt.number(blocked)}</span>
          }
          hint={blocked > 0 ? t("kpi.blockedHint") : t("kpi.blockedNone")}
        />
        <KpiCard
          label={t("kpi.review")}
          value={fmt.number(count("review"))}
          hint={t("kpi.reviewHint")}
        />
        <KpiCard label={t("kpi.zones")} value={fmt.number(zones)} hint={t("kpi.zonesHint")} />
      </section>

      <Card className="gap-0 py-0">
        <nav aria-label={t("tabs.label")} className="flex gap-1 overflow-x-auto border-b px-2">
          {tabs.map(({ id, n }) => {
            const active = id === filter;
            return (
              <Link
                key={id}
                href={id === "all" ? basePath : `${basePath}?verdict=${id}`}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "-mb-px flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                  active
                    ? "border-primary font-medium text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {t(`tabs.${id}`)}
                <span className="rounded-full bg-muted px-1.5 text-muted-foreground text-xs tabular-nums">
                  {n}
                </span>
              </Link>
            );
          })}
        </nav>
        <ChangeList changes={shown} showProject={showProject} />
      </Card>
    </>
  );
}
