"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { activeItem, PROJECT_NAV, projectIdFrom, SETTINGS, WORKSPACE_NAV } from "@/lib/nav";
import { splitProjectName } from "@/lib/project-name";

const WORKSPACE_ITEMS = [...WORKSPACE_NAV.flatMap((g) => g.items), SETTINGS];
const PROJECT_ITEMS = [...PROJECT_NAV.flatMap((g) => g.items), SETTINGS];

/** Where you are, GitLab-style, pinned atop the page panel: <group> / <project> / <view>. None on home. */
export function Breadcrumbs({ projectNames }: { projectNames: Record<string, string> }) {
  const t = useTranslations();
  const pathname = usePathname();
  const crumbs: { label: string; href?: string }[] = [];
  const id = projectIdFrom(pathname);

  if (id) {
    const base = `/projects/${id}`;
    const view = activeItem(PROJECT_ITEMS, pathname, base);
    const inView = view !== undefined && view.href !== "";
    // GitLab's trail: each namespace level, then the project. The branch is on the page header.
    const name = splitProjectName(projectNames[id] ?? id);
    if (name.namespace) {
      for (const part of name.namespace.split("/")) crumbs.push({ label: part, href: "/projects" });
    } else {
      crumbs.push({ label: t("nav.item.projects"), href: "/projects" });
    }
    crumbs.push({ label: name.short, href: inView ? base : undefined });
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
    // The sidebar group comes first, as GitLab names the section: Governance / Traceability.
    const group = WORKSPACE_NAV.find((g) => g.key && item && g.items.includes(item));
    const first = group?.items[0];
    if (!parent && group?.key && first && first !== item) {
      crumbs.push({ label: t(`nav.group.${group.key}`), href: first.href });
    }
    if (parent) crumbs.push({ label: t(`nav.item.${parent.key}`), href: parent.href });
    if (item && item.href !== "/") crumbs.push({ label: t(`nav.item.${item.key}`) });
  }

  if (crumbs.length === 0) return null;
  return (
    <nav aria-label={t("shell.breadcrumb")} className="min-w-0">
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] leading-5">
        {crumbs.map((c, i) => {
          const last = i === crumbs.length - 1;
          // The trail up to here: unique even when a group and its project share a name.
          const path = crumbs
            .slice(0, i + 1)
            .map((x) => x.label)
            .join("/");
          return (
            <li key={path} className="flex min-w-0 items-center gap-2">
              {i > 0 ? (
                <span className="text-muted-foreground/60" aria-hidden>
                  /
                </span>
              ) : null}
              {c.href && !last ? (
                <Link
                  href={c.href}
                  className="truncate rounded-sm text-muted-foreground outline-none hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring/50"
                >
                  {c.label}
                </Link>
              ) : (
                <span aria-current="page" className="truncate font-semibold text-foreground">
                  {c.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
