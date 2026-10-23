"use client";

import { Coins, FolderGit2, FolderInput, LayoutDashboard, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import type { NavGroup, NavIcon } from "@/lib/nav";
import { cn } from "@/lib/utils";

const ICONS: Record<NavIcon, React.ComponentType<{ className?: string }>> = {
  dashboard: LayoutDashboard,
  projects: FolderGit2,
  issues: TriangleAlert,
  tokens: Coins,
  import: FolderInput,
};

export function SidebarNav({ groups }: { groups: NavGroup[] }) {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const matches = (href: string) =>
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
  // "/projects/import" must not also light up "/projects": only the longest matching href is active.
  const hrefs = groups.flatMap((g) => g.items.map((i) => i.href));
  const isActive = (href: string) =>
    matches(href) && !hrefs.some((other) => other.length > href.length && matches(other));

  return (
    <nav aria-label={t("label")} className="flex flex-col gap-5">
      {groups.map((group) => (
        <div key={group.title} className="flex flex-col gap-0.5">
          <span className="px-2 pb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {t(`group.${group.title}`)}
          </span>
          {group.items.map((item) => {
            const Icon = ICONS[item.icon];
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50",
                  active
                    ? "bg-accent font-medium text-accent-foreground"
                    : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                )}
              >
                <Icon className="size-4" />
                {t(`item.${item.label}`)}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
