import { getImportView } from "@cairn/db";
import { can, isImportActive } from "@cairn/shared";
import { RotateCcw } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { AutoRefresh } from "@/components/import/auto-refresh";
import { ImportStatusBadge, ImportTimeline } from "@/components/import/status";
import { LockedCard, PageHeader } from "@/components/page";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate, formatNumber } from "@/lib/format";
import { describeError } from "@/lib/import/messages";
import { getDb, isImportConfigured } from "@/lib/import/runtime";
import { getViewer } from "@/lib/session";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b py-2 text-sm last:border-b-0">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-right">{children}</dd>
    </div>
  );
}

export default async function ImportRunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await getViewer();
  if (!UUID.test(id) || !isImportConfigured()) notFound();

  if (!can(viewer.role, "see.allTeams")) {
    return (
      <>
        <PageHeader title="Import de dépôt" />
        <LockedCard title="Détail de l'import" />
      </>
    );
  }

  const view = await getImportView(getDb(), id);
  if (!view) notFound();

  const active = isImportActive(view.status);
  const { repository: repo } = view;
  const moved = view.requestedSha && view.commitSha && view.requestedSha !== view.commitSha;
  const seconds =
    view.startedAt && view.finishedAt
      ? Math.max(0, Math.round((Date.parse(view.finishedAt) - Date.parse(view.startedAt)) / 1000))
      : null;
  const retry = new URLSearchParams({
    provider: repo.provider,
    url: repo.webUrl ?? `${repo.host}/${repo.fullPath}`,
    branch: repo.branch,
  });

  return (
    <>
      <AutoRefresh active={active} />
      <PageHeader
        title={repo.fullPath}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <span>{repo.host}</span>
            <Badge variant="outline" className="font-mono">
              {repo.branch}
            </Badge>
            <ImportStatusBadge status={view.status} />
          </span>
        }
        actions={
          <>
            {view.status === "failed" ? (
              <Link
                href={`/projects/import?${retry}`}
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                <RotateCcw aria-hidden /> Réessayer
              </Link>
            ) : null}
            <Link
              href={`/projects/${repo.id}`}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Ouvrir le projet
            </Link>
            <Link
              href="/projects/import"
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Nouvel import
            </Link>
          </>
        }
      />

      {view.status === "failed" ? (
        <div
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm"
        >
          <div className="font-medium">{describeError(view.errorCode)}</div>
          {view.errorMessage ? (
            <div className="mt-1 break-words text-xs text-muted-foreground">
              {view.errorMessage}
            </div>
          ) : null}
          <div className="mt-1 text-xs text-muted-foreground">
            Le jeton n'est pas réaffiché : saisissez-le à nouveau pour réessayer.
          </div>
        </div>
      ) : null}

      <div className="grid items-start gap-4 lg:grid-cols-[320px_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Progression</CardTitle>
          </CardHeader>
          <CardContent>
            <ImportTimeline view={view} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Détails</CardTitle>
          </CardHeader>
          <CardContent>
            <dl>
              <Row label="Équipe">{repo.team}</Row>
              <Row label="Fournisseur">{repo.provider === "github" ? "GitHub" : "GitLab"}</Row>
              <Row label="Demandé par">
                {view.requestedBy} · {formatDate(view.createdAt)}
              </Row>
              <Row label="Commit à la demande">
                <code className="text-xs">{view.requestedSha?.slice(0, 12) ?? "—"}</code>
              </Row>
              <Row label="Commit analysé">
                <code className="text-xs">{view.commitSha?.slice(0, 12) ?? "—"}</code>
              </Row>
              {moved ? (
                <Row label="Note">
                  <span className="text-xs text-muted-foreground">
                    La branche a avancé entre la demande et le clonage : le commit analysé fait foi.
                  </span>
                </Row>
              ) : null}
              {view.facts ? (
                <>
                  <Row label="Fichiers">{formatNumber(view.facts.fileCount)}</Row>
                  <Row label="Technologies détectées">
                    <span className="flex flex-wrap justify-end gap-1">
                      {view.facts.technologies.length > 0
                        ? view.facts.technologies.map((t) => (
                            <Badge key={t} variant="outline">
                              {t}
                            </Badge>
                          ))
                        : "Aucune reconnue"}
                    </span>
                  </Row>
                </>
              ) : null}
              {seconds !== null ? <Row label="Durée">{seconds} s</Row> : null}
            </dl>
            {view.status === "done" ? (
              <p className={cn("mt-3 text-xs text-muted-foreground")}>
                Copie de travail supprimée. Seuls les faits (technologies, nombre de fichiers) sont
                conservés ; aucun contenu de fichier n'a été lu.
              </p>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
