import {
  blockingAccesses,
  filledPhases,
  formatMinutes,
  SETUP_PHASE_HINT,
  SETUP_PHASE_LABEL,
  setupEffort,
  stepsOfPhase,
} from "@cairn/shared";
import { CalendarClock, Timer } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ImportedOnboarding } from "@/components/guide/onboarding-view";
import { IssueTable } from "@/components/issue-table";
import { AccessRow, PitfallCard, PrereqRow, StepCard } from "@/components/onboarding/steps";
import { PageHeader } from "@/components/page";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getApi } from "@/lib/api";
import { formatDate } from "@/lib/format";
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
        title={`Démarrage — ${project.name}`}
        description={
          onboarding && effort ? (
            <>
              {formatMinutes(effort.handsOnMin)} au clavier · jusqu'à {effort.waitingDays} jours
              ouvrés d'attente d'accès · tenu par {onboarding.maintainer} · vérifié le{" "}
              {formatDate(onboarding.generatedAt)}
            </>
          ) : (
            "Aucune procédure d'installation n'a encore été décrite pour ce projet."
          )
        }
        actions={
          <div className="flex flex-wrap gap-4 text-sm">
            <Link
              href={`/projects/${project.id}/architecture`}
              className="underline underline-offset-4"
            >
              Vue architecture
            </Link>
            <Link
              href={`/projects/${project.id}/delivery`}
              className="underline underline-offset-4"
            >
              Chaîne CI/CD
            </Link>
            <Link href={`/projects/${project.id}`} className="underline underline-offset-4">
              Fiche projet
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
                  <CalendarClock className="size-4 text-warning" aria-hidden />À demander
                  aujourd'hui, avant toute chose
                </CardTitle>
                <CardDescription>
                  Les commandes plus bas prennent {formatMinutes(effort.handsOnMin)}. Ces accès
                  prennent jusqu'à {effort.waitingDays} jours ouvrés, et rien ne tourne sans eux. Le
                  plus lent d'abord.
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
                <CardTitle>Sur le poste</CardTitle>
                <CardDescription>
                  Les versions sont celles que le dépôt impose, pas les dernières publiées.
                </CardDescription>
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
                  Installation
                  <span className="flex items-center gap-1 font-normal text-muted-foreground text-xs tabular-nums">
                    <Timer className="size-3" aria-hidden />
                    {formatMinutes(effort.handsOnMin)}
                  </span>
                </CardTitle>
                <CardDescription>
                  Chaque étape indique à quoi ressemble la réussite, et le fichier d'où elle est
                  tirée.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-6">
                {phases.map((phase) => {
                  const steps = stepsOfPhase(onboarding, phase);
                  return (
                    <section key={phase} className="flex flex-col gap-3">
                      <header className="flex flex-col">
                        <h3 className="font-semibold text-sm uppercase tracking-wide">
                          {SETUP_PHASE_LABEL[phase]}
                        </h3>
                        <p className="text-muted-foreground text-xs">{SETUP_PHASE_HINT[phase]}</p>
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
              <CardTitle>Ça casse souvent ici</CardTitle>
              <CardDescription>
                Les pannes réellement rencontrées à l'arrivée, décrites par ce qui s'affiche à
                l'écran plutôt que par leur cause — c'est le message d'erreur que vous aurez sous
                les yeux.
              </CardDescription>
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
                <CardTitle>Pour une première contribution</CardTitle>
                <CardDescription>
                  Des sujets volontairement petits et localisés : l'objectif est de faire le tour
                  complet — brancher, corriger, tester, faire relire — pas de livrer beaucoup.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <IssueTable issues={firstIssues} />
              </CardContent>
            </Card>
          ) : null}

          <p className="text-muted-foreground text-sm">
            Une étape fausse ou manquante ? C'est une anomalie du dépôt, pas de cette page :
            prévenez {onboarding.maintainer}.
          </p>
        </>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Pas encore de procédure</CardTitle>
            <CardDescription>
              Une installation inventée ferait perdre plus de temps qu'elle n'en ferait gagner.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-muted-foreground text-sm">
            Exemple disponible :{" "}
            <Link href="/projects/qis-dist-cms/onboarding" className="underline underline-offset-4">
              qis-dist-cms
            </Link>
            .
          </CardContent>
        </Card>
      )}
    </>
  );
}
