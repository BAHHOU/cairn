"use client";

import { CODE_NODE_KIND_LABEL, type CodeNodeKind } from "@cairn/shared";
import { cn } from "@/lib/utils";

const FILTERABLE: CodeNodeKind[] = ["class", "function", "table", "config", "doc", "external"];

export function CodeMapToolbar({
  search,
  kinds,
  extractedOnly,
  fullscreen,
  stats,
  onSearch,
  onToggleKind,
  onToggleExtracted,
  onToggleFullscreen,
}: {
  search: string;
  kinds: CodeNodeKind[];
  extractedOnly: boolean;
  fullscreen: boolean;
  stats: { shown: number; total: number; edges: number; inferred: number };
  onSearch: (value: string) => void;
  onToggleKind: (kind: CodeNodeKind) => void;
  onToggleExtracted: () => void;
  onToggleFullscreen: () => void;
}) {
  const inferredShare = stats.edges ? Math.round((stats.inferred / stats.edges) * 100) : 0;

  return (
    <div className="flex flex-wrap items-center gap-2 border-b bg-card px-3 py-2">
      <input
        value={search}
        onChange={(e) => onSearch(e.target.value)}
        placeholder="Chercher un symbole, un fichier…"
        className="h-8 w-56 rounded-md border bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      />

      <div className="flex flex-wrap items-center gap-1">
        {FILTERABLE.map((kind) => {
          const on = kinds.includes(kind);
          return (
            <button
              key={kind}
              type="button"
              onClick={() => onToggleKind(kind)}
              aria-pressed={on}
              className={cn(
                "rounded-full border px-2 py-0.5 text-xs transition-colors",
                on ? "bg-primary text-primary-foreground" : "hover:bg-accent",
              )}
            >
              {CODE_NODE_KIND_LABEL[kind]}
            </button>
          );
        })}
        {kinds.length > 0 ? (
          <span className="text-[11px] text-muted-foreground">
            (sans filtre de type, tout est affiché)
          </span>
        ) : null}
      </div>

      <label className="flex cursor-pointer items-center gap-1.5 text-xs">
        <input type="checkbox" checked={extractedOnly} onChange={onToggleExtracted} />
        Liens extraits seulement
      </label>

      <div className="ml-auto flex items-center gap-3">
        <span className="text-[11px] text-muted-foreground tabular-nums">
          {stats.shown}/{stats.total} symboles · {stats.edges} liens ·{" "}
          <span title="Part des liens résolus par heuristique plutôt que lus dans la syntaxe">
            {inferredShare}% déduits
          </span>
        </span>
        <button
          type="button"
          onClick={onToggleFullscreen}
          className="rounded-md border px-2 py-1 text-xs hover:bg-accent"
        >
          {fullscreen ? "Réduire" : "Plein écran"}
        </button>
      </div>
    </div>
  );
}

/** The answer to a path query, shown as the hops themselves rather than a count. */
export function PathBar({
  from,
  to,
  labels,
  hops,
  onClear,
  onSelect,
}: {
  from: string | null;
  to: string | null;
  labels: Record<string, string>;
  hops: string[] | null;
  onClear: () => void;
  onSelect: (id: string) => void;
}) {
  if (!from && !to) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 border-b bg-muted/50 px-3 py-1.5 text-xs">
      <span className="font-medium">Chemin</span>
      <span className="text-muted-foreground">
        {from ? (labels[from] ?? from) : "choisissez un départ"} →{" "}
        {to ? (labels[to] ?? to) : "choisissez une arrivée"}
      </span>
      {from && to ? (
        hops ? (
          <span className="flex flex-wrap items-center gap-1">
            <span className="text-muted-foreground">·</span>
            {hops.map((id, index) => (
              <span key={id} className="flex items-center gap-1">
                {index > 0 ? <span className="text-muted-foreground">→</span> : null}
                <button
                  type="button"
                  onClick={() => onSelect(id)}
                  className="underline underline-offset-2"
                >
                  {labels[id] ?? id}
                </button>
              </span>
            ))}
            <span className="text-muted-foreground">({hops.length - 1} sauts)</span>
          </span>
        ) : (
          // An honest dead end: the two symbols genuinely never meet.
          <span className="text-destructive">
            aucun chemin : ces deux symboles ne se touchent pas
          </span>
        )
      ) : null}
      <button
        type="button"
        onClick={onClear}
        className="ml-auto text-muted-foreground underline underline-offset-2"
      >
        effacer
      </button>
    </div>
  );
}
