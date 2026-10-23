import { type ImportView, isImportActive, type ScanView } from "@cairn/shared";
import { ExternalLink } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { ProjectTabs } from "@/components/guide/bits";
import { AutoRefresh } from "@/components/import/auto-refresh";
import { RescanButton } from "@/components/import/rescan-button";
import { ScanNumbers } from "@/components/import/scan-numbers";
import { ImportStatusBadge } from "@/components/import/status";
import { PageHeader } from "@/components/page";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useFormat } from "@/i18n/format";

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b py-2 text-sm last:border-b-0">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-right">{children}</dd>
    </div>
  );
}

function ViewLink({ href, label, summary }: { href: string; label: string; summary: string }) {
  const t = useTranslations("projects.imported");
  return (
    <li>
      <Link
        href={href}
        className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm transition-colors hover:bg-accent/50"
      >
        <span className="flex flex-col">
          <span className="font-medium">{label}</span>
          <span className="text-muted-foreground text-xs">{summary}</span>
        </span>
        <Badge>{t("open")}</Badge>
      </Link>
    </li>
  );
}

/**
 * Project page of a repository imported from Git. Only measured facts are shown: no score, maturity
 * or issue count exists for it yet, and none is invented.
 */
export function ImportedProject({
  runs,
  scan,
  canRescan = false,
}: {
  runs: ImportView[];
  scan: ScanView | null;
  canRescan?: boolean;
}) {
  const t = useTranslations("projects.imported");
  const fmt = useFormat();
  const latest = runs[0];
  if (!latest) return null;
  const analysed = runs.find((r) => r.status === "done");
  const { repository: repo } = latest;
  const facts = analysed?.facts ?? null;
  const active = runs.some((r) => isImportActive(r.status));
  const seconds =
    analysed?.startedAt && analysed.finishedAt
      ? Math.max(
          0,
          Math.round((Date.parse(analysed.finishedAt) - Date.parse(analysed.startedAt)) / 1000),
        )
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
            <ImportStatusBadge status={latest.status} />
            {facts?.technologies.map((tech) => (
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
                {t("openOn", { provider: repo.provider === "github" ? "GitHub" : "GitLab" })}
              </a>
            ) : null}
            <Link
              href="/projects/import"
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              {t("newImport")}
            </Link>
            {canRescan ? <RescanButton repositoryId={repo.id} disabled={active} /> : null}
          </>
        }
      />
      <ProjectTabs id={repo.id} active="overview" />

      <section className="grid items-start gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t("lastScan")}</CardTitle>
            <CardDescription>{t("lastScanHint")}</CardDescription>
          </CardHeader>
          <CardContent>
            {analysed && facts ? (
              <dl>
                <Row label={t("branch")}>
                  <span className="font-mono text-xs">{repo.branch}</span>
                </Row>
                <Row label={t("commit")}>
                  <span className="font-mono text-xs">
                    {analysed.commitSha?.slice(0, 10) ?? "—"}
                  </span>
                </Row>
                <Row label={t("files")}>{fmt.number(facts.fileCount)}</Row>
                <Row label={t("technologies")}>
                  {facts.technologies.length ? (
                    <span className="flex flex-wrap justify-end gap-1">
                      {facts.technologies.map((tech) => (
                        <Badge key={tech} variant="outline">
                          {tech}
                        </Badge>
                      ))}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">{t("noTechnology")}</span>
                  )}
                </Row>
                <Row label={t("duration")}>
                  {seconds === null ? "—" : t("seconds", { seconds })}
                </Row>
                <Row label={t("analysedAt")}>
                  {analysed.finishedAt ? fmt.date(analysed.finishedAt) : "—"}
                </Row>
              </dl>
            ) : (
              <p className="text-sm text-muted-foreground">
                {active ? t("running") : t("noSuccess")}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("views")}</CardTitle>
            <CardDescription>{t("viewsHint")}</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-2">
              {scan ? (
                <>
                  <li>
                    <Link
                      href={`/projects/${repo.id}/architecture`}
                      className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm transition-colors hover:bg-accent/50"
                    >
                      <span className="flex flex-col">
                        <span className="font-medium">{t("architecture")}</span>
                        <span className="text-muted-foreground text-xs">
                          {t("architectureSummary", {
                            nodes: scan.report.counts.archNodes,
                            edges: scan.report.counts.archEdges,
                            violations: scan.report.counts.archViolations,
                          })}
                        </span>
                      </span>
                      <Badge>{t("open")}</Badge>
                    </Link>
                  </li>
                  <li>
                    <Link
                      href={`/projects/${repo.id}/code-map`}
                      className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm transition-colors hover:bg-accent/50"
                    >
                      <span className="flex flex-col">
                        <span className="font-medium">{t("codeMap")}</span>
                        <span className="text-muted-foreground text-xs">
                          {t("codeMapSummary", {
                            nodes: scan.report.counts.codeNodes,
                            edges: scan.report.counts.codeEdges,
                          })}
                        </span>
                      </span>
                      <Badge>{t("open")}</Badge>
                    </Link>
                  </li>
                  <ViewLink
                    href={`/projects/${repo.id}/delivery`}
                    label={t("delivery")}
                    summary={
                      scan.delivery
                        ? t("deliverySummary", {
                            stages: scan.delivery.stages.length,
                            jobs: scan.delivery.counts.jobs,
                            findings: scan.delivery.findings.length,
                          })
                        : t("deliveryEmpty")
                    }
                  />
                  <ViewLink
                    href={`/projects/${repo.id}/onboarding`}
                    label={t("onboarding")}
                    summary={
                      scan.onboarding
                        ? t("onboardingSummary", {
                            tools: scan.onboarding.tools.length,
                            steps: scan.onboarding.steps.length,
                          })
                        : t("onboardingEmpty")
                    }
                  />
                  <ViewLink
                    href={`/projects/${repo.id}/docs`}
                    label={t("docs")}
                    summary={
                      scan.docs
                        ? t("docsSummary", {
                            files: scan.docs.stats.files,
                            drift: scan.docs.drift.length,
                          })
                        : t("docsEmpty")
                    }
                  />
                </>
              ) : (
                <li className="rounded-lg border border-dashed p-3 text-muted-foreground text-sm">
                  {t("viewsPending")}
                </li>
              )}
            </ul>
          </CardContent>
        </Card>
      </section>

      {scan ? <ScanNumbers report={scan.report} /> : null}

      <Card className="gap-0 py-0">
        <CardHeader className="py-5">
          <CardTitle>{t("history", { count: runs.length })}</CardTitle>
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
                {t("runDetail")}
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
