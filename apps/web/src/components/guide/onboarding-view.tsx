import { GUIDE_PHASES, type GuideStep, type GuideTool } from "@cairn/shared";
import { CircleAlert, KeyRound, ListChecks, Wrench } from "lucide-react";
import { useTranslations } from "next-intl";
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
  const t = useTranslations("onboarding.imported");
  return (
    <li className="flex flex-col gap-1.5 border-border/60 border-b py-3 last:border-0">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-sm">{tool.label}</span>
        {tool.version ? <span className="font-mono text-xs">{tool.version}</span> : null}
        <Badge variant={tool.basis === "pinned" ? "success" : "secondary"} className="ml-auto">
          {tool.basis === "pinned" ? t("pinned") : t("fromReadme")}
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
  const t = useTranslations("onboarding.imported");
  const td = useTranslations("domain");
  const onboarding = imported.scan?.onboarding ?? null;
  const base = imported.source;
  let counter = 0;

  return (
    <>
      <PageHeader
        title={t("title", { name: imported.name })}
        description={
          onboarding?.readme
            ? t.rich("descriptionReadme", {
                path: onboarding.readme.path,
                mono: (chunks) => <span className="font-mono">{chunks}</span>,
              })
            : t("description")
        }
      />
      <ProjectTabs id={id} active="onboarding" />

      {!imported.scan || !onboarding ? (
        <GuideUnavailable title={t("unavailableTitle")}>{t("unavailableBody")}</GuideUnavailable>
      ) : (
        <>
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              label={t("tools")}
              value={onboarding.tools.length}
              hint={t("toolsHint", {
                count: onboarding.tools.filter((tool) => tool.basis === "pinned").length,
              })}
              visual={<Wrench className="size-5 text-muted-foreground" aria-hidden />}
            />
            <KpiCard
              label={t("steps")}
              value={onboarding.steps.length}
              hint={onboarding.readme ? t("inReadme") : t("noReadme")}
              visual={<ListChecks className="size-5 text-muted-foreground" aria-hidden />}
            />
            <KpiCard
              label={t("warnings")}
              value={onboarding.warnings.length}
              hint={t("warningsHint")}
              visual={<CircleAlert className="size-5 text-muted-foreground" aria-hidden />}
            />
            <KpiCard
              label={t("toObtain")}
              value={onboarding.secretsToObtain.length}
              hint={t("toObtainHint")}
              visual={<KeyRound className="size-5 text-muted-foreground" aria-hidden />}
            />
          </section>

          {onboarding.warnings.length > 0 ? (
            <Section
              title={t("beforeYouStart")}
              description={t("beforeYouStartHint")}
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
              title={t("workstation")}
              description={t("workstationHint")}
              count={onboarding.tools.length}
            >
              {onboarding.tools.length > 0 ? (
                <ul className="flex flex-col">
                  {onboarding.tools.map((tool) => (
                    <ToolRow key={tool.id} tool={tool} base={base} />
                  ))}
                </ul>
              ) : (
                <p className="text-muted-foreground text-sm">{t("noTool")}</p>
              )}
            </Section>

            <div className="flex flex-col gap-4 lg:col-span-2">
              <Section
                title={t("install")}
                description={t("installHint")}
                count={onboarding.steps.length}
              >
                {onboarding.steps.length === 0 ? (
                  <p className="text-muted-foreground text-sm">{t("noCommand")}</p>
                ) : (
                  <div className="flex flex-col gap-6">
                    {GUIDE_PHASES.map((phase) => {
                      const steps = onboarding.steps.filter((s) => s.phase === phase);
                      if (steps.length === 0) return null;
                      return (
                        <section key={phase} className="flex flex-col gap-3">
                          <header className="flex flex-col">
                            <h3 className="font-semibold text-sm uppercase tracking-wide">
                              {td(`guidePhase.${phase}`)}
                            </h3>
                            <p className="text-muted-foreground text-xs">
                              {td(`guidePhaseHint.${phase}`)}
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
                title={t("toObtain")}
                description={t("toObtainSectionHint")}
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
                title={t("localPaths")}
                description={t("localPathsHint")}
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
              <Section title={t("urls")} description={t("urlsHint")} count={onboarding.urls.length}>
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
            title={t("findings")}
            description={t("findingsHint")}
            count={onboarding.findings.length}
          >
            <Findings findings={onboarding.findings} base={base} emptyText={t("noFinding")} />
          </Section>

          <LimitsNote>{t("limits")}</LimitsNote>
        </>
      )}
    </>
  );
}
