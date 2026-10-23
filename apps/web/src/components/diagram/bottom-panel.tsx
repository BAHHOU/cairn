"use client";

import type { ProjectArchitecture } from "@cairn/shared";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { GraphState } from "./use-graph-state";

/** Labels: `diagram.panel.tab.<id>`. */
const TABS = [{ id: "contract" }, { id: "violations" }, { id: "inventory" }] as const;

interface Props {
  architecture: ProjectArchitecture;
  state: GraphState;
  update: (patch: Partial<GraphState>) => void;
}

const SEVERITY_VARIANT = {
  blocker: "destructive",
  critical: "destructive",
  major: "warning",
  minor: "secondary",
} as const;

export function BottomPanel({ architecture, state, update }: Props) {
  const t = useTranslations("diagram.panel");
  const td = useTranslations("domain");
  const open = state.panel !== null;
  const layerLabel = (id: string) =>
    architecture.contract.layers.find((l) => l.id === id)?.label ?? id;
  const nodeLabel = (id: string) => architecture.nodes.find((n) => n.id === id)?.label ?? id;

  return (
    <div className="shrink-0 border-t bg-card">
      <div className="flex items-center gap-1 px-4 py-1.5">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => update({ panel: state.panel === tab.id ? null : tab.id })}
            className={cn(
              "rounded px-2.5 py-1 font-medium text-xs transition-colors",
              state.panel === tab.id
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:bg-accent/50",
            )}
          >
            {t(`tab.${tab.id}`)}
            {tab.id === "violations" && architecture.violations.length > 0 && (
              <span className="ml-1.5 rounded-full bg-destructive px-1.5 text-[10px] text-background">
                {architecture.violations.length}
              </span>
            )}
          </button>
        ))}
        <span className="ml-auto text-muted-foreground text-xs">
          {t.rich("commit", {
            commit: architecture.commit,
            code: (chunks) => <code className="font-mono">{chunks}</code>,
          })}
        </span>
        {open ? (
          <ChevronDown className="size-4 text-muted-foreground" aria-hidden />
        ) : (
          <ChevronUp className="size-4 text-muted-foreground" aria-hidden />
        )}
      </div>

      {open && (
        <div className="max-h-64 overflow-y-auto border-t px-4 py-3">
          {state.panel === "contract" && (
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <h3 className="mb-2 font-medium text-sm">{t("layers")}</h3>
                <ol className="space-y-1.5">
                  {architecture.contract.layers.map((l, i) => (
                    <li key={l.id} className="text-xs">
                      <span className="font-medium">
                        {i + 1}. {l.label}
                      </span>
                      <span className="text-muted-foreground"> — {l.description}</span>
                    </li>
                  ))}
                </ol>
              </div>
              <div>
                <h3 className="mb-2 font-medium text-sm">{t("forbidden")}</h3>
                <ul className="space-y-1.5">
                  {architecture.contract.forbidden.map((r) => (
                    <li key={`${r.from}->${r.to}`} className="text-xs">
                      <span className="font-medium">
                        {layerLabel(r.from)} → {layerLabel(r.to)}
                      </span>
                      <span className="text-muted-foreground"> — {r.reason}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-muted-foreground text-xs">
                  {architecture.contract.validatedBy
                    ? t("validated", {
                        by: architecture.contract.validatedBy,
                        at: architecture.contract.validatedAt ?? "",
                      })
                    : t("defaultContract")}
                </p>
              </div>
            </div>
          )}

          {state.panel === "violations" && (
            <ul className="space-y-2">
              {architecture.violations.map((v) => (
                <li key={v.id}>
                  <button
                    type="button"
                    onClick={() => update({ node: v.sourceId, view: "impact" })}
                    className="w-full rounded border p-2 text-left transition-colors hover:bg-accent/50"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={SEVERITY_VARIANT[v.severity]}>{v.rule}</Badge>
                      <span className="font-medium text-xs">
                        {nodeLabel(v.sourceId)} → {nodeLabel(v.targetId)}
                      </span>
                      {v.introducedBy && (
                        <span className="text-muted-foreground text-xs">
                          {t("introducedBy", {
                            ref: v.introducedBy.ref,
                            title: v.introducedBy.title,
                            date: v.introducedBy.date,
                          })}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-muted-foreground text-xs">{v.explanation}</p>
                    <p className="mt-1 text-xs">
                      <span className="font-medium">{t("proposedFix")}</span> {v.proposedFix}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {state.panel === "inventory" && (
            <table className="w-full text-xs">
              <thead className="text-left text-muted-foreground">
                <tr>
                  <th className="pb-1 font-medium">{t("node")}</th>
                  <th className="pb-1 font-medium">{t("type")}</th>
                  <th className="pb-1 font-medium">{t("repository")}</th>
                  <th className="pb-1 font-medium">{t("provenance")}</th>
                  <th className="pb-1 font-medium">{t("sources")}</th>
                </tr>
              </thead>
              <tbody>
                {architecture.nodes.map((n) => (
                  <tr key={n.id} className="border-t">
                    <td className="py-1">
                      <button
                        type="button"
                        onClick={() => update({ node: n.id })}
                        className="font-medium underline-offset-2 hover:underline"
                      >
                        {n.label}
                      </button>
                    </td>
                    <td className="py-1 text-muted-foreground">{td(`archNodeKind.${n.kind}`)}</td>
                    <td className="py-1 text-muted-foreground">{n.repoId}</td>
                    <td className="py-1 text-muted-foreground">
                      {td(`archProvenance.${n.provenance}`)}
                    </td>
                    <td className="py-1 font-mono text-[10px] text-muted-foreground">
                      {n.sources[0]?.path ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
