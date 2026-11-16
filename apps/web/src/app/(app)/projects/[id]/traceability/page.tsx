import { listTrackerConnections } from "@cairn/db";
import { can, TRACE_WINDOW_DAYS, type Traceability } from "@cairn/shared";
import { GitPullRequestArrow, Info, Link2, ScrollText } from "lucide-react";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Panel } from "@/components/import/overview/dashboard";
import { PageHeader } from "@/components/page";
import { BoardLinks } from "@/components/traceability/board-links";
import { parseCategory, TraceView } from "@/components/traceability/trace-view";
import { Card, CardContent } from "@/components/ui/card";
import { getApi } from "@/lib/api";
import { getDb } from "@/lib/import/runtime";
import { getViewer } from "@/lib/session";
import { demoTrace } from "@/lib/traceability/demo";
import { loadLiveTrace } from "@/lib/traceability/live";
import { describeScope, isListable } from "@/lib/traceability/scope";

export default async function TraceabilityPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ c?: string | string[] }>;
}) {
  const { id } = await params;
  const t = await getTranslations("traceability");
  const filter = parseCategory((await searchParams).c);
  const basePath = `/projects/${id}/traceability`;
  const project = await (await getApi()).projects.get(id);

  if (project) {
    const trace = demoTrace(id);
    return (
      <Layout
        description={t("description", { branch: "main", days: TRACE_WINDOW_DAYS })}
        trace={trace}
        filter={filter}
        basePath={basePath}
        branch="main"
        sources={<Method demo />}
      />
    );
  }

  // An imported repository: its main branch read from GitLab, its tickets from the trackers.
  const live = await loadLiveTrace(id);
  if (!live) notFound();
  if (!live.ok) {
    const tc = await getTranslations("changeControl");
    return (
      <>
        <PageHeader title={t("title")} />
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <GitPullRequestArrow className="size-7 text-muted-foreground" aria-hidden />
            <h2 className="font-semibold">{t("unavailable")}</h2>
            <p className="max-w-md text-muted-foreground text-sm">
              {tc(`live.reason.${live.reason}`)}
            </p>
          </CardContent>
        </Card>
      </>
    );
  }

  const { trace, links, failed, branch } = live.value;
  const viewer = await getViewer();
  const connections = await listTrackerConnections(getDb());
  return (
    <Layout
      description={t("description", { branch, days: TRACE_WINDOW_DAYS })}
      trace={trace}
      filter={filter}
      basePath={basePath}
      branch={branch}
      sources={
        <>
          <Panel title={t("boards.title")} Icon={Link2}>
            <p className="-mt-2 text-muted-foreground text-xs">{t("boards.hint")}</p>
            <BoardLinks
              repositoryId={id}
              mayLink={can(viewer.role, "manage.rules")}
              links={links.map((l) => ({
                id: l.id,
                kind: l.kind,
                label: l.label,
                scope: describeScope(l.scope),
                failure: failed.find((f) => f.linkId === l.id)?.code ?? null,
              }))}
              connections={connections.map((c) => ({
                id: c.id,
                kind: c.kind,
                label: c.label,
                listable: isListable(c.kind),
              }))}
            />
          </Panel>
          <Method />
        </>
      }
    />
  );
}

async function Layout({
  description,
  trace,
  filter,
  basePath,
  branch,
  sources,
}: {
  description: string;
  trace: Traceability;
  filter: ReturnType<typeof parseCategory>;
  basePath: string;
  branch: string;
  sources: React.ReactNode;
}) {
  const t = await getTranslations("traceability");
  return (
    <>
      <PageHeader title={t("title")} description={description} />
      <TraceView
        trace={trace}
        filter={filter}
        basePath={basePath}
        branch={branch}
        aside={<aside className="flex min-w-0 flex-col gap-5">{sources}</aside>}
      />
    </>
  );
}

/** How the matrix is built, so a reader can trust it or challenge it. */
async function Method({ demo = false }: { demo?: boolean }) {
  const t = await getTranslations("traceability.method");
  return (
    <Panel title={t("title")} Icon={ScrollText}>
      <ul className="-mt-1 flex flex-col gap-2 text-muted-foreground text-xs">
        <li>{t("reference")}</li>
        <li>{t("tickets")}</li>
        <li>{t("agents")}</li>
        <li>{t("deterministic")}</li>
      </ul>
      {demo ? (
        <p className="flex items-start gap-1.5 text-muted-foreground text-xs">
          <Info className="mt-px size-3.5 shrink-0" aria-hidden />
          {t("demo")}
        </p>
      ) : null}
    </Panel>
  );
}
