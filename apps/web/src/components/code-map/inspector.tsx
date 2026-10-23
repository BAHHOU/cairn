"use client";

import type { CodeExplanation } from "@cairn/shared";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

/**
 * One symbol, explained.
 *
 * Deliberately the shape of a terminal answer rather than a dashboard: what it is,
 * where it lives, what it is connected to, and for each link whether we read it or
 * worked it out. A developer should be able to act on this panel without opening the file.
 */
export function Explanation({
  explanation,
  projectId,
  onSelect,
  onPathFrom,
  onPathTo,
  onClose,
}: {
  explanation: CodeExplanation;
  projectId: string;
  onSelect: (id: string) => void;
  onPathFrom: () => void;
  onPathTo: () => void;
  onClose: () => void;
}) {
  const t = useTranslations("codeMap.inspector");
  const td = useTranslations("domain");
  const { node, connections, communityLabel, degree, rationale } = explanation;
  const outgoing = connections.filter((c) => c.direction === "out");
  const incoming = connections.filter((c) => c.direction === "in");

  return (
    <aside className="flex w-80 shrink-0 flex-col gap-4 overflow-y-auto border-l bg-card p-4">
      <header className="flex flex-col gap-2">
        <div className="flex items-start justify-between gap-2">
          <h2 className="font-semibold text-base leading-tight">{node.label}</h2>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 text-muted-foreground text-xs hover:text-foreground"
          >
            {t("close")}
          </button>
        </div>
        <div className="flex flex-wrap gap-1">
          <Badge variant="outline">{td(`codeNodeKind.${node.kind}`)}</Badge>
          {node.language ? <Badge variant="secondary">{node.language}</Badge> : null}
          <Badge variant="info">{communityLabel}</Badge>
          <Badge variant="outline">{t("links", { count: degree })}</Badge>
        </div>
        {node.path ? (
          <p className="break-all font-mono text-[11px] text-muted-foreground">
            {node.path}
            {node.line ? `:${node.line}` : ""}
          </p>
        ) : (
          <p className="text-[11px] text-muted-foreground">{t("external")}</p>
        )}
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={onPathFrom}>
            {t("pathFrom")}
          </Button>
          <Button size="sm" variant="outline" onClick={onPathTo}>
            {t("pathTo")}
          </Button>
        </div>
        {node.archNodeId ? (
          <Link
            href={`/projects/${projectId}/architecture?vue=flux&noeud=${encodeURIComponent(node.archNodeId)}`}
            className="text-xs underline underline-offset-4"
          >
            {t("seeInArchitecture")}
          </Link>
        ) : null}
      </header>

      {rationale.length > 0 ? (
        <section className="flex flex-col gap-1 rounded-md border bg-muted/40 p-2">
          <h3 className="font-semibold text-xs uppercase tracking-wider">{t("why")}</h3>
          {rationale.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => onSelect(r.id)}
              className="text-left text-xs underline underline-offset-2"
            >
              {r.label}
            </button>
          ))}
        </section>
      ) : null}

      <ConnectionList
        title={t("outgoing", { count: outgoing.length })}
        connections={outgoing}
        arrow="→"
        onSelect={onSelect}
      />
      <ConnectionList
        title={t("incoming", { count: incoming.length })}
        connections={incoming}
        arrow="←"
        onSelect={onSelect}
      />
    </aside>
  );
}

function ConnectionList({
  title,
  connections,
  arrow,
  onSelect,
}: {
  title: string;
  connections: CodeExplanation["connections"];
  arrow: string;
  onSelect: (id: string) => void;
}) {
  const td = useTranslations("domain");
  if (!connections.length) return null;
  return (
    <section className="flex flex-col gap-1">
      <h3 className="font-semibold text-xs uppercase tracking-wider">{title}</h3>
      <ul className="flex flex-col gap-1">
        {connections.map((c) => (
          <li key={c.edgeId} className="flex flex-col">
            <button
              type="button"
              onClick={() => onSelect(c.otherId)}
              className="flex items-baseline gap-1.5 rounded px-1 py-0.5 text-left text-xs hover:bg-accent"
            >
              <span className="shrink-0 text-muted-foreground">{arrow}</span>
              <span className="min-w-0 flex-1 truncate">{c.otherLabel}</span>
              <span className="shrink-0 text-[10px] text-muted-foreground">
                {td(`codeEdgeKind.${c.kind}`)}
              </span>
              <span
                className={
                  c.confidence === "inferred"
                    ? "shrink-0 text-[10px] text-warning"
                    : "shrink-0 text-[10px] text-muted-foreground"
                }
              >
                {td(`codeConfidence.${c.confidence}`)}
              </span>
            </button>
            {c.note ? (
              <p className="pl-5 text-[10px] text-muted-foreground italic leading-snug">{c.note}</p>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
