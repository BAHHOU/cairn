import {
  AXES,
  INSTRUCTION_TOKEN_BUDGET,
  MATURITY_LEVELS,
  type PortfolioReadiness,
  type Readiness,
  type Verdict,
} from "@cairn/shared";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ProvenanceBadge, SeverityBadge } from "@/components/badges";
import { KpiCard } from "@/components/page";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useFormat } from "@/i18n/format";
import { cn } from "@/lib/utils";

/** Gap "why" sentences take different arguments per id; every id has one (catalog test). */
type DynamicT = (key: string, values?: Record<string, number>) => string;

/** The level an agent may work at on normal tasks (`domain.maturityUsage.4`). */
export const AGENT_LEVEL = 4;

export interface PortfolioRow {
  id: string;
  name: string;
  team: string;
  readiness: Readiness;
}

const VERDICT_VARIANT: Record<Verdict, "success" | "warning" | "destructive" | "outline"> = {
  ready: "success",
  partial: "warning",
  notReady: "destructive",
  blocked: "destructive",
  unknown: "outline",
};

export function PortfolioKpis({ portfolio }: { portfolio: PortfolioReadiness }) {
  const t = useTranslations("aiReadiness.portfolio.kpi");
  const fmt = useFormat();
  const agentReady = MATURITY_LEVELS.filter((l) => l >= AGENT_LEVEL).reduce<number>(
    (sum, l) => sum + portfolio.byLevel[l],
    0,
  );
  return (
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label={t("label")}>
      <KpiCard label={t("projects")} value={fmt.number(portfolio.projects)} />
      <KpiCard
        label={t("average")}
        value={portfolio.averageScore ?? "—"}
        hint={t("averageHint")}
        visual={<ProvenanceBadge provenance="measured" />}
      />
      <KpiCard
        label={t("agentReady")}
        value={fmt.number(agentReady)}
        hint={t("agentReadyHint", { level: AGENT_LEVEL })}
      />
      <KpiCard
        label={t("blocked")}
        value={
          <span className={cn(portfolio.blocked > 0 && "text-destructive")}>
            {fmt.number(portfolio.blocked)}
          </span>
        }
        hint={portfolio.blocked > 0 ? t("blockedHint") : t("blockedNone")}
      />
    </section>
  );
}

/**
 * How many projects stand on each rung. One series over an ordered scale: single-hue bars, the
 * count written at the end of each bar, the rung named on the left — no legend needed.
 */
export function LevelDistribution({ portfolio }: { portfolio: PortfolioReadiness }) {
  const t = useTranslations("aiReadiness.portfolio.levels");
  const td = useTranslations("domain");
  const max = Math.max(1, ...MATURITY_LEVELS.map((l) => portfolio.byLevel[l]));
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("hint")}</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col gap-2.5">
          {[...MATURITY_LEVELS].reverse().map((level) => {
            const count = portfolio.byLevel[level];
            const label = `${level} · ${td(`maturity.${level}`)}`;
            return (
              <li
                key={level}
                className="group grid grid-cols-[minmax(0,11rem)_1fr_2rem] items-center gap-3"
                title={t("bar", { label, count })}
              >
                <span className="truncate text-sm">{label}</span>
                <span className="h-3 overflow-hidden rounded-r bg-muted/60">
                  {count > 0 ? (
                    <span
                      className="block h-full rounded-r bg-(--viz-1) transition-opacity group-hover:opacity-80"
                      style={{ width: `${(count / max) * 100}%` }}
                    />
                  ) : null}
                </span>
                <span className="text-right font-medium text-sm tabular-nums">{count}</span>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}

/** The fixes that help the most projects, each with how many it helps and what it saves. */
export function PortfolioFixes({ portfolio }: { portfolio: PortfolioReadiness }) {
  const t = useTranslations("aiReadiness.portfolio.fixes");
  const why = useTranslations("overview.gaps.item") as unknown as DynamicT;
  const fmt = useFormat();
  const fixes = portfolio.fixes.slice(0, 6);
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("hint")}</CardDescription>
      </CardHeader>
      <CardContent>
        {fixes.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t("empty")}</p>
        ) : (
          <ol className="flex flex-col divide-y">
            {fixes.map((fix) => (
              <li key={fix.gap} className="flex flex-col gap-1 py-2.5 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-center gap-2">
                  <SeverityBadge severity={fix.severity} />
                  <span className="font-medium text-sm">{t(`item.${fix.gap}`)}</span>
                </div>
                <p className="text-muted-foreground text-sm">
                  {why(`${fix.gap}.why`, { budget: INSTRUCTION_TOKEN_BUDGET })}
                </p>
                <p className="text-xs">
                  {t("projects", { count: fix.projects.length, total: portfolio.projects })}
                  {fix.tokensSaved !== null
                    ? ` · ${t("saved", { value: fmt.tokens(fix.tokensSaved) })}`
                    : null}
                </p>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

/** Mix of the sequential hue for a 0–100 score: light for low, dark for high, in either theme. */
const heat = (score: number) =>
  `color-mix(in oklch, var(--viz-1) ${Math.round(12 + (score / 100) * 68)}%, var(--card))`;

/**
 * Every project, the ones that need attention first. The axis columns are a heatmap whose cells
 * also print their value, so the table is its own accessible view of the chart.
 */
export function PortfolioTable({
  rows,
  portfolio,
}: {
  rows: PortfolioRow[];
  portfolio: PortfolioReadiness;
}) {
  const t = useTranslations("aiReadiness.portfolio.table");
  const tv = useTranslations("overview.verdict.label");
  const td = useTranslations("domain");
  const levelOf = (id: string) => portfolio.autonomy[id]?.level ?? 0;
  const sorted = [...rows].sort(
    (a, b) =>
      levelOf(a.id) - levelOf(b.id) || (a.readiness.score ?? -1) - (b.readiness.score ?? -1),
  );

  return (
    <Card className="gap-0 py-0">
      <CardHeader className="py-5">
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("hint")}</CardDescription>
      </CardHeader>
      <div className="overflow-x-auto border-t">
        <table className="w-full min-w-[56rem] text-sm">
          <thead className="bg-muted/40 text-left text-muted-foreground text-xs">
            <tr>
              <th className="px-4 py-2 font-medium">{t("project")}</th>
              <th className="px-3 py-2 font-medium">{t("level")}</th>
              <th className="px-3 py-2 text-right font-medium">{t("score")}</th>
              {AXES.map((axis) => (
                <th key={axis} className="px-1 py-2 text-center font-medium">
                  {td(`axis.${axis}`)}
                </th>
              ))}
              <th className="px-4 py-2 font-medium">{t("verdict")}</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {sorted.map((row) => {
              const level = levelOf(row.id);
              const axes = new Map(row.readiness.axes.map((a) => [a.axis, a.score] as const));
              return (
                <tr key={row.id} className="hover:bg-muted/30">
                  <td className="px-4 py-2.5">
                    <Link
                      href={`/projects/${row.id}/ai-readiness`}
                      className="font-medium hover:text-primary-ink"
                    >
                      {row.name}
                    </Link>
                    <div className="text-muted-foreground text-xs">{row.team}</div>
                  </td>
                  <td className="px-3 py-2.5 text-xs">
                    <span className="font-semibold tabular-nums">{level}</span>{" "}
                    <span className="text-muted-foreground">{td(`maturity.${level}`)}</span>
                  </td>
                  <td className="px-3 py-2.5 text-right font-semibold tabular-nums">
                    {row.readiness.score ?? "—"}
                  </td>
                  {AXES.map((axis) => (
                    <HeatCell
                      key={axis}
                      score={axes.get(axis) ?? null}
                      label={t("cell", { axis: td(`axis.${axis}`), project: row.name })}
                    />
                  ))}
                  <td className="px-4 py-2.5">
                    <Badge variant={VERDICT_VARIANT[row.readiness.verdict]}>
                      {tv(row.readiness.verdict)}
                    </Badge>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function HeatCell({ score, label }: { score: number | null; label: string }) {
  const t = useTranslations("aiReadiness.portfolio.table");
  if (score === null) {
    return (
      <td className="px-1 py-1.5">
        <span
          title={`${label} · ${t("notEvaluated")}`}
          className="grid h-8 place-items-center rounded border border-dashed text-muted-foreground text-xs"
        >
          —
        </span>
      </td>
    );
  }
  return (
    <td className="px-1 py-1.5">
      <span
        title={`${label} · ${score}`}
        className={cn(
          "grid h-8 place-items-center rounded font-medium text-xs tabular-nums",
          score >= 60 ? "text-white" : "text-foreground",
        )}
        style={{ background: heat(score) }}
      >
        {score}
      </span>
    </td>
  );
}
