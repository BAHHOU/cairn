"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { activeItem, PROJECT_NAV, projectIdFrom, SETTINGS, WORKSPACE_NAV } from "@/lib/nav";
import { splitProjectName } from "@/lib/project-name";

const WORKSPACE_ITEMS = [...WORKSPACE_NAV.flatMap((g) => g.items), SETTINGS];
const PROJECT_ITEMS = [...PROJECT_NAV.flatMap((g) => g.items), SETTINGS];

/** Where you are, GitLab-style, atop the page panel: Projects / <project> / <view>. None on home. */
export function Breadcrumbs({ projectNames }: { projectNames: Record<string, string> }) {
  const t = useTranslations();
  const pathname = usePathname();
  const crumbs: { label: string; href?: string }[] = [];
  const id = projectIdFrom(pathname);

  if (id) {
    const base = `/projects/${id}`;
    const view = activeItem(PROJECT_ITEMS, pathname, base);
    const inView = view !== undefined && view.href !== "";
    crumbs.push({ label: t("nav.item.projects"), href: "/projects" });
    // The branch is on the page header; the trail names the repository, as GitLab's does.
    crumbs.push({
      label: splitProjectName(projectNames[id] ?? id).path,
      href: inView ? base : undefined,
    });
    if (inView) {
      // A page below the view (one merge request) links back to the view and names itself last.
      const viewHref = `${base}${view.href}`;
      const below = pathname.slice(viewHref.length + 1).split("/")[0];
      crumbs.push({ label: t(`nav.item.${view.key}`), href: below ? viewHref : undefined });
      if (below) crumbs.push({ label: view.key === "changeControl" ? `!${below}` : below });
    }
  } else {
    const item = activeItem(WORKSPACE_ITEMS, pathname);
    const parent = WORKSPACE_ITEMS.find((i) => i.key === item?.parent);
    if (parent) crumbs.push({ label: t(`nav.item.${parent.key}`), href: parent.href });
    if (item && item.href !== "/") crumbs.push({ label: t(`nav.item.${item.key}`) });
  }

  if (crumbs.length === 0) return null;
  return (
    <nav aria-label={t("shell.breadcrumb")} className="min-w-0">
      <ol className="flex flex-wrap items-center gap-x-1.5 text-muted-foreground text-xs">
        {crumbs.map((c, i) => (
          <li key={c.label} className="flex min-w-0 items-center gap-1.5">
            {i > 0 ? (
              <span className="text-border" aria-hidden>
                /
              </span>
            ) : null}
            {c.href ? (
              <Link href={c.href} className="truncate hover:text-foreground hover:underline">
                {c.label}
              </Link>
            ) : (
              <span className="truncate font-medium text-foreground">{c.label}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
