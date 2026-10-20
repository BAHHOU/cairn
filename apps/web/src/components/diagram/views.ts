import {
  type ArchEdge,
  type ArchLayer,
  type ArchNode,
  type ArchView,
  DATA_EDGE_KINDS,
  type ProjectArchitecture,
} from "@cairn/shared";

/**
 * Every view is a projection over the one graph.
 *
 * Nothing here touches React or the DOM, which is the point: a view is a pure
 * function and can be asserted on in a unit test. A diagram whose correctness
 * can only be judged by looking at it is a diagram nobody trusts.
 */

/** How deep into the containment tree a view is allowed to look. */
export const VIEW_DEPTH: Record<ArchView, number> = {
  contexte: 0,
  conteneurs: 1,
  flux: 2,
  impact: 2,
};

/** An edge in a projected graph. It may stand for several edges of the source graph. */
export interface ViewEdge extends ArchEdge {
  /** Ids of the original edges folded into this one. Always contains at least `id`. */
  mergedIds: string[];
  /** True when any folded edge breaks the architecture contract. */
  violating: boolean;
}

export interface ViewNode extends ArchNode {
  /** Ids of the original nodes folded into this one, itself included. */
  mergedIds: string[];
}

export interface ViewGraph {
  nodes: ViewNode[];
  edges: ViewEdge[];
  /** Node id of the source graph -> node id shown on screen. */
  representative: Record<string, string>;
}

export interface ViewFilters {
  layers?: ArchLayer[];
  search?: string;
  crossRepoOnly?: boolean;
}

const depthOf = (node: ArchNode, byId: Map<string, ArchNode>): number => {
  let depth = 0;
  let current = node;
  const guard = new Set<string>([node.id]);
  while (current.parentId) {
    const parent = byId.get(current.parentId);
    if (!parent || guard.has(parent.id)) break;
    guard.add(parent.id);
    current = parent;
    depth += 1;
  }
  return depth;
};

/** Walk up until the node is shallow enough to be displayed at this level of detail. */
const resolveAt = (node: ArchNode, byId: Map<string, ArchNode>, maxDepth: number): ArchNode => {
  let current = node;
  const guard = new Set<string>([node.id]);
  while (depthOf(current, byId) > maxDepth && current.parentId) {
    const parent = byId.get(current.parentId);
    if (!parent || guard.has(parent.id)) break;
    guard.add(parent.id);
    current = parent;
  }
  return current;
};

/** Edges the "flux" view keeps: something that carries business data actually moves here. */
export const isDataEdge = (e: ArchEdge): boolean =>
  DATA_EDGE_KINDS.includes(e.kind) && e.payload !== undefined && e.payload !== "config";

const matches = (node: ArchNode, needle: string): boolean => {
  const q = needle.trim().toLowerCase();
  if (!q) return true;
  return (
    node.label.toLowerCase().includes(q) ||
    node.description.toLowerCase().includes(q) ||
    node.tech.some((t) => t.toLowerCase().includes(q)) ||
    node.sources.some((s) => s.path.toLowerCase().includes(q))
  );
};

export function projectGraph(
  graph: Pick<ProjectArchitecture, "nodes" | "edges" | "violations">,
  view: ArchView,
  filters: ViewFilters = {},
): ViewGraph {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const maxDepth = VIEW_DEPTH[view];

  const representative: Record<string, string> = {};
  const folded = new Map<string, ViewNode>();
  for (const n of graph.nodes) {
    const rep = resolveAt(n, byId, maxDepth);
    representative[n.id] = rep.id;
    const existing = folded.get(rep.id);
    if (existing) {
      if (existing.id !== n.id) existing.mergedIds.push(n.id);
    } else {
      folded.set(rep.id, { ...rep, mergedIds: [rep.id] });
    }
  }
  // A folded node inherits the issues of everything it now stands for.
  for (const vn of folded.values()) {
    const issues = new Set(vn.issueIds ?? []);
    for (const id of vn.mergedIds)
      for (const issueId of byId.get(id)?.issueIds ?? []) issues.add(issueId);
    vn.issueIds = [...issues];
  }

  const violatingEdgeIds = new Set(
    graph.violations.map((v) => v.edgeId).filter((x): x is string => Boolean(x)),
  );

  const kept = view === "flux" ? graph.edges.filter(isDataEdge) : graph.edges;
  const merged = new Map<string, ViewEdge>();
  for (const e of kept) {
    const source = representative[e.source];
    const target = representative[e.target];
    if (!source || !target || source === target) continue; // folded away: an internal detail of one box
    const key = `${source}->${target}->${e.kind}`;
    const existing = merged.get(key);
    if (existing) {
      existing.mergedIds.push(e.id);
      existing.violating ||= violatingEdgeIds.has(e.id);
      existing.crossRepo ||= e.crossRepo;
      if (existing.label !== e.label) existing.label = `${existing.mergedIds.length} liens`;
      continue;
    }
    merged.set(key, {
      ...e,
      source,
      target,
      mergedIds: [e.id],
      violating: violatingEdgeIds.has(e.id),
    });
  }

  let nodes = [...folded.values()];
  let edges = [...merged.values()];

  if (filters.crossRepoOnly) edges = edges.filter((e) => e.crossRepo);
  if (filters.layers?.length) {
    const allowed = new Set(filters.layers);
    const visible = new Set(nodes.filter((n) => allowed.has(n.layer)).map((n) => n.id));
    nodes = nodes.filter((n) => visible.has(n.id));
    edges = edges.filter((e) => visible.has(e.source) && visible.has(e.target));
  }
  if (filters.search?.trim()) {
    // Keep what matches, plus its direct neighbours: a node alone explains nothing.
    const seeds = new Set(nodes.filter((n) => matches(n, filters.search ?? "")).map((n) => n.id));
    const visible = new Set(seeds);
    for (const e of edges) {
      if (seeds.has(e.source)) visible.add(e.target);
      if (seeds.has(e.target)) visible.add(e.source);
    }
    nodes = nodes.filter((n) => visible.has(n.id));
    edges = edges.filter((e) => visible.has(e.source) && visible.has(e.target));
  }

  // Drop boxes that no longer connect to anything: they are noise at this level of detail.
  const connected = new Set<string>();
  for (const e of edges) {
    connected.add(e.source);
    connected.add(e.target);
  }
  nodes = nodes.filter((n) => connected.has(n.id));

  const visibleIds = new Set(nodes.map((n) => n.id));
  for (const key of Object.keys(representative)) {
    if (!visibleIds.has(representative[key] as string)) delete representative[key];
  }

  return { nodes, edges, representative };
}

/** Direct neighbours of a node, used to dim everything else on hover. */
export function neighboursOf(
  graph: ViewGraph,
  nodeId: string,
): { nodes: Set<string>; edges: Set<string> } {
  const nodes = new Set<string>([nodeId]);
  const edges = new Set<string>();
  for (const e of graph.edges) {
    if (e.source === nodeId) {
      nodes.add(e.target);
      edges.add(e.id);
    } else if (e.target === nodeId) {
      nodes.add(e.source);
      edges.add(e.id);
    }
  }
  return { nodes, edges };
}

/** Counts shown in the legend, so the provenance mix is visible rather than claimed. */
export function provenanceMix(nodes: ArchNode[]): {
  extracted: number;
  inferred: number;
  declared: number;
} {
  const mix = { extracted: 0, inferred: 0, declared: 0 };
  for (const n of nodes) mix[n.provenance] += 1;
  return mix;
}
