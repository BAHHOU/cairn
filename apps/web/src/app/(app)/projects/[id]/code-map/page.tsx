import dynamic from "next/dynamic";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { ProjectTabs } from "@/components/guide/bits";
import { PageHeader } from "@/components/page";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getFormat } from "@/i18n/format";
import { getApi } from "@/lib/api";
import { loadImportedScan } from "@/lib/import/scan";

/**
 * The code map sits one floor below the architecture view.
 *
 * Architecture answers "what does this system look like", with a few dozen boxes a
 * human curated. This answers "where does this actually live", with every symbol the
 * extractor found. Keeping them as two routes rather than two tabs of one diagram is
 * deliberate: they are read at different moments, by people asking different questions.
 */
const CodeMapCanvas = dynamic(() =>
  import("@/components/code-map/canvas").then((m) => m.CodeMapCanvas),
);

export default async function CodeMapPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = await getTranslations("codeMap.page");
  const tn = await getTranslations("projectNav");
  const fmt = await getFormat();
  const api = await getApi();
  const project = await api.projects.get(id);
  const imported = project ? null : await loadImportedScan(id);
  if (!project && !imported) notFound();
  const name = project?.name ?? imported?.name ?? id;
  const tech = project?.tech ?? [];
  const demoLinks = Boolean(project);

  const graph = project ? await api.projects.codeGraph(id) : (imported?.scan?.codeGraph ?? null);

  return (
    <>
      <PageHeader
        title={t("title", { name })}
        description={
          graph
            ? t("summary", {
                nodes: graph.nodes.length,
                edges: graph.edges.length,
                repo: graph.repoId,
                commit: graph.commit,
                date: fmt.date(graph.generatedAt),
              })
            : t("none")
        }
        actions={
          <div className="flex flex-wrap gap-4 text-sm">
            <Link href={`/projects/${id}/architecture`} className="underline underline-offset-4">
              {tn("architecture")}
            </Link>
            {demoLinks ? (
              <>
                <Link href={`/projects/${id}/delivery`} className="underline underline-offset-4">
                  {tn("delivery")}
                </Link>
                <Link href={`/projects/${id}/onboarding`} className="underline underline-offset-4">
                  {tn("onboarding")}
                </Link>
              </>
            ) : null}
            <Link href={`/projects/${id}`} className="underline underline-offset-4">
              {tn("project")}
            </Link>
          </div>
        }
      />
      {imported ? <ProjectTabs id={id} active="code-map" /> : null}

      {graph ? (
        <>
          <Suspense fallback={<p className="text-muted-foreground text-sm">{t("loading")}</p>}>
            <CodeMapCanvas graph={graph} />
          </Suspense>

          {graph.skipped.length > 0 ? (
            <Card className="mt-4">
              <CardHeader>
                <CardTitle className="text-base">
                  {t("skipped", { count: graph.skipped.length })}
                </CardTitle>
                <CardDescription>{t("skippedHint")}</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="flex flex-col gap-2 text-sm">
                  {graph.skipped.map((skip) => (
                    <li key={skip.path} className="flex flex-col">
                      <code className="text-xs">{skip.path}</code>
                      <span className="text-muted-foreground text-xs">{skip.reason}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}
        </>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>{t("emptyTitle")}</CardTitle>
            <CardDescription>{t("emptyHint")}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            <div className="flex flex-wrap gap-2">
              {tech.map((item) => (
                <Badge key={item} variant="outline">
                  {item}
                </Badge>
              ))}
            </div>
            <p className="text-muted-foreground">
              {tn.rich("exampleAvailable", {
                link: (chunks) => (
                  <Link
                    href="/projects/qis-dist-cms/code-map"
                    className="underline underline-offset-4"
                  >
                    {chunks}
                  </Link>
                ),
              })}
            </p>
          </CardContent>
        </Card>
      )}
    </>
  );
}
