"use client";

import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

const KEY = "cairn-sidebar-collapsed";

/**
 * The GitLab frame: a quiet top bar (brand, search, create and account), a sidebar that can fold to icons, and the page inside a
 * rounded panel of its own. The fold state is a per-viewer convenience, so it lives in the browser.
 */
export function AppShell({
  brand,
  search,
  actions,
  breadcrumbs,
  sidebar,
  children,
}: {
  brand: React.ReactNode;
  search: React.ReactNode;
  actions: React.ReactNode;
  /** Shown at the top of the page panel, not in the top bar: the top bar is the same everywhere. */
  breadcrumbs: React.ReactNode;
  sidebar: React.ReactNode;
  children: React.ReactNode;
}) {
  const t = useTranslations("shell");
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(KEY) === "1");
    } catch {}
  }, []);

  const toggle = () => {
    setCollapsed((c) => {
      try {
        localStorage.setItem(KEY, c ? "0" : "1");
      } catch {}
      return !c;
    });
  };

  return (
    <div className="flex h-screen flex-col bg-muted/40">
      <header className="grid h-12 shrink-0 grid-cols-[auto_1fr_auto] items-center gap-3 px-3 md:grid-cols-[1fr_minmax(0,32rem)_1fr]">
        <div className="flex min-w-0 items-center">{brand}</div>
        <div className="flex min-w-0 justify-center">{search}</div>
        <div className="flex items-center justify-end gap-1">{actions}</div>
      </header>
      <div className="flex min-h-0 flex-1">
        <aside
          data-collapsed={collapsed}
          className={cn(
            "hidden shrink-0 flex-col gap-4 overflow-y-auto px-2 pb-2 transition-[width] md:flex",
            collapsed ? "w-14" : "w-60",
          )}
        >
          {sidebar}
          <button
            type="button"
            onClick={toggle}
            aria-label={collapsed ? t("expandSidebar") : t("collapseSidebar")}
            title={collapsed ? t("expandSidebar") : t("collapseSidebar")}
            className="mt-auto flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm text-muted-foreground outline-none hover:bg-accent/60 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            {collapsed ? (
              <PanelLeftOpen className="size-4" aria-hidden />
            ) : (
              <PanelLeftClose className="size-4" aria-hidden />
            )}
            <span className="sb-label">{t("collapseSidebar")}</span>
          </button>
        </aside>
        <main className="mb-2 mr-2 min-w-0 flex-1 overflow-y-auto rounded-xl border bg-background max-md:ml-2">
          <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 pt-3 pb-6">
            <div className="flex min-h-6 items-center">{breadcrumbs}</div>
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
