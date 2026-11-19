import type { GateStatus, ImportStatus, Role } from "@cairn/shared";
import {
  Clock,
  ExternalLink,
  FileCode2,
  GitBranch,
  type LucideIcon,
  Server,
  Users,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { GateBadge } from "@/components/badges";
import { RescanButton } from "@/components/import/rescan-button";
import { ImportStatusBadge } from "@/components/import/status";
import { ProjectTabs } from "@/components/project-tabs";
import { buttonVariants } from "@/components/ui/button";
import { useFormat } from "@/i18n/format";
import { cn } from "@/lib/utils";

/** What the shared project header shows, for demo and imported projects alike. */
export interface ProjectHeaderData {
  id: string;
  name: string;
  /** Imported repositories only. */
  branch: string | null;
  /** Latest import run, shown while it is not done. */
  status: ImportStatus | null;
  scannedAt: string | null;
  files: number | null;
  provider: string;
  host: string | null;
  team: string;
  webUrl: string | null;
  gate: GateStatus | null;
  /** The viewer's role: the tabs show the same sections as the sidebar. */
  role: Role;
  rescan: { repositoryId: string; disabled: boolean } | null;
}

/** Identity, key facts and the views of a project: the same on every project route. */
export function ProjectHeader({ data }: { data: ProjectHeaderData }) {
  const t = useTranslations("overview.dash");
  const ti = useTranslations("projects.imported");
  const fmt = useFormat();
  const meta: [LucideIcon, string][] = [];
  if (data.scannedAt) meta.push([Clock, t("scanned", { ago: fmt.ago(data.scannedAt) })]);
  if (data.files !== null) meta.push([FileCode2, t("fileCount", { count: data.files })]);
  meta.push([Server, data.host ? `${data.provider} · ${data.host}` : data.provider]);
  meta.push([Users, t("team", { team: data.team })]);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
        <div className="flex min-w-0 items-center gap-4">
          <span
            className="grid size-14 shrink-0 place-items-center rounded-xl bg-primary [background-image:var(--primary-image,none)] font-semibold text-2xl text-primary-foreground uppercase"
            aria-hidden
          >
            {data.name.charAt(0)}
          </span>
          <div className="flex min-w-0 flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-2.5">
              <p className="min-w-0 break-words font-semibold text-[1.75rem] leading-tight tracking-[-0.02em]">
                {data.name}
              </p>
              {data.branch ? (
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 font-medium text-primary text-xs">
                  <GitBranch className="size-3.5" aria-hidden />
                  {data.branch}
                </span>
              ) : null}
              {data.gate ? <GateBadge status={data.gate} /> : null}
              {data.status && data.status !== "done" ? (
                <ImportStatusBadge status={data.status} />
              ) : null}
            </div>
            <ul className="flex flex-wrap items-center gap-y-1 text-[13px] text-muted-foreground">
              {meta.map(([Icon, label], i) => (
                <li
                  key={label}
                  className={cn("flex items-center gap-1.5", i > 0 && "ml-3 border-l pl-3")}
                >
                  <Icon className="size-3.5 shrink-0" aria-hidden />
                  {label}
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {data.webUrl ? (
            <a
              href={data.webUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonVariants({ variant: "outline" })}
            >
              {ti("openOn", { provider: data.provider })}
              <ExternalLink aria-hidden />
            </a>
          ) : null}
          {data.rescan ? (
            <RescanButton
              repositoryId={data.rescan.repositoryId}
              disabled={data.rescan.disabled}
              className="h-9 border-foreground bg-foreground px-4 text-background hover:bg-foreground/85 hover:text-background"
            />
          ) : null}
        </div>
      </header>
      <ProjectTabs projectId={data.id} role={data.role} />
    </div>
  );
}
