import { type DeliveryView, PIPELINE_VARIABLE_KINDS } from "@cairn/shared";
import { Box, Layers, ShieldAlert, Workflow } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
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
import { useFormat } from "@/i18n/format";
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
  const t = useTranslations("delivery.imported");
  return (
    <Section title={t("images")} description={t("imagesHint")} count={delivery.images.length}>
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
                  {t("seeInArchitecture")}
                </Link>
              ) : null}
            </div>
            <dl className="grid gap-x-4 gap-y-1 text-xs sm:grid-cols-[auto_1fr]">
              {image.tag ? (
                <>
                  <dt className="text-muted-foreground">{t("tag")}</dt>
                  <dd className="break-all font-mono">{image.tag}</dd>
                </>
              ) : null}
              {image.baseImage ? (
                <>
                  <dt className="text-muted-foreground">{t("base")}</dt>
                  <dd className="break-all font-mono">{image.baseImage}</dd>
                </>
              ) : null}
              {image.jar ? (
                <>
                  <dt className="text-muted-foreground">{t("runs")}</dt>
                  <dd className="font-mono">{image.jar}</dd>
                </>
              ) : null}
              <dt className="text-muted-foreground">{t("builtBy")}</dt>
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
  const t = useTranslations("delivery.imported");
  const td = useTranslations("domain");
  const groups = PIPELINE_VARIABLE_KINDS.map((kind) => ({
    kind,
    items: delivery.variables.filter((v) => v.kind === kind),
  })).filter((g) => g.items.length > 0);
  return (
    <Section
      title={t("variables")}
      description={t("variablesHint")}
      count={delivery.variables.length}
    >
      <div className="flex flex-col gap-4">
        {groups.map((g) => (
          <div key={g.kind} className="flex flex-col gap-2">
            <h3 className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
              {td(`pipelineVariableKind.${g.kind}`)}
            </h3>
            <ul className="flex flex-wrap gap-1.5">
              {g.items.map((v) => (
                <li key={v.name}>
                  <Badge
                    variant={g.kind === "secret" ? "warning" : "secondary"}
                    className="font-mono"
                    title={t("usedBy", { jobs: v.usedBy.join(", ") })}
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
  const t = useTranslations("delivery.imported");
  return (
    <Section
      title={t("environments")}
      description={t("environmentsHint")}
      count={delivery.environments.length}
    >
      {delivery.environments.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t("noEnvironment")}</p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {delivery.environments.map((e) => (
            <li key={e.name} className="flex flex-col gap-0.5 rounded-lg border p-3">
              <span className="font-medium text-sm">{e.name}</span>
              <span className="text-muted-foreground text-xs">
                {t("configFiles", { count: e.files })}
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
  const t = useTranslations("delivery.imported");
  const fmt = useFormat();
  const delivery = imported.scan?.delivery ?? null;
  return (
    <>
      <PageHeader
        title={t("title", { name: imported.name })}
        description={
          delivery
            ? t("summary", {
                provider: PROVIDER_LABEL[delivery.provider],
                path: delivery.path,
                date: fmt.date(imported.scan?.report.generatedAt ?? ""),
              })
            : t("description")
        }
      />
      <ProjectTabs id={id} active="delivery" />

      {!imported.scan ? (
        <GuideUnavailable title={t("unavailableTitle")}>{t("unavailableBody")}</GuideUnavailable>
      ) : !delivery ? (
        <GuideUnavailable title={t("noPipelineTitle")}>{t("noPipelineBody")}</GuideUnavailable>
      ) : (
        <>
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              label={t("stages")}
              value={delivery.stages.length}
              hint={delivery.stages.map((s) => s.name).join(" → ")}
              visual={<Layers className="size-5 text-muted-foreground" aria-hidden />}
            />
            <KpiCard
              label={t("jobs")}
              value={delivery.counts.jobs}
              hint={t("manualJobs", { count: delivery.counts.manual })}
              visual={<Workflow className="size-5 text-muted-foreground" aria-hidden />}
            />
            <KpiCard
              label={t("images")}
              value={delivery.counts.images}
              hint={delivery.deploysToEnvironment ? t("deployDescribed") : t("noDeploy")}
              visual={<Box className="size-5 text-muted-foreground" aria-hidden />}
            />
            <KpiCard
              label={t("findings")}
              value={delivery.findings.length}
              hint={t("nonBlocking", { count: delivery.counts.nonBlocking })}
              visual={<ShieldAlert className="size-5 text-muted-foreground" aria-hidden />}
            />
          </section>

          <Section title={t("topology")} description={t("topologyHint")}>
            {delivery.topology ? (
              <DeliveryMap
                view={delivery.topology}
                delivery={delivery}
                id={id}
                base={imported.source}
              />
            ) : (
              <p className="text-muted-foreground text-sm">{t("topologyOutdated")}</p>
            )}
          </Section>

          <Section title={t("jobsDetail")} description={t("jobsDetailHint")}>
            <PipelineFlow delivery={delivery} base={imported.source} />
          </Section>

          <Section
            title={t("findings")}
            description={t("findingsHint")}
            count={delivery.findings.length}
          >
            <Findings
              findings={delivery.findings}
              base={imported.source}
              emptyText={t("noFinding")}
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

          <LimitsNote>{t("limits")}</LimitsNote>
        </>
      )}
    </>
  );
}
