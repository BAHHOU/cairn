import {
  computeHealth,
  computeReadiness,
  type ImportView,
  isImportActive,
  type ScanView,
  type TraceSummary,
} from "@cairn/shared";
import { ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { AutoRefresh } from "@/components/import/auto-refresh";
import {
  AreaHealth,
  LatestScan,
  PostureBanner,
  TokensByModule,
  TopRisks,
} from "@/components/import/overview/dashboard";
import { LargestFiles, ReadinessAxes, TokenCharts } from "@/components/import/overview/sections";
import { TraceSignal } from "@/components/traceability/trace-signal";
import type { SourceBase } from "@/lib/import/source-link";

/**
 * Overview of an imported repository: the posture and what to fix for the person who decides,
 * project facts and actions on the side, then the evidence for the engineers who act.
 */
export function ImportedProject({
  runs,
  scan,
  source,
  aiIgnoreFiles,
  trace = null,
}: {
  runs: ImportView[];
  scan: ScanView | null;
  source: SourceBase | null;
  aiIgnoreFiles: string[] | null;
  /** The last traceability run, counts only. */
  trace?: { summary: TraceSummary; computedAt: string } | null;
}) {
  const t = useTranslations("overview.dash");
  const tch = useTranslations("overview.charts");
  const ti = useTranslations("projects.imported");
  const latest = runs[0];
  if (!latest) return null;
  const projectId = latest.repository.id;
  const active = runs.some((r) => isImportActive(r.status));
  const technologies = runs.find((r) => r.status === "done")?.facts?.technologies ?? [];
  const readiness = scan
    ? computeReadiness({
        report: scan.report,
        docs: scan.docs,
        onboarding: scan.onboarding,
        aiIgnoreFiles,
      })
    : null;
  const health =
    scan && readiness
      ? computeHealth({
          readiness,
          report: scan.report,
          delivery: scan.delivery,
          guidesScanned: scan.docs !== null || scan.onboarding !== null,
        })
      : null;

  return (
    <div className="flex flex-col gap-6 pb-6">
      <AutoRefresh active={active} />
      <h1 className="sr-only">
        {t("overview")} · {latest.repository.fullPath}
      </h1>

      {/* Rows stretch: cards side by side share one height, so no row leaves a hole. */}
      {scan && readiness && health ? (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-2 xl:grid-cols-3">
          <PostureBanner
            brief={health}
            readiness={readiness}
            scan={scan}
            className="lg:col-span-2"
          />
          {/* Two columns pair tokens with risks, then delivery with the scan; three keep DOM order. */}
          <TraceSignal
            projectId={projectId}
            snapshot={trace}
            className="h-full lg:order-4 xl:order-none"
          />
          <TokensByModule scan={scan} className="h-full lg:order-2 xl:order-none" />
          <TopRisks
            readiness={readiness}
            projectId={projectId}
            className="h-full lg:order-3 xl:order-none"
          />
          <LatestScan
            runs={runs}
            scan={scan}
            technologies={technologies}
            className="h-full lg:order-5 xl:order-none"
          />
          <AreaHealth
            brief={health}
            projectId={projectId}
            className="lg:order-6 lg:col-span-2 xl:order-none xl:col-span-3"
          />
        </div>
      ) : (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-2">
          <section className="flex flex-col gap-1 rounded-xl border border-dashed p-6">
            <h2 className="font-semibold text-base">{active ? ti("running") : ti("noSuccess")}</h2>
            <p className="text-muted-foreground text-sm">{ti("viewsPending")}</p>
          </section>
          <LatestScan runs={runs} scan={scan} technologies={technologies} />
        </div>
      )}

      {scan && readiness ? (
        <section aria-labelledby="evidence-title" className="flex flex-col gap-4 pt-4">
          <div className="flex flex-col gap-0.5">
            <h2 id="evidence-title" className="font-semibold text-lg">
              {t("evidenceTitle")}
            </h2>
            <p className="text-muted-foreground text-sm">{t("evidenceHint")}</p>
          </div>
          <ReadinessAxes readiness={readiness} base={source} />
          <LargestFiles scan={scan} base={source} />
          <details className="group rounded-xl border bg-card">
            <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-2 gap-y-1 rounded-xl px-5 py-4 font-medium text-sm outline-none hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
              <ChevronRight
                className="size-4 text-muted-foreground transition-transform group-open:rotate-90"
                aria-hidden
              />
              {tch("title")}
              <span className="font-normal text-muted-foreground text-xs">{tch("hint")}</span>
            </summary>
            <div className="flex flex-col gap-4 px-5 pb-5">
              <TokenCharts scan={scan} titled={false} />
            </div>
          </details>
        </section>
      ) : null}
    </div>
  );
}
