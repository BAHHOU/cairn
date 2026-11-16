import { TRACE_CATEGORIES, type TraceSummary } from "@cairn/shared";
import { ArrowRight, Waypoints } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Panel } from "@/components/import/overview/dashboard";
import { useFormat } from "@/i18n/format";
import { cn } from "@/lib/utils";

/**
 * The project's request ↔ delivery gap on its overview, from the last traceability run: counts
 * only, so the overview never waits for GitLab and the trackers.
 */
export function TraceSignal({
  projectId,
  snapshot,
  className,
}: {
  projectId: string;
  className?: string;
  snapshot: { summary: TraceSummary; computedAt: string } | null;
}) {
  const t = useTranslations("traceability.signal");
  const tc = useTranslations("domain.trace.category");
  const fmt = useFormat();
  const href = `/projects/${projectId}/traceability`;

  return (
    <Panel
      title={t("title")}
      Icon={Waypoints}
      className={className}
      action={
        <Link
          href={href}
          className="inline-flex items-center gap-1 rounded font-medium text-[13px] outline-none hover:text-primary focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          {t("open")}
          <ArrowRight className="size-3.5" aria-hidden />
        </Link>
      }
    >
      {snapshot ? (
        <>
          <dl className="grid grid-cols-2 gap-2">
            {TRACE_CATEGORIES.map((c) => {
              const n = snapshot.summary.counts[c];
              return (
                <div
                  key={c}
                  className="flex flex-col-reverse justify-end gap-0.5 rounded-lg bg-muted/60 px-3 py-2"
                >
                  <dt className="text-muted-foreground text-xs leading-4">{tc(`${c}.label`)}</dt>
                  <dd
                    className={cn(
                      "font-semibold text-lg tabular-nums leading-tight",
                      n === 0 && "text-muted-foreground",
                      n > 0 && c === "unrequested" && "text-destructive",
                    )}
                  >
                    {n}
                  </dd>
                </div>
              );
            })}
          </dl>
          <p className="mt-auto text-muted-foreground text-xs">
            {t("asOf", { ago: fmt.ago(snapshot.computedAt) })}
          </p>
        </>
      ) : (
        <p className="text-muted-foreground text-sm">{t("never")}</p>
      )}
    </Panel>
  );
}
