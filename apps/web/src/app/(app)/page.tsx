import { MATURITY_LEVELS, SEVERITIES } from "@cairn/shared";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { GateBadge, ProvenanceBadge, SeverityBadge } from "@/components/badges";
import { ScoreRing } from "@/components/charts/score-ring";
import { Sparkline } from "@/components/charts/sparkline";
import { RealOverview } from "@/components/import/real-overview";
import { KpiCard, LockedCard, PageHeader, ProgressBar } from "@/components/page";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getFormat } from "@/i18n/format";
import { getApi } from "@/lib/api";
import { scoreTone, TONE_TEXT } from "@/lib/format";
import { loadRealScans } from "@/lib/import/scan";
import { getViewer } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function OverviewPage() {
  const t = await getTranslations("dashboard");
  const td = await getTranslations("domain");
  const fmt = await getFormat();
  const viewer = await getViewer();
  const api = await getApi();
  const [o, tokens, realScans] = await Promise.all([
    api.overview(),
    api.tokens.summary(),
    loadRealScans(),
  ]);
  const firstName = viewer.name.split(" ")[0];
  const scope =
    viewer.role === "admin" || viewer.role === "superadmin"
      ? t("scopeAll")
      : t("scopeTeam", { team: viewer.team });
  const maxMaturity = Math.max(...o.maturityDistribution, 1);
  const hasReal = realScans.length > 0;

  return (
    <>
      <PageHeader
        title={t("greeting", { name: firstName ?? "" })}
        description={`${td(`role.${viewer.role}`)} · ${scope} · ${
          hasReal
            ? t("realRepos", { count: realScans.length })
            : t("trackedProjects", { count: o.projectCount })
        }`}
      />

      {hasReal ? <RealOverview scans={realScans} /> : null}

      {hasReal ? (
        <div className="flex flex-col gap-1 border-t pt-6">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold">{t("demoTitle")}</h2>
            <Badge variant="warning">{t("demoBadge")}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {t("demoBody", { count: o.projectCount })}
          </p>
        </div>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label={t("kpis")}>
        <KpiCard
          label={t("avgScore")}
          value={`${o.avgScore} / 100`}
          hint={t("sixMonths")}
          visual={
            <div className="flex flex-col items-end gap-1">
              <ScoreRing score={o.avgScore} size={56} stroke={6} />
              <Sparkline values={o.scoreTrend} className="h-5 w-16 text-primary" />
            </div>
          }
        />
        <KpiCard
          label={t("gates")}
          value={
            <span className="flex items-baseline gap-3 text-base">
              <span className="text-primary">{t("gatesPassed", { count: o.gates.passed })}</span>
              <span className="text-warning">{t("gatesWarning", { count: o.gates.warning })}</span>
              <span className="text-destructive">
                {t("gatesFailed", { count: o.gates.failed })}
              </span>
            </span>
          }
          hint={t("gatesHint")}
        />
        <KpiCard
          label={t("openIssues")}
          value={SEVERITIES.reduce((s, k) => s + o.issuesBySeverity[k], 0)}
          hint={
            <span className="flex gap-1.5">
              <Badge variant="destructive">
                {t("blockers", { count: o.issuesBySeverity.blocker })}
              </Badge>
              <Badge variant="destructive">
                {t("criticals", { count: o.issuesBySeverity.critical })}
              </Badge>
            </span>
          }
        />
        <KpiCard
          label={t("avgMaturity")}
          value={t("level", { level: o.avgMaturity })}
          hint={t("maturityScale")}
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{t("priorities")}</CardTitle>
            <CardDescription>{t("prioritiesHint")}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col divide-y">
            {o.priorities.map((p) => (
              <Link
                key={p.id}
                href={`/projects/${p.id}`}
                className="flex items-center gap-4 py-3 outline-none first:pt-0 last:pb-0 hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring/50"
              >
                <ScoreRing score={p.score} size={44} stroke={5} />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-medium">{p.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {t("priorityLine", { team: p.team, level: p.maturity, count: p.openIssues })}
                  </span>
                </div>
                <GateBadge status={p.gate} />
              </Link>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("nextAction")}</CardTitle>
            <CardDescription>{t("nextActionHint")}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {o.nextAction ? (
              <>
                <div className="flex items-center gap-2">
                  <SeverityBadge severity={o.nextAction.severity} />
                  <span className="text-xs text-muted-foreground">{o.nextAction.projectName}</span>
                </div>
                <p className="font-medium">{o.nextAction.title}</p>
                <p className="text-sm text-muted-foreground">{o.nextAction.why}</p>
                <p className="text-xs text-muted-foreground">
                  {t("nextActionEffort", { minutes: o.nextAction.effortMin })}
                </p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">{t("nothingToFix")}</p>
            )}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{t("maturityDistribution")}</CardTitle>
            <CardDescription>{t("maturityDistributionHint")}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2.5">
            {MATURITY_LEVELS.map((level) => (
              <div
                key={level}
                className="grid grid-cols-[9rem_1fr_2rem] items-center gap-3 text-sm"
              >
                <span className="text-muted-foreground">
                  {level} · {td(`maturity.${level}`)}
                </span>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${(o.maturityDistribution[level] / maxMaturity) * 100}%` }}
                  />
                </div>
                <span className="text-right tabular-nums">{o.maturityDistribution[level]}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        {tokens ? (
          <Card>
            <CardHeader>
              <CardTitle>{t("tokenBudget")}</CardTitle>
              <CardDescription>{tokens.label}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="flex items-baseline justify-between">
                <span className="text-2xl font-semibold tabular-nums">
                  {fmt.tokens(tokens.consumed)}
                </span>
                <span className="text-xs text-muted-foreground">
                  {t("ofQuota", { quota: fmt.tokens(tokens.quota) })}
                </span>
              </div>
              <ProgressBar value={(tokens.consumed / tokens.quota) * 100} />
              <p
                className={`text-sm ${tokens.projection > tokens.quota ? "text-destructive" : TONE_TEXT[scoreTone(80)]}`}
              >
                {t("projection", { value: fmt.tokens(tokens.projection) })}
                {tokens.euros !== undefined ? ` (${fmt.euros(tokens.euros)})` : ""}
              </p>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <ProvenanceBadge provenance="measured" /> {tokens.provenance.measured} %
              </div>
            </CardContent>
          </Card>
        ) : (
          <LockedCard title={t("tokenBudgetLocked")} />
        )}
      </section>
    </>
  );
}
