"use client";

import {
  ARCH_LAYERS,
  ARCH_VIEW_HINT,
  ARCH_VIEW_LABEL,
  ARCH_VIEWS,
  type ArchLayer,
  type ArchView,
} from "@cairn/shared";
import { Download, Link2, Maximize2, Minimize2, Search, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { GraphState } from "./use-graph-state";

const LAYER_LABEL: Record<ArchLayer, string> = {
  experience: "Expérience",
  application: "Application",
  domaine: "Domaine",
  infrastructure: "Infrastructure",
  externe: "Externe",
};

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
  const toggleLayer = (layer: ArchLayer) => {
    const next = state.layers.includes(layer)
      ? state.layers.filter((l) => l !== layer)
      : [...state.layers, layer];
    update({ layers: next });
  };

  return (
    <div className="flex flex-col gap-3 border-b bg-card/50 px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <div
          className="flex rounded-md border p-0.5"
          role="tablist"
          aria-label="Vue de l'architecture"
        >
          {ARCH_VIEWS.map((view: ArchView) => (
            <button
              key={view}
              type="button"
              role="tab"
              aria-selected={state.view === view}
              title={ARCH_VIEW_HINT[view]}
              onClick={() => update({ view })}
              className={cn(
                "rounded px-3 py-1 font-medium text-sm transition-colors",
                state.view === view
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
              )}
            >
              {ARCH_VIEW_LABEL[view]}
            </button>
          ))}
        </div>

        <label className="relative ml-auto">
          <Search
            className="-translate-y-1/2 absolute top-1/2 left-2 size-3.5 text-muted-foreground"
            aria-hidden
          />
          <span className="sr-only">Rechercher un nœud, une technologie ou un fichier</span>
          <input
            value={state.search}
            onChange={(e) => update({ search: e.target.value })}
            placeholder="Rechercher un nœud, une techno, un fichier…"
            className="h-8 w-72 rounded-md border bg-background pr-2 pl-7 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          />
        </label>

        <Button
          variant="outline"
          size="sm"
          onClick={onCopyLink}
          title="Copier le lien de cette vue"
        >
          <Share2 /> Partager
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={onCopyMermaid}
          title="Copier le diagramme au format Mermaid"
        >
          <Link2 /> Mermaid
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={onDownloadMermaid}
          title="Télécharger le fichier .mmd"
        >
          <Download /> .mmd
        </Button>
        <Button
          variant={fullscreen ? "secondary" : "outline"}
          size="sm"
          onClick={onToggleFullscreen}
          aria-pressed={fullscreen}
          title={
            fullscreen ? "Quitter le plein écran (Échap)" : "Afficher en plein écran (touche F)"
          }
        >
          {fullscreen ? <Minimize2 /> : <Maximize2 />}
          {fullscreen ? "Réduire" : "Plein écran"}
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-muted-foreground">Couches :</span>
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
              {LAYER_LABEL[layer]}
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
          Liens inter-dépôts uniquement
        </label>

        <span className="ml-auto text-muted-foreground">
          {nodeCount} nœuds · {edgeCount} liens
          {hiddenCount > 0 && ` · ${hiddenCount} masqués par les filtres`}
        </span>
      </div>

      <p className="text-muted-foreground text-xs">{ARCH_VIEW_HINT[state.view]}</p>
      {notice && <p className="text-primary text-xs">{notice}</p>}
    </div>
  );
}
