/**
 * The code map: one graph of symbols, files, tables and documents.
 *
 * The architecture graph answers "what does this system look like". This one answers
 * "where does this actually live, and what would I break". It is deliberately a
 * different granularity — hundreds of symbols rather than a few dozen curated boxes —
 * so the two never compete: one is a map of the territory, the other a map of the city.
 *
 * Two rules make it trustworthy:
 *  - every edge says how it was obtained (`extracted` from the syntax tree, `inferred`
 *    by name resolution). A reader can always tell what was read from what was guessed;
 *  - communities are computed, never hand-drawn, and labelled by their most connected
 *    member. Nobody has to maintain a legend.
 */

export const CODE_NODE_KINDS = [
  "module",
  "class",
  "interface",
  "function",
  "table",
  "config",
  "doc",
  "adr",
  "rationale",
  "external",
] as const;
export type CodeNodeKind = (typeof CODE_NODE_KINDS)[number];

export const CODE_NODE_KIND_LABEL: Record<CodeNodeKind, string> = {
  module: "Module",
  class: "Classe",
  interface: "Interface",
  function: "Fonction",
  table: "Table",
  config: "Configuration",
  doc: "Document",
  adr: "Décision (ADR)",
  rationale: "Justification",
  external: "Dépendance externe",
};

/**
 * How the link was obtained. This is the single most important field of the graph:
 * a map that cannot distinguish what it read from what it guessed is a rumour.
 */
export const CODE_CONFIDENCES = ["extracted", "inferred"] as const;
export type CodeConfidence = (typeof CODE_CONFIDENCES)[number];

export const CODE_CONFIDENCE_LABEL: Record<CodeConfidence, string> = {
  extracted: "Extrait",
  inferred: "Déduit",
};

export const CODE_EDGE_KINDS = [
  "imports",
  "calls",
  "inherits",
  "implements",
  "reads",
  "writes",
  "publishes",
  "consumes",
  "configures",
  "documents",
  "decides",
  "explains",
] as const;
export type CodeEdgeKind = (typeof CODE_EDGE_KINDS)[number];

export const CODE_EDGE_KIND_LABEL: Record<CodeEdgeKind, string> = {
  imports: "importe",
  calls: "appelle",
  inherits: "hérite de",
  implements: "implémente",
  reads: "lit",
  writes: "écrit",
  publishes: "publie vers",
  consumes: "consomme",
  configures: "configure",
  documents: "documente",
  decides: "décide de",
  explains: "explique",
};

export interface CodeNode {
  id: string;
  label: string;
  kind: CodeNodeKind;
  /** Repository-relative path. Absent for external dependencies. */
  path?: string;
  line?: number;
  language?: string;
  /** Which deployable unit of the architecture graph this symbol belongs to, if any. */
  archNodeId?: string;
}

export interface CodeEdge {
  id: string;
  source: string;
  target: string;
  kind: CodeEdgeKind;
  confidence: CodeConfidence;
  /** Why the resolver believed this link, shown verbatim for `inferred` edges. */
  note?: string;
}

export interface CodeCommunity {
  id: string;
  /** The most connected member. Chosen, not written by hand. */
  label: string;
  size: number;
  /** Rank by size, 0-based. Drives the colour so the biggest cluster is always the same hue. */
  rank: number;
  memberIds: string[];
}

export interface CodeGraph {
  projectId: string;
  repoId: string;
  commit: string;
  generatedAt: string;
  nodes: CodeNode[];
  edges: CodeEdge[];
  /** Files the extractor could not parse. Declared, because silence would look like success. */
  skipped: { path: string; reason: string }[];
}

/* ------------------------------------------------------------------ *
 * Pure analysis. No React, no DOM, no randomness: all of it unit-testable.
 * ------------------------------------------------------------------ */

type Adjacency = Map<string, Map<string, number>>;

/** Undirected weighted adjacency. Direction matters for reading the graph, not for clustering it. */
export function adjacencyOf(nodes: CodeNode[], edges: CodeEdge[]): Adjacency {
  const adj: Adjacency = new Map(nodes.map((n) => [n.id, new Map<string, number>()]));
  for (const e of edges) {
    const a = adj.get(e.source);
    const b = adj.get(e.target);
    if (!a || !b || e.source === e.target) continue;
    a.set(e.target, (a.get(e.target) ?? 0) + 1);
    b.set(e.source, (b.get(e.source) ?? 0) + 1);
  }
  return adj;
}

/** Number of distinct neighbours. The headline number of the `expliquer` panel. */
export function degreesOf(nodes: CodeNode[], edges: CodeEdge[]): Record<string, number> {
  const adj = adjacencyOf(nodes, edges);
  const out: Record<string, number> = {};
  for (const [id, neighbours] of adj) out[id] = neighbours.size;
  return out;
}

/**
 * Community detection by label propagation.
 *
 * Leiden would give slightly tidier clusters, but it needs a library and a random seed.
 * Label propagation on a sorted node list is deterministic — same graph, same colours,
 * every run — which matters far more here: a map whose legend changes on refresh
 * teaches nobody anything. Ties are broken on the lexicographically smallest label.
 */
export function detectCommunities(
  nodes: CodeNode[],
  edges: CodeEdge[],
  options: { passes?: number } = {},
): CodeCommunity[] {
  const passes = options.passes ?? 20;
  const adj = adjacencyOf(nodes, edges);
  const ordered = [...nodes].map((n) => n.id).sort();
  const label = new Map(ordered.map((id) => [id, id]));

  // On a big graph a few shared modules (entities, enums, base repositories) are linked to
  // a tenth of everything. Letting them vote glues all their users into one blob, so they
  // sit out the vote and join the plurality of their neighbours afterwards. Small graphs
  // keep the plain algorithm.
  const hubCutoff =
    ordered.length >= 100 ? Math.ceil(ordered.length * 0.1) : Number.POSITIVE_INFINITY;
  const hubs = new Set(ordered.filter((id) => (adj.get(id)?.size ?? 0) > hubCutoff));

  for (let pass = 0; pass < passes; pass += 1) {
    let moved = false;
    for (const id of ordered) {
      if (hubs.has(id)) continue;
      const neighbours = adj.get(id);
      if (!neighbours?.size) continue;
      const score = new Map<string, number>();
      for (const [other, weight] of neighbours) {
        if (hubs.has(other)) continue;
        const l = label.get(other);
        if (!l) continue;
        score.set(l, (score.get(l) ?? 0) + weight);
      }
      let best = label.get(id) ?? id;
      let bestScore = score.get(best) ?? 0;
      for (const [candidate, value] of [...score].sort((a, b) => a[0].localeCompare(b[0]))) {
        if (value > bestScore) {
          best = candidate;
          bestScore = value;
        }
      }
      if (best !== label.get(id)) {
        label.set(id, best);
        moved = true;
      }
    }
    if (!moved) break;
  }

  for (const id of ordered) {
    if (!hubs.has(id)) continue;
    const score = new Map<string, number>();
    for (const [other, weight] of adj.get(id) ?? []) {
      if (hubs.has(other)) continue;
      const l = label.get(other);
      if (l) score.set(l, (score.get(l) ?? 0) + weight);
    }
    let best = id;
    let bestScore = 0;
    for (const [candidate, value] of [...score].sort((a, b) => a[0].localeCompare(b[0]))) {
      if (value > bestScore) {
        best = candidate;
        bestScore = value;
      }
    }
    label.set(id, best);
  }

  const degree = degreesOf(nodes, edges);
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const groups = new Map<string, string[]>();
  for (const id of ordered) {
    const key = label.get(id) ?? id;
    const bucket = groups.get(key);
    if (bucket) bucket.push(id);
    else groups.set(key, [id]);
  }

  // Biggest first; on equal size the label decides, so the order never wobbles.
  const sorted = [...groups.entries()].sort(
    (a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]),
  );

  return sorted.map(([key, memberIds], rank) => {
    const hub =
      [...memberIds].sort(
        (a, b) =>
          (degree[b] ?? 0) - (degree[a] ?? 0) ||
          (byId.get(a)?.label ?? a).localeCompare(byId.get(b)?.label ?? b),
      )[0] ?? key;
    return {
      id: key,
      label: byId.get(hub)?.label ?? hub,
      size: memberIds.length,
      rank,
      memberIds,
    };
  });
}

/** Community id for every node, so the canvas can colour in one lookup. */
export function communityOfNode(communities: CodeCommunity[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const c of communities) for (const id of c.memberIds) out[id] = c.id;
  return out;
}

export interface GodNode {
  nodeId: string;
  label: string;
  degree: number;
  communityId: string;
}

/**
 * The most connected symbols: what everything flows through.
 *
 * Utility hubs — a logger, a constants file — are connected to everything and tell you
 * nothing, so `excludeKinds` lets the caller drop them rather than pretending they are
 * architecture.
 */
export function godNodes(
  nodes: CodeNode[],
  edges: CodeEdge[],
  communities: CodeCommunity[],
  options: { limit?: number; excludeKinds?: CodeNodeKind[] } = {},
): GodNode[] {
  const limit = options.limit ?? 8;
  const excluded = new Set(options.excludeKinds ?? []);
  const degree = degreesOf(nodes, edges);
  const community = communityOfNode(communities);
  return nodes
    .filter((n) => !excluded.has(n.kind))
    .map((n) => ({
      nodeId: n.id,
      label: n.label,
      degree: degree[n.id] ?? 0,
      communityId: community[n.id] ?? "",
    }))
    .sort((a, b) => b.degree - a.degree || a.label.localeCompare(b.label))
    .slice(0, limit);
}

export interface CodePath {
  nodeIds: string[];
  edgeIds: string[];
  hops: number;
}

/**
 * Shortest path between two symbols, direction ignored.
 *
 * "How does the controller end up touching the ledger table" is a question about
 * reachability, not about call direction, and answering it only downstream would hide
 * the half of the answer that travels back up.
 */
export function shortestPath(
  nodes: CodeNode[],
  edges: CodeEdge[],
  fromId: string,
  toId: string,
): CodePath | null {
  if (fromId === toId) return { nodeIds: [fromId], edgeIds: [], hops: 0 };
  const links = new Map<string, { to: string; edgeId: string }[]>(nodes.map((n) => [n.id, []]));
  for (const e of edges) {
    links.get(e.source)?.push({ to: e.target, edgeId: e.id });
    links.get(e.target)?.push({ to: e.source, edgeId: e.id });
  }
  if (!links.has(fromId) || !links.has(toId)) return null;

  const cameFrom = new Map<string, { node: string; edgeId: string }>();
  const seen = new Set([fromId]);
  let frontier = [fromId];

  while (frontier.length) {
    const next: string[] = [];
    for (const current of frontier) {
      // Sorted so that two equally short paths always resolve to the same one.
      const outgoing = [...(links.get(current) ?? [])].sort((a, b) => a.to.localeCompare(b.to));
      for (const { to, edgeId } of outgoing) {
        if (seen.has(to)) continue;
        seen.add(to);
        cameFrom.set(to, { node: current, edgeId });
        if (to === toId) {
          const nodeIds = [to];
          const edgeIds = [edgeId];
          let cursor = current;
          while (cursor !== fromId) {
            const step = cameFrom.get(cursor);
            if (!step) break;
            nodeIds.unshift(cursor);
            edgeIds.unshift(step.edgeId);
            cursor = step.node;
          }
          nodeIds.unshift(fromId);
          return { nodeIds, edgeIds, hops: edgeIds.length };
        }
        next.push(to);
      }
    }
    frontier = next;
  }
  return null;
}

export interface CodeConnection {
  edgeId: string;
  direction: "out" | "in";
  otherId: string;
  otherLabel: string;
  kind: CodeEdgeKind;
  confidence: CodeConfidence;
  note?: string;
}

export interface CodeExplanation {
  node: CodeNode;
  communityId: string;
  communityLabel: string;
  degree: number;
  connections: CodeConnection[];
  /** Documents, ADRs and `// POURQUOI:` comments attached to this symbol. */
  rationale: CodeNode[];
}

/** Everything the inspector shows about one symbol, assembled away from the UI. */
export function explainNode(
  graph: Pick<CodeGraph, "nodes" | "edges">,
  communities: CodeCommunity[],
  nodeId: string,
): CodeExplanation | null {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const node = byId.get(nodeId);
  if (!node) return null;
  const community = communities.find((c) => c.memberIds.includes(nodeId));

  const connections: CodeConnection[] = [];
  for (const e of graph.edges) {
    if (e.source !== nodeId && e.target !== nodeId) continue;
    const out = e.source === nodeId;
    const otherId = out ? e.target : e.source;
    connections.push({
      edgeId: e.id,
      direction: out ? "out" : "in",
      otherId,
      otherLabel: byId.get(otherId)?.label ?? otherId,
      kind: e.kind,
      confidence: e.confidence,
      note: e.note,
    });
  }
  // Extracted links first: a reader should meet the facts before the guesses.
  connections.sort(
    (a, b) =>
      Number(a.confidence === "inferred") - Number(b.confidence === "inferred") ||
      a.otherLabel.localeCompare(b.otherLabel),
  );

  const narrativeKinds = new Set<CodeNodeKind>(["doc", "adr", "rationale"]);
  const rationale = connections
    .map((c) => byId.get(c.otherId))
    .filter((n): n is CodeNode => !!n && narrativeKinds.has(n.kind));

  return {
    node,
    communityId: community?.id ?? "",
    communityLabel: community?.label ?? "—",
    degree: new Set(connections.map((c) => c.otherId)).size,
    connections,
    rationale: [...new Map(rationale.map((n) => [n.id, n])).values()],
  };
}

/** Share of the links that were read from the source rather than resolved by heuristic. */
export function confidenceMix(edges: CodeEdge[]): Record<CodeConfidence, number> {
  const mix: Record<CodeConfidence, number> = { extracted: 0, inferred: 0 };
  for (const e of edges) mix[e.confidence] += 1;
  return mix;
}
