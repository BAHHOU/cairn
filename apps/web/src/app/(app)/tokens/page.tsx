import { PROVENANCES } from "@cairn/shared";
import { getTranslations } from "next-intl/server";
import { ProvenanceBadge } from "@/components/badges";
import { KpiCard, PageHeader, ProgressBar, Restricted } from "@/components/page";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getFormat } from "@/i18n/format";
import { getApi } from "@/lib/api";
import { cn } from "@/lib/utils";

/** The demo series ends in October (month index 9). */
const LAST_MONTH = 9;

export default async function TokensPage() {
  const s = await (await getApi()).tokens.summary();
  if (!s) return <Restricted />;
  const t = await getTranslations("tokens");
  const fmt = await getFormat();
  const months = s.monthly.map((_, i) => fmt.month(LAST_MONTH - (s.monthly.length - 1 - i)));

  const over = s.projection > s.quota;
  const max = Math.max(...s.monthly, 1);

  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("description", { label: s.label, day: 18, days: 30 })}
      />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label={t("consumed")}
          value={fmt.tokens(s.consumed)}
          hint={t("ofQuota", { quota: fmt.tokens(s.quota) })}
        />
        <KpiCard
          label={t("projection")}
          value={<span className={cn(over && "text-destructive")}>{fmt.tokens(s.projection)}</span>}
          hint={over ? t("overQuota") : t("withinQuota")}
        />
        {s.euros !== undefined ? (
          <KpiCard label={t("cost")} value={fmt.euros(s.euros)} hint={t("costHint")} />
        ) : null}
        <KpiCard
          label={t("quotaShare")}
          value={`${Math.round((s.consumed / s.quota) * 100)} %`}
          visual={
            <div className="w-20">
              <ProgressBar value={(s.consumed / s.quota) * 100} />
            </div>
          }
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{t("trend")}</CardTitle>
            <CardDescription>{t("trendHint")}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex h-44 items-stretch gap-3" role="img" aria-label={t("trendLabel")}>
              {s.monthly.map((v, i) => (
                <div key={months[i]} className="flex h-full flex-1 flex-col items-center gap-1">
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {fmt.tokens(v)}
                  </span>
                  <div className="flex w-full flex-1 items-end">
                    <div
                      className={cn(
                        "w-full rounded-t-md",
                        i === s.monthly.length - 1 ? "bg-primary/60" : "bg-primary",
                      )}
                      style={{ height: `${(v / max) * 100}%` }}
                    />
                  </div>
                  <span className="text-xs text-muted-foreground">{months[i]}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("sources")}</CardTitle>
            <CardDescription>{t("sourcesHint")}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {PROVENANCES.map((p) => (
              <div key={p} className="flex items-center gap-3">
                <div className="w-20">
                  <ProvenanceBadge provenance={p} />
                </div>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-foreground/60"
                    style={{ width: `${s.provenance[p]}%` }}
                  />
                </div>
                <span className="w-10 text-right text-sm tabular-nums">{s.provenance[p]} %</span>
              </div>
            ))}
            <p className="text-xs text-muted-foreground">{t("ceilingNote")}</p>
          </CardContent>
        </Card>
      </section>

      <Card className="gap-0 py-0">
        <CardHeader className="py-5">
          <CardTitle>{t("byProject")}</CardTitle>
          <CardDescription>{t("byProjectHint")}</CardDescription>
        </CardHeader>
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>{t("project")}</TableHead>
              <TableHead>{t("team")}</TableHead>
              <TableHead className="text-right">{t("tokensCol")}</TableHead>
              <TableHead className="w-56">{t("wasted")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {s.byProject.map((r) => (
              <TableRow key={r.projectId}>
                <TableCell className="font-medium">{r.projectName}</TableCell>
                <TableCell>{r.team}</TableCell>
                <TableCell className="text-right tabular-nums">{fmt.tokens(r.tokens)}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <span className="w-12 whitespace-nowrap text-right tabular-nums">
                      {r.wasteShare} %
                    </span>
                    <ProgressBar value={100 - r.wasteShare} />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </>
  );
}
