import type { Role } from "@cairn/shared";

/**
 * Cairn's map, in two contexts like GitLab: the workspace (every project) and one project.
 *
 * The order follows a project's life — make it AI-ready, understand it, ship it, run it — so a
 * non-developer can read the sidebar top to bottom as the story of a project. An item is `live`
 * when its page exists; a `planned` one opens a page that says what it will do, never a dead link.
 */

/** Icon names, mapped to components on the client (props crossing to the client must be data). */
export type NavIcon =
  | "home"
  | "sparkles"
  | "gauge"
  | "fileText"
  | "bot"
  | "coins"
  | "folders"
  | "folderInput"
  | "users"
  | "radar"
  | "shieldCheck"
  | "shield"
  | "package"
  | "bug"
  | "rocket"
  | "server"
  | "cloud"
  | "activity"
  | "siren"
  | "barChart"
  | "briefcase"
  | "settings"
  | "network"
  | "waypoints"
  | "database"
  | "bookOpen"
  | "play"
  | "code"
  | "gitBranch"
  | "tag"
  | "scale"
  | "gitPullRequest"
  | "fileCheck"
  | "plug"
  | "route";

export type NavStatus = "live" | "planned";

/** Feature keys. Labels: `nav.item.<key>`; planned pages: `planned.<key>`. */
export type FeatureKey =
  | "home"
  | "aiReadiness"
  | "aiContext"
  | "aiAgents"
  | "tokens"
  | "projects"
  | "import"
  | "teams"
  | "techRadar"
  | "issues"
  | "security"
  | "dependencies"
  | "pipelines"
  | "environments"
  | "releases"
  | "infrastructure"
  | "monitoring"
  | "incidents"
  | "reports"
  | "executive"
  | "settings"
  | "overview"
  | "architecture"
  | "codeMap"
  | "dataModel"
  | "docs"
  | "onboarding"
  | "files"
  | "quality"
  | "delivery"
  | "compliance"
  | "changeControl"
  | "traceability"
  | "policies"
  | "integrations";

/** Group keys. Labels: `nav.group.<key>`. */
export type NavGroupKey =
  | "aiReadiness"
  | "portfolio"
  | "quality"
  | "delivery"
  | "operations"
  | "insights"
  | "understand"
  | "code"
  | "security"
  | "governance";

export interface NavItem {
  key: FeatureKey;
  /** Absolute in the workspace; relative to `/projects/<id>` in a project ("" is its overview). */
  href: string;
  icon: NavIcon;
  status: NavStatus;
  roles: readonly Role[];
  /** The feature this one sits under in the breadcrumbs, when it is not a top-level page. */
  parent?: FeatureKey;
}

export interface NavGroup {
  /** `null` for the items that sit above every group, like GitLab's project name and pins. */
  key: NavGroupKey | null;
  icon: NavIcon;
  /** Unfolded on first render, before the viewer folds or unfolds anything. */
  defaultOpen?: boolean;
  items: NavItem[];
}

const ALL: readonly Role[] = ["superadmin", "admin", "manager", "dev"];
const LEADS: readonly Role[] = ["superadmin", "admin", "manager"];

const live = (key: FeatureKey, href: string, icon: NavIcon, roles = ALL): NavItem => ({
  key,
  href,
  icon,
  status: "live",
  roles,
});
const planned = (key: FeatureKey, href: string, icon: NavIcon, roles = ALL): NavItem => ({
  key,
  href,
  icon,
  status: "planned",
  roles,
});

export const WORKSPACE_NAV: NavGroup[] = [
  { key: null, icon: "home", items: [live("home", "/", "home")] },
  {
    key: "aiReadiness",
    icon: "sparkles",
    defaultOpen: true,
    items: [
      live("aiReadiness", "/ai-readiness", "gauge"),
      planned("aiContext", "/ai-readiness/context", "fileText"),
      planned("aiAgents", "/ai-readiness/agents", "bot"),
      live("tokens", "/tokens", "coins", LEADS),
    ],
  },
  {
    key: "portfolio",
    icon: "folders",
    items: [
      live("projects", "/projects", "folders"),
      { ...live("import", "/projects/import", "folderInput", ["superadmin"]), parent: "projects" },
      planned("teams", "/teams", "users"),
      planned("techRadar", "/tech-radar", "radar"),
    ],
  },
  {
    key: "quality",
    icon: "shieldCheck",
    items: [
      live("issues", "/issues", "bug"),
      planned("security", "/security", "shield"),
      planned("dependencies", "/dependencies", "package"),
    ],
  },
  {
    key: "governance",
    icon: "gitPullRequest",
    items: [
      live("changeControl", "/changes", "gitPullRequest"),
      live("traceability", "/governance/traceability", "route"),
      live("policies", "/governance/policies", "fileCheck", LEADS),
      {
        ...live("integrations", "/settings/integrations", "plug", ["superadmin"]),
        parent: "settings",
      },
    ],
  },
  {
    key: "delivery",
    icon: "rocket",
    items: [
      planned("pipelines", "/pipelines", "play"),
      planned("environments", "/environments", "server"),
      planned("releases", "/releases", "tag"),
    ],
  },
  {
    key: "operations",
    icon: "activity",
    items: [
      planned("infrastructure", "/infrastructure", "cloud"),
      planned("monitoring", "/monitoring", "activity"),
      planned("incidents", "/incidents", "siren"),
    ],
  },
  {
    key: "insights",
    icon: "barChart",
    items: [
      planned("executive", "/executive", "briefcase", LEADS),
      planned("reports", "/reports", "barChart", LEADS),
    ],
  },
];

export const PROJECT_NAV: NavGroup[] = [
  { key: null, icon: "home", items: [live("overview", "", "home")] },
  {
    key: "aiReadiness",
    icon: "sparkles",
    defaultOpen: true,
    items: [
      live("aiReadiness", "/ai-readiness", "gauge"),
      planned("aiContext", "/ai-readiness/context", "fileText"),
      planned("tokens", "/ai-readiness/tokens", "coins"),
    ],
  },
  {
    key: "understand",
    icon: "bookOpen",
    items: [
      live("architecture", "/architecture", "network"),
      live("codeMap", "/code-map", "waypoints"),
      planned("dataModel", "/data-model", "database"),
      live("docs", "/docs", "bookOpen"),
      live("onboarding", "/onboarding", "play"),
    ],
  },
  {
    key: "code",
    icon: "code",
    items: [
      planned("files", "/code", "code"),
      planned("quality", "/quality", "bug"),
      planned("dependencies", "/dependencies", "package"),
    ],
  },
  {
    key: "delivery",
    icon: "rocket",
    items: [
      live("delivery", "/delivery", "gitBranch"),
      planned("environments", "/environments", "server"),
      planned("releases", "/releases", "tag"),
    ],
  },
  {
    key: "governance",
    icon: "gitPullRequest",
    items: [
      live("changeControl", "/changes", "gitPullRequest"),
      live("traceability", "/traceability", "route"),
    ],
  },
  {
    key: "security",
    icon: "shield",
    items: [
      planned("security", "/security", "shield"),
      planned("compliance", "/security/compliance", "scale"),
    ],
  },
  {
    key: "operations",
    icon: "activity",
    items: [
      planned("infrastructure", "/infrastructure", "cloud"),
      planned("monitoring", "/monitoring", "activity"),
      planned("incidents", "/incidents", "siren"),
    ],
  },
];

/** At the foot of the sidebar, under every group, in both contexts. */
export const SETTINGS = planned("settings", "/settings", "settings", LEADS);

const forRole = (groups: NavGroup[], role: Role): NavGroup[] =>
  groups
    .map((g) => ({ ...g, items: g.items.filter((i) => i.roles.includes(role)) }))
    .filter((g) => g.items.length > 0);

export const navFor = (role: Role): NavGroup[] => forRole(WORKSPACE_NAV, role);
export const projectNavFor = (role: Role): NavGroup[] => forRole(PROJECT_NAV, role);

/** `/projects/<id>/…` → `<id>`; `/projects/import…` is the import flow, not a project. */
export function projectIdFrom(pathname: string): string | null {
  const m = /^\/projects\/([^/]+)/.exec(pathname);
  return m?.[1] && m[1] !== "import" ? m[1] : null;
}

/** The item a path belongs to: the longest href that matches it, so `/projects/import` wins. */
export function activeItem(items: NavItem[], pathname: string, base = ""): NavItem | undefined {
  const matches = (i: NavItem) => {
    const href = `${base}${i.href}` || "/";
    return href === "/" || i.href === ""
      ? pathname === href
      : pathname === href || pathname.startsWith(`${href}/`);
  };
  return items.filter(matches).sort((a, b) => b.href.length - a.href.length)[0];
}

/** A planned feature, found by its path. Used by the placeholder routes to refuse unknown URLs. */
export function plannedAt(groups: NavGroup[], extra: NavItem[], href: string): NavItem | undefined {
  return [...groups.flatMap((g) => g.items), ...extra].find(
    (i) => i.status === "planned" && i.href === href,
  );
}
