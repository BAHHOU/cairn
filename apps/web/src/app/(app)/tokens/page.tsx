import { PROVENANCES } from "@cairn/shared";
import { ProvenanceBadge } from "@/components/badges";
import { KpiCard, PageHeader, ProgressBar, Restricted } from "@/components/page";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getApi } from "@/lib/api";
import { formatEuros, formatTokens } from "@/lib/format";
import { cn } from "@/lib/utils";

const MONTHS = ["mai", "juin", "juil.", "août", "sept.", "oct."];

export default async function TokensPage() {
  const s = await (await getApi()).tokens.summary();
  if (!s) return <Restricted />;

  const over = s.projection > s.quota;
  const max = Math.max(...s.monthly, 1);

  return (
    <>
      <PageHeader
        title="Budget tokens"
        description={`${s.label} · mois en cours, jour 18 sur 30`}
      />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Consommé"
          value={formatTokens(s.consumed)}
          hint={`sur un quota de ${formatTokens(s.quota)}`}
        />
        <KpiCard
          label="Projection fin de mois"
          value={
            <span className={cn(over && "text-destructive")}>{formatTokens(s.projection)}</span>
          }
          hint={over ? "Dépasse le quota" : "Dans le quota"}
        />
        {s.euros !== undefined ? (
          <KpiCard label="Coût projeté" value={formatEuros(s.euros)} hint="Tarif interne moyen" />
        ) : null}
        <KpiCard
          label="Part du quota"
          value={`${Math.round((s.consumed / s.quota) * 100)} %`}
          visual={
            <div className="w-20">
              <ProgressBar value={(s.consumed / s.quota) * 100} />
            </div>
          }
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Évolution sur six mois</CardTitle>
            <CardDescription>Le dernier mois est partiel</CardDescription>
          </CardHeader>
          <CardContent>
            <div
              className="flex h-44 items-stretch gap-3"
              role="img"
              aria-label="Consommation mensuelle de tokens"
            >
              {s.monthly.map((v, i) => (
                <div key={MONTHS[i]} className="flex h-full flex-1 flex-col items-center gap-1">
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {formatTokens(v)}
                  </span>
                  <div className="flex w-full flex-1 items-end">
                    <div
                      className={cn(
                        "w-full rounded-t-md",
                        i === s.monthly.length - 1 ? "bg-primary/60" : "bg-primary",
                      )}
                      style={{ height: `${(v / max) * 100}%` }}
                    />
                  </div>
                  <span className="text-xs text-muted-foreground">{MONTHS[i]}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>D'où viennent les chiffres</CardTitle>
            <CardDescription>Répartition par niveau de fiabilité</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {PROVENANCES.map((p) => (
              <div key={p} className="flex items-center gap-3">
                <div className="w-20">
                  <ProvenanceBadge provenance={p} />
                </div>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-foreground/60"
                    style={{ width: `${s.provenance[p]}%` }}
                  />
                </div>
                <span className="w-10 text-right text-sm tabular-nums">{s.provenance[p]} %</span>
              </div>
            ))}
            <p className="text-xs text-muted-foreground">
              Un plafond théorique n'est jamais présenté comme un résultat mesuré.
            </p>
          </CardContent>
        </Card>
      </section>

      <Card className="gap-0 py-0">
        <CardHeader className="py-5">
          <CardTitle>Par projet</CardTitle>
          <CardDescription>Compteurs par projet, jamais par personne</CardDescription>
        </CardHeader>
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Projet</TableHead>
              <TableHead>Équipe</TableHead>
              <TableHead className="text-right">Tokens</TableHead>
              <TableHead className="w-56">Part perdue</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {s.byProject.map((r) => (
              <TableRow key={r.projectId}>
                <TableCell className="font-medium">{r.projectName}</TableCell>
                <TableCell>{r.team}</TableCell>
                <TableCell className="text-right tabular-nums">{formatTokens(r.tokens)}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <span className="w-12 whitespace-nowrap text-right tabular-nums">
                      {r.wasteShare} %
                    </span>
                    <ProgressBar value={100 - r.wasteShare} />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </>
  );
}
