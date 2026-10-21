import { FILE_KIND_LABEL, FINDING_RULE_LABEL, type FileRef, type ScanReport } from "@cairn/shared";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate, formatNumber } from "@/lib/format";

const compact = (n: number) =>
  n >= 1_000_000
    ? `${(n / 1_000_000).toFixed(1).replace(".", ",")} M`
    : n >= 10_000
      ? `${Math.round(n / 1000)} k`
      : formatNumber(n);

const megabytes = (bytes: number) =>
  bytes >= 1_048_576
    ? `${(bytes / 1_048_576).toFixed(1).replace(".", ",")} Mo`
    : `${Math.round(bytes / 1024)} Ko`;

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card className="gap-1 py-4">
      <CardHeader className="gap-0 px-5">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl tabular-nums">{value}</CardTitle>
      </CardHeader>
      {hint ? (
        <CardContent className="px-5 text-muted-foreground text-xs">{hint}</CardContent>
      ) : null}
    </Card>
  );
}

function Bar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0;
  return (
    <span className="block h-1.5 w-full overflow-hidden rounded bg-muted">
      <span className="block h-full rounded bg-primary/70" style={{ width: `${pct}%` }} />
    </span>
  );
}

function FileList({ files }: { files: FileRef[] }) {
  return (
    <ul className="flex flex-col gap-1.5 text-sm">
      {files.map((f) => (
        <li key={f.path} className="flex items-baseline justify-between gap-3">
          <code className="min-w-0 truncate text-xs" title={f.path}>
            {f.path}
          </code>
          <span className="shrink-0 text-muted-foreground text-xs tabular-nums">
            {megabytes(f.bytes)} · {compact(f.tokens)} tokens
          </span>
        </li>
      ))}
    </ul>
  );
}

const STRUCTURE: { key: keyof ScanReport["stats"]["structure"]; label: string }[] = [
  { key: "sourceFiles", label: "Fichiers source" },
  { key: "testFiles", label: "Fichiers de test" },
  { key: "javaTypes", label: "Types Java" },
  { key: "controllers", label: "Contrôleurs REST" },
  { key: "endpoints", label: "Points d'entrée HTTP" },
  { key: "services", label: "Services" },
  { key: "repositories", label: "Repositories" },
  { key: "entities", label: "Entités JPA" },
  { key: "schedulers", label: "Planificateurs" },
  { key: "listeners", label: "Listeners de messages" },
  { key: "angularComponents", label: "Composants Angular" },
];

/**
 * The numbers of a scan. Tokens are an estimate (one token per four bytes), labelled as such:
 * the real count depends on the model. Findings list where something was found, never its value.
 */
export function ScanNumbers({ report }: { report: ScanReport }) {
  const { stats, incremental } = report;
  const notePct = stats.tokens > 0 ? Math.round((stats.tokensNoise / stats.tokens) * 100) : 0;
  const maxKind = Math.max(1, ...stats.byKind.map((k) => k.tokens));
  const maxLang = Math.max(1, ...stats.byLanguage.map((l) => l.lines));
  const maxModule = Math.max(1, ...stats.modules.map((m) => m.tokens));
  const structure = STRUCTURE.filter((s) => stats.structure[s.key] > 0);

  return (
    <>
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Fichiers"
          value={formatNumber(stats.files)}
          hint={`${megabytes(stats.bytes)} au total, dont ${formatNumber(stats.structure.sourceFiles)} fichiers source`}
        />
        <Stat
          label="Lignes de texte"
          value={compact(stats.lines)}
          hint="Hors fichiers binaires, données et générés"
        />
        <Stat
          label="Tokens (estimés)"
          value={compact(stats.tokens)}
          hint="Lire tout le dépôt une fois, à 1 token pour 4 octets"
        />
        <Stat
          label="Tokens utiles à l'IA"
          value={compact(stats.tokensAiRelevant)}
          hint={`${compact(stats.tokensNoise)} tokens de bruit (${notePct} %) : données et fichiers générés`}
        />
      </section>

      <section className="grid items-start gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Par nature de fichier</CardTitle>
            <CardDescription>
              Ce qu'un assistant a intérêt à lire, et ce qu'il devrait ignorer.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-3 text-sm">
              {stats.byKind.map((k) => (
                <li key={k.kind} className="flex flex-col gap-1">
                  <span className="flex items-baseline justify-between gap-3">
                    <span>
                      {FILE_KIND_LABEL[k.kind]}{" "}
                      <span className="text-muted-foreground text-xs">
                        {formatNumber(k.files)} fichiers
                      </span>
                    </span>
                    <span className="text-muted-foreground text-xs tabular-nums">
                      {k.tokens > 0 ? `${compact(k.tokens)} tokens` : megabytes(k.bytes)}
                    </span>
                  </span>
                  <Bar value={k.tokens} max={maxKind} />
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Par langage</CardTitle>
            <CardDescription>Lignes de texte par langage.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-3 text-sm">
              {stats.byLanguage.slice(0, 8).map((l) => (
                <li key={l.language} className="flex flex-col gap-1">
                  <span className="flex items-baseline justify-between gap-3">
                    <span>
                      {l.language}{" "}
                      <span className="text-muted-foreground text-xs">
                        {formatNumber(l.files)} fichiers
                      </span>
                    </span>
                    <span className="text-muted-foreground text-xs tabular-nums">
                      {formatNumber(l.lines)} lignes
                    </span>
                  </span>
                  <Bar value={l.lines} max={maxLang} />
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </section>

      <section className="grid items-start gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Modules</CardTitle>
            <CardDescription>
              Modules Maven, application Angular ou dossier de premier niveau.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-3 text-sm">
              {stats.modules.map((m) => (
                <li key={m.path} className="flex flex-col gap-1">
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="flex items-center gap-2">
                      <span className="font-medium">{m.name}</span>
                      {m.deployable ? <Badge variant="outline">déployable</Badge> : null}
                    </span>
                    <span className="text-muted-foreground text-xs tabular-nums">
                      {formatNumber(m.files)} fichiers · {formatNumber(m.lines)} lignes ·{" "}
                      {compact(m.tokens)} tokens
                    </span>
                  </span>
                  <Bar value={m.tokens} max={maxModule} />
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Structure détectée</CardTitle>
            <CardDescription>Comptée dans le code, sans interprétation.</CardDescription>
          </CardHeader>
          <CardContent>
            <dl>
              {structure.map((s) => (
                <div
                  key={s.key}
                  className="flex items-baseline justify-between gap-4 border-b py-2 text-sm last:border-b-0"
                >
                  <dt className="text-muted-foreground">{s.label}</dt>
                  <dd className="tabular-nums">{formatNumber(stats.structure[s.key])}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>
      </section>

      <section className="grid items-start gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Fichiers qui gaspillent des tokens</CardTitle>
            <CardDescription>
              Données et fichiers générés à exclure du contexte d'un assistant (par exemple dans un
              fichier d'ignorés).
            </CardDescription>
          </CardHeader>
          <CardContent>
            {stats.noise.length > 0 ? (
              <FileList files={stats.noise.slice(0, 8)} />
            ) : (
              <p className="text-muted-foreground text-sm">Aucun.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Plus gros fichiers lisibles</CardTitle>
            <CardDescription>Les plus coûteux à lire en entier.</CardDescription>
          </CardHeader>
          <CardContent>
            <FileList files={stats.largest.slice(0, 8)} />
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Secrets possibles ({report.findings.length})</CardTitle>
          <CardDescription>
            Seuls l'endroit et le nom de la clé sont conservés. La valeur n'est ni stockée ni
            affichée, et ne doit pas rester dans le dépôt.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {report.findings.length > 0 ? (
            <ul className="flex flex-col gap-1.5 text-sm">
              {report.findings.slice(0, 40).map((f) => (
                <li
                  key={`${f.path}:${f.line ?? 0}:${f.key ?? f.rule}`}
                  className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5"
                >
                  <Badge variant="destructive">{FINDING_RULE_LABEL[f.rule]}</Badge>
                  <code className="text-xs">
                    {f.path}
                    {f.line ? `:${f.line}` : ""}
                  </code>
                  {f.key ? (
                    <span className="text-muted-foreground text-xs">clé {f.key}</span>
                  ) : null}
                </li>
              ))}
              {report.findings.length > 40 ? (
                <li className="text-muted-foreground text-xs">
                  … et {report.findings.length - 40} autres.
                </li>
              ) : null}
            </ul>
          ) : (
            <p className="text-muted-foreground text-sm">Aucun secret détecté.</p>
          )}
        </CardContent>
      </Card>

      <p className="text-muted-foreground text-xs">
        {incremental.mode === "incremental"
          ? `Analyse incrémentale depuis ${incremental.previousCommit?.slice(0, 7) ?? "—"} : ${formatNumber(incremental.reused)} fichiers inchangés réutilisés, ${formatNumber(incremental.analysed)} relus, ${formatNumber(incremental.removed)} supprimés.`
          : `Analyse complète : ${formatNumber(incremental.analysed)} fichiers lus.`}{" "}
        {report.counts.unreadable > 0
          ? `${formatNumber(report.counts.unreadable)} fichiers non lus (déclarés). `
          : ""}
        Terminée en {(report.durationMs / 1000).toFixed(1).replace(".", ",")} s le{" "}
        {formatDate(report.generatedAt)}. Aucune IA n'intervient : tout est lu dans le code.
      </p>
    </>
  );
}
