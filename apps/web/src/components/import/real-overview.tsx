import type { RepositoryScanSummary } from "@cairn/db";
import Link from "next/link";
import { KpiCard } from "@/components/page";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate, formatNumber, formatTokens } from "@/lib/format";

/**
 * Dashboard block built only from real scans of imported repositories. Everything here is counted in
 * the code: no score, maturity level or cost is shown, because none is measured for these repositories.
 */
export function RealOverview({ scans }: { scans: RepositoryScanSummary[] }) {
  const total = (pick: (s: RepositoryScanSummary) => number) =>
    scans.reduce((sum, s) => sum + pick(s), 0);
  const files = total((s) => s.report.stats.files);
  const lines = total((s) => s.report.stats.lines);
  const tokens = total((s) => s.report.stats.tokens);
  const useful = total((s) => s.report.stats.tokensAiRelevant);
  const noise = total((s) => s.report.stats.tokensNoise);
  const noisePct = tokens > 0 ? Math.round((noise / tokens) * 100) : 0;
  const secrets = total((s) => s.report.findings.length);
  const violations = total((s) => s.report.counts.archViolations);

  return (
    <section className="flex flex-col gap-4" aria-label="Dépôts réels">
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-semibold">Dépôts réels</h2>
        <Badge variant="success">Données réelles</Badge>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Dépôts analysés"
          value={scans.length}
          hint={scans.length === 1 ? "Un dépôt importé" : "Dépôts importés depuis Git"}
        />
        <KpiCard
          label="Code analysé"
          value={`${formatNumber(files)} fichiers`}
          hint={`${formatNumber(lines)} lignes`}
        />
        <KpiCard
          label="Tokens (estimés)"
          value={formatTokens(tokens)}
          hint={`${formatTokens(useful)} utiles pour une IA · ${noisePct} % de bruit`}
        />
        <KpiCard
          label="Points d'attention"
          value={secrets + violations}
          hint={
            <span className="flex flex-wrap gap-1.5">
              <Badge variant={secrets > 0 ? "destructive" : "outline"}>
                {secrets} {secrets > 1 ? "secrets" : "secret"}
              </Badge>
              <Badge variant={violations > 0 ? "warning" : "outline"}>
                {violations} {violations > 1 ? "violations" : "violation"} d'architecture
              </Badge>
            </span>
          }
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Projets importés</CardTitle>
          <CardDescription>
            Lus dans le code, sans IA. Les tokens sont estimés (un token pour quatre octets).
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col divide-y">
          {scans.map((s) => {
            const { stats, counts, findings } = s.report;
            return (
              <div
                key={s.repositoryId}
                className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 py-3 first:pt-0 last:pb-0"
              >
                <div className="flex min-w-0 flex-col">
                  <Link
                    href={`/projects/${s.repositoryId}`}
                    className="truncate font-medium hover:underline"
                  >
                    {s.fullPath}
                  </Link>
                  <span className="text-xs text-muted-foreground">
                    {s.team} · {s.host} ·{" "}
                    <span className="font-mono">
                      {s.branch}@{s.commitSha.slice(0, 7)}
                    </span>{" "}
                    · scan du {formatDate(s.createdAt)}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
                  <span className="tabular-nums">{formatNumber(stats.files)} fichiers</span>
                  <span className="tabular-nums">{formatNumber(stats.lines)} lignes</span>
                  <span className="tabular-nums">{formatTokens(stats.tokens)} tokens</span>
                  <Badge variant={findings.length > 0 ? "destructive" : "outline"}>
                    {findings.length} {findings.length > 1 ? "secrets" : "secret"}
                  </Badge>
                  <Badge variant={counts.archViolations > 0 ? "warning" : "outline"}>
                    {counts.archViolations} {counts.archViolations > 1 ? "violations" : "violation"}
                  </Badge>
                  <Link
                    href={`/projects/${s.repositoryId}/architecture`}
                    className="text-xs underline-offset-2 hover:underline"
                  >
                    Architecture
                  </Link>
                  <Link
                    href={`/projects/${s.repositoryId}/code-map`}
                    className="text-xs underline-offset-2 hover:underline"
                  >
                    Carte du code
                  </Link>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </section>
  );
}
