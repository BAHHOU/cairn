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
 * The canvas is the only client leaf of this route.
 *
 * Everything above it — fetching, permission filtering, the empty state — stays on
 * the server, so a project without a graph costs no JavaScript at all.
 */
const ArchitectureCanvas = dynamic(() =>
  import("@/components/diagram/canvas").then((m) => m.ArchitectureCanvas),
);

export default async function ArchitecturePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = await getTranslations("architecture.page");
  const tn = await getTranslations("projectNav");
  const fmt = await getFormat();
  const api = await getApi();
  const project = await api.projects.get(id);
  const imported = project ? null : await loadImportedScan(id);
  if (!project && !imported) notFound();
  const name = project?.name ?? imported?.name ?? id;
  const tech = project?.tech ?? [];
  const demoLinks = Boolean(project);

  const architecture = project
    ? await api.projects.architecture(id)
    : (imported?.scan?.architecture ?? null);

  return (
    <>
      <PageHeader
        title={t("title", { name })}
        description={
          architecture
            ? t("summary", {
                nodes: architecture.nodes.length,
                edges: architecture.edges.length,
                repos: architecture.repos.length - 1,
                date: fmt.date(architecture.generatedAt),
              })
            : t("none")
        }
        actions={
          <div className="flex flex-wrap gap-4 text-sm">
            <Link href={`/projects/${id}/code-map`} className="underline underline-offset-4">
              {tn("codeMap")}
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
      {imported ? <ProjectTabs id={id} active="architecture" /> : null}

      {architecture ? (
        <Suspense fallback={<p className="text-muted-foreground text-sm">{t("loading")}</p>}>
          <ArchitectureCanvas architecture={architecture} />
        </Suspense>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>{t("emptyTitle")}</CardTitle>
            <CardDescription>{t("emptyHint")}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            <p className="text-muted-foreground">{t("emptyBody", { name })}</p>
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
                    href="/projects/qis-dist-cms/architecture"
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
