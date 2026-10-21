import dynamic from "next/dynamic";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PageHeader } from "@/components/page";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getApi } from "@/lib/api";
import { formatDate } from "@/lib/format";
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
        title={`Architecture — ${name}`}
        description={
          architecture ? (
            <>
              {architecture.nodes.length} nœuds · {architecture.edges.length} liens ·{" "}
              {architecture.repos.length - 1} dépôts · extrait le{" "}
              {formatDate(architecture.generatedAt)}
            </>
          ) : (
            "Aucun graphe n'a encore été extrait pour ce projet."
          )
        }
        actions={
          <div className="flex flex-wrap gap-4 text-sm">
            <Link href={`/projects/${id}/code-map`} className="underline underline-offset-4">
              Carte du code
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

      {architecture ? (
        <Suspense
          fallback={<p className="text-muted-foreground text-sm">Chargement du diagramme…</p>}
        >
          <ArchitectureCanvas architecture={architecture} />
        </Suspense>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Pas encore de graphe</CardTitle>
            <CardDescription>
              Un diagramme inventé serait pire que pas de diagramme du tout : il serait cru.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            <p className="text-muted-foreground">
              L'extraction s'appuie sur les fichiers de construction, la configuration et les
              manifestes de déploiement. Elle n'a pas encore été lancée sur {name}.
            </p>
            <div className="flex flex-wrap gap-2">
              {tech.map((t) => (
                <Badge key={t} variant="outline">
                  {t}
                </Badge>
              ))}
            </div>
            <p className="text-muted-foreground">
              Exemple disponible :{" "}
              <Link
                href="/projects/qis-dist-cms/architecture"
                className="underline underline-offset-4"
              >
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
