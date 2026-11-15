"use client";

import {
  Activity,
  ArrowLeft,
  BarChart3,
  BookOpen,
  Bot,
  Briefcase,
  Bug,
  ChevronRight,
  Cloud,
  Code,
  Coins,
  Database,
  FileCheck2,
  FileText,
  FolderInput,
  Folders,
  Gauge,
  GitBranch,
  GitPullRequestArrow,
  House,
  Network,
  Package,
  Play,
  Plug,
  Radar,
  Rocket,
  Route,
  Scale,
  Server,
  Settings,
  Shield,
  ShieldCheck,
  Siren,
  Sparkles,
  Tag,
  Users,
  Waypoints,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import {
  activeItem,
  type NavGroup,
  type NavGroupKey,
  type NavIcon,
  type NavItem,
  projectIdFrom,
} from "@/lib/nav";
import { splitProjectName } from "@/lib/project-name";
import { cn } from "@/lib/utils";

const ICONS: Record<NavIcon, React.ComponentType<{ className?: string }>> = {
  home: House,
  sparkles: Sparkles,
  gauge: Gauge,
  fileText: FileText,
  bot: Bot,
  coins: Coins,
  folders: Folders,
  folderInput: FolderInput,
  users: Users,
  radar: Radar,
  shieldCheck: ShieldCheck,
  shield: Shield,
  package: Package,
  bug: Bug,
  rocket: Rocket,
  server: Server,
  cloud: Cloud,
  activity: Activity,
  siren: Siren,
  barChart: BarChart3,
  briefcase: Briefcase,
  settings: Settings,
  network: Network,
  waypoints: Waypoints,
  database: Database,
  bookOpen: BookOpen,
  play: Play,
  code: Code,
  gitBranch: GitBranch,
  tag: Tag,
  scale: Scale,
  gitPullRequest: GitPullRequestArrow,
  fileCheck: FileCheck2,
  plug: Plug,
  route: Route,
};

const ROW =
  "flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50";

/**
 * The sidebar changes with the context, like GitLab's: the workspace everywhere, and the views of
 * one project as soon as the URL is inside it.
 */
export function SidebarNav({
  groups,
  projectGroups,
  settings,
  projectNames,
}: {
  groups: NavGroup[];
  projectGroups: NavGroup[];
  settings: NavItem | null;
  projectNames: Record<string, string>;
}) {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const projectId = projectIdFrom(pathname);

  if (projectId) {
    const full = projectNames[projectId] ?? projectId;
    const name = splitProjectName(full);
    return (
      <div className="flex flex-col gap-3">
        <Link
          href="/projects"
          title={t("item.projects")}
          className={cn(ROW, "text-xs text-muted-foreground hover:text-foreground")}
        >
          <ArrowLeft className="size-3.5 shrink-0" aria-hidden />
          <span className="sb-label">{t("item.projects")}</span>
        </Link>
        <Link
          href={`/projects/${projectId}`}
          title={full}
          className="flex items-center gap-2.5 rounded-md px-1.5 py-1 outline-none hover:bg-accent/60 focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <span className="grid size-8 shrink-0 place-items-center rounded-md bg-primary/15 font-semibold text-primary text-sm">
            {name.short.slice(0, 1).toUpperCase()}
          </span>
          <span className="sb-label flex min-w-0 flex-col">
            <span className="truncate font-semibold text-sm">{name.short}</span>
            {name.namespace || name.branch ? (
              <span className="truncate text-muted-foreground text-xs">
                {[name.namespace, name.branch].filter(Boolean).join(" · ")}
              </span>
            ) : null}
          </span>
        </Link>
        <NavTree
          label={t("projectLabel")}
          groups={projectGroups}
          settings={settings}
          base={`/projects/${projectId}`}
        />
      </div>
    );
  }

  return <NavTree label={t("label")} groups={groups} settings={settings} base="" />;
}

function NavTree({
  label,
  groups,
  settings,
  base,
}: {
  label: string;
  groups: NavGroup[];
  settings: NavItem | null;
  base: string;
}) {
  const pathname = usePathname();
  const items = groups.flatMap((g) => g.items);
  const active = activeItem(settings ? [...items, settings] : items, pathname, base);

  return (
    <nav aria-label={label} className="flex flex-col gap-0.5">
      {groups.map((group) =>
        group.key === null ? (
          group.items.map((item) => (
            <NavLink key={item.key} item={item} base={base} active={item === active} />
          ))
        ) : (
          <NavSection key={group.key} title={group.key} group={group} base={base} active={active} />
        ),
      )}
      {settings ? (
        <>
          <div className="my-2 h-px bg-border" role="presentation" />
          <NavLink item={settings} base={base} active={settings === active} />
        </>
      ) : null}
    </nav>
  );
}

/** A GitLab section: a heading that folds its items. The one holding the current page opens. */
function NavSection({
  title,
  group,
  base,
  active,
}: {
  title: NavGroupKey;
  group: NavGroup;
  base: string;
  active: NavItem | undefined;
}) {
  const t = useTranslations("nav");
  const holdsActive = active !== undefined && group.items.includes(active);
  const [open, setOpen] = useState(holdsActive || group.defaultOpen === true);
  useEffect(() => {
    if (holdsActive) setOpen(true);
  }, [holdsActive]);
  const Icon = ICONS[group.icon];
  const id = `sb-${base ? "p" : "w"}-${title}`;

  return (
    <div className="flex flex-col">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          ROW,
          "sb-group-header",
          holdsActive && !open ? "text-foreground" : "text-muted-foreground",
          "hover:bg-accent/60 hover:text-foreground",
        )}
      >
        <Icon className="size-4 shrink-0" />
        <span className="flex-1 text-left">{t(`group.${title}`)}</span>
        <ChevronRight
          className={cn("size-3.5 shrink-0 transition-transform", open && "rotate-90")}
          aria-hidden
        />
      </button>
      <ul id={id} className={cn("sb-group-items flex-col gap-0.5 pl-3", open ? "flex" : "hidden")}>
        {group.items.map((item) => (
          <li key={item.key}>
            <NavLink item={item} base={base} active={item === active} nested />
          </li>
        ))}
      </ul>
    </div>
  );
}

function NavLink({
  item,
  base,
  active,
  nested = false,
}: {
  item: NavItem;
  base: string;
  active: boolean;
  nested?: boolean;
}) {
  const t = useTranslations("nav");
  const Icon = ICONS[item.icon];
  const label = t(`item.${item.key}`);
  return (
    <Link
      href={`${base}${item.href}` || "/"}
      aria-current={active ? "page" : undefined}
      title={label}
      className={cn(
        ROW,
        nested && "sb-nested",
        active
          ? "bg-accent font-medium text-accent-foreground"
          : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
      )}
    >
      <Icon className="size-4 shrink-0" />
      <span className="sb-label flex-1 truncate">{label}</span>
      {item.status === "planned" ? (
        <span className="sb-label rounded border px-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/80">
          {t("soon")}
        </span>
      ) : null}
    </Link>
  );
}
