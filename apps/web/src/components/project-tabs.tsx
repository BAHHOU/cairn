"use client";

import type { Role } from "@cairn/shared";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { NAV_ICONS } from "@/components/sidebar-nav";
import { activeItem, projectNavFor } from "@/lib/nav";
import { cn } from "@/lib/utils";

/**
 * The project's top-level sections as tabs: the same groups as the sidebar, in the same order and
 * for the same role. A tab opens its section's first live page; the pages inside a section stay
 * in the sidebar. The current tab is the section that holds the current page.
 */
export function ProjectTabs({ projectId, role }: { projectId: string; role: Role }) {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const base = `/projects/${projectId}`;
  const groups = projectNavFor(role);
  const current = activeItem(
    groups.flatMap((g) => g.items),
    pathname,
    base,
  );

  return (
    <nav aria-label={t("projectSections")} className="-mt-1 overflow-x-auto border-b">
      <ul className="flex min-w-max gap-6">
        {groups.map((group) => {
          const first = group.items.find((i) => i.status === "live") ?? group.items[0];
          if (!first) return null;
          const label = group.key ? t(`group.${group.key}`) : t(`item.${first.key}`);
          const Icon = NAV_ICONS[group.icon];
          const selected = current !== undefined && group.items.includes(current);
          return (
            <li key={group.key ?? "overview"}>
              <Link
                href={base + first.href}
                aria-current={selected ? "page" : undefined}
                className={cn(
                  "-mb-px flex items-center gap-2 border-b-2 px-0.5 pt-1 pb-3 text-sm outline-none transition-colors focus-visible:text-foreground",
                  selected
                    ? "border-foreground font-medium text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="size-4" />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
