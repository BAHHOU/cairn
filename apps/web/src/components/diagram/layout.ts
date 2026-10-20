import type { ArchNodeKind } from "@cairn/shared";
import dagre from "@dagrejs/dagre";

/**
 * Layout is synchronous on purpose.
 *
 * An asynchronous layout engine forces the canvas to render an empty frame, then
 * jump. Dagre returns positions in the same tick, so the first paint is already
 * the final one.
 */

export interface LaidOutNode {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export const NODE_SIZE: Record<ArchNodeKind, { width: number; height: number }> = {
  system: { width: 260, height: 92 },
  service: { width: 220, height: 84 },
  component: { width: 196, height: 72 },
  datastore: { width: 196, height: 76 },
  queue: { width: 184, height: 72 },
  external: { width: 204, height: 76 },
  actor: { width: 172, height: 68 },
  pipeline: { width: 196, height: 72 },
  deployment: { width: 196, height: 72 },
};

export type LayoutDirection = "LR" | "TB";

export function autoLayout(
  nodes: { id: string; kind: ArchNodeKind }[],
  edges: { source: string; target: string }[],
  direction: LayoutDirection = "LR",
): Record<string, LaidOutNode> {
  const g = new dagre.graphlib.Graph();
  g.setGraph({
    rankdir: direction,
    // Generous spacing: labelled edges that overlap are worse than a wider canvas.
    nodesep: direction === "LR" ? 36 : 56,
    ranksep: direction === "LR" ? 140 : 110,
    marginx: 32,
    marginy: 32,
  });
  g.setDefaultEdgeLabel(() => ({}));

  const known = new Set(nodes.map((n) => n.id));
  for (const n of nodes) g.setNode(n.id, { ...NODE_SIZE[n.kind] });
  for (const e of edges) {
    if (known.has(e.source) && known.has(e.target)) g.setEdge(e.source, e.target);
  }

  dagre.layout(g);

  const out: Record<string, LaidOutNode> = {};
  for (const n of nodes) {
    const laid = g.node(n.id) as
      | { x: number; y: number; width: number; height: number }
      | undefined;
    const size = NODE_SIZE[n.kind];
    out[n.id] = laid
      ? // dagre positions a node by its centre; React Flow wants the top-left corner.
        { id: n.id, x: laid.x - laid.width / 2, y: laid.y - laid.height / 2, ...size }
      : { id: n.id, x: 0, y: 0, ...size };
  }
  return out;
}
