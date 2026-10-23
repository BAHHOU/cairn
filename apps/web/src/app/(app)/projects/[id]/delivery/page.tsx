import {
  deliveryBoard,
  deliveryRisks,
  formatMinutes,
  type ProjectArchitecture,
} from "@cairn/shared";
import { ChevronRight, GitCommitHorizontal, RotateCcw } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { SeverityBadge } from "@/components/badges";
import { EnvironmentCard, Source, StageRow } from "@/components/delivery/board";
import { ImportedDelivery } from "@/components/guide/delivery-view";
import { PageHeader } from "@/components/page";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getFormat } from "@/i18n/format";
import { getApi } from "@/lib/api";
import { loadImportedScan } from "@/lib/import/scan";

/**
 * The chain from a commit to production.
 *
 * Drawn as a board rather than as a graph: a pipeline is a sequence with gates,
 * and the parts a reader comes for — the waiting, who is allowed to approve, what
 * happens when it goes wrong — have no natural place in a node-and-edge diagram.
 */

const labelsOf = (architecture: ProjectArchitecture | null): Record<string, string> =>
  Object.fromEntries((architecture?.nodes ?? []).map((n) => [n.id, n.label]));

export default async function DeliveryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const api = await getApi();
  const project = await api.projects.get(id);
  if (!project) {
    const imported = await loadImportedScan(id);
    if (!imported) notFound();
    return <ImportedDelivery id={id} imported={imported} />;
  }

  const t = await getTranslations("delivery.page");
  const tn = await getTranslations("projectNav");
  const fmt = await getFormat();
  const pipeline = await api.projects.delivery(id);
  const architecture = await api.projects.architecture(id);
  const nodeLabels = labelsOf(architecture);

  const board = pipeline ? deliveryBoard(pipeline) : null;
  const risks = pipeline ? deliveryRisks(pipeline) : [];
  const last = board?.lanes[board.lanes.length - 1];

  return (
    <>
      <PageHeader
        title={t("title", { name: project.name })}
        description={
          pipeline && board && last
            ? t(last.waitMin ? "summaryWithWait" : "summary", {
                provider: pipeline.provider,
                stages: pipeline.stages.length,
                environments: pipeline.environments.length,
                env: last.env.label,
                machine: formatMinutes(last.leadTimeMin),
                wait: formatMinutes(last.waitMin),
                date: fmt.date(pipeline.generatedAt),
              })
            : t("none")
        }
        actions={
          <div className="flex flex-wrap gap-4 text-sm">
            <Link
              href={`/projects/${project.id}/architecture`}
              className="underline underline-offset-4"
            >
              {tn("architecture")}
            </Link>
            <Link
              href={`/projects/${project.id}/onboarding`}
              className="underline underline-offset-4"
            >
              {tn("onboarding")}
            </Link>
            <Link href={`/projects/${project.id}`} className="underline underline-offset-4">
              {tn("project")}
            </Link>
          </div>
        }
      />

      {pipeline && board ? (
        <>
          {/* ------------------------------------------------ commit and shared CI */}
          <section className="flex flex-col gap-3 overflow-hidden rounded-xl border bg-card">
            <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b bg-muted/30 px-4 py-3">
              <GitCommitHorizontal className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <span className="font-medium text-sm">{t("commit")}</span>
              <span className="font-mono text-muted-foreground text-xs">{pipeline.commit}</span>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <h3 className="font-semibold text-sm">{t("ci")}</h3>
              <span className="text-muted-foreground text-xs tabular-nums">
                {formatMinutes(board.ciMinutes)}
              </span>
              <p className="basis-full text-muted-foreground text-xs sm:basis-auto sm:border-border sm:border-l sm:pl-3">
                {t("ciHint")}
              </p>
            </header>

            <ul className="grid gap-2 px-4 pb-4 sm:grid-cols-2 xl:grid-cols-3">
              {board.ci.map((s) => (
                <StageRow key={s.id} stage={s} />
              ))}
            </ul>
          </section>

          {/* ------------------------------------------------ one column per environment */}
          <section className="grid items-stretch gap-4 lg:grid-cols-3">
            {board.lanes.map((lane) => (
              <EnvironmentCard
                key={lane.env.id}
                env={lane.env}
                stages={lane.stages}
                leadTimeMin={lane.leadTimeMin}
                waitMin={lane.waitMin}
                nodeLabels={nodeLabels}
                architectureHref={(nodeId) =>
                  `/projects/${project.id}/architecture?noeud=${encodeURIComponent(nodeId)}`
                }
              />
            ))}
          </section>

          {/* ------------------------------------------------ findings and rollback */}
          <section className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>{t("risks")}</CardTitle>
                <CardDescription>{t("risksHint")}</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                {risks.length === 0 ? (
                  <p className="text-muted-foreground text-sm">{t("noRisk")}</p>
                ) : (
                  risks.map((risk) => (
                    <article key={risk.id} className="flex flex-col gap-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <SeverityBadge severity={risk.severity} />
                        <h4 className="font-medium text-sm">{risk.title}</h4>
                      </div>
                      <p className="text-muted-foreground text-sm">{risk.detail}</p>
                      <Source sources={risk.sources} />
                    </article>
                  ))
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <RotateCcw className="size-4" aria-hidden />
                  {t("rollback")}
                </CardTitle>
                <CardDescription>
                  {pipeline.rollback.testedAt
                    ? t("rollbackTested", { date: fmt.date(pipeline.rollback.testedAt) })
                    : t("rollbackNever")}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3 text-sm">
                <p className="text-muted-foreground">{pipeline.rollback.how}</p>
                <p>
                  {t.rich("rollbackDuration", {
                    duration: formatMinutes(pipeline.rollback.durationMin),
                    strong: (chunks) => (
                      <span className="font-semibold tabular-nums">{chunks}</span>
                    ),
                  })}
                </p>
                <Source sources={pipeline.rollback.sources} />
              </CardContent>
            </Card>
          </section>
        </>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>{t("emptyTitle")}</CardTitle>
            <CardDescription>{t("emptyHint")}</CardDescription>
          </CardHeader>
          <CardContent className="text-muted-foreground text-sm">
            {tn.rich("exampleAvailable", {
              link: (chunks) => (
                <Link
                  href="/projects/qis-dist-cms/delivery"
                  className="underline underline-offset-4"
                >
                  {chunks}
                </Link>
              ),
            })}
          </CardContent>
        </Card>
      )}
    </>
  );
}
