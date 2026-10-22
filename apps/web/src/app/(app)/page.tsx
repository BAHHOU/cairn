import { MATURITY_NAMES, SEVERITIES } from "@cairn/shared";
import Link from "next/link";
import { GateBadge, ProvenanceBadge, SeverityBadge } from "@/components/badges";
import { ScoreRing } from "@/components/charts/score-ring";
import { Sparkline } from "@/components/charts/sparkline";
import { RealOverview } from "@/components/import/real-overview";
import { KpiCard, LockedCard, PageHeader, ProgressBar } from "@/components/page";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getApi } from "@/lib/api";
import { formatEuros, formatTokens, scoreTone, TONE_TEXT } from "@/lib/format";
import { loadRealScans } from "@/lib/import/scan";
import { getViewer, ROLE_LABEL } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function OverviewPage() {
  const viewer = await getViewer();
  const api = await getApi();
  const [o, tokens, realScans] = await Promise.all([
    api.overview(),
    api.tokens.summary(),
    loadRealScans(),
  ]);
  const firstName = viewer.name.split(" ")[0];
  const scope =
    viewer.role === "admin" || viewer.role === "superadmin"
      ? "Toutes les équipes"
      : `Équipe ${viewer.team}`;
  const maxMaturity = Math.max(...o.maturityDistribution, 1);
  const hasReal = realScans.length > 0;

  return (
    <>
      <PageHeader
        title={`Bonjour ${firstName}`}
        description={
          hasReal
            ? `${ROLE_LABEL[viewer.role]} · ${scope} · ${realScans.length} dépôt${realScans.length > 1 ? "s" : ""} réel${realScans.length > 1 ? "s" : ""} analysé${realScans.length > 1 ? "s" : ""}`
            : `${ROLE_LABEL[viewer.role]} · ${scope} · ${o.projectCount} projets suivis`
        }
      />

      {hasReal ? <RealOverview scans={realScans} /> : null}

      {hasReal ? (
        <div className="flex flex-col gap-1 border-t pt-6">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold">Exemple de pilotage</h2>
            <Badge variant="warning">Démo · données fictives</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Scores, maturité, portes qualité et budget tokens ne sont pas encore mesurés sur les
            dépôts réels : {o.projectCount} projets fictifs illustrent ce que Cairn affichera.
          </p>
        </div>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Indicateurs clés">
        <KpiCard
          label="Score IA moyen"
          value={`${o.avgScore} / 100`}
          hint="Sur six mois"
          visual={
            <div className="flex flex-col items-end gap-1">
              <ScoreRing score={o.avgScore} size={56} stroke={6} />
              <Sparkline values={o.scoreTrend} className="h-5 w-16 text-primary" />
            </div>
          }
        />
        <KpiCard
          label="Portes qualité"
          value={
            <span className="flex items-baseline gap-3 text-base">
              <span className="text-primary">{o.gates.passed} validées</span>
              <span className="text-warning">{o.gates.warning} avert.</span>
              <span className="text-destructive">{o.gates.failed} échecs</span>
            </span>
          }
          hint="Conditions de la porte standard"
        />
        <KpiCard
          label="Problèmes ouverts"
          value={SEVERITIES.reduce((s, k) => s + o.issuesBySeverity[k], 0)}
          hint={
            <span className="flex gap-1.5">
              <Badge variant="destructive">{o.issuesBySeverity.blocker} bloquants</Badge>
              <Badge variant="destructive">{o.issuesBySeverity.critical} critiques</Badge>
            </span>
          }
        />
        <KpiCard
          label="Maturité IA moyenne"
          value={`Niveau ${o.avgMaturity}`}
          hint="Échelle de 0 à 5"
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Projets à traiter en priorité</CardTitle>
            <CardDescription>Scores les plus bas du périmètre</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col divide-y">
            {o.priorities.map((p) => (
              <Link
                key={p.id}
                href={`/projects/${p.id}`}
                className="flex items-center gap-4 py-3 outline-none first:pt-0 last:pb-0 hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring/50"
              >
                <ScoreRing score={p.score} size={44} stroke={5} />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-medium">{p.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {p.team} · niveau {p.maturity} · {p.openIssues} problèmes ouverts
                  </span>
                </div>
                <GateBadge status={p.gate} />
              </Link>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Prochaine meilleure action</CardTitle>
            <CardDescription>Correction automatique la plus utile</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {o.nextAction ? (
              <>
                <div className="flex items-center gap-2">
                  <SeverityBadge severity={o.nextAction.severity} />
                  <span className="text-xs text-muted-foreground">{o.nextAction.projectName}</span>
                </div>
                <p className="font-medium">{o.nextAction.title}</p>
                <p className="text-sm text-muted-foreground">{o.nextAction.why}</p>
                <p className="text-xs text-muted-foreground">
                  Effort estimé : {o.nextAction.effortMin} min · proposée en merge request
                </p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Rien à corriger automatiquement.</p>
            )}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Répartition par niveau de maturité IA</CardTitle>
            <CardDescription>Nombre de projets à chaque niveau</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2.5">
            {o.maturityDistribution.map((count, level) => (
              <div
                key={MATURITY_NAMES[level]}
                className="grid grid-cols-[9rem_1fr_2rem] items-center gap-3 text-sm"
              >
                <span className="text-muted-foreground">
                  {level} · {MATURITY_NAMES[level]}
                </span>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${(count / maxMaturity) * 100}%` }}
                  />
                </div>
                <span className="text-right tabular-nums">{count}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        {tokens ? (
          <Card>
            <CardHeader>
              <CardTitle>Budget tokens du mois</CardTitle>
              <CardDescription>{tokens.label}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="flex items-baseline justify-between">
                <span className="text-2xl font-semibold tabular-nums">
                  {formatTokens(tokens.consumed)}
                </span>
                <span className="text-xs text-muted-foreground">
                  sur {formatTokens(tokens.quota)}
                </span>
              </div>
              <ProgressBar value={(tokens.consumed / tokens.quota) * 100} />
              <p
                className={`text-sm ${tokens.projection > tokens.quota ? "text-destructive" : TONE_TEXT[scoreTone(80)]}`}
              >
                Projection fin de mois : {formatTokens(tokens.projection)}
                {tokens.euros !== undefined ? ` (${formatEuros(tokens.euros)})` : ""}
              </p>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <ProvenanceBadge provenance="measured" /> {tokens.provenance.measured} %
              </div>
            </CardContent>
          </Card>
        ) : (
          <LockedCard title="Budget tokens" />
        )}
      </section>
    </>
  );
}
