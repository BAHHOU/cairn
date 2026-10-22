import { DOC_KIND_LABEL } from "@cairn/shared";
import { BookOpen, Bot, CheckCircle2, CircleDashed, FileText, Layers } from "lucide-react";
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
import { formatNumber, formatTokens } from "@/lib/format";
import type { ImportedScan } from "@/lib/import/scan";
import { cn } from "@/lib/utils";

/** The documentation page of a repository imported from Git: what exists, what is missing, what lies. */
export function ImportedDocs({ id, imported }: { id: string; imported: ImportedScan }) {
  const docs = imported.scan?.docs ?? null;
  const base = imported.source;

  return (
    <>
      <PageHeader
        title={`Documentation — ${imported.name}`}
        description="Ce qui est écrit, ce qui manque, et ce qui ne correspond plus au code."
      />
      <ProjectTabs id={id} active="docs" />

      {!imported.scan || !docs ? (
        <GuideUnavailable title="Aucune analyse pour l'instant">
          La vue documentation apparaît après une analyse réussie. Si l'analyse date d'avant cette
          vue, relancez-la depuis la fiche du projet.
        </GuideUnavailable>
      ) : (
        <>
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              label="Documents"
              value={formatNumber(docs.stats.files)}
              hint={`${formatNumber(docs.stats.words)} mots`}
              visual={<FileText className="size-5 text-muted-foreground" aria-hidden />}
            />
            <KpiCard
              label="Coût de lecture"
              value={formatTokens(docs.stats.tokens)}
              hint={`≈ ${docs.stats.tokenShare > 0 && docs.stats.tokenShare < 0.01 ? "< 1" : Math.round(docs.stats.tokenShare * 100)} % du dépôt (estimation)`}
              visual={<BookOpen className="size-5 text-muted-foreground" aria-hidden />}
            />
            <KpiCard
              label="Modules avec un README"
              value={`${docs.stats.modulesWithReadme} / ${docs.stats.modules}`}
              hint="Dossiers qui portent un build"
              visual={<Layers className="size-5 text-muted-foreground" aria-hidden />}
            />
            <KpiCard
              label="Contradictions"
              value={docs.drift.length}
              hint="Documentation contre dépôt"
              visual={<CheckCircle2 className="size-5 text-muted-foreground" aria-hidden />}
            />
          </section>

          <Section
            title="Ce qui ne correspond plus"
            description="La documentation affirme une chose, le dépôt en montre une autre. Chaque constat cite la ligne."
            count={docs.drift.length}
          >
            <Findings
              findings={docs.drift}
              base={base}
              emptyText="Aucune contradiction détectée entre la documentation et le dépôt."
            />
          </Section>

          <section className="grid items-start gap-4 lg:grid-cols-2">
            <Section
              title="Ce qu'un lecteur cherche"
              description="Les questions qu'un nouvel arrivant se pose, et si la documentation y répond."
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
                      {item.present ? "Présent" : "Absent"}
                    </Badge>
                  </li>
                ))}
              </ul>
            </Section>

            <Section
              title="Plan du README"
              description={docs.outline ? docs.outline.path : "Aucun README à la racine."}
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
                        L{item.line}
                      </span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-muted-foreground text-sm">Pas de titres à afficher.</p>
              )}
            </Section>
          </section>

          <section className="grid items-start gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <Section
                title="Documents du dépôt"
                description="Les fichiers de documentation, avec ce qu'il en coûte de les lire."
                count={docs.files.length}
              >
                {docs.files.length === 0 ? (
                  <p className="text-muted-foreground text-sm">Aucun document trouvé.</p>
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
                        <Badge variant="outline">{DOC_KIND_LABEL[f.kind]}</Badge>
                        <span className="w-20 text-right text-muted-foreground text-xs tabular-nums">
                          {formatNumber(f.words)} mots
                        </span>
                        <span className="w-20 text-right text-muted-foreground text-xs tabular-nums">
                          ≈ {formatTokens(f.tokens)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Section>
            </div>

            <Section
              title="Pour les assistants IA"
              description="Les fichiers d'instructions que les assistants lisent d'eux-mêmes. Cairn en propose, il n'en écrit jamais."
            >
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
                      {f.present ? "Présent" : "Absent"}
                    </Badge>
                  </li>
                ))}
              </ul>
            </Section>
          </section>

          <LimitsNote>
            Lecture à base de motifs : Cairn compare des versions et des chemins cités, il ne juge
            pas la qualité de la rédaction. Un document peut être exact et absent de cette liste, ou
            l'inverse. Les coûts de lecture sont des estimations (taille / 4).
          </LimitsNote>
        </>
      )}
    </>
  );
}
