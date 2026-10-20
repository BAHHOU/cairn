import { AXES, AXIS_LABEL, MATURITY_NAMES, MATURITY_USAGE } from "@cairn/shared";
import { Check } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { GateBadge } from "@/components/badges";
import { Radar } from "@/components/charts/radar";
import { ScoreRing } from "@/components/charts/score-ring";
import { Sparkline } from "@/components/charts/sparkline";
import { IssueTable } from "@/components/issue-table";
import { PageHeader, ProgressBar } from "@/components/page";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getApi } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const api = await getApi();
  const project = await api.projects.get(id);
  if (!project) notFound();
  const issues = await api.issues.list({ projectId: id });
  const next = Math.min(project.maturity + 1, 5);

  return (
    <>
      <PageHeader
        title={project.name}
        description={
          <span className="flex flex-wrap items-center gap-2">
            {project.team} · {project.provider} · dernier scan {formatDate(project.lastScan)}
            {project.tech.map((t) => (
              <Badge key={t} variant="outline">
                {t}
              </Badge>
            ))}
          </span>
        }
        actions={
          <div className="flex items-center gap-3">
            <Link
              href={`/projects/${project.id}/architecture`}
              className="text-sm underline underline-offset-4 hover:text-primary"
            >
              Voir l'architecture
            </Link>
            <GateBadge status={project.gate} />
          </div>
        }
      />

      <section className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Score IA</CardTitle>
            <CardDescription>Moyenne pondérée des cinq axes</CardDescription>
          </CardHeader>
          <CardContent className="flex items-center gap-6">
            <ScoreRing score={project.score} size={96} stroke={9} />
            <div className="flex flex-col gap-2">
              <span className="text-xs text-muted-foreground">Tendance sur six mois</span>
              <Sparkline values={project.trend} className="h-8 w-28 text-primary" />
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Cinq axes</CardTitle>
          </CardHeader>
          <CardContent className="grid items-center gap-4 sm:grid-cols-2">
            <Radar values={project.axes} />
            <div className="flex flex-col gap-3">
              {AXES.map((axis) => (
                <div key={axis} className="flex flex-col gap-1">
                  <div className="flex justify-between text-sm">
                    <span>{AXIS_LABEL[axis]}</span>
                    <span className="tabular-nums text-muted-foreground">{project.axes[axis]}</span>
                  </div>
                  <ProgressBar value={project.axes[axis]} />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Maturité IA</CardTitle>
          <CardDescription>
            Niveau {project.maturity} : {MATURITY_NAMES[project.maturity]}. Usage recommandé
            aujourd'hui : {MATURITY_USAGE[project.maturity].toLowerCase()}.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {MATURITY_NAMES.map((name, level) => {
            const done = level <= project.maturity;
            const isNext = project.maturity < 5 && level === next;
            return (
              <div
                key={name}
                className={cn(
                  "flex flex-col gap-1 rounded-lg border p-3 text-sm",
                  done && "border-primary/40 bg-primary/5",
                  isNext && "border-dashed border-foreground/30",
                )}
              >
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  {done ? <Check className="size-3.5 text-primary" aria-hidden /> : null}
                  Niveau {level}
                </span>
                <span className="font-medium">{name}</span>
                {isNext ? (
                  <span className="text-xs text-muted-foreground">Prochain palier</span>
                ) : null}
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card className="gap-0 py-0">
        <CardHeader className="py-5">
          <CardTitle>Problèmes ouverts ({issues.length})</CardTitle>
        </CardHeader>
        <IssueTable issues={issues} showProject={false} />
      </Card>
    </>
  );
}
