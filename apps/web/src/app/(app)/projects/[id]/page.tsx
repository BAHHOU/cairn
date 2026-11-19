import { getTraceSnapshot, listImportViewsForRepository } from "@cairn/db";
import { AXES, can, MATURITY_LEVELS } from "@cairn/shared";
import { Check } from "lucide-react";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Radar } from "@/components/charts/radar";
import { ScoreRing } from "@/components/charts/score-ring";
import { Sparkline } from "@/components/charts/sparkline";
import { ImportedProject } from "@/components/import/imported-project";
import { IssueTable } from "@/components/issue-table";
import { ProgressBar } from "@/components/page";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getFormat } from "@/i18n/format";
import { getApi } from "@/lib/api";
import { getDb, isImportConfigured } from "@/lib/import/runtime";
import { loadImportedScan } from "@/lib/import/scan";
import { getViewer } from "@/lib/session";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const api = await getApi();
  const project = await api.projects.get(id);

  if (!project) {
    // Demo projects use slugs; imported repositories use UUIDs and live in the database.
    const viewer = await getViewer();
    if (UUID.test(id) && isImportConfigured() && can(viewer.role, "see.allTeams")) {
      const runs = await listImportViewsForRepository(getDb(), id);
      if (runs.length > 0) {
        const [imported, trace] = await Promise.all([
          loadImportedScan(id),
          getTraceSnapshot(getDb(), id),
        ]);
        return (
          <ImportedProject
            runs={runs}
            scan={imported?.scan ?? null}
            source={imported?.source ?? null}
            aiIgnoreFiles={imported?.aiIgnoreFiles ?? null}
            trace={
              trace ? { summary: trace.summary, computedAt: trace.computedAt.toISOString() } : null
            }
          />
        );
      }
    }
    notFound();
  }
  const t = await getTranslations("projects.detail");
  const td = await getTranslations("domain");
  const tc = await getTranslations("charts");
  const _fmt = await getFormat();
  const issues = await api.issues.list({ projectId: id });
  const next = Math.min(project.maturity + 1, 5);

  return (
    <>
      {/* Name, facts, gate and the views are in the project layout's shared header. */}
      <h1 className="sr-only">{project.name}</h1>
      {project.tech.length > 0 ? (
        <div className="-mt-2 flex flex-wrap gap-1.5">
          {project.tech.map((tech) => (
            <Badge key={tech} variant="outline">
              {tech}
            </Badge>
          ))}
        </div>
      ) : null}

      <section className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>{t("score")}</CardTitle>
            <CardDescription>{t("scoreHint")}</CardDescription>
          </CardHeader>
          <CardContent className="flex items-center gap-6">
            <ScoreRing score={project.score} size={96} stroke={9} />
            <div className="flex flex-col gap-2">
              <span className="text-xs text-muted-foreground">{t("trend")}</span>
              <Sparkline
                label={tc("sixMonthTrend")}
                values={project.trend}
                className="h-8 w-28 text-primary"
              />
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{t("axes")}</CardTitle>
          </CardHeader>
          <CardContent className="grid items-center gap-4 sm:grid-cols-2">
            <Radar values={project.axes} />
            <div className="flex flex-col gap-3">
              {AXES.map((axis) => (
                <div key={axis} className="flex flex-col gap-1">
                  <div className="flex justify-between text-sm">
                    <span>{td(`axis.${axis}`)}</span>
                    <span className="tabular-nums text-muted-foreground">{project.axes[axis]}</span>
                  </div>
                  <ProgressBar value={project.axes[axis]} />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>{t("maturity")}</CardTitle>
          <CardDescription>
            {t("maturityLine", {
              level: project.maturity,
              name: td(`maturity.${project.maturity}`),
              usage: td(`maturityUsage.${project.maturity}`).toLowerCase(),
            })}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {MATURITY_LEVELS.map((level) => {
            const done = level <= project.maturity;
            const isNext = project.maturity < 5 && level === next;
            return (
              <div
                key={level}
                className={cn(
                  "flex flex-col gap-1 rounded-lg border p-3 text-sm",
                  done && "border-success/40 bg-success/5",
                  isNext && "border-dashed border-foreground/30",
                )}
              >
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  {done ? <Check className="size-3.5 text-success" aria-hidden /> : null}
                  {t("level", { level })}
                </span>
                <span className="font-medium">{td(`maturity.${level}`)}</span>
                {isNext ? (
                  <span className="text-xs text-muted-foreground">{t("nextLevel")}</span>
                ) : null}
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card className="gap-0 py-0">
        <CardHeader className="py-5">
          <CardTitle>{t("openIssues", { count: issues.length })}</CardTitle>
        </CardHeader>
        <IssueTable issues={issues} showProject={false} />
      </Card>
    </>
  );
}
