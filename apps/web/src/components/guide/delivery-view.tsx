import {
  type DeliveryView,
  PIPELINE_VARIABLE_KIND_LABEL,
  PIPELINE_VARIABLE_KINDS,
} from "@cairn/shared";
import { Box, Layers, ShieldAlert, Workflow } from "lucide-react";
import Link from "next/link";
import {
  GuideUnavailable,
  LimitsNote,
  ProjectTabs,
  Section,
  SourceRef,
} from "@/components/guide/bits";
import { DeliveryMap } from "@/components/guide/delivery-map";
import { Findings } from "@/components/guide/findings";
import { PipelineFlow } from "@/components/guide/pipeline-flow";
import { KpiCard, PageHeader } from "@/components/page";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/format";
import type { ImportedScan } from "@/lib/import/scan";

const PROVIDER_LABEL = {
  gitlab: "GitLab CI",
  github: "GitHub Actions",
  jenkins: "Jenkins",
} as const;

function Images({
  delivery,
  id,
  imported,
}: {
  delivery: DeliveryView;
  id: string;
  imported: ImportedScan;
}) {
  return (
    <Section
      title="Images produites"
      description="Ce que la chaîne construit et publie. Le lien ouvre le service dans l'architecture."
      count={delivery.images.length}
    >
      <ul className="flex flex-col gap-3">
        {delivery.images.map((image) => (
          <li key={image.repository} className="flex flex-col gap-2 rounded-lg border p-3">
            <div className="flex flex-wrap items-center gap-2">
              <Box className="size-4 text-muted-foreground" aria-hidden />
              <span className="font-medium font-mono text-sm">{image.repository}</span>
              {image.exposes.map((p) => (
                <Badge key={p} variant="outline" className="font-mono">
                  :{p}
                </Badge>
              ))}
              {image.nodeId ? (
                <Link
                  href={`/projects/${id}/architecture?vue=flux&noeud=${encodeURIComponent(image.nodeId)}`}
                  className="ml-auto text-xs underline underline-offset-4 hover:text-primary"
                >
                  Voir dans l'architecture
                </Link>
              ) : null}
            </div>
            <dl className="grid gap-x-4 gap-y-1 text-xs sm:grid-cols-[auto_1fr]">
              {image.tag ? (
                <>
                  <dt className="text-muted-foreground">Étiquette</dt>
                  <dd className="break-all font-mono">{image.tag}</dd>
                </>
              ) : null}
              {image.baseImage ? (
                <>
                  <dt className="text-muted-foreground">Base</dt>
                  <dd className="break-all font-mono">{image.baseImage}</dd>
                </>
              ) : null}
              {image.jar ? (
                <>
                  <dt className="text-muted-foreground">Exécute</dt>
                  <dd className="font-mono">{image.jar}</dd>
                </>
              ) : null}
              <dt className="text-muted-foreground">Construite par</dt>
              <dd className="font-mono">{image.builtBy}</dd>
            </dl>
            {image.source ? <SourceRef source={image.source} base={imported.source} /> : null}
          </li>
        ))}
      </ul>
    </Section>
  );
}

function Variables({ delivery }: { delivery: DeliveryView }) {
  const groups = PIPELINE_VARIABLE_KINDS.map((kind) => ({
    kind,
    items: delivery.variables.filter((v) => v.kind === kind),
  })).filter((g) => g.items.length > 0);
  return (
    <Section
      title="Variables"
      description="Les noms que la chaîne lit. Leurs valeurs ne sont jamais lues ni conservées par Cairn."
      count={delivery.variables.length}
    >
      <div className="flex flex-col gap-4">
        {groups.map((g) => (
          <div key={g.kind} className="flex flex-col gap-2">
            <h3 className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
              {PIPELINE_VARIABLE_KIND_LABEL[g.kind]}
            </h3>
            <ul className="flex flex-wrap gap-1.5">
              {g.items.map((v) => (
                <li key={v.name}>
                  <Badge
                    variant={g.kind === "secret" ? "warning" : "secondary"}
                    className="font-mono"
                    title={`Utilisée par ${v.usedBy.join(", ")}`}
                  >
                    {v.name}
                  </Badge>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Section>
  );
}

function Environments({ delivery }: { delivery: DeliveryView }) {
  return (
    <Section
      title="Environnements dans le dépôt"
      description="Dossiers de configuration nommés d'après un environnement. Ce n'est pas la liste de ce qui est déployé."
      count={delivery.environments.length}
    >
      {delivery.environments.length === 0 ? (
        <p className="text-muted-foreground text-sm">Aucun dossier par environnement trouvé.</p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {delivery.environments.map((e) => (
            <li key={e.name} className="flex flex-col gap-0.5 rounded-lg border p-3">
              <span className="font-medium text-sm">{e.name}</span>
              <span className="text-muted-foreground text-xs">
                {e.files} fichier{e.files > 1 ? "s" : ""} de configuration
              </span>
              {e.example ? (
                <span className="truncate font-mono text-[11px] text-muted-foreground">
                  {e.example}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

/** The CI/CD page of a repository imported from Git: everything comes from its pipeline file. */
export function ImportedDelivery({ id, imported }: { id: string; imported: ImportedScan }) {
  const delivery = imported.scan?.delivery ?? null;
  return (
    <>
      <PageHeader
        title={`CI/CD — ${imported.name}`}
        description={
          delivery ? (
            <>
              {PROVIDER_LABEL[delivery.provider]} · {delivery.path} · lu le{" "}
              {formatDate(imported.scan?.report.generatedAt ?? "")}
            </>
          ) : (
            "Du commit à la production, lu dans le pipeline du dépôt."
          )
        }
      />
      <ProjectTabs id={id} active="delivery" />

      {!imported.scan ? (
        <GuideUnavailable title="Aucune analyse pour l'instant">
          La chaîne CI/CD apparaît après la première analyse réussie.
        </GuideUnavailable>
      ) : !delivery ? (
        <GuideUnavailable title="Aucun pipeline trouvé">
          Ni fichier GitLab CI, ni workflow GitHub Actions, ni Jenkinsfile n'a été trouvé dans ce
          dépôt. Si l'analyse date d'avant cette vue, relancez-la depuis la fiche du projet.
        </GuideUnavailable>
      ) : (
        <>
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              label="Étapes"
              value={delivery.stages.length}
              hint={delivery.stages.map((s) => s.name).join(" → ")}
              visual={<Layers className="size-5 text-muted-foreground" aria-hidden />}
            />
            <KpiCard
              label="Jobs"
              value={delivery.counts.jobs}
              hint={`${delivery.counts.manual} manuel(s)`}
              visual={<Workflow className="size-5 text-muted-foreground" aria-hidden />}
            />
            <KpiCard
              label="Images produites"
              value={delivery.counts.images}
              hint={
                delivery.deploysToEnvironment ? "Déploiement décrit" : "Aucun déploiement décrit"
              }
              visual={<Box className="size-5 text-muted-foreground" aria-hidden />}
            />
            <KpiCard
              label="Points d'attention"
              value={delivery.findings.length}
              hint={`${delivery.counts.nonBlocking} job(s) qui n'arrêtent rien`}
              visual={<ShieldAlert className="size-5 text-muted-foreground" aria-hidden />}
            />
          </section>

          <Section
            title="Architecture de déploiement"
            description="Du commit à ce qui tourne : les outils, leurs logos et ce qu'ils se passent. Trait plein : écrit dans le dépôt. Pointillé : déduit, ou non décrit."
          >
            {delivery.topology ? (
              <DeliveryMap
                view={delivery.topology}
                delivery={delivery}
                id={id}
                base={imported.source}
              />
            ) : (
              <p className="text-muted-foreground text-sm">
                Cette analyse date d'avant le schéma de déploiement. Relancez-la depuis la fiche du
                projet pour le dessiner.
              </p>
            )}
          </Section>

          <Section
            title="Détail des jobs"
            description="Les étapes dans l'ordre du pipeline. Cliquez sur un job pour voir quand il s'exécute, ce qu'il produit et ce qui l'affaiblit."
          >
            <PipelineFlow delivery={delivery} base={imported.source} />
          </Section>

          <Section
            title="Points d'attention"
            description="Des constats vérifiables dans le fichier, avec la ligne. Cairn propose, il ne modifie jamais le dépôt."
            count={delivery.findings.length}
          >
            <Findings
              findings={delivery.findings}
              base={imported.source}
              emptyText="Aucun point d'attention relevé dans le pipeline."
            />
          </Section>

          <div id="images" className="grid items-start gap-4 lg:grid-cols-2">
            {delivery.images.length > 0 ? (
              <Images delivery={delivery} id={id} imported={imported} />
            ) : null}
            <div className="flex flex-col gap-4">
              <Variables delivery={delivery} />
              <Environments delivery={delivery} />
            </div>
          </div>

          <LimitsNote>
            Tout vient du fichier de pipeline, lu sans l'exécuter. Les durées, les validations, les
            reprises sur incident et l'historique des exécutions n'y figurent pas : Cairn ne les
            invente pas. Lecture à base de motifs, pas d'analyse complète du YAML : un job généré
            par inclusion ou par règle dynamique peut ne pas apparaître.
          </LimitsNote>
        </>
      )}
    </>
  );
}
