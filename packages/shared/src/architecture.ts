import type { Severity } from "./domain";

/**
 * One graph, several projections.
 *
 * The architecture is stored once, as nodes and edges extracted from the repository.
 * Every view in the UI is a pure selector over this single graph, never a separate
 * drawing: a diagram that can drift from the code is worse than no diagram at all.
 */

export const ARCH_VIEWS = ["contexte", "conteneurs", "flux", "impact"] as const;
export type ArchView = (typeof ARCH_VIEWS)[number];

export const ARCH_LAYERS = [
  "experience",
  "application",
  "domaine",
  "infrastructure",
  "externe",
] as const;
export type ArchLayer = (typeof ARCH_LAYERS)[number];

export const ARCH_NODE_KINDS = [
  "system",
  "service",
  "component",
  "datastore",
  "queue",
  "external",
  "actor",
  "pipeline",
  "deployment",
] as const;
export type ArchNodeKind = (typeof ARCH_NODE_KINDS)[number];

/**
 * How we know this. `extracted` comes from a file we parsed, `inferred` from a heuristic,
 * `declared` from a human. The legend only means something if the mix is honest.
 */
export const ARCH_PROVENANCES = ["extracted", "inferred", "declared"] as const;
export type ArchProvenance = (typeof ARCH_PROVENANCES)[number];

/** The exact place in the repository a node or an edge was derived from. */
export interface ArchSource {
  repoId: string;
  path: string;
  line?: number;
  note?: string;
}

export interface ArchLink {
  id: string;
  title: string;
  href?: string;
}

export interface ArchNode {
  id: string;
  label: string;
  kind: ArchNodeKind;
  layer: ArchLayer;
  /** Modelled from day one: blast radius has to be able to leave the repository. */
  repoId: string;
  /** Containers own components. Used by nesting and by the impact view. */
  parentId?: string;
  description: string;
  tech: string[];
  provenance: ArchProvenance;
  sources: ArchSource[];
  docs?: ArchLink[];
  adrs?: ArchLink[];
  /** Open issues attached to the code behind this node. */
  issueIds?: string[];
}

export const ARCH_EDGE_KINDS = ["sync", "async", "data", "build", "deploy"] as const;
export type ArchEdgeKind = (typeof ARCH_EDGE_KINDS)[number];

export const ARCH_PAYLOADS = [
  "mt-message",
  "rest-json",
  "sql",
  "event",
  "config",
  "artifact",
] as const;
export type ArchPayload = (typeof ARCH_PAYLOADS)[number];

/** Edges that actually move business data. The flow view is exactly this set. */
export const DATA_EDGE_KINDS: readonly ArchEdgeKind[] = ["async", "data", "sync"];

export interface ArchEdge {
  id: string;
  source: string;
  target: string;
  kind: ArchEdgeKind;
  label: string;
  payload?: ArchPayload;
  /** True when the two ends do not live in the same repository. */
  crossRepo: boolean;
  provenance: ArchProvenance;
  sources: ArchSource[];
}

export interface ArchViolation {
  id: string;
  rule: string;
  severity: Severity;
  sourceId: string;
  targetId: string;
  /** Edge the violation sits on, so clicking a violation can highlight it. */
  edgeId?: string;
  explanation: string;
  proposedFix: string;
  /** The merge request that introduced the violation. Blame the change, not the person. */
  introducedBy?: {
    ref: string;
    title: string;
    date: string;
  };
}

export interface ArchLayerRule {
  from: ArchLayer;
  to: ArchLayer;
  reason: string;
}

export interface ArchitectureContract {
  /** Ordered from the outside in. */
  layers: { id: ArchLayer; label: string; description: string }[];
  forbidden: ArchLayerRule[];
  validatedBy: string;
  validatedAt: string;
}

export interface ProjectArchitecture {
  projectId: string;
  /** Every repository the graph spans. Single-repo today, more than one later. */
  repos: { id: string; name: string; provider: string }[];
  commit: string;
  generatedAt: string;
  nodes: ArchNode[];
  edges: ArchEdge[];
  contract: ArchitectureContract;
  violations: ArchViolation[];
}

export interface BlastRadius {
  rootId: string;
  /** Node id to number of hops from the root. The root itself is 0. */
  hops: Record<string, number>;
  edgeIds: string[];
  impactedRepoIds: string[];
  impactedIssueIds: string[];
  /** Nodes reached in a single hop, named so the inspector can list them first. */
  directIds: string[];
}

/**
 * Breadth-first walk over the undirected graph.
 *
 * Direction is deliberately ignored: if a queue feeds a consumer, changing the queue
 * breaks the consumer, and changing the consumer's contract breaks the producer.
 * Impact travels both ways.
 */
export function computeBlastRadius(
  graph: Pick<ProjectArchitecture, "nodes" | "edges">,
  rootId: string,
  maxHops = 3,
): BlastRadius {
  const empty: BlastRadius = {
    rootId,
    hops: {},
    edgeIds: [],
    impactedRepoIds: [],
    impactedIssueIds: [],
    directIds: [],
  };
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  if (!byId.has(rootId)) return empty;

  const neighbours = new Map<string, { nodeId: string; edgeId: string }[]>();
  const link = (from: string, to: string, edgeId: string) => {
    const list = neighbours.get(from);
    if (list) list.push({ nodeId: to, edgeId });
    else neighbours.set(from, [{ nodeId: to, edgeId }]);
  };
  for (const e of graph.edges) {
    if (!byId.has(e.source) || !byId.has(e.target)) continue;
    link(e.source, e.target, e.id);
    link(e.target, e.source, e.id);
  }

  const hops: Record<string, number> = { [rootId]: 0 };
  const edgeIds = new Set<string>();
  const directIds: string[] = [];
  let frontier = [rootId];

  for (let depth = 1; depth <= maxHops && frontier.length > 0; depth += 1) {
    const next: string[] = [];
    for (const current of frontier) {
      for (const { nodeId, edgeId } of neighbours.get(current) ?? []) {
        edgeIds.add(edgeId);
        if (hops[nodeId] !== undefined) continue;
        hops[nodeId] = depth;
        if (depth === 1) directIds.push(nodeId);
        next.push(nodeId);
      }
    }
    frontier = next;
  }

  const repoIds = new Set<string>();
  const issueIds = new Set<string>();
  for (const id of Object.keys(hops)) {
    const node = byId.get(id);
    if (!node) continue;
    repoIds.add(node.repoId);
    for (const issueId of node.issueIds ?? []) issueIds.add(issueId);
  }

  return {
    rootId,
    hops,
    edgeIds: [...edgeIds],
    impactedRepoIds: [...repoIds],
    impactedIssueIds: [...issueIds],
    directIds,
  };
}

/** Cycles in the dependency graph. Directed, unlike blast radius. */
export function findCycles(edges: Pick<ArchEdge, "id" | "source" | "target">[]): string[][] {
  const out = new Map<string, { to: string; id: string }[]>();
  for (const e of edges) {
    const list = out.get(e.source);
    if (list) list.push({ to: e.target, id: e.id });
    else out.set(e.source, [{ to: e.target, id: e.id }]);
  }

  const cycles: string[][] = [];
  const seen = new Set<string>();
  const onPath = new Set<string>();
  const path: string[] = [];

  const walk = (id: string) => {
    seen.add(id);
    onPath.add(id);
    path.push(id);
    for (const { to } of out.get(id) ?? []) {
      if (onPath.has(to)) {
        const start = path.indexOf(to);
        if (start >= 0) cycles.push(path.slice(start));
      } else if (!seen.has(to)) {
        walk(to);
      }
    }
    onPath.delete(id);
    path.pop();
  };

  for (const id of out.keys()) if (!seen.has(id)) walk(id);
  return cycles;
}
