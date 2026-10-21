import { type ImportView, isImportActive, type ScanView } from "@cairn/shared";
import { ExternalLink } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { AutoRefresh } from "@/components/import/auto-refresh";
import { RescanButton } from "@/components/import/rescan-button";
import { ScanNumbers } from "@/components/import/scan-numbers";
import { ImportStatusBadge } from "@/components/import/status";
import { PageHeader } from "@/components/page";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate, formatNumber } from "@/lib/format";

/** Views Cairn cannot draw yet for an imported repository. */
const PENDING_VIEWS = [
  { label: "Livraison", hint: "Du commit à la production (CI/CD)" },
  { label: "Démarrage", hint: "Installation locale pour un nouveau développeur" },
] as const;

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b py-2 text-sm last:border-b-0">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-right">{children}</dd>
    </div>
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
            {facts?.technologies.map((t) => (
              <Badge key={t} variant="outline">
                {t}
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
                <ExternalLink aria-hidden /> Ouvrir sur{" "}
                {repo.provider === "github" ? "GitHub" : "GitLab"}
              </a>
            ) : null}
            <Link
              href="/projects/import"
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Nouvel import
            </Link>
            {canRescan ? <RescanButton repositoryId={repo.id} disabled={active} /> : null}
          </>
        }
      />

      <section className="grid items-start gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Dernière analyse</CardTitle>
            <CardDescription>
              Faits mesurés sur le code cloné. Aucun contenu de fichier n'est conservé.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {analysed && facts ? (
              <dl>
                <Row label="Branche">
                  <span className="font-mono text-xs">{repo.branch}</span>
                </Row>
                <Row label="Commit analysé">
                  <span className="font-mono text-xs">
                    {analysed.commitSha?.slice(0, 10) ?? "—"}
                  </span>
                </Row>
                <Row label="Fichiers">{formatNumber(facts.fileCount)}</Row>
                <Row label="Technologies">
                  {facts.technologies.length ? (
                    <span className="flex flex-wrap justify-end gap-1">
                      {facts.technologies.map((t) => (
                        <Badge key={t} variant="outline">
                          {t}
                        </Badge>
                      ))}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">Aucune détectée</span>
                  )}
                </Row>
                <Row label="Durée">{seconds === null ? "—" : `${seconds} s`}</Row>
                <Row label="Analysé le">
                  {analysed.finishedAt ? formatDate(analysed.finishedAt) : "—"}
                </Row>
              </dl>
            ) : (
              <p className="text-sm text-muted-foreground">
                {active
                  ? "Import en cours : les résultats apparaîtront ici automatiquement."
                  : "Aucun import n'a abouti pour ce dépôt."}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Vues du projet</CardTitle>
            <CardDescription>
              Construites depuis le code lu, sans donnée fictive. Chaque lien de l'architecture et
              de la carte indique s'il a été extrait ou seulement déduit.
            </CardDescription>
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
                        <span className="font-medium">Architecture</span>
                        <span className="text-muted-foreground text-xs">
                          {formatNumber(scan.report.counts.archNodes)} nœuds ·{" "}
                          {formatNumber(scan.report.counts.archEdges)} liens ·{" "}
                          {formatNumber(scan.report.counts.archViolations)} violation
                          {scan.report.counts.archViolations > 1 ? "s" : ""}
                        </span>
                      </span>
                      <Badge>Ouvrir</Badge>
                    </Link>
                  </li>
                  <li>
                    <Link
                      href={`/projects/${repo.id}/code-map`}
                      className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm transition-colors hover:bg-accent/50"
                    >
                      <span className="flex flex-col">
                        <span className="font-medium">Carte du code</span>
                        <span className="text-muted-foreground text-xs">
                          {formatNumber(scan.report.counts.codeNodes)} symboles ·{" "}
                          {formatNumber(scan.report.counts.codeEdges)} liens
                        </span>
                      </span>
                      <Badge>Ouvrir</Badge>
                    </Link>
                  </li>
                </>
              ) : (
                <li className="rounded-lg border border-dashed p-3 text-muted-foreground text-sm">
                  Architecture et carte du code : disponibles après la première analyse réussie.
                </li>
              )}
              {PENDING_VIEWS.map((view) => (
                <li
                  key={view.label}
                  className="flex items-center justify-between gap-3 rounded-lg border border-dashed p-3 text-sm"
                >
                  <span className="flex flex-col">
                    <span className="font-medium">{view.label}</span>
                    <span className="text-xs text-muted-foreground">{view.hint}</span>
                  </span>
                  <Badge variant="secondary">À venir</Badge>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </section>

      {scan ? <ScanNumbers report={scan.report} /> : null}

      <Card className="gap-0 py-0">
        <CardHeader className="py-5">
          <CardTitle>Historique des imports ({runs.length})</CardTitle>
        </CardHeader>
        <ul className="divide-y border-t">
          {runs.map((run) => (
            <li key={run.id} className="flex flex-wrap items-center gap-3 px-6 py-3 text-sm">
              <ImportStatusBadge status={run.status} />
              <span className="font-mono text-xs">
                {(run.commitSha ?? run.requestedSha)?.slice(0, 10) ?? "—"}
              </span>
              <span className="text-xs text-muted-foreground">
                {run.requestedBy} · {formatDate(run.createdAt)}
              </span>
              <Link
                href={`/projects/import/${run.id}`}
                className="ml-auto text-xs underline underline-offset-4 hover:text-primary"
              >
                Détail de l'exécution
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
