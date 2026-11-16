import { listTraceSnapshots } from "@cairn/db";
import { can, summarizeTrace, TRACE_CATEGORIES, type TraceSummary } from "@cairn/shared";
import { ChevronRight, Waypoints } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Panel } from "@/components/import/overview/dashboard";
import { PageHeader } from "@/components/page";
import { getFormat } from "@/i18n/format";
import { getApi } from "@/lib/api";
import { getDb, isImportConfigured } from "@/lib/import/runtime";
import { getViewer } from "@/lib/session";
import { DEMO_TRACED, demoTrace } from "@/lib/traceability/demo";
import { cn } from "@/lib/utils";

interface Line {
  id: string;
  name: string;
  team: string;
  summary: TraceSummary;
  /** Null for demo data, computed on the fly. */
  computedAt: Date | null;
}

/** Every project's requests against its main branch, as of its last traceability run. */
export default async function PortfolioTraceabilityPage() {
  const t = await getTranslations("traceability.portfolio");
  const tc = await getTranslations("domain.trace.category");
  const fmt = await getFormat();
  const api = await getApi();
  const viewer = await getViewer();

  const demo: Line[] = [];
  for (const id of DEMO_TRACED) {
    const project = await api.projects.get(id);
    if (project) {
      demo.push({
        id,
        name: project.name,
        team: project.team,
        summary: summarizeTrace(demoTrace(id)),
        computedAt: null,
      });
    }
  }
  const live: Line[] =
    isImportConfigured() && can(viewer.role, "see.allTeams")
      ? (await listTraceSnapshots(getDb())).map((s) => ({
          id: s.repositoryId,
          name: s.fullPath,
          team: s.team,
          summary: s.summary,
          computedAt: s.computedAt,
        }))
      : [];
  const lines = [...live, ...demo].sort(
    (a, b) => total(b.summary) - total(a.summary) || a.name.localeCompare(b.name),
  );

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <Panel title={t("tableTitle")} Icon={Waypoints}>
        {lines.length === 0 ? (
          <p className="rounded-lg border border-dashed p-4 text-muted-foreground text-sm">
            {t("empty")}
          </p>
        ) : (
          <div className="-mx-5 overflow-x-auto">
            <table className="w-full min-w-[46rem] text-sm">
              <thead className="text-left text-muted-foreground text-xs">
                <tr className="border-b">
                  <th className="px-5 pb-2 font-normal">{t("project")}</th>
                  {TRACE_CATEGORIES.map((c) => (
                    <th key={c} className="px-3 pb-2 text-right font-normal">
                      {tc(`${c}.label`)}
                    </th>
                  ))}
                  <th className="px-3 pb-2 font-normal">{t("lastRun")}</th>
                  <th className="w-8 pr-5" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {lines.map((l) => (
                  <tr key={l.id} className="group hover:bg-muted/40">
                    <td className="px-5 py-3">
                      <Link
                        href={`/projects/${l.id}/traceability`}
                        className="font-medium outline-none hover:text-primary focus-visible:underline"
                      >
                        {l.name}
                      </Link>
                      <span className="block text-muted-foreground text-xs">{l.team}</span>
                    </td>
                    {TRACE_CATEGORIES.map((c) => (
                      <td
                        key={c}
                        className={cn(
                          "px-3 py-3 text-right tabular-nums",
                          l.summary.counts[c] === 0
                            ? "text-muted-foreground"
                            : c === "unrequested"
                              ? "font-semibold text-destructive"
                              : "font-semibold",
                        )}
                      >
                        {l.summary.counts[c]}
                      </td>
                    ))}
                    <td className="px-3 py-3 text-muted-foreground text-xs">
                      {l.computedAt ? fmt.ago(l.computedAt.toISOString()) : t("demo")}
                    </td>
                    <td className="pr-5">
                      <ChevronRight
                        className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                        aria-hidden
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-muted-foreground text-xs">{t("note")}</p>
      </Panel>
    </>
  );
}

const total = (s: TraceSummary) => TRACE_CATEGORIES.reduce((n, c) => n + s.counts[c], 0);
