"use client";

import type { CodeCommunity, GodNode } from "@cairn/shared";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { colorOfRank } from "./layout";

/**
 * The legend, and the only filter that matters.
 *
 * Counts are of the whole community, not of what survives the current search: a
 * legend that shrinks with the filters tells you about the filters, not about the code.
 */
export function CommunityPanel({
  communities,
  hidden,
  gods,
  selected,
  onToggle,
  onOnly,
  onReset,
  onSelect,
}: {
  communities: CodeCommunity[];
  hidden: string[];
  gods: GodNode[];
  selected: string | null;
  onToggle: (id: string) => void;
  onOnly: (id: string) => void;
  onReset: () => void;
  onSelect: (nodeId: string) => void;
}) {
  const t = useTranslations("codeMap.communities");
  const hiddenSet = new Set(hidden);

  return (
    <aside className="flex w-64 shrink-0 flex-col gap-4 overflow-y-auto border-l bg-card/40 p-3">
      <section className="flex flex-col gap-1">
        <header className="flex items-baseline justify-between">
          <h3 className="font-semibold text-xs uppercase tracking-wider">{t("title")}</h3>
          {hidden.length > 0 ? (
            <button
              type="button"
              onClick={onReset}
              className="text-[11px] text-muted-foreground underline underline-offset-2"
            >
              {t("showAll")}
            </button>
          ) : null}
        </header>
        <p className="mb-1 text-[11px] text-muted-foreground leading-snug">{t("hint")}</p>
        <ul className="flex flex-col">
          {communities.map((community) => {
            const off = hiddenSet.has(community.id);
            return (
              <li key={community.id} className="group flex items-center gap-2 py-[3px]">
                <button
                  type="button"
                  onClick={() => onToggle(community.id)}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  aria-pressed={!off}
                >
                  <span
                    className={cn("size-3 shrink-0 rounded-[3px] border", off && "bg-transparent!")}
                    style={{
                      background: colorOfRank(community.rank),
                      borderColor: colorOfRank(community.rank),
                    }}
                  />
                  <span
                    className={cn(
                      "min-w-0 flex-1 truncate text-xs",
                      off && "text-muted-foreground line-through",
                    )}
                    title={community.label}
                  >
                    {community.label}
                  </span>
                  <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
                    {community.size}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => onOnly(community.id)}
                  className="shrink-0 text-[10px] text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
                  title={t("onlyHint")}
                >
                  {t("only")}
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="flex flex-col gap-1">
        <h3 className="font-semibold text-xs uppercase tracking-wider">{t("gods")}</h3>
        <p className="mb-1 text-[11px] text-muted-foreground leading-snug">{t("godsHint")}</p>
        <ul className="flex flex-col">
          {gods.map((god) => (
            <li key={god.nodeId}>
              <button
                type="button"
                onClick={() => onSelect(god.nodeId)}
                className={cn(
                  "flex w-full items-center gap-2 rounded px-1 py-[3px] text-left text-xs hover:bg-accent",
                  god.nodeId === selected && "bg-accent",
                )}
              >
                <span className="min-w-0 flex-1 truncate" title={god.label}>
                  {god.label}
                </span>
                <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
                  {god.degree}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>
    </aside>
  );
}
