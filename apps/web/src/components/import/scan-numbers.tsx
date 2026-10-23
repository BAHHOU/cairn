import type { FileRef, ScanReport } from "@cairn/shared";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useFormat } from "@/i18n/format";

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
  const t = useTranslations("scan");
  const fmt = useFormat();
  return (
    <ul className="flex flex-col gap-1.5 text-sm">
      {files.map((f) => (
        <li key={f.path} className="flex items-baseline justify-between gap-3">
          <code className="min-w-0 truncate text-xs" title={f.path}>
            {f.path}
          </code>
          <span className="shrink-0 text-muted-foreground text-xs tabular-nums">
            {fmt.bytes(f.bytes)} · {t("tokens", { value: fmt.compact(f.tokens) })}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Labels: `scan.structure.<key>`. */
const STRUCTURE = [
  "sourceFiles",
  "testFiles",
  "javaTypes",
  "controllers",
  "endpoints",
  "services",
  "repositories",
  "entities",
  "schedulers",
  "listeners",
  "angularComponents",
] as const satisfies readonly (keyof ScanReport["stats"]["structure"])[];

/**
 * The numbers of a scan. Tokens are an estimate (one token per four bytes), labelled as such:
 * the real count depends on the model. Findings list where something was found, never its value.
 */
export function ScanNumbers({ report }: { report: ScanReport }) {
  const t = useTranslations("scan");
  const td = useTranslations("domain");
  const fmt = useFormat();
  const { stats, incremental } = report;
  const notePct = stats.tokens > 0 ? Math.round((stats.tokensNoise / stats.tokens) * 100) : 0;
  const maxKind = Math.max(1, ...stats.byKind.map((k) => k.tokens));
  const maxLang = Math.max(1, ...stats.byLanguage.map((l) => l.lines));
  const maxModule = Math.max(1, ...stats.modules.map((m) => m.tokens));
  const structure = STRUCTURE.filter((key) => stats.structure[key] > 0);

  return (
    <>
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label={t("files")}
          value={fmt.number(stats.files)}
          hint={t("filesHint", {
            size: fmt.bytes(stats.bytes),
            source: fmt.number(stats.structure.sourceFiles),
          })}
        />
        <Stat label={t("lines")} value={fmt.compact(stats.lines)} hint={t("linesHint")} />
        <Stat
          label={t("tokensEstimated")}
          value={fmt.compact(stats.tokens)}
          hint={t("tokensEstimatedHint")}
        />
        <Stat
          label={t("tokensUseful")}
          value={fmt.compact(stats.tokensAiRelevant)}
          hint={t("tokensUsefulHint", { noise: fmt.compact(stats.tokensNoise), pct: notePct })}
        />
      </section>

      <section className="grid items-start gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t("byKind")}</CardTitle>
            <CardDescription>{t("byKindHint")}</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-3 text-sm">
              {stats.byKind.map((k) => (
                <li key={k.kind} className="flex flex-col gap-1">
                  <span className="flex items-baseline justify-between gap-3">
                    <span>
                      {td(`fileKind.${k.kind}`)}{" "}
                      <span className="text-muted-foreground text-xs">
                        {t("fileCount", { count: k.files })}
                      </span>
                    </span>
                    <span className="text-muted-foreground text-xs tabular-nums">
                      {k.tokens > 0
                        ? t("tokens", { value: fmt.compact(k.tokens) })
                        : fmt.bytes(k.bytes)}
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
            <CardTitle>{t("byLanguage")}</CardTitle>
            <CardDescription>{t("byLanguageHint")}</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-3 text-sm">
              {stats.byLanguage.slice(0, 8).map((l) => (
                <li key={l.language} className="flex flex-col gap-1">
                  <span className="flex items-baseline justify-between gap-3">
                    <span>
                      {l.language}{" "}
                      <span className="text-muted-foreground text-xs">
                        {t("fileCount", { count: l.files })}
                      </span>
                    </span>
                    <span className="text-muted-foreground text-xs tabular-nums">
                      {t("lineCount", { count: l.lines })}
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
            <CardTitle>{t("modules")}</CardTitle>
            <CardDescription>{t("modulesHint")}</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-3 text-sm">
              {stats.modules.map((m) => (
                <li key={m.path} className="flex flex-col gap-1">
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="flex items-center gap-2">
                      <span className="font-medium">{m.name}</span>
                      {m.deployable ? <Badge variant="outline">{t("deployable")}</Badge> : null}
                    </span>
                    <span className="text-muted-foreground text-xs tabular-nums">
                      {t("fileCount", { count: m.files })} · {t("lineCount", { count: m.lines })} ·{" "}
                      {t("tokens", { value: fmt.compact(m.tokens) })}
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
            <CardTitle>{t("structureTitle")}</CardTitle>
            <CardDescription>{t("structureHint")}</CardDescription>
          </CardHeader>
          <CardContent>
            <dl>
              {structure.map((key) => (
                <div
                  key={key}
                  className="flex items-baseline justify-between gap-4 border-b py-2 text-sm last:border-b-0"
                >
                  <dt className="text-muted-foreground">{t(`structure.${key}`)}</dt>
                  <dd className="tabular-nums">{fmt.number(stats.structure[key])}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>
      </section>

      <section className="grid items-start gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t("noiseTitle")}</CardTitle>
            <CardDescription>{t("noiseHint")}</CardDescription>
          </CardHeader>
          <CardContent>
            {stats.noise.length > 0 ? (
              <FileList files={stats.noise.slice(0, 8)} />
            ) : (
              <p className="text-muted-foreground text-sm">{t("none")}</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("largestTitle")}</CardTitle>
            <CardDescription>{t("largestHint")}</CardDescription>
          </CardHeader>
          <CardContent>
            <FileList files={stats.largest.slice(0, 8)} />
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>{t("secretsTitle", { count: report.findings.length })}</CardTitle>
          <CardDescription>{t("secretsHint")}</CardDescription>
        </CardHeader>
        <CardContent>
          {report.findings.length > 0 ? (
            <ul className="flex flex-col gap-1.5 text-sm">
              {report.findings.slice(0, 40).map((f) => (
                <li
                  key={`${f.path}:${f.line ?? 0}:${f.key ?? f.rule}`}
                  className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5"
                >
                  <Badge variant="destructive">{td(`findingRule.${f.rule}`)}</Badge>
                  <code className="text-xs">
                    {f.path}
                    {f.line ? `:${f.line}` : ""}
                  </code>
                  {f.key ? (
                    <span className="text-muted-foreground text-xs">
                      {t("secretKey", { key: f.key })}
                    </span>
                  ) : null}
                </li>
              ))}
              {report.findings.length > 40 ? (
                <li className="text-muted-foreground text-xs">
                  {t("andMore", { count: report.findings.length - 40 })}
                </li>
              ) : null}
            </ul>
          ) : (
            <p className="text-muted-foreground text-sm">{t("noSecret")}</p>
          )}
        </CardContent>
      </Card>

      <p className="text-muted-foreground text-xs">
        {incremental.mode === "incremental"
          ? t("runIncremental", {
              previous: incremental.previousCommit?.slice(0, 7) ?? "—",
              reused: incremental.reused,
              analysed: incremental.analysed,
              removed: incremental.removed,
            })
          : t("runFull", { analysed: incremental.analysed })}{" "}
        {report.counts.unreadable > 0
          ? `${t("unreadable", { count: report.counts.unreadable })} `
          : ""}
        {t("runFinished", {
          seconds: fmt.seconds(report.durationMs),
          date: fmt.date(report.generatedAt),
        })}
      </p>
    </>
  );
}
