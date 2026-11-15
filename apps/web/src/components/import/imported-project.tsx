import {
  computeHealth,
  computeReadiness,
  type ImportView,
  isImportActive,
  type ScanView,
} from "@cairn/shared";
import { ExternalLink } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { AutoRefresh } from "@/components/import/auto-refresh";
import { HealthBriefPanel } from "@/components/import/overview/health-brief";
import { ProjectMap } from "@/components/import/overview/project-map";
import {
  Gaps,
  Kpis,
  LargestFiles,
  ReadinessAxes,
  ScanHealth,
  SectionTitle,
  TokenCharts,
  VerdictPanel,
} from "@/components/import/overview/sections";
import { ImportStatusBadge } from "@/components/import/status";
import { PageHeader } from "@/components/page";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { useFormat } from "@/i18n/format";
import type { SourceBase } from "@/lib/import/source-link";

export function ImportedProject({
  runs,
  scan,
  source,
  aiIgnoreFiles,
  canRescan = false,
}: {
  runs: ImportView[];
  scan: ScanView | null;
  source: SourceBase | null;
  aiIgnoreFiles: string[] | null;
  canRescan?: boolean;
}) {
  const t = useTranslations("overview");
  const ti = useTranslations("projects.imported");
  const fmt = useFormat();
  const latest = runs[0];
  if (!latest) return null;
  const { repository: repo } = latest;
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
    <>
      <AutoRefresh active={active} />
      <PageHeader
        title={repo.fullPath}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <span>
              {repo.team} · {repo.host}
            </span>
            <Badge variant="outline" className="font-mono">
              {repo.branch}
            </Badge>
            {scan ? (
              <span className="font-mono text-xs">{scan.report.commit.slice(0, 10)}</span>
            ) : null}
            <ImportStatusBadge status={latest.status} />
            {scan ? (
              <span className="text-xs">
                {t("scannedAt", {
                  date: fmt.date(scan.report.generatedAt),
                  seconds: fmt.seconds(scan.report.durationMs),
                })}
              </span>
            ) : null}
            {technologies.map((tech) => (
              <Badge key={tech} variant="outline">
                {tech}
              </Badge>
            ))}
          </span>
        }
        actions={
          <>
            {repo.webUrl ? (
              <a
                href={repo.webUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                <ExternalLink aria-hidden />{" "}
                {ti("openOn", { provider: repo.provider === "github" ? "GitHub" : "GitLab" })}
              </a>
            ) : null}
            <Link
              href="/projects/import"
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              {ti("newImport")}
            </Link>
          </>
        }
      />

      {scan && readiness && health ? (
        <>
          <ProjectMap projectId={repo.id} scan={scan} />
          <HealthBriefPanel brief={health} projectId={repo.id} />
          <SectionTitle id="actions" title={t("actionsTitle")} hint={t("actionsHint")} />
          <Gaps readiness={readiness} base={source} />
          <VerdictPanel readiness={readiness} />
          <Kpis scan={scan} readiness={readiness} />
          <TokenCharts scan={scan} />
          <section className="grid items-start gap-4 xl:grid-cols-2">
            <LargestFiles scan={scan} base={source} />
            <ReadinessAxes readiness={readiness} base={source} />
          </section>
          <ScanHealth scan={scan} repositoryId={repo.id} canRescan={canRescan} active={active} />
        </>
      ) : (
        <Card className="border-dashed">
          <CardHeader>
            <CardTitle className="text-base">{active ? ti("running") : ti("noSuccess")}</CardTitle>
            <p className="text-muted-foreground text-sm">{ti("viewsPending")}</p>
          </CardHeader>
        </Card>
      )}

      <Card className="gap-0 py-0">
        <CardHeader className="py-5">
          <CardTitle>{ti("history", { count: runs.length })}</CardTitle>
        </CardHeader>
        <ul className="divide-y border-t">
          {runs.map((run) => (
            <li key={run.id} className="flex flex-wrap items-center gap-3 px-6 py-3 text-sm">
              <ImportStatusBadge status={run.status} />
              <span className="font-mono text-xs">
                {(run.commitSha ?? run.requestedSha)?.slice(0, 10) ?? "—"}
              </span>
              <span className="text-xs text-muted-foreground">
                {run.requestedBy} · {fmt.date(run.createdAt)}
              </span>
              <Link
                href={`/projects/import/${run.id}`}
                className="ml-auto text-xs underline underline-offset-4 hover:text-primary"
              >
                {ti("runDetail")}
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
