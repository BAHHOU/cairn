"use client";

import {
  ARCH_NODE_KIND_LABEL,
  ARCH_PAYLOAD_LABEL,
  ARCH_PROVENANCE_LABEL,
  type BlastRadius,
  type ProjectArchitecture,
} from "@cairn/shared";
import { ArrowRight, FileCode2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ViewGraph, ViewNode } from "./views";

interface Props {
  node: ViewNode;
  graph: ViewGraph;
  architecture: ProjectArchitecture;
  blastRadius: BlastRadius | null;
  loadingRadius: boolean;
  onClose: () => void;
  onSelect: (nodeId: string) => void;
  onShowImpact: () => void;
}

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="border-t px-4 py-3">
    <h3 className="mb-2 font-medium text-muted-foreground text-xs uppercase tracking-wide">
      {title}
    </h3>
    {children}
  </section>
);

export function Inspector({
  node,
  graph,
  architecture,
  blastRadius,
  loadingRadius,
  onClose,
  onSelect,
  onShowImpact,
}: Props) {
  const incoming = graph.edges.filter((e) => e.target === node.id);
  const outgoing = graph.edges.filter((e) => e.source === node.id);
  const label = (id: string) => graph.nodes.find((n) => n.id === id)?.label ?? id;

  const violations = architecture.violations.filter(
    (v) => v.sourceId === node.id || v.targetId === node.id,
  );
  const repo = architecture.repos.find((r) => r.id === node.repoId);

  return (
    <aside className="flex w-96 shrink-0 flex-col overflow-y-auto border-l bg-card">
      <header className="flex items-start gap-2 px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-muted-foreground text-xs">
            <span>{ARCH_NODE_KIND_LABEL[node.kind]}</span>
            <span aria-hidden>·</span>
            <span>{repo?.name ?? node.repoId}</span>
          </div>
          <h2 className="truncate font-semibold text-base">{node.label}</h2>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Fermer l'inspecteur">
          <X />
        </Button>
      </header>

      <div className="flex flex-wrap gap-1.5 px-4 pb-3">
        <Badge
          variant={
            node.provenance === "extracted"
              ? "success"
              : node.provenance === "inferred"
                ? "warning"
                : "secondary"
          }
        >
          {ARCH_PROVENANCE_LABEL[node.provenance]}
        </Badge>
        {node.tech.map((t) => (
          <Badge key={t} variant="outline">
            {t}
          </Badge>
        ))}
      </div>

      <p className="px-4 pb-3 text-sm leading-relaxed">{node.description}</p>

      <Section title="D'où vient cette information">
        {node.sources.length === 0 ? (
          <p className="text-muted-foreground text-sm">Aucune source enregistrée.</p>
        ) : (
          <ul className="space-y-1.5">
            {node.sources.map((s) => (
              <li key={`${s.repoId}:${s.path}:${s.line ?? 0}`} className="flex gap-2 text-xs">
                <FileCode2 className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                <span className="min-w-0">
                  <code className="break-all font-mono">
                    {s.path}
                    {s.line ? `:${s.line}` : ""}
                  </code>
                  {s.note && <span className="block text-muted-foreground">{s.note}</span>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {node.mergedIds.length > 1 && (
        <Section title={`Regroupe ${node.mergedIds.length} éléments`}>
          <p className="text-muted-foreground text-xs">
            Cette boîte représente plusieurs nœuds du graphe à ce niveau de détail. Passez à une vue
            plus fine pour les voir séparément.
          </p>
        </Section>
      )}

      <Section title="Liens">
        {incoming.length === 0 && outgoing.length === 0 ? (
          <p className="text-muted-foreground text-sm">Aucun lien dans cette vue.</p>
        ) : (
          <ul className="space-y-1">
            {[
              ...incoming.map((e) => ({ e, dir: "in" as const })),
              ...outgoing.map((e) => ({ e, dir: "out" as const })),
            ].map(({ e, dir }) => (
              <li key={e.id}>
                <button
                  type="button"
                  onClick={() => onSelect(dir === "in" ? e.source : e.target)}
                  className="flex w-full items-center gap-1.5 rounded px-1 py-0.5 text-left text-xs hover:bg-accent"
                >
                  <ArrowRight
                    className={
                      dir === "in"
                        ? "size-3 shrink-0 rotate-180 text-muted-foreground"
                        : "size-3 shrink-0 text-muted-foreground"
                    }
                    aria-hidden
                  />
                  <span className="truncate font-medium">
                    {label(dir === "in" ? e.source : e.target)}
                  </span>
                  <span className="truncate text-muted-foreground">
                    {e.label}
                    {e.payload ? ` · ${ARCH_PAYLOAD_LABEL[e.payload]}` : ""}
                  </span>
                  {e.crossRepo && <Badge variant="outline">inter-dépôt</Badge>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {violations.length > 0 && (
        <Section title="Écarts au contrat">
          <ul className="space-y-2">
            {violations.map((v) => (
              <li
                key={v.id}
                className="rounded border border-destructive/40 bg-destructive/5 p-2 text-xs"
              >
                <div className="font-medium">{v.rule}</div>
                <p className="mt-1 text-muted-foreground">{v.explanation}</p>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {(node.docs?.length || node.adrs?.length) && (
        <Section title="Documentation et décisions">
          <ul className="space-y-1 text-xs">
            {[...(node.docs ?? []), ...(node.adrs ?? [])].map((l) => (
              <li key={l.id}>
                <a className="underline underline-offset-2 hover:text-primary" href={l.href ?? "#"}>
                  {l.title}
                </a>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title="Rayon d'impact">
        {loadingRadius ? (
          <p className="text-muted-foreground text-sm">Calcul en cours…</p>
        ) : blastRadius ? (
          <div className="space-y-2 text-xs">
            <p>
              <strong>{Object.keys(blastRadius.hops).length - 1}</strong> nœuds touchés, dont{" "}
              <strong>{blastRadius.directIds.length}</strong> directement.
            </p>
            <p className="text-muted-foreground">
              Dépôts concernés : {blastRadius.impactedRepoIds.join(", ")}
            </p>
            {blastRadius.impactedIssueIds.length > 0 && (
              <p className="text-muted-foreground">
                {blastRadius.impactedIssueIds.length} constat(s) ouverts dans le périmètre.
              </p>
            )}
            <Button variant="outline" size="sm" onClick={onShowImpact}>
              Voir sur le diagramme
            </Button>
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">Indisponible.</p>
        )}
      </Section>
    </aside>
  );
}
