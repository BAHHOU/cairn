import { listImportViewsForRepository } from "@cairn/db";
import { AXES, can, MATURITY_LEVELS } from "@cairn/shared";
import { Check } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { GateBadge } from "@/components/badges";
import { Radar } from "@/components/charts/radar";
import { ScoreRing } from "@/components/charts/score-ring";
import { Sparkline } from "@/components/charts/sparkline";
import { ImportedProject } from "@/components/import/imported-project";
import { IssueTable } from "@/components/issue-table";
import { PageHeader, ProgressBar } from "@/components/page";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getFormat } from "@/i18n/format";
import { getApi } from "@/lib/api";
import { getDb, isImportConfigured, viewerMayImport } from "@/lib/import/runtime";
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
        const imported = await loadImportedScan(id);
        return (
          <ImportedProject
            runs={runs}
            scan={imported?.scan ?? null}
            canRescan={viewerMayImport(viewer)}
          />
        );
      }
    }
    notFound();
  }
  const t = await getTranslations("projects.detail");
  const td = await getTranslations("domain");
  const fmt = await getFormat();
  const issues = await api.issues.list({ projectId: id });
  const next = Math.min(project.maturity + 1, 5);

  return (
    <>
      <PageHeader
        title={project.name}
        description={
          <span className="flex flex-wrap items-center gap-2">
            {t("subtitle", {
              team: project.team,
              provider: project.provider,
              date: fmt.date(project.lastScan),
            })}
            {project.tech.map((t) => (
              <Badge key={t} variant="outline">
                {t}
              </Badge>
            ))}
          </span>
        }
        actions={
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href={`/projects/${project.id}/architecture`}
              className="text-sm underline underline-offset-4 hover:text-primary"
            >
              {t("linkArchitecture")}
            </Link>
            <Link
              href={`/projects/${project.id}/code-map`}
              className="text-sm underline underline-offset-4 hover:text-primary"
            >
              {t("linkCodeMap")}
            </Link>
            <Link
              href={`/projects/${project.id}/delivery`}
              className="text-sm underline underline-offset-4 hover:text-primary"
            >
              {t("linkDelivery")}
            </Link>
            <Link
              href={`/projects/${project.id}/onboarding`}
              className="text-sm underline underline-offset-4 hover:text-primary"
            >
              {t("linkOnboarding")}
            </Link>
            <GateBadge status={project.gate} />
          </div>
        }
      />

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
              <Sparkline values={project.trend} className="h-8 w-28 text-primary" />
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
                  done && "border-primary/40 bg-primary/5",
                  isNext && "border-dashed border-foreground/30",
                )}
              >
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  {done ? <Check className="size-3.5 text-primary" aria-hidden /> : null}
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
