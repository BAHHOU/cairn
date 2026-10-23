"use client";

import { ARCH_LAYERS, ARCH_VIEWS, type ArchLayer, type ArchView } from "@cairn/shared";
import { Download, Link2, Maximize2, Minimize2, Search, Share2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { GraphState } from "./use-graph-state";

interface Props {
  state: GraphState;
  update: (patch: Partial<GraphState>) => void;
  nodeCount: number;
  edgeCount: number;
  hiddenCount: number;
  onCopyMermaid: () => void;
  onDownloadMermaid: () => void;
  onCopyLink: () => void;
  fullscreen: boolean;
  onToggleFullscreen: () => void;
  notice: string | null;
}

export function DiagramToolbar({
  state,
  update,
  nodeCount,
  edgeCount,
  hiddenCount,
  onCopyMermaid,
  onDownloadMermaid,
  onCopyLink,
  fullscreen,
  onToggleFullscreen,
  notice,
}: Props) {
  const t = useTranslations("diagram.toolbar");
  const td = useTranslations("domain");
  const toggleLayer = (layer: ArchLayer) => {
    const next = state.layers.includes(layer)
      ? state.layers.filter((l) => l !== layer)
      : [...state.layers, layer];
    update({ layers: next });
  };

  return (
    <div className="flex flex-col gap-3 border-b bg-card/50 px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-md border p-0.5" role="tablist" aria-label={t("viewLabel")}>
          {ARCH_VIEWS.map((view: ArchView) => (
            <button
              key={view}
              type="button"
              role="tab"
              aria-selected={state.view === view}
              title={td(`archViewHint.${view}`)}
              onClick={() => update({ view })}
              className={cn(
                "rounded px-3 py-1 font-medium text-sm transition-colors",
                state.view === view
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
              )}
            >
              {td(`archView.${view}`)}
            </button>
          ))}
        </div>

        <label className="relative ml-auto">
          <Search
            className="-translate-y-1/2 absolute top-1/2 left-2 size-3.5 text-muted-foreground"
            aria-hidden
          />
          <span className="sr-only">{t("searchLabel")}</span>
          <input
            value={state.search}
            onChange={(e) => update({ search: e.target.value })}
            placeholder={t("searchPlaceholder")}
            className="h-8 w-72 rounded-md border bg-background pr-2 pl-7 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          />
        </label>

        <Button variant="outline" size="sm" onClick={onCopyLink} title={t("shareHint")}>
          <Share2 /> {t("share")}
        </Button>
        <Button variant="outline" size="sm" onClick={onCopyMermaid} title={t("mermaidHint")}>
          <Link2 /> Mermaid
        </Button>
        <Button variant="outline" size="sm" onClick={onDownloadMermaid} title={t("downloadHint")}>
          <Download /> .mmd
        </Button>
        <Button
          variant={fullscreen ? "secondary" : "outline"}
          size="sm"
          onClick={onToggleFullscreen}
          aria-pressed={fullscreen}
          title={fullscreen ? t("exitFullscreenHint") : t("fullscreenHint")}
        >
          {fullscreen ? <Minimize2 /> : <Maximize2 />}
          {fullscreen ? t("exitFullscreen") : t("fullscreen")}
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-muted-foreground">{t("layers")}</span>
        {ARCH_LAYERS.map((layer) => {
          const active = state.layers.length === 0 || state.layers.includes(layer);
          return (
            <button
              key={layer}
              type="button"
              aria-pressed={state.layers.includes(layer)}
              onClick={() => toggleLayer(layer)}
              className={cn(
                "rounded-full border px-2 py-0.5 transition-colors",
                active ? "bg-accent text-accent-foreground" : "text-muted-foreground opacity-60",
              )}
            >
              {td(`archLayer.${layer}`)}
            </button>
          );
        })}

        <label className="ml-2 flex items-center gap-1.5 text-muted-foreground">
          <input
            type="checkbox"
            checked={state.crossRepoOnly}
            onChange={(e) => update({ crossRepoOnly: e.target.checked })}
            className="size-3.5 accent-[var(--primary)]"
          />
          {t("crossRepoOnly")}
        </label>

        <span className="ml-auto text-muted-foreground">
          {t("counts", { nodes: nodeCount, edges: edgeCount })}
          {hiddenCount > 0 && ` · ${t("hidden", { count: hiddenCount })}`}
        </span>
      </div>

      <p className="text-muted-foreground text-xs">{td(`archViewHint.${state.view}`)}</p>
      {notice && <p className="text-primary text-xs">{notice}</p>}
    </div>
  );
}
