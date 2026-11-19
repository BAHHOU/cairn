import { listImportViews } from "@cairn/db";
import { can } from "@cairn/shared";
import { cookies } from "next/headers";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { AppShell } from "@/components/app-shell";
import { BrandLogo, BrandMark } from "@/components/brand-mark";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { CommandPalette, type PaletteEntry } from "@/components/command-palette";
import { CreateMenu } from "@/components/create-menu";
import { SidebarNav } from "@/components/sidebar-nav";
import { ThemeCustomizer } from "@/components/theme-customizer";
import { UserMenu } from "@/components/user-menu";
import { getApi } from "@/lib/api";
import { getDb, isImportConfigured, viewerMayImport } from "@/lib/import/runtime";
import { navFor, projectNavFor, SETTINGS } from "@/lib/nav";
import { getViewer, isDemo } from "@/lib/session";
import { parseTheme, THEME_COOKIE } from "@/lib/theme";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const t = await getTranslations();
  const viewer = await getViewer();
  const api = await getApi();
  const projects = await api.projects.list();
  const groups = navFor(viewer.role);
  const settings = SETTINGS.roles.includes(viewer.role) ? SETTINGS : null;

  const projectNames: Record<string, string> = Object.fromEntries(
    projects.map((p) => [p.id, p.name]),
  );
  if (can(viewer.role, "see.allTeams") && isImportConfigured()) {
    try {
      for (const run of await listImportViews(getDb(), 50)) {
        projectNames[run.repository.id] ??= run.repository.name;
      }
    } catch {
      // Names fall back to the id when the database is down.
    }
  }

  const entries: PaletteEntry[] = [
    ...groups.flatMap((g) =>
      g.items.map((i) => ({
        group: t("palette.groupPages"),
        label: t(`nav.item.${i.key}`),
        href: i.href,
      })),
    ),
    ...projects.map((p) => ({
      group: t("palette.groupProjects"),
      label: p.name,
      href: `/projects/${p.id}`,
    })),
  ];

  return (
    <AppShell
      brand={
        <Link
          href="/"
          className="flex items-center gap-2 rounded-md px-1.5 py-1 outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <BrandMark className="sm:hidden" />
          <span className="sr-only sm:hidden">{t("meta.brand")}</span>
          <BrandLogo alt={t("meta.brand")} className="hidden sm:inline-flex" />
        </Link>
      }
      search={<CommandPalette entries={entries} />}
      actions={
        <>
          {viewerMayImport(viewer) ? <CreateMenu /> : null}
          <ThemeCustomizer initial={parseTheme((await cookies()).get(THEME_COOKIE)?.value)} />
          <UserMenu name={viewer.name} role={viewer.role} team={viewer.team} demo={isDemo()} />
        </>
      }
      breadcrumbs={<Breadcrumbs projectNames={projectNames} />}
      sidebar={
        <SidebarNav
          groups={groups}
          projectGroups={projectNavFor(viewer.role)}
          settings={settings}
          projectNames={projectNames}
        />
      }
    >
      {children}
    </AppShell>
  );
}
