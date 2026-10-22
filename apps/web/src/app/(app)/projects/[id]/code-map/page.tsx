import dynamic from "next/dynamic";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ProjectTabs } from "@/components/guide/bits";
import { PageHeader } from "@/components/page";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getApi } from "@/lib/api";
import { formatDate } from "@/lib/format";
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
        title={`Carte du code — ${name}`}
        description={
          graph ? (
            <>
              {graph.nodes.length} symboles · {graph.edges.length} liens · dépôt {graph.repoId} ·
              commit {graph.commit} · extrait le {formatDate(graph.generatedAt)}
            </>
          ) : (
            "Aucune extraction n'a encore été faite sur ce dépôt."
          )
        }
        actions={
          <div className="flex flex-wrap gap-4 text-sm">
            <Link href={`/projects/${id}/architecture`} className="underline underline-offset-4">
              Vue architecture
            </Link>
            {demoLinks ? (
              <>
                <Link href={`/projects/${id}/delivery`} className="underline underline-offset-4">
                  De dev à production
                </Link>
                <Link href={`/projects/${id}/onboarding`} className="underline underline-offset-4">
                  Démarrage local
                </Link>
              </>
            ) : null}
            <Link href={`/projects/${id}`} className="underline underline-offset-4">
              Fiche projet
            </Link>
          </div>
        }
      />
      {imported ? <ProjectTabs id={id} active="code-map" /> : null}

      {graph ? (
        <>
          <Suspense
            fallback={<p className="text-muted-foreground text-sm">Chargement de la carte…</p>}
          >
            <CodeMapCanvas graph={graph} />
          </Suspense>

          {graph.skipped.length > 0 ? (
            <Card className="mt-4">
              <CardHeader>
                <CardTitle className="text-base">Non lus ({graph.skipped.length})</CardTitle>
                <CardDescription>
                  Déclarés plutôt que passés sous silence : une carte muette sur ses trous se fait
                  croire complète.
                </CardDescription>
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
            <CardTitle>Pas encore de carte</CardTitle>
            <CardDescription>
              L'extraction lit la syntaxe du dépôt, pas une documentation : tant qu'elle n'a pas
              tourné, il n'y a rien d'honnête à montrer.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            <div className="flex flex-wrap gap-2">
              {tech.map((t) => (
                <Badge key={t} variant="outline">
                  {t}
                </Badge>
              ))}
            </div>
            <p className="text-muted-foreground">
              Exemple disponible :{" "}
              <Link href="/projects/qis-dist-cms/code-map" className="underline underline-offset-4">
                qis-dist-cms
              </Link>
              .
            </p>
          </CardContent>
        </Card>
      )}
    </>
  );
}
