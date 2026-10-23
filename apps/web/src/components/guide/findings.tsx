"use client";

import type { GuideFinding } from "@cairn/shared";
import { AlertTriangle, CheckCircle2, ChevronRight, Info, Lightbulb } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Inline, SourceRef } from "@/components/guide/bits";
import { Modal } from "@/components/ui/dialog";
import type { SourceBase } from "@/lib/import/source-link";
import { cn } from "@/lib/utils";

type Severity = GuideFinding["severity"];

/** Labels: `domain.severity.<key>`. */
const SEVERITY: Record<Severity, { text: string; chip: string; Icon: typeof Info }> = {
  blocker: {
    text: "text-destructive",
    chip: "bg-destructive/15 text-destructive",
    Icon: AlertTriangle,
  },
  critical: {
    text: "text-destructive",
    chip: "bg-destructive/15 text-destructive",
    Icon: AlertTriangle,
  },
  major: {
    text: "text-warning",
    chip: "bg-warning/15 text-warning",
    Icon: AlertTriangle,
  },
  minor: {
    text: "text-muted-foreground",
    chip: "bg-muted text-muted-foreground",
    Icon: Info,
  },
};

const ORDER: Severity[] = ["blocker", "critical", "major", "minor"];

/**
 * Observations about the repository, one compact row each: the reader sees all of them at a glance
 * and opens one in a modal for the detail, the line it comes from and what to do about it.
 */
export function Findings({
  findings,
  base,
  emptyText,
}: {
  findings: GuideFinding[];
  base: SourceBase | null;
  emptyText?: string;
}) {
  const t = useTranslations("findings");
  const td = useTranslations("domain.severity");
  const [openId, setOpenId] = useState<string | null>(null);
  const open = findings.find((f) => f.id === openId) ?? null;

  if (findings.length === 0) {
    return (
      <p className="flex items-center gap-2 text-muted-foreground text-sm">
        <CheckCircle2 className="size-4 text-primary" aria-hidden /> {emptyText ?? t("empty")}
      </p>
    );
  }

  const counts = ORDER.map((s) => ({
    s,
    n: findings.filter((f) => f.severity === s).length,
  })).filter((c) => c.n > 0);

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-wrap gap-1.5 text-xs">
        {counts.map(({ s, n }) => (
          <li key={s} className={cn("rounded-full px-2.5 py-0.5 font-medium", SEVERITY[s].chip)}>
            {t(`count.${s}`, { count: n })}
          </li>
        ))}
      </ul>

      <ul className="flex flex-col divide-y rounded-lg border">
        {findings.map((f) => {
          const style = SEVERITY[f.severity];
          return (
            <li key={f.id}>
              <button
                type="button"
                onClick={() => setOpenId(f.id)}
                className="flex w-full items-center gap-3 px-3 py-2.5 text-left outline-none transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset"
              >
                <style.Icon className={cn("size-4 shrink-0", style.text)} aria-hidden />
                <span className="min-w-0 flex-1 truncate text-sm">
                  <Inline text={f.title} />
                </span>
                {f.source ? (
                  <span className="hidden shrink-0 font-mono text-[11px] text-muted-foreground sm:inline">
                    {f.source.path}
                    {f.source.line ? `:${f.source.line}` : ""}
                  </span>
                ) : null}
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              </button>
            </li>
          );
        })}
      </ul>

      <Modal
        open={open !== null}
        onOpenChange={(o) => {
          if (!o) setOpenId(null);
        }}
        title={open ? <Inline text={open.title} /> : ""}
        description={open ? td(open.severity) : undefined}
        icon={
          open ? (
            <span
              className={cn(
                "grid size-9 shrink-0 place-items-center rounded-lg",
                SEVERITY[open.severity].chip,
              )}
            >
              {(() => {
                const Icon = SEVERITY[open.severity].Icon;
                return <Icon className="size-4" aria-hidden />;
              })()}
            </span>
          ) : null
        }
      >
        {open ? (
          <>
            <p className="text-sm leading-relaxed">
              <Inline text={open.detail} />
            </p>
            {open.source ? <SourceRef source={open.source} base={base} /> : null}
            {open.proposal ? (
              <p className="flex items-start gap-2 rounded-md bg-muted/60 px-3 py-2 text-sm">
                <Lightbulb className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden />
                <span>
                  <span className="font-medium">{t("proposal")} </span>
                  <Inline text={open.proposal} />
                </span>
              </p>
            ) : null}
          </>
        ) : null}
      </Modal>
    </div>
  );
}
