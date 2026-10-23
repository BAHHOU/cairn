import type { Role } from "@cairn/shared";

export type NavIcon = "dashboard" | "projects" | "issues" | "tokens" | "import";

/** Keys of `nav.item` and `nav.group` in the message catalog. */
export type NavItemKey = "overview" | "projects" | "import" | "issues" | "tokens";
export type NavGroupKey = "pilotage" | "repositories" | "optimisation";

export interface NavItem {
  href: string;
  label: NavItemKey;
  icon: NavIcon;
  roles: readonly Role[];
}

export interface NavGroup {
  title: NavGroupKey;
  items: NavItem[];
}

const ALL: readonly Role[] = ["superadmin", "admin", "manager", "dev"];

export const NAV: NavGroup[] = [
  {
    title: "pilotage",
    items: [{ href: "/", label: "overview", icon: "dashboard", roles: ALL }],
  },
  {
    title: "repositories",
    items: [
      { href: "/projects", label: "projects", icon: "projects", roles: ALL },
      { href: "/projects/import", label: "import", icon: "import", roles: ["superadmin"] },
      { href: "/issues", label: "issues", icon: "issues", roles: ALL },
    ],
  },
  {
    title: "optimisation",
    items: [
      {
        href: "/tokens",
        label: "tokens",
        icon: "tokens",
        roles: ["superadmin", "admin", "manager"],
      },
    ],
  },
];

export const navFor = (role: Role): NavGroup[] =>
  NAV.map((g) => ({ ...g, items: g.items.filter((i) => i.roles.includes(role)) })).filter(
    (g) => g.items.length > 0,
  );
