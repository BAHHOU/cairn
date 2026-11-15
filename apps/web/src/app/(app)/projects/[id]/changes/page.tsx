import { can } from "@cairn/shared";
import { GitPullRequestArrow, Info } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ChangeQueue, parseVerdictFilter } from "@/components/changes/change-queue";
import { PageHeader } from "@/components/page";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getApi } from "@/lib/api";
import { type LiveFailure, loadLiveChanges } from "@/lib/changes/live";
import { getViewer } from "@/lib/session";

export default async function ProjectChangesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ verdict?: string | string[] }>;
}) {
  const { id } = await params;
  const t = await getTranslations("changeControl");
  const filter = parseVerdictFilter((await searchParams).verdict);
  const api = await getApi();
  const project = await api.projects.get(id);
  const basePath = `/projects/${id}/changes`;

  if (project) {
    const changes = await api.changes.list({ projectId: id });
    return (
      <>
        <PageHeader
          title={t("title")}
          description={t("projectDescription", { name: project.name })}
        />
        <ChangeQueue changes={changes} filter={filter} basePath={basePath} showProject={false} />
      </>
    );
  }

  // An imported repository: its real merge requests, read from GitLab and Jira.
  const live = await loadLiveChanges(id);
  if (!live) notFound();
  const viewer = await getViewer();
  const mayConnect = can(viewer.role, "import.repositories");

  if (!live.ok) {
    return (
      <>
        <PageHeader title={t("title")} />
        <Unavailable reason={live.reason} mayConnect={mayConnect} />
      </>
    );
  }
  return (
    <>
      <PageHeader title={t("title")} description={t("live.description")} />
      {live.connected > 0 ? null : <TrackerNotice mayConnect={mayConnect} />}
      <ChangeQueue changes={live.value} filter={filter} basePath={basePath} showProject={false} />
    </>
  );
}

async function Unavailable({ reason, mayConnect }: { reason: LiveFailure; mayConnect: boolean }) {
  const t = await getTranslations("changeControl");
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
        <GitPullRequestArrow className="size-7 text-muted-foreground" aria-hidden />
        <h2 className="font-semibold">{t("live.unavailable")}</h2>
        <p className="max-w-md text-muted-foreground text-sm">{t(`live.reason.${reason}`)}</p>
        {mayConnect ? (
          <Link href="/settings/integrations" className={buttonVariants({ size: "sm" })}>
            {t("none.action")}
          </Link>
        ) : (
          <p className="text-muted-foreground text-xs">{t("none.noAccess")}</p>
        )}
      </CardContent>
    </Card>
  );
}

async function TrackerNotice({ mayConnect }: { mayConnect: boolean }) {
  const t = await getTranslations("changeControl");
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-info/40 bg-info/5 px-4 py-3 text-sm">
      <Info className="size-4 shrink-0 text-info" aria-hidden />
      <span className="flex-1">{t("live.noTracker")}</span>
      {mayConnect ? (
        <Link href="/settings/integrations" className="font-medium underline underline-offset-4">
          {t("none.action")}
        </Link>
      ) : null}
    </div>
  );
}
