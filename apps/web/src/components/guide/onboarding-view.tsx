import {
  GUIDE_PHASE_HINT,
  GUIDE_PHASE_LABEL,
  GUIDE_PHASES,
  type GuideStep,
  type GuideTool,
} from "@cairn/shared";
import { CircleAlert, KeyRound, ListChecks, Wrench } from "lucide-react";
import {
  GuideUnavailable,
  LimitsNote,
  ProjectTabs,
  Section,
  SourceRef,
} from "@/components/guide/bits";
import { Findings } from "@/components/guide/findings";
import { CommandBlock } from "@/components/onboarding/command-block";
import { KpiCard, PageHeader } from "@/components/page";
import { Badge } from "@/components/ui/badge";
import type { ImportedScan } from "@/lib/import/scan";
import type { SourceBase } from "@/lib/import/source-link";

function ToolRow({ tool, base }: { tool: GuideTool; base: SourceBase }) {
  return (
    <li className="flex flex-col gap-1.5 border-border/60 border-b py-3 last:border-0">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-sm">{tool.label}</span>
        {tool.version ? <span className="font-mono text-xs">{tool.version}</span> : null}
        <Badge variant={tool.basis === "pinned" ? "success" : "secondary"} className="ml-auto">
          {tool.basis === "pinned" ? "Imposé par le dépôt" : "Écrit dans le README"}
        </Badge>
      </div>
      {tool.check ? <CommandBlock command={tool.check} /> : null}
      {tool.note ? <p className="text-muted-foreground text-xs">{tool.note}</p> : null}
      <SourceRef source={tool.source} base={base} />
    </li>
  );
}

function StepRow({ step, index, base }: { step: GuideStep; index: number; base: SourceBase }) {
  return (
    <li className="flex gap-3">
      <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border bg-card font-medium text-xs tabular-nums">
        {index}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-2 pb-6">
        <h4 className="font-medium text-sm">{step.title}</h4>
        {step.explanation ? (
          <p className="text-muted-foreground text-sm leading-relaxed">{step.explanation}</p>
        ) : null}
        <CommandBlock command={step.commands.join("\n")} />
        <SourceRef source={step.source} base={base} />
      </div>
    </li>
  );
}

/** The local-setup page of a repository imported from Git: its README, read and ordered. */
export function ImportedOnboarding({ id, imported }: { id: string; imported: ImportedScan }) {
  const onboarding = imported.scan?.onboarding ?? null;
  const base = imported.source;
  let counter = 0;

  return (
    <>
      <PageHeader
        title={`Démarrage — ${imported.name}`}
        description={
          onboarding?.readme ? (
            <>
              Installation locale pour un nouveau développeur, lue dans{" "}
              <span className="font-mono">{onboarding.readme.path}</span> et les fichiers de build.
            </>
          ) : (
            "Installation locale pour un nouveau développeur."
          )
        }
      />
      <ProjectTabs id={id} active="onboarding" />

      {!imported.scan || !onboarding ? (
        <GuideUnavailable title="Aucune analyse pour l'instant">
          Le guide de démarrage apparaît après une analyse réussie. Si l'analyse date d'avant cette
          vue, relancez-la depuis la fiche du projet.
        </GuideUnavailable>
      ) : (
        <>
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              label="Outils"
              value={onboarding.tools.length}
              hint={`${onboarding.tools.filter((t) => t.basis === "pinned").length} imposé(s) par le dépôt`}
              visual={<Wrench className="size-5 text-muted-foreground" aria-hidden />}
            />
            <KpiCard
              label="Étapes écrites"
              value={onboarding.steps.length}
              hint={onboarding.readme ? "Dans le README" : "Aucun README"}
              visual={<ListChecks className="size-5 text-muted-foreground" aria-hidden />}
            />
            <KpiCard
              label="Mises en garde"
              value={onboarding.warnings.length}
              hint="Écrites par les auteurs"
              visual={<CircleAlert className="size-5 text-muted-foreground" aria-hidden />}
            />
            <KpiCard
              label="À obtenir"
              value={onboarding.secretsToObtain.length}
              hint="Variables fournies hors du dépôt"
              visual={<KeyRound className="size-5 text-muted-foreground" aria-hidden />}
            />
          </section>

          {onboarding.warnings.length > 0 ? (
            <Section
              title="À savoir avant de commencer"
              description="Les avertissements que les auteurs ont eux-mêmes écrits dans le README."
              count={onboarding.warnings.length}
            >
              <ul className="flex flex-col gap-2">
                {onboarding.warnings.map((w) => (
                  <li
                    key={w.id}
                    className="flex flex-col gap-1 rounded-lg border border-warning/40 bg-warning/5 p-3"
                  >
                    <p className="flex items-start gap-2 text-sm leading-relaxed">
                      <CircleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
                      {w.text}
                    </p>
                    <SourceRef source={w.source} base={base} className="pl-6" />
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}

          <section className="grid items-start gap-4 lg:grid-cols-3">
            <Section
              title="Sur le poste"
              description="Versions tirées du pipeline et des fichiers de build quand c'est possible, sinon du README."
              count={onboarding.tools.length}
            >
              {onboarding.tools.length > 0 ? (
                <ul className="flex flex-col">
                  {onboarding.tools.map((t) => (
                    <ToolRow key={t.id} tool={t} base={base} />
                  ))}
                </ul>
              ) : (
                <p className="text-muted-foreground text-sm">Aucun outil identifié.</p>
              )}
            </Section>

            <div className="flex flex-col gap-4 lg:col-span-2">
              <Section
                title="Installation"
                description="Les commandes du README, dans l'ordre où il les donne, regroupées par moment. Les valeurs qui ressemblent à un identifiant sont masquées."
                count={onboarding.steps.length}
              >
                {onboarding.steps.length === 0 ? (
                  <p className="text-muted-foreground text-sm">
                    Le README ne contient aucune commande à exécuter.
                  </p>
                ) : (
                  <div className="flex flex-col gap-6">
                    {GUIDE_PHASES.map((phase) => {
                      const steps = onboarding.steps.filter((s) => s.phase === phase);
                      if (steps.length === 0) return null;
                      return (
                        <section key={phase} className="flex flex-col gap-3">
                          <header className="flex flex-col">
                            <h3 className="font-semibold text-sm uppercase tracking-wide">
                              {GUIDE_PHASE_LABEL[phase]}
                            </h3>
                            <p className="text-muted-foreground text-xs">
                              {GUIDE_PHASE_HINT[phase]}
                            </p>
                          </header>
                          <ol className="flex flex-col">
                            {steps.map((step) => {
                              counter += 1;
                              return (
                                <StepRow key={step.id} step={step} index={counter} base={base} />
                              );
                            })}
                          </ol>
                        </section>
                      );
                    })}
                  </div>
                )}
              </Section>
            </div>
          </section>

          <section className="grid items-start gap-4 lg:grid-cols-3">
            {onboarding.secretsToObtain.length > 0 ? (
              <Section
                title="À obtenir"
                description="Variables que la chaîne attend et que le dépôt ne fournit pas. Seuls les noms sont lus."
                count={onboarding.secretsToObtain.length}
              >
                <ul className="flex flex-wrap gap-1.5">
                  {onboarding.secretsToObtain.map((s) => (
                    <li key={s.name}>
                      <Badge variant="secondary" className="font-mono">
                        {s.name}
                      </Badge>
                    </li>
                  ))}
                </ul>
              </Section>
            ) : null}
            {onboarding.localPaths.length > 0 ? (
              <Section
                title="À adapter à votre poste"
                description="Chemins écrits pour la machine d'un auteur."
                count={onboarding.localPaths.length}
              >
                <ul className="flex flex-col gap-2">
                  {onboarding.localPaths.map((p) => (
                    <li key={p.text} className="flex flex-col gap-0.5">
                      <code className="break-all font-mono text-xs">{p.text}</code>
                      <SourceRef source={p.source} base={base} />
                    </li>
                  ))}
                </ul>
              </Section>
            ) : null}
            {onboarding.urls.length > 0 ? (
              <Section
                title="Adresses locales"
                description="Ce que le README dit d'ouvrir une fois lancé."
                count={onboarding.urls.length}
              >
                <ul className="flex flex-col gap-2">
                  {onboarding.urls.map((u) => (
                    <li key={u.url} className="flex flex-col gap-0.5">
                      <code className="break-all font-mono text-xs">{u.url}</code>
                      <SourceRef source={u.source} base={base} />
                    </li>
                  ))}
                </ul>
              </Section>
            ) : null}
          </section>

          <Section
            title="Points d'attention"
            description="Ce qui ralentit un nouvel arrivant, avec la ligne d'où ça vient."
            count={onboarding.findings.length}
          >
            <Findings
              findings={onboarding.findings}
              base={base}
              emptyText="Le README couvre l'essentiel d'un démarrage."
            />
          </Section>

          <LimitsNote>
            Lu dans le README et les fichiers de build, jamais exécuté : Cairn ne sait pas si une
            commande fonctionne aujourd'hui. Les durées et les accès à demander ne figurent pas dans
            un dépôt, ils ne sont donc pas affichés.
          </LimitsNote>
        </>
      )}
    </>
  );
}
