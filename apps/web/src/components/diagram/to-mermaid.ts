import { ARCH_PAYLOAD_LABEL, type ArchNodeKind } from "@cairn/shared";
import type { ViewGraph } from "./views";

/**
 * Mermaid export.
 *
 * A PNG is a picture; Mermaid text can be pasted into a README and reviewed in a
 * merge request. Exporting the diagram as something a human can diff is what keeps
 * the documentation from drifting again.
 */

const SHAPE: Record<ArchNodeKind, [string, string]> = {
  system: ["[", "]"],
  service: ["[", "]"],
  component: ["(", ")"],
  datastore: ["[(", ")]"],
  queue: ["[/", "/]"],
  external: ["[[", "]]"],
  actor: ["([", "])"],
  pipeline: ["{{", "}}"],
  deployment: ["[/", "/]"],
};

/** Mermaid ids may not contain punctuation that collides with its own syntax. */
const safeId = (id: string) => id.replace(/[^a-zA-Z0-9_]/g, "_");

/** Quotes are what break a generated Mermaid block most often. */
const clean = (text: string) => text.replace(/"/g, "'").replace(/\n/g, " ");

export function toMermaid(graph: ViewGraph, title: string): string {
  const lines = [`%% ${clean(title)} — exporté depuis Cairn`, "flowchart LR"];

  const byRepo = new Map<string, typeof graph.nodes>();
  for (const n of graph.nodes) {
    const list = byRepo.get(n.repoId);
    if (list) list.push(n);
    else byRepo.set(n.repoId, [n]);
  }

  for (const [repoId, nodes] of byRepo) {
    const grouped = byRepo.size > 1;
    if (grouped) lines.push(`  subgraph ${safeId(repoId)}["${clean(repoId)}"]`);
    for (const n of nodes) {
      const [open, close] = SHAPE[n.kind];
      lines.push(`  ${grouped ? "  " : ""}${safeId(n.id)}${open}"${clean(n.label)}"${close}`);
    }
    if (grouped) lines.push("  end");
  }

  for (const e of graph.edges) {
    const arrow = e.kind === "async" ? "-.->" : "-->";
    const payload = e.payload ? ` (${ARCH_PAYLOAD_LABEL[e.payload]})` : "";
    lines.push(`  ${safeId(e.source)} ${arrow}|"${clean(e.label)}${payload}"| ${safeId(e.target)}`);
  }

  const violating = graph.edges.map((e, i) => [e, i] as const).filter(([e]) => e.violating);
  if (violating.length) {
    for (const [, index] of violating) {
      lines.push(`  linkStyle ${index} stroke:#dc2626,stroke-width:2px`);
    }
  }

  return lines.join("\n");
}
