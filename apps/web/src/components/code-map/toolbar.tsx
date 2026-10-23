"use client";

import type { CodeNodeKind } from "@cairn/shared";
import { useTranslations } from "next-intl";
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
  const t = useTranslations("codeMap.toolbar");
  const td = useTranslations("domain");
  const inferredShare = stats.edges ? Math.round((stats.inferred / stats.edges) * 100) : 0;

  return (
    <div className="flex flex-wrap items-center gap-2 border-b bg-card px-3 py-2">
      <input
        value={search}
        onChange={(e) => onSearch(e.target.value)}
        placeholder={t("search")}
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
              {td(`codeNodeKind.${kind}`)}
            </button>
          );
        })}
        {kinds.length > 0 ? (
          <span className="text-[11px] text-muted-foreground">{t("noTypeFilter")}</span>
        ) : null}
      </div>

      <label className="flex cursor-pointer items-center gap-1.5 text-xs">
        <input type="checkbox" checked={extractedOnly} onChange={onToggleExtracted} />
        {t("extractedOnly")}
      </label>

      <div className="ml-auto flex items-center gap-3">
        <span className="text-[11px] text-muted-foreground tabular-nums">
          {t("counts", { shown: stats.shown, total: stats.total, edges: stats.edges })} ·{" "}
          <span title={t("inferredHint")}>{t("inferred", { pct: inferredShare })}</span>
        </span>
        <button
          type="button"
          onClick={onToggleFullscreen}
          className="rounded-md border px-2 py-1 text-xs hover:bg-accent"
        >
          {fullscreen ? t("exitFullscreen") : t("fullscreen")}
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
  const t = useTranslations("codeMap.path");
  if (!from && !to) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 border-b bg-muted/50 px-3 py-1.5 text-xs">
      <span className="font-medium">{t("title")}</span>
      <span className="text-muted-foreground">
        {from ? (labels[from] ?? from) : t("pickStart")} → {to ? (labels[to] ?? to) : t("pickEnd")}
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
            <span className="text-muted-foreground">{t("hops", { count: hops.length - 1 })}</span>
          </span>
        ) : (
          // An honest dead end: the two symbols genuinely never meet.
          <span className="text-destructive">{t("noPath")}</span>
        )
      ) : null}
      <button
        type="button"
        onClick={onClear}
        className="ml-auto text-muted-foreground underline underline-offset-2"
      >
        {t("clear")}
      </button>
    </div>
  );
}
