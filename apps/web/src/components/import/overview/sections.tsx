import {
  AI_NOISE_KINDS,
  type AxisScore,
  type CheckStatus,
  HUGE_FILE_TOKENS,
  type Provenance,
  type Readiness,
  type ReadinessGap,
  type ScanView,
  tokensByKind,
  topWithOther,
  type Verdict,
} from "@cairn/shared";
import {
  CircleCheck,
  CircleDashed,
  CircleX,
  FilePlus2,
  ShieldAlert,
  TriangleAlert,
} from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { ProvenanceBadge, SeverityBadge } from "@/components/badges";
import { SourceRef } from "@/components/guide/bits";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useFormat } from "@/i18n/format";
import type { SourceBase } from "@/lib/import/source-link";
import { cn } from "@/lib/utils";
import { ChartBoundary, KindStackedBar, TopBars, UsefulNoiseDonut } from "./lazy-charts";

/* ---------------------------------------------------------------- shared bits */

/**
 * Check and gap ids index messages whose arguments differ from one id to the next, which the typed
 * translator cannot express for a union of keys. Every id has its message in both catalogs: the
 * catalog test asserts it for `CHECK_IDS` and `GAP_IDS`.
 */
type DynamicT = (key: string, values?: Record<string, number>) => string;

/** A card whose body is a chart, with its provenance and an explicit empty state. */
export function ChartCard({
  title,
  description,
  provenance,
  empty,
  emptyText,
  className,
  children,
}: {
  title: string;
  description?: string;
  provenance: Provenance;
  empty: boolean;
  emptyText: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          {title}
          <ProvenanceBadge provenance={provenance} />
        </CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent>
        {empty ? (
          <p className="rounded-md border border-dashed p-4 text-muted-foreground text-sm">
            {emptyText}
          </p>
        ) : (
          <ChartBoundary>{children}</ChartBoundary>
        )}
      </CardContent>
    </Card>
  );
}

function SectionTitle({ id, title, hint }: { id?: string; title: string; hint?: string }) {
  return (
    <div id={id} className="flex scroll-mt-20 flex-col gap-0.5 pt-2">
      <h2 className="font-semibold text-lg">{title}</h2>
      {hint ? <p className="text-muted-foreground text-sm">{hint}</p> : null}
    </div>
  );
}

const VERDICT_STYLE: Record<Verdict, { Icon: typeof CircleCheck; tone: string; ring: string }> = {
  ready: { Icon: CircleCheck, tone: "text-primary", ring: "border-primary/40 bg-primary/5" },
  partial: { Icon: TriangleAlert, tone: "text-warning", ring: "border-warning/50 bg-warning/5" },
  notReady: {
    Icon: CircleX,
    tone: "text-destructive",
    ring: "border-destructive/40 bg-destructive/5",
  },
  blocked: {
    Icon: ShieldAlert,
    tone: "text-destructive",
    ring: "border-destructive/40 bg-destructive/5",
  },
  unknown: { Icon: CircleDashed, tone: "text-muted-foreground", ring: "border-dashed" },
};

/* ---------------------------------------------------------------- 1. verdict */

export function VerdictPanel({ readiness }: { readiness: Readiness }) {
  const t = useTranslations("overview.verdict");
  const style = VERDICT_STYLE[readiness.verdict];
  const evaluated = readiness.checks.filter((c) => c.status !== "unknown").length;
  const passed = readiness.checks.filter((c) => c.status === "pass").length;
  const axes = readiness.axes.filter((a) => a.score !== null).length;

  return (
    <section
      aria-labelledby="verdict-title"
      className={cn("flex flex-wrap items-center gap-5 rounded-xl border p-5", style.ring)}
    >
      <div className="flex items-baseline gap-1">
        <span className={cn("font-semibold text-5xl tabular-nums leading-none", style.tone)}>
          {readiness.score ?? "—"}
        </span>
        <span className="text-muted-foreground text-sm">/ 100</span>
      </div>
      <div className="flex min-w-60 flex-1 flex-col gap-1">
        <h2 id="verdict-title" className="flex items-center gap-2 font-semibold text-lg">
          <style.Icon className={cn("size-5 shrink-0", style.tone)} aria-hidden />
          {t(`label.${readiness.verdict}`)}
        </h2>
        <p className="text-sm">
          {t(`message.${readiness.verdict}`, { count: readiness.blockers })}
        </p>
        <p className="text-muted-foreground text-xs">
          {t("howComputed", { axes, passed, evaluated })}{" "}
          <a href="#readiness" className="underline underline-offset-4 hover:text-foreground">
            {t("seeChecks")}
          </a>
        </p>
      </div>
      <ProvenanceBadge provenance="measured" />
    </section>
  );
}

/* ---------------------------------------------------------------- 3. charts */

export function TokenCharts({ scan, titled = true }: { scan: ScanView; titled?: boolean }) {
  const t = useTranslations("overview.charts");
  const { stats } = scan.report;
  const kinds = tokensByKind(scan.report);
  const languages = topWithOther(stats.byLanguage, 10);
  const modules = topWithOther(stats.modules, 10);

  return (
    <>
      {titled ? <SectionTitle title={t("title")} hint={t("hint")} /> : null}
      <section className="grid items-start gap-4 lg:grid-cols-2">
        <ChartCard
          title={t("donutTitle")}
          description={t("donutHint")}
          provenance="estimated"
          empty={stats.tokens === 0}
          emptyText={t("empty")}
        >
          <UsefulNoiseDonut useful={stats.tokensAiRelevant} noise={stats.tokensNoise} />
        </ChartCard>
        <ChartCard
          title={t("kindTitle")}
          description={t("kindHint")}
          provenance="estimated"
          empty={kinds.length === 0}
          emptyText={t("empty")}
        >
          <KindStackedBar kinds={kinds} />
        </ChartCard>
        <ChartCard
          title={t("languageTitle")}
          description={
            languages.otherCount > 0
              ? t("otherHint", { count: languages.otherCount })
              : t("languageHint")
          }
          provenance="estimated"
          empty={languages.top.length === 0}
          emptyText={t("empty")}
        >
          <LanguageBars scan={scan} />
        </ChartCard>
        <ChartCard
          title={t("moduleTitle")}
          description={
            modules.otherCount > 0 ? t("otherHint", { count: modules.otherCount }) : t("moduleHint")
          }
          provenance="estimated"
          empty={modules.top.length === 0}
          emptyText={t("empty")}
        >
          <ModuleBars scan={scan} />
        </ChartCard>
      </section>
    </>
  );
}

function LanguageBars({ scan }: { scan: ScanView }) {
  const t = useTranslations("overview.charts");
  const { top } = topWithOther(scan.report.stats.byLanguage, 10);
  return (
    <TopBars
      label={t("languageTitle")}
      items={top.map((l) => ({
        name: l.language,
        tokens: l.tokens,
        detail: t("files", { count: l.files }),
      }))}
    />
  );
}

function ModuleBars({ scan }: { scan: ScanView }) {
  const t = useTranslations("overview.charts");
  const { top } = topWithOther(scan.report.stats.modules, 10);
  return (
    <TopBars
      label={t("moduleTitle")}
      items={top.map((m) => ({
        name: m.name,
        tokens: m.tokens,
        detail: t("files", { count: m.files }),
      }))}
    />
  );
}

/* ---------------------------------------------------------------- largest files */

export function LargestFiles({ scan, base }: { scan: ScanView; base: SourceBase | null }) {
  const t = useTranslations("overview.largest");
  const td = useTranslations("domain.fileKind");
  const fmt = useFormat();
  const files = scan.report.stats.largest.slice(0, 10);
  const max = Math.max(1, ...files.map((f) => f.tokens));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          {t("title")}
          <ProvenanceBadge provenance="estimated" />
        </CardTitle>
        <CardDescription>{t("hint", { max: fmt.number(HUGE_FILE_TOKENS) })}</CardDescription>
      </CardHeader>
      <CardContent>
        {files.length === 0 ? (
          <p className="rounded-md border border-dashed p-4 text-muted-foreground text-sm">
            {t("empty")}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-xl text-sm">
              <thead className="text-left text-muted-foreground text-xs">
                <tr>
                  <th className="pb-2 font-medium">{t("file")}</th>
                  <th className="pb-2 font-medium">{t("kind")}</th>
                  <th className="w-[38%] pb-2 font-medium">{t("tokens")}</th>
                  <th className="pb-2 text-right font-medium">{t("size")}</th>
                </tr>
              </thead>
              <tbody>
                {files.map((f) => {
                  const noise = AI_NOISE_KINDS.includes(f.kind);
                  const huge = !noise && f.tokens > HUGE_FILE_TOKENS;
                  return (
                    <tr key={f.path} className="border-t">
                      <td className="max-w-72 py-2 pr-3">
                        <SourceRef source={{ path: f.path }} base={base} className="text-xs" />
                      </td>
                      <td className="whitespace-nowrap py-2 pr-3 text-muted-foreground text-xs">
                        {td(f.kind)}
                        {noise ? (
                          <span className="ml-1.5 rounded bg-muted px-1 text-[10px] uppercase">
                            {t("noise")}
                          </span>
                        ) : null}
                      </td>
                      <td className="py-2 pr-3">
                        <div className="flex items-center gap-2">
                          <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                            <span
                              className="block h-full rounded-full"
                              style={{
                                width: `${Math.max(2, (f.tokens / max) * 100)}%`,
                                background: noise ? "var(--viz-2)" : "var(--viz-1)",
                              }}
                            />
                          </span>
                          <span className="w-14 text-right text-xs tabular-nums">
                            {fmt.tokens(f.tokens)}
                          </span>
                          {huge ? (
                            <TriangleAlert
                              className="size-3.5 shrink-0 text-warning"
                              aria-label={t("tooLarge")}
                            />
                          ) : (
                            <span className="size-3.5 shrink-0" />
                          )}
                        </div>
                      </td>
                      <td className="py-2 text-right text-muted-foreground text-xs tabular-nums">
                        {fmt.bytes(f.bytes)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ---------------------------------------------------------------- readiness axes */

const CHECK_ICON: Record<CheckStatus, { Icon: typeof CircleCheck; tone: string }> = {
  pass: { Icon: CircleCheck, tone: "text-primary" },
  fail: { Icon: CircleX, tone: "text-destructive" },
  unknown: { Icon: CircleDashed, tone: "text-muted-foreground" },
};

export function ReadinessAxes({
  readiness,
  base,
}: {
  readiness: Readiness;
  base: SourceBase | null;
}) {
  const t = useTranslations("overview.readiness");
  const tc = t as unknown as DynamicT;
  const td = useTranslations("domain.axis");

  return (
    <Card id="readiness" className="scroll-mt-20">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          {t("title")}
          <ProvenanceBadge provenance="measured" />
        </CardTitle>
        <CardDescription>{t("hint")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {readiness.axes.map((axis) => (
          <AxisRow key={axis.axis} axis={axis} label={td(axis.axis)}>
            <ul className="flex flex-col gap-1.5 pt-2">
              {readiness.checks
                .filter((c) => c.axis === axis.axis)
                .map((c) => {
                  const { Icon, tone } = CHECK_ICON[c.status];
                  return (
                    <li key={c.id} className="flex flex-wrap items-start gap-x-2 gap-y-0.5 text-sm">
                      <Icon className={cn("mt-0.5 size-4 shrink-0", tone)} aria-hidden />
                      <span className="sr-only">{t(`status.${c.status}`)}</span>
                      <span
                        className={cn("flex-1", c.status === "unknown" && "text-muted-foreground")}
                      >
                        {tc(`check.${c.id}`, c.params)}
                      </span>
                      {c.evidence ? <SourceRef source={c.evidence} base={base} /> : null}
                    </li>
                  );
                })}
              {axis.total === 0 ? (
                <li className="text-muted-foreground text-sm">{t(`unavailable.${axis.axis}`)}</li>
              ) : null}
            </ul>
          </AxisRow>
        ))}
      </CardContent>
    </Card>
  );
}

function AxisRow({
  axis,
  label,
  children,
}: {
  axis: AxisScore;
  label: string;
  children: ReactNode;
}) {
  const t = useTranslations("overview.readiness");
  return (
    <details className="group rounded-lg border px-3 py-2 open:bg-muted/20">
      <summary className="flex cursor-pointer list-none items-center gap-3 rounded outline-none focus-visible:ring-2 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
        <span className="w-40 shrink-0 font-medium text-sm">{label}</span>
        <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
          {axis.score !== null ? (
            <span
              className="block h-full rounded-full bg-(--viz-1)"
              style={{ width: `${Math.max(2, axis.score)}%` }}
            />
          ) : null}
        </span>
        <span className="w-28 shrink-0 text-right text-xs tabular-nums">
          {axis.score === null ? (
            <span className="text-muted-foreground">{t("notAvailable")}</span>
          ) : (
            <>
              <span className="font-semibold text-sm">{axis.score}</span>
              <span className="text-muted-foreground">
                {" "}
                · {t("checks", { passed: axis.passed, evaluated: axis.evaluated })}
              </span>
            </>
          )}
        </span>
      </summary>
      {children}
    </details>
  );
}

/* ---------------------------------------------------------------- 4. gaps */

export function Gaps({ readiness, base }: { readiness: Readiness; base: SourceBase | null }) {
  const t = useTranslations("overview.gaps");
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          {t("title")}
          <Badge variant="secondary">{readiness.gaps.length}</Badge>
        </CardTitle>
        <CardDescription>{t("hint")}</CardDescription>
      </CardHeader>
      <CardContent>
        {readiness.gaps.length === 0 ? (
          <p className="flex items-center gap-2 text-muted-foreground text-sm">
            <CircleCheck className="size-4 text-primary" aria-hidden />
            {t("empty")}
          </p>
        ) : (
          <ol className="flex flex-col divide-y">
            {readiness.gaps.map((gap, index) => (
              <GapRow key={gap.id} gap={gap} index={index + 1} base={base} />
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

function GapRow({
  gap,
  index,
  base,
}: {
  gap: ReadinessGap;
  index: number;
  base: SourceBase | null;
}) {
  const t = useTranslations("overview.gaps");
  const tg = t as unknown as DynamicT;
  const fmt = useFormat();
  const params = gap.params ?? {};
  return (
    <li className="grid gap-x-4 gap-y-1.5 py-3 first:pt-0 last:pb-0 md:grid-cols-[1.5rem_1fr_9rem]">
      <span className="hidden font-medium text-muted-foreground text-sm tabular-nums md:block">
        {index}
      </span>
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <SeverityBadge severity={gap.severity} />
          <span className="font-medium text-sm">{tg(`item.${gap.id}.title`, params)}</span>
        </div>
        <p className="text-muted-foreground text-sm">{tg(`item.${gap.id}.why`, params)}</p>
        {gap.file ? (
          gap.file.create ? (
            <span className="inline-flex items-center gap-1 font-mono text-[11px] text-muted-foreground">
              <FilePlus2 className="size-3" aria-hidden />
              {t("create", { path: gap.file.path })}
            </span>
          ) : (
            <SourceRef
              source={{ path: gap.file.path, ...(gap.file.line ? { line: gap.file.line } : {}) }}
              base={base}
            />
          )
        ) : null}
      </div>
      <div className="flex items-center gap-2 md:flex-col md:items-end md:justify-center">
        {gap.tokensSaved !== null ? (
          <>
            <span className="font-semibold text-sm tabular-nums">
              {t("saved", { value: fmt.tokens(gap.tokensSaved) })}
            </span>
            <ProvenanceBadge provenance="estimated" />
          </>
        ) : (
          <span className="text-muted-foreground text-xs">{t("noTokenFigure")}</span>
        )}
      </div>
    </li>
  );
}

export { SectionTitle };
