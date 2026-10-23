import { BookOpen, Bot, CheckCircle2, CircleDashed, FileText, Layers } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  GuideUnavailable,
  LimitsNote,
  ProjectTabs,
  Section,
  SourceRef,
} from "@/components/guide/bits";
import { Findings } from "@/components/guide/findings";
import { KpiCard, PageHeader } from "@/components/page";
import { Badge } from "@/components/ui/badge";
import { useFormat } from "@/i18n/format";
import type { ImportedScan } from "@/lib/import/scan";
import { cn } from "@/lib/utils";

/** The documentation page of a repository imported from Git: what exists, what is missing, what lies. */
export function ImportedDocs({ id, imported }: { id: string; imported: ImportedScan }) {
  const t = useTranslations("docs");
  const td = useTranslations("domain");
  const fmt = useFormat();
  const docs = imported.scan?.docs ?? null;
  const base = imported.source;

  return (
    <>
      <PageHeader title={t("title", { name: imported.name })} description={t("description")} />
      <ProjectTabs id={id} active="docs" />

      {!imported.scan || !docs ? (
        <GuideUnavailable title={t("unavailableTitle")}>{t("unavailableBody")}</GuideUnavailable>
      ) : (
        <>
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              label={t("documents")}
              value={fmt.number(docs.stats.files)}
              hint={t("words", { count: docs.stats.words })}
              visual={<FileText className="size-5 text-muted-foreground" aria-hidden />}
            />
            <KpiCard
              label={t("readingCost")}
              value={fmt.tokens(docs.stats.tokens)}
              hint={t("readingCostHint", {
                pct:
                  docs.stats.tokenShare > 0 && docs.stats.tokenShare < 0.01
                    ? "< 1"
                    : Math.round(docs.stats.tokenShare * 100),
              })}
              visual={<BookOpen className="size-5 text-muted-foreground" aria-hidden />}
            />
            <KpiCard
              label={t("modulesWithReadme")}
              value={`${docs.stats.modulesWithReadme} / ${docs.stats.modules}`}
              hint={t("modulesWithReadmeHint")}
              visual={<Layers className="size-5 text-muted-foreground" aria-hidden />}
            />
            <KpiCard
              label={t("contradictions")}
              value={docs.drift.length}
              hint={t("contradictionsHint")}
              visual={<CheckCircle2 className="size-5 text-muted-foreground" aria-hidden />}
            />
          </section>

          <Section title={t("drift")} description={t("driftHint")} count={docs.drift.length}>
            <Findings findings={docs.drift} base={base} emptyText={t("noDrift")} />
          </Section>

          <section className="grid items-start gap-4 lg:grid-cols-2">
            <Section
              title={t("coverage")}
              description={t("coverageHint")}
              count={docs.coverage.filter((c) => c.present).length}
            >
              <ul className="flex flex-col">
                {docs.coverage.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-start gap-3 border-border/60 border-b py-2.5 last:border-0"
                  >
                    {item.present ? (
                      <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                    ) : (
                      <CircleDashed
                        className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                        aria-hidden
                      />
                    )}
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className={cn("text-sm", !item.present && "text-muted-foreground")}>
                        {item.label}
                      </span>
                      {item.present && item.evidence ? (
                        <SourceRef source={item.evidence} base={base} />
                      ) : (
                        <span className="text-muted-foreground text-xs">{item.hint}</span>
                      )}
                    </div>
                    <Badge variant={item.present ? "success" : "secondary"}>
                      {item.present ? t("present") : t("absent")}
                    </Badge>
                  </li>
                ))}
              </ul>
            </Section>

            <Section
              title={t("outline")}
              description={docs.outline ? docs.outline.path : t("noReadme")}
            >
              {docs.outline && docs.outline.items.length > 0 ? (
                <ol className="flex flex-col gap-1 text-sm">
                  {docs.outline.items.map((item) => (
                    <li
                      key={`${item.line}-${item.text}`}
                      style={{ paddingLeft: `${Math.max(0, item.level - 1) * 14}px` }}
                      className={cn(
                        "flex items-baseline justify-between gap-3",
                        item.level > 2 && "text-muted-foreground",
                      )}
                    >
                      <span className={cn(item.level === 1 && "font-semibold")}>{item.text}</span>
                      <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                        {t("line", { line: item.line })}
                      </span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-muted-foreground text-sm">{t("noHeadings")}</p>
              )}
            </Section>
          </section>

          <section className="grid items-start gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <Section title={t("files")} description={t("filesHint")} count={docs.files.length}>
                {docs.files.length === 0 ? (
                  <p className="text-muted-foreground text-sm">{t("noFiles")}</p>
                ) : (
                  <ul className="flex flex-col">
                    {docs.files.map((f) => (
                      <li
                        key={f.path}
                        className="flex flex-wrap items-center gap-x-3 gap-y-1 border-border/60 border-b py-2.5 last:border-0"
                      >
                        <div className="flex min-w-0 flex-1 flex-col">
                          <SourceRef source={{ path: f.path }} base={base} className="text-xs" />
                          {f.title ? (
                            <span className="truncate text-muted-foreground text-xs">
                              {f.title}
                            </span>
                          ) : null}
                        </div>
                        <Badge variant="outline">{td(`docKind.${f.kind}`)}</Badge>
                        <span className="w-20 text-right text-muted-foreground text-xs tabular-nums">
                          {t("words", { count: f.words })}
                        </span>
                        <span className="w-20 text-right text-muted-foreground text-xs tabular-nums">
                          ≈ {fmt.tokens(f.tokens)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Section>
            </div>

            <Section title={t("ai")} description={t("aiHint")}>
              <ul className="flex flex-col gap-2">
                {docs.ai.map((f) => (
                  <li key={f.path} className="flex items-center gap-2.5 text-sm">
                    <Bot
                      className={cn(
                        "size-4 shrink-0",
                        f.present ? "text-primary" : "text-muted-foreground",
                      )}
                      aria-hidden
                    />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className={cn(!f.present && "text-muted-foreground")}>{f.label}</span>
                      <span className="truncate font-mono text-[11px] text-muted-foreground">
                        {f.path}
                      </span>
                    </span>
                    <Badge variant={f.present ? "success" : "secondary"}>
                      {f.present ? t("present") : t("absent")}
                    </Badge>
                  </li>
                ))}
              </ul>
            </Section>
          </section>

          <LimitsNote>{t("limits")}</LimitsNote>
        </>
      )}
    </>
  );
}
