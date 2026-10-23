import {
  blockingAccesses,
  filledPhases,
  formatMinutes,
  setupEffort,
  stepsOfPhase,
} from "@cairn/shared";
import { CalendarClock, Timer } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ImportedOnboarding } from "@/components/guide/onboarding-view";
import { IssueTable } from "@/components/issue-table";
import { AccessRow, PitfallCard, PrereqRow, StepCard } from "@/components/onboarding/steps";
import { PageHeader } from "@/components/page";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getFormat } from "@/i18n/format";
import { getApi } from "@/lib/api";
import { loadImportedScan } from "@/lib/import/scan";

/**
 * Getting a new developer running locally.
 *
 * Organised against the two things that actually cost time — the accesses you
 * have to wait for, and the failures nobody warned you about — rather than as a
 * linear README. The commands matter least; they were always the easy part.
 */
export default async function OnboardingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const api = await getApi();
  const project = await api.projects.get(id);
  if (!project) {
    const imported = await loadImportedScan(id);
    if (!imported) notFound();
    return <ImportedOnboarding id={id} imported={imported} />;
  }

  const t = await getTranslations("onboarding.page");
  const td = await getTranslations("domain");
  const tn = await getTranslations("projectNav");
  const fmt = await getFormat();
  const onboarding = await api.projects.onboarding(id);
  const issues = onboarding ? await api.issues.list({ projectId: id }) : [];

  const effort = onboarding ? setupEffort(onboarding) : null;
  const blockers = onboarding ? blockingAccesses(onboarding) : [];
  const phases = onboarding ? filledPhases(onboarding) : [];
  const firstIssues = onboarding
    ? issues.filter((i) => onboarding.firstIssueIds.includes(i.id))
    : [];

  // Numbering runs across the whole page, not per section: it is one sequence.
  let counter = 0;

  return (
    <>
      <PageHeader
        title={t("title", { name: project.name })}
        description={
          onboarding && effort
            ? t("summary", {
                handsOn: formatMinutes(effort.handsOnMin),
                days: effort.waitingDays,
                maintainer: onboarding.maintainer,
                date: fmt.date(onboarding.generatedAt),
              })
            : t("none")
        }
        actions={
          <div className="flex flex-wrap gap-4 text-sm">
            <Link
              href={`/projects/${project.id}/architecture`}
              className="underline underline-offset-4"
            >
              {tn("architecture")}
            </Link>
            <Link
              href={`/projects/${project.id}/delivery`}
              className="underline underline-offset-4"
            >
              {t("deliveryLink")}
            </Link>
            <Link href={`/projects/${project.id}`} className="underline underline-offset-4">
              {tn("project")}
            </Link>
          </div>
        }
      />

      {onboarding && effort ? (
        <>
          {/* ------------------------------------------------ the one thing to do today */}
          {blockers.length ? (
            <Card className="border-warning/50 bg-warning/5">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CalendarClock className="size-4 text-warning" aria-hidden />
                  {t("askToday")}
                </CardTitle>
                <CardDescription>
                  {t("askTodayHint", {
                    handsOn: formatMinutes(effort.handsOnMin),
                    days: effort.waitingDays,
                  })}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="flex flex-col">
                  {blockers.map((a) => (
                    <AccessRow key={a.id} access={a} />
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}

          <section className="grid items-start gap-4 lg:grid-cols-3">
            {/* ------------------------------------------------ prerequisites */}
            <Card className="lg:sticky lg:top-4">
              <CardHeader>
                <CardTitle>{t("workstation")}</CardTitle>
                <CardDescription>{t("workstationHint")}</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="flex flex-col">
                  {onboarding.prereqs.map((p) => (
                    <PrereqRow key={p.id} prereq={p} />
                  ))}
                </ul>
              </CardContent>
            </Card>

            {/* ------------------------------------------------ the steps */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  {t("install")}
                  <span className="flex items-center gap-1 font-normal text-muted-foreground text-xs tabular-nums">
                    <Timer className="size-3" aria-hidden />
                    {formatMinutes(effort.handsOnMin)}
                  </span>
                </CardTitle>
                <CardDescription>{t("installHint")}</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-6">
                {phases.map((phase) => {
                  const steps = stepsOfPhase(onboarding, phase);
                  return (
                    <section key={phase} className="flex flex-col gap-3">
                      <header className="flex flex-col">
                        <h3 className="font-semibold text-sm uppercase tracking-wide">
                          {td(`setupPhase.${phase}`)}
                        </h3>
                        <p className="text-muted-foreground text-xs">
                          {td(`setupPhaseHint.${phase}`)}
                        </p>
                      </header>
                      <ol className="flex flex-col">
                        {steps.map((step) => {
                          counter += 1;
                          return <StepCard key={step.id} step={step} index={counter} />;
                        })}
                      </ol>
                    </section>
                  );
                })}
              </CardContent>
            </Card>
          </section>

          {/* ------------------------------------------------ known failures */}
          <Card>
            <CardHeader>
              <CardTitle>{t("pitfalls")}</CardTitle>
              <CardDescription>{t("pitfallsHint")}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 lg:grid-cols-2">
              {onboarding.pitfalls.map((p) => (
                <PitfallCard key={p.id} pitfall={p} />
              ))}
            </CardContent>
          </Card>

          {/* ------------------------------------------------ first contribution */}
          {firstIssues.length ? (
            <Card>
              <CardHeader>
                <CardTitle>{t("firstContribution")}</CardTitle>
                <CardDescription>{t("firstContributionHint")}</CardDescription>
              </CardHeader>
              <CardContent>
                <IssueTable issues={firstIssues} />
              </CardContent>
            </Card>
          ) : null}

          <p className="text-muted-foreground text-sm">
            {t("wrongStep", { maintainer: onboarding.maintainer })}
          </p>
        </>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>{t("emptyTitle")}</CardTitle>
            <CardDescription>{t("emptyHint")}</CardDescription>
          </CardHeader>
          <CardContent className="text-muted-foreground text-sm">
            {tn.rich("exampleAvailable", {
              link: (chunks) => (
                <Link
                  href="/projects/qis-dist-cms/onboarding"
                  className="underline underline-offset-4"
                >
                  {chunks}
                </Link>
              ),
            })}
          </CardContent>
        </Card>
      )}
    </>
  );
}
