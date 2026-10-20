import type { Role } from "@cairn/shared";

export type NavIcon = "dashboard" | "projects" | "issues" | "tokens";

export interface NavItem {
  href: string;
  label: string;
  icon: NavIcon;
  roles: readonly Role[];
}

export interface NavGroup {
  title: string;
  items: NavItem[];
}

const ALL: readonly Role[] = ["superadmin", "admin", "manager", "dev"];

export const NAV: NavGroup[] = [
  {
    title: "Pilotage",
    items: [{ href: "/", label: "Vue d'ensemble", icon: "dashboard", roles: ALL }],
  },
  {
    title: "Dépôts",
    items: [
      { href: "/projects", label: "Projets", icon: "projects", roles: ALL },
      { href: "/issues", label: "Problèmes", icon: "issues", roles: ALL },
    ],
  },
  {
    title: "Optimisation",
    items: [
      {
        href: "/tokens",
        label: "Budget tokens",
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
