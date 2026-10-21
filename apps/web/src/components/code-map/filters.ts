import type { CodeCommunity, CodeEdge, CodeGraph, CodeNode } from "@cairn/shared";
import type { CodeMapState } from "./use-code-map-state";

export interface VisibleGraph {
  nodes: CodeNode[];
  edges: CodeEdge[];
  /** Ids that matched the search itself, as opposed to those kept for context. */
  matched: Set<string>;
}

/**
 * What the canvas is allowed to draw.
 *
 * Pure, so the rules can be asserted instead of squinted at. One decision deserves a
 * word: a search keeps the matches *and their direct neighbours*. A lone matching dot
 * floating in empty space answers "does this name exist", which the reader already
 * knew; showing what it touches answers the question they actually had.
 */
export function visibleGraph(
  graph: Pick<CodeGraph, "nodes" | "edges">,
  communities: CodeCommunity[],
  state: Pick<CodeMapState, "hidden" | "kinds" | "search" | "extractedOnly">,
): VisibleGraph {
  const hidden = new Set(state.hidden);
  const dropped = new Set<string>();
  for (const community of communities) {
    if (hidden.has(community.id)) for (const id of community.memberIds) dropped.add(id);
  }

  const kinds = new Set(state.kinds);
  let kept = graph.nodes.filter(
    (n) => !dropped.has(n.id) && (kinds.size === 0 || kinds.has(n.kind)),
  );

  const needle = state.search.trim().toLowerCase();
  const matched = new Set<string>();
  if (needle) {
    for (const n of kept) {
      if (n.label.toLowerCase().includes(needle) || n.path?.toLowerCase().includes(needle)) {
        matched.add(n.id);
      }
    }
    const withContext = new Set(matched);
    for (const e of graph.edges) {
      if (matched.has(e.source)) withContext.add(e.target);
      if (matched.has(e.target)) withContext.add(e.source);
    }
    kept = kept.filter((n) => withContext.has(n.id));
  }

  const visible = new Set(kept.map((n) => n.id));
  const edges = graph.edges.filter(
    (e) =>
      visible.has(e.source) &&
      visible.has(e.target) &&
      (!state.extractedOnly || e.confidence === "extracted"),
  );

  return { nodes: kept, edges, matched };
}

/** The symbols one hop away, used to light up a neighbourhood on hover. */
export function neighbourhood(
  edges: CodeEdge[],
  nodeId: string,
): { nodes: Set<string>; edges: Set<string> } {
  const nodes = new Set([nodeId]);
  const touched = new Set<string>();
  for (const e of edges) {
    if (e.source === nodeId) {
      nodes.add(e.target);
      touched.add(e.id);
    } else if (e.target === nodeId) {
      nodes.add(e.source);
      touched.add(e.id);
    }
  }
  return { nodes, edges: touched };
}
