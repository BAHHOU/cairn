"use client";

import type { DeliveryView, PipelineJobRole, PipelineJobView } from "@cairn/shared";
import {
  AlertTriangle,
  ChevronRight,
  CloudUpload,
  Cog,
  FlaskConical,
  Gauge,
  GitCommitHorizontal,
  Hammer,
  type LucideIcon,
  Package,
  Rocket,
  ShieldAlert,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { type ReactNode, useMemo, useState } from "react";
import { SourceRef } from "@/components/guide/bits";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/dialog";
import type { SourceBase } from "@/lib/import/source-link";
import { cn } from "@/lib/utils";

const ROLE_STYLE: Record<PipelineJobRole, { Icon: LucideIcon; chip: string }> = {
  build: { Icon: Hammer, chip: "bg-sky-500/15 text-sky-700 dark:text-sky-300" },
  test: { Icon: FlaskConical, chip: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" },
  quality: { Icon: Gauge, chip: "bg-violet-500/15 text-violet-700 dark:text-violet-300" },
  security: { Icon: ShieldAlert, chip: "bg-rose-500/15 text-rose-700 dark:text-rose-300" },
  package: { Icon: Package, chip: "bg-amber-500/15 text-amber-700 dark:text-amber-300" },
  publish: { Icon: CloudUpload, chip: "bg-orange-500/15 text-orange-700 dark:text-orange-300" },
  deploy: { Icon: Rocket, chip: "bg-teal-500/15 text-teal-700 dark:text-teal-300" },
  other: { Icon: Cog, chip: "bg-muted text-muted-foreground" },
};

function RoleIcon({ role, className }: { role: PipelineJobRole; className?: string }) {
  const { Icon, chip } = ROLE_STYLE[role];
  return (
    <span className={cn("grid size-8 shrink-0 place-items-center rounded-lg", chip, className)}>
      <Icon className="size-4" aria-hidden />
    </span>
  );
}

function Connector() {
  return (
    <li aria-hidden className="flex shrink-0 items-center self-center text-muted-foreground/60">
      <ChevronRight className="size-4" />
    </li>
  );
}

function JobCard({
  job,
  selected,
  onSelect,
}: {
  job: PipelineJobView;
  selected: boolean;
  onSelect: () => void;
}) {
  const t = useTranslations();
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "flex w-full flex-col gap-2.5 rounded-xl border bg-card p-3 text-left shadow-xs transition-all",
        "hover:-translate-y-px hover:shadow-md focus-visible:outline-2 focus-visible:outline-ring",
        selected && "border-primary ring-2 ring-primary/40",
      )}
    >
      <span className="flex items-center gap-2.5">
        <RoleIcon role={job.role} />
        <span className="flex min-w-0 flex-col">
          <span className="break-words font-medium font-mono text-[13px] leading-tight">
            {job.name.replace(/[_-]/g, "$&\u200b")}
          </span>
          <span className="text-[11px] text-muted-foreground">
            {t(`domain.pipelineJobRole.${job.role}`)}
          </span>
        </span>
      </span>
      <span className="flex flex-wrap gap-1">
        <Badge variant="outline" className="text-[11px]">
          {t(`domain.pipelineTrigger.${job.trigger}`)}
        </Badge>
        {!job.blocking ? (
          <Badge variant="warning" className="text-[11px]">
            {t("pipeline.nonBlocking")}
          </Badge>
        ) : null}
        {job.flags.length > 0 ? (
          <Badge variant="warning" className="text-[11px]">
            <AlertTriangle className="size-3" aria-hidden />
            {job.flags.length}
          </Badge>
        ) : null}
      </span>
    </button>
  );
}

function Fact({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <h4 className="font-medium text-muted-foreground text-xs uppercase tracking-wide">{title}</h4>
      <div className="text-sm">{children}</div>
    </div>
  );
}

const Chips = ({ items, mono = true }: { items: string[]; mono?: boolean }) => (
  <span className="flex flex-wrap gap-1">
    {items.map((i) => (
      <Badge key={i} variant="secondary" className={cn(mono && "font-mono")}>
        {i}
      </Badge>
    ))}
  </span>
);

const None = ({ children }: { children: ReactNode }) => (
  <span className="text-muted-foreground">{children}</span>
);

/** The detail of one job. In a modal (`bare`) the title is the modal's, so only the badges remain. */
export function JobDetail({
  job,
  path,
  base,
  bare = false,
}: {
  job: PipelineJobView;
  path: string;
  base: SourceBase | null;
  bare?: boolean;
}) {
  const t = useTranslations();
  const tp = useTranslations("pipeline");
  return (
    <section
      aria-live="polite"
      className={cn("flex flex-col gap-5", !bare && "rounded-xl border bg-card p-5 shadow-xs")}
    >
      <header className="flex flex-wrap items-center gap-3">
        {bare ? null : (
          <>
            <RoleIcon role={job.role} className="size-10" />
            <div className="flex min-w-0 flex-col">
              <h3 className="font-mono font-semibold text-base">{job.name}</h3>
              <span className="text-muted-foreground text-xs">
                {tp("roleAndStage", {
                  role: t(`domain.pipelineJobRole.${job.role}`),
                  stage: job.stage,
                })}
              </span>
            </div>
          </>
        )}
        <div className={cn("flex flex-wrap gap-1.5", !bare && "ml-auto")}>
          <Badge variant="outline">{t(`domain.pipelineTrigger.${job.trigger}`)}</Badge>
          <Badge variant={job.blocking ? "success" : "warning"}>
            {job.blocking ? tp("failureStops") : tp("failureTolerated")}
          </Badge>
          {job.retry ? (
            <Badge variant="secondary">{tp("retries", { count: job.retry })}</Badge>
          ) : null}
        </div>
      </header>

      {job.flags.length > 0 ? (
        <ul className="flex flex-col gap-1.5 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
          {job.flags.map((f) => (
            <li key={f} className="flex items-center gap-2">
              <AlertTriangle className="size-4 shrink-0 text-warning" aria-hidden />
              {t(`domain.pipelineFlag.${f}`)}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        <Fact title={tp("when")}>
          {job.conditions.length > 0 ? (
            <ul className="flex flex-col gap-1">
              {job.conditions.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          ) : (
            <None>{tp("always")}</None>
          )}
        </Fact>
        <Fact title={tp("needs")}>
          {job.needs.length > 0 ? <Chips items={job.needs} /> : <None>{tp("previousStage")}</None>}
        </Fact>
        <Fact title={tp("runtime")}>
          {job.image ? (
            <span className="font-mono text-xs">
              {job.image.name}
              {job.image.version ? `:${job.image.version}` : ""}
            </span>
          ) : (
            <None>{tp("defaultImage")}</None>
          )}
          {job.tools.length > 0 ? (
            <div className="mt-1.5">
              <Chips items={job.tools} mono={false} />
            </div>
          ) : null}
        </Fact>
        <Fact title={tp("produces")}>
          {job.artifacts.length > 0 || job.pushes.length > 0 || job.reportsTests ? (
            <ul className="flex flex-col gap-1">
              {job.pushes.map((p) => (
                <li key={p.image} className="font-mono text-xs">
                  {tp("image", { image: p.tag ? `${p.image}:${p.tag}` : p.image })}
                </li>
              ))}
              {job.artifacts.map((a) => (
                <li key={a} className="font-mono text-xs">
                  {a}
                </li>
              ))}
              {job.reportsTests ? <li>{tp("testReport")}</li> : null}
            </ul>
          ) : (
            <None>{tp("nothingKept")}</None>
          )}
        </Fact>
        <Fact title={tp("variables")}>
          {job.variables.length > 0 ? (
            <Chips items={job.variables} />
          ) : (
            <None>{tp("noVariable")}</None>
          )}
        </Fact>
        <Fact title={tp("inRepo")}>
          <SourceRef source={{ path, ...(job.line ? { line: job.line } : {}) }} base={base} />
        </Fact>
      </div>
    </section>
  );
}

/**
 * The route of a commit, read from the pipeline file: stages left to right, jobs in each stage,
 * and the point where the repository stops describing what happens. Click a job for the detail.
 */
export function PipelineFlow({ delivery, base }: { delivery: DeliveryView; base: SourceBase }) {
  const t = useTranslations();
  const tp = useTranslations("pipeline");
  const jobs = useMemo(() => delivery.stages.flatMap((s) => s.jobs), [delivery]);
  const [selected, setSelected] = useState<string | null>(null);
  const job = jobs.find((j) => j.name === selected) ?? null;
  const envNames = delivery.environments.map((e) => e.name);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-4 rounded-2xl border bg-muted/30 p-5">
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <span className="grid size-8 place-items-center rounded-lg bg-primary/15 text-primary">
            <GitCommitHorizontal className="size-4" aria-hidden />
          </span>
          <span className="font-medium">{tp("commitPushed")}</span>
          <span className="text-muted-foreground text-xs">
            {delivery.mergeRequestPipelines === false ? tp("noMrPipeline") : tp("rulesPerJob")}
          </span>
        </p>
        <div className="overflow-x-auto pb-1">
          <ol className="flex min-w-[44rem] items-stretch gap-1">
            {delivery.stages.map((stage, index) => (
              <FlowStage
                key={stage.name}
                name={stage.name}
                index={index + 1}
                jobs={stage.jobs}
                selected={job?.name ?? null}
                onSelect={setSelected}
              />
            ))}
          </ol>
        </div>
        <div
          className={cn(
            "flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-dashed p-3",
            delivery.deploysToEnvironment ? "bg-card/60" : "bg-muted/40",
          )}
        >
          <span className="grid size-8 place-items-center rounded-lg bg-muted text-muted-foreground">
            <Rocket className="size-4" aria-hidden />
          </span>
          <span className="font-medium text-sm">
            {delivery.deploysToEnvironment ? tp("deploy") : tp("stopsHere")}
          </span>
          <span className="text-muted-foreground text-xs">
            {delivery.deploysToEnvironment ? tp("reachesEnv") : tp("noDeployDescribed")}
          </span>
          {envNames.length > 0 ? (
            <span className="ml-auto flex items-center gap-2">
              <span className="text-muted-foreground text-xs">{tp("envConfigs")}</span>
              <Chips items={envNames} mono={false} />
            </span>
          ) : null}
        </div>
      </div>

      <Modal
        open={job !== null}
        onOpenChange={(o) => {
          if (!o) setSelected(null);
        }}
        wide
        title={<span className="font-mono">{job?.name}</span>}
        description={
          job
            ? tp("roleAndStage", {
                role: t(`domain.pipelineJobRole.${job.role}`),
                stage: job.stage,
              })
            : undefined
        }
        icon={job ? <RoleIcon role={job.role} className="size-9" /> : null}
      >
        {job ? <JobDetail job={job} path={delivery.path} base={base} bare /> : null}
      </Modal>
      {delivery.includes.length > 0 ? (
        <p className="text-muted-foreground text-xs">
          {tp.rich("includes", {
            files: delivery.includes.join(", "),
            mono: (chunks) => <span className="font-mono">{chunks}</span>,
          })}
        </p>
      ) : null}
    </div>
  );
}

function FlowStage({
  name,
  index,
  jobs,
  selected,
  onSelect,
}: {
  name: string;
  index: number;
  jobs: PipelineJobView[];
  selected: string | null;
  onSelect: (name: string) => void;
}) {
  const tp = useTranslations("pipeline");
  return (
    <>
      {index > 1 ? <Connector /> : null}
      <li className="flex min-w-0 flex-1 basis-0 flex-col gap-2">
        <div className="flex items-center gap-2 px-1">
          <span className="grid size-5 place-items-center rounded-full bg-foreground font-medium text-[11px] text-background">
            {index}
          </span>
          <h3 className="font-semibold text-sm">{name}</h3>
          <span className="text-muted-foreground text-xs">
            {tp("jobCount", { count: jobs.length })}
          </span>
        </div>
        <ul className="flex flex-col gap-2">
          {jobs.map((j) => (
            <li key={j.name}>
              <JobCard job={j} selected={selected === j.name} onSelect={() => onSelect(j.name)} />
            </li>
          ))}
        </ul>
      </li>
    </>
  );
}
