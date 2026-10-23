import type { RepositoryScanSummary } from "@cairn/db";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { KpiCard } from "@/components/page";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useFormat } from "@/i18n/format";

/**
 * Dashboard block built only from real scans of imported repositories. Everything here is counted in
 * the code: no score, maturity level or cost is shown, because none is measured for these repositories.
 */
export function RealOverview({ scans }: { scans: RepositoryScanSummary[] }) {
  const t = useTranslations("dashboard.real");
  const fmt = useFormat();
  const total = (pick: (s: RepositoryScanSummary) => number) =>
    scans.reduce((sum, s) => sum + pick(s), 0);
  const files = total((s) => s.report.stats.files);
  const lines = total((s) => s.report.stats.lines);
  const tokens = total((s) => s.report.stats.tokens);
  const useful = total((s) => s.report.stats.tokensAiRelevant);
  const noise = total((s) => s.report.stats.tokensNoise);
  const noisePct = tokens > 0 ? Math.round((noise / tokens) * 100) : 0;
  const secrets = total((s) => s.report.findings.length);
  const violations = total((s) => s.report.counts.archViolations);

  return (
    <section className="flex flex-col gap-4" aria-label={t("title")}>
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-semibold">{t("title")}</h2>
        <Badge variant="success">{t("badge")}</Badge>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label={t("analysed")}
          value={scans.length}
          hint={t("analysedHint", { count: scans.length })}
        />
        <KpiCard
          label={t("code")}
          value={t("files", { count: files })}
          hint={t("lines", { count: lines })}
        />
        <KpiCard
          label={t("tokens")}
          value={fmt.tokens(tokens)}
          hint={t("tokensHint", { useful: fmt.tokens(useful), pct: noisePct })}
        />
        <KpiCard
          label={t("attention")}
          value={secrets + violations}
          hint={
            <span className="flex flex-wrap gap-1.5">
              <Badge variant={secrets > 0 ? "destructive" : "outline"}>
                {t("secrets", { count: secrets })}
              </Badge>
              <Badge variant={violations > 0 ? "warning" : "outline"}>
                {t("archViolations", { count: violations })}
              </Badge>
            </span>
          }
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("imported")}</CardTitle>
          <CardDescription>{t("importedHint")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col divide-y">
          {scans.map((s) => {
            const { stats, counts, findings } = s.report;
            return (
              <div
                key={s.repositoryId}
                className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 py-3 first:pt-0 last:pb-0"
              >
                <div className="flex min-w-0 flex-col">
                  <Link
                    href={`/projects/${s.repositoryId}`}
                    className="truncate font-medium hover:underline"
                  >
                    {s.fullPath}
                  </Link>
                  <span className="text-xs text-muted-foreground">
                    {s.team} · {s.host} ·{" "}
                    <span className="font-mono">
                      {s.branch}@{s.commitSha.slice(0, 7)}
                    </span>{" "}
                    · {t("scannedOn", { date: fmt.date(s.createdAt) })}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
                  <span className="tabular-nums">{t("files", { count: stats.files })}</span>
                  <span className="tabular-nums">{t("lines", { count: stats.lines })}</span>
                  <span className="tabular-nums">
                    {t("tokenCount", { value: fmt.tokens(stats.tokens) })}
                  </span>
                  <Badge variant={findings.length > 0 ? "destructive" : "outline"}>
                    {t("secrets", { count: findings.length })}
                  </Badge>
                  <Badge variant={counts.archViolations > 0 ? "warning" : "outline"}>
                    {t("violations", { count: counts.archViolations })}
                  </Badge>
                  <Link
                    href={`/projects/${s.repositoryId}/architecture`}
                    className="text-xs underline-offset-2 hover:underline"
                  >
                    {t("architecture")}
                  </Link>
                  <Link
                    href={`/projects/${s.repositoryId}/code-map`}
                    className="text-xs underline-offset-2 hover:underline"
                  >
                    {t("codeMap")}
                  </Link>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </section>
  );
}
