import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { CommandPalette, type PaletteEntry } from "@/components/command-palette";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { RoleSwitcher } from "@/components/role-switcher";
import { SidebarNav } from "@/components/sidebar-nav";
import { ThemeToggle } from "@/components/theme-toggle";
import { Badge } from "@/components/ui/badge";
import { getApi } from "@/lib/api";
import { navFor } from "@/lib/nav";
import { getViewer, isDemo } from "@/lib/session";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const t = await getTranslations();
  const viewer = await getViewer();
  const api = await getApi();
  const projects = await api.projects.list();
  const groups = navFor(viewer.role);

  const entries: PaletteEntry[] = [
    ...groups.flatMap((g) =>
      g.items.map((i) => ({
        group: t("palette.groupPages"),
        label: t(`nav.item.${i.label}`),
        href: i.href,
      })),
    ),
    ...projects.map((p) => ({
      group: t("palette.groupProjects"),
      label: p.name,
      href: `/projects/${p.id}`,
    })),
  ];

  const initials = viewer.name
    .split(" ")
    .map((w) => w[0])
    .join("");

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col gap-6 border-r bg-card p-3 md:flex">
        <Link
          href="/"
          className="flex items-center gap-2 px-2 py-1.5 outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <span className="grid size-7 place-items-center rounded-md bg-primary text-sm font-bold text-primary-foreground">
            C
          </span>
          <span className="text-base font-semibold tracking-tight">Cairn</span>
        </Link>

        <SidebarNav groups={groups} />

        <div className="mt-auto flex flex-col gap-3">
          {isDemo() ? <RoleSwitcher current={viewer.role} /> : null}
          <div className="flex items-center gap-2 rounded-md border p-2">
            <span className="grid size-8 place-items-center rounded-full bg-muted text-xs font-medium">
              {initials}
            </span>
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-sm font-medium">{viewer.name}</span>
              <span className="truncate text-xs text-muted-foreground">
                {t(`domain.role.${viewer.role}`)} · {viewer.team}
              </span>
            </div>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex h-14 items-center gap-3 border-b bg-background/80 px-6 backdrop-blur">
          <CommandPalette entries={entries} />
          <div className="ml-auto flex items-center gap-2">
            {isDemo() ? <Badge variant="warning">{t("shell.demoBadge")}</Badge> : null}
            <LocaleSwitcher />
            <ThemeToggle />
          </div>
        </header>
        <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 p-6">{children}</main>
      </div>
    </div>
  );
}
