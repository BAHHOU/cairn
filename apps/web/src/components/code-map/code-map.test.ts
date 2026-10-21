import {
  confidenceMix,
  degreesOf,
  detectCommunities,
  explainNode,
  godNodes,
  shortestPath,
} from "@cairn/shared";
import { describe, expect, it } from "vitest";
import { CODE_GRAPHS } from "../../lib/api/code-graph-data";
import { visibleGraph } from "./filters";
import { clusterLayout, colorOfRank, nodeSize } from "./layout";
import { parseCodeMapState, serializeCodeMapState } from "./use-code-map-state";

const graph = CODE_GRAPHS["qis-dist-cms"];
// A missing seed should fail loudly here rather than as sixty confusing assertions.
if (!graph) throw new Error("Le graphe de démonstration qis-dist-cms est introuvable.");
const communities = detectCommunities(graph.nodes, graph.edges);
const degrees = degreesOf(graph.nodes, graph.edges);
const firstCommunity = communities[0];
if (!firstCommunity) throw new Error("Aucune communauté détectée.");

describe("seed integrity", () => {
  it("has no dangling edge", () => {
    const ids = new Set(graph.nodes.map((n) => n.id));
    const dangling = graph.edges.filter((e) => !ids.has(e.source) || !ids.has(e.target));
    expect(dangling.map((e) => `${e.source}->${e.target}`)).toEqual([]);
  });

  it("gives every node a unique id", () => {
    expect(new Set(graph.nodes.map((n) => n.id)).size).toBe(graph.nodes.length);
  });

  it("explains every inferred link and never explains an extracted one", () => {
    for (const edge of graph.edges) {
      if (edge.confidence === "inferred") expect(edge.note, edge.id).toBeTruthy();
      else expect(edge.note, edge.id).toBeUndefined();
    }
  });

  it("keeps the mix honest: both kinds of link are present", () => {
    const mix = confidenceMix(graph.edges);
    expect(mix.extracted).toBeGreaterThan(0);
    expect(mix.inferred).toBeGreaterThan(0);
  });

  it("leaves no symbol unconnected", () => {
    const orphans = graph.nodes.filter((n) => (degrees[n.id] ?? 0) === 0);
    expect(orphans.map((n) => n.id)).toEqual([]);
  });
});

describe("community detection", () => {
  it("is deterministic across runs", () => {
    const again = detectCommunities(graph.nodes, graph.edges);
    expect(again.map((c) => [c.id, c.size])).toEqual(communities.map((c) => [c.id, c.size]));
  });

  it("does not depend on the order the nodes were written in", () => {
    const shuffled = [...graph.nodes].reverse();
    const other = detectCommunities(shuffled, [...graph.edges].reverse());
    expect(other.map((c) => c.label)).toEqual(communities.map((c) => c.label));
  });

  it("partitions the graph: every node once, no node twice", () => {
    const seen = communities.flatMap((c) => c.memberIds);
    expect(seen.length).toBe(graph.nodes.length);
    expect(new Set(seen).size).toBe(graph.nodes.length);
  });

  it("finds more than one subsystem and ranks them by size", () => {
    expect(communities.length).toBeGreaterThan(2);
    const sizes = communities.map((c) => c.size);
    expect([...sizes].sort((a, b) => b - a)).toEqual(sizes);
  });

  it("names a community after its most connected member", () => {
    for (const community of communities) {
      const best = Math.max(...community.memberIds.map((id) => degrees[id] ?? 0));
      const named = graph.nodes.find((n) => n.label === community.label);
      expect(named).toBeDefined();
      expect(degrees[named?.id ?? ""]).toBe(best);
    }
  });
});

describe("god nodes", () => {
  it("ranks by degree and respects the limit", () => {
    const gods = godNodes(graph.nodes, graph.edges, communities, { limit: 5 });
    expect(gods).toHaveLength(5);
    expect(gods.map((g) => g.degree)).toEqual([...gods.map((g) => g.degree)].sort((a, b) => b - a));
  });

  it("can drop utility hubs that are connected to everything", () => {
    const withExternals = godNodes(graph.nodes, graph.edges, communities, { limit: 20 });
    const without = godNodes(graph.nodes, graph.edges, communities, {
      limit: 20,
      excludeKinds: ["external"],
    });
    expect(withExternals.length).toBeGreaterThanOrEqual(without.length);
    expect(without.every((g) => !g.nodeId.startsWith("x-"))).toBe(true);
  });
});

describe("shortest path", () => {
  it("connects the controller to the table it ends up writing", () => {
    const path = shortestPath(graph.nodes, graph.edges, "c-msg-controller", "t-distribution");
    expect(path).not.toBeNull();
    expect(path?.nodeIds[0]).toBe("c-msg-controller");
    expect(path?.nodeIds.at(-1)).toBe("t-distribution");
    expect(path?.edgeIds).toHaveLength(path?.hops ?? -1);
  });

  it("is symmetric in length: direction does not change reachability", () => {
    const there = shortestPath(graph.nodes, graph.edges, "c-mt-parser", "t-audit-log");
    const back = shortestPath(graph.nodes, graph.edges, "t-audit-log", "c-mt-parser");
    expect(there?.hops).toBe(back?.hops);
  });

  it("returns a zero-hop path for a symbol and itself", () => {
    expect(shortestPath(graph.nodes, graph.edges, "c-amount", "c-amount")?.hops).toBe(0);
  });

  it("returns null rather than inventing a route to an unknown symbol", () => {
    expect(shortestPath(graph.nodes, graph.edges, "c-amount", "nope")).toBeNull();
  });
});

describe("explanation", () => {
  it("lists both directions and puts the facts before the guesses", () => {
    const explained = explainNode(graph, communities, "c-dist-controller");
    expect(explained).not.toBeNull();
    const confidences = explained?.connections.map((c) => c.confidence) ?? [];
    const firstInferred = confidences.indexOf("inferred");
    const lastExtracted = confidences.lastIndexOf("extracted");
    if (firstInferred >= 0) expect(firstInferred).toBeGreaterThan(lastExtracted);
    expect(explained?.connections.some((c) => c.direction === "in")).toBe(true);
    expect(explained?.connections.some((c) => c.direction === "out")).toBe(true);
  });

  it("surfaces the rationale attached to a symbol", () => {
    const explained = explainNode(graph, communities, "c-cutoff-policy");
    expect(explained?.rationale.map((r) => r.id)).toContain("r-cutoff");
  });

  it("agrees with the degree computed over the whole graph", () => {
    const explained = explainNode(graph, communities, "c-logger");
    expect(explained?.degree).toBe(degrees["c-logger"]);
  });
});

describe("filters", () => {
  it("hides a whole community without touching the rest", () => {
    const target = firstCommunity;
    const view = visibleGraph(graph, communities, {
      hidden: [target.id],
      kinds: [],
      search: "",
      extractedOnly: false,
    });
    expect(view.nodes.length).toBe(graph.nodes.length - target.size);
    expect(view.nodes.some((n) => target.memberIds.includes(n.id))).toBe(false);
  });

  it("keeps the neighbours of a search match, so a hit is never alone", () => {
    const view = visibleGraph(graph, communities, {
      hidden: [],
      kinds: [],
      search: "CutoffPolicy",
      extractedOnly: false,
    });
    // The rationale comment lives in the same file, so it matches on path — which is
    // the behaviour we want: searching a file name should surface what it contains.
    expect([...view.matched].sort()).toEqual(["c-cutoff-policy", "r-cutoff"]);
    expect(view.nodes.map((n) => n.id)).toContain("c-clock");
    expect(view.nodes.length).toBeGreaterThan(1);
  });

  it("drops every inferred link when only extracted ones are wanted", () => {
    const view = visibleGraph(graph, communities, {
      hidden: [],
      kinds: [],
      search: "",
      extractedOnly: true,
    });
    expect(view.edges.every((e) => e.confidence === "extracted")).toBe(true);
  });

  it("never keeps an edge whose end has been filtered out", () => {
    const view = visibleGraph(graph, communities, {
      hidden: [],
      kinds: ["table"],
      search: "",
      extractedOnly: false,
    });
    const ids = new Set(view.nodes.map((n) => n.id));
    expect(view.edges.every((e) => ids.has(e.source) && ids.has(e.target))).toBe(true);
  });
});

describe("layout", () => {
  it("places every visible node exactly once", () => {
    const { positions } = clusterLayout(graph.nodes, graph.edges, communities, degrees);
    expect(Object.keys(positions).sort()).toEqual(graph.nodes.map((n) => n.id).sort());
  });

  it("is stable: the same graph produces the same drawing", () => {
    const a = clusterLayout(graph.nodes, graph.edges, communities, degrees);
    const b = clusterLayout(graph.nodes, graph.edges, communities, degrees);
    expect(a.positions).toEqual(b.positions);
  });

  it("keeps a community inside its own halo", () => {
    const { positions, hulls } = clusterLayout(graph.nodes, graph.edges, communities, degrees);
    for (const hull of hulls) {
      const members = communities.find((c) => c.id === hull.id)?.memberIds ?? [];
      for (const id of members) {
        const placed = positions[id];
        if (!placed) continue;
        const dx = placed.x + placed.size / 2 - hull.x;
        const dy = placed.y + placed.size / 2 - hull.y;
        expect(Math.hypot(dx, dy)).toBeLessThanOrEqual(hull.radius);
      }
    }
  });

  it("grows a dot with its degree", () => {
    expect(nodeSize(20)).toBeGreaterThan(nodeSize(2));
  });

  it("reuses the palette past its last colour rather than running out", () => {
    expect(colorOfRank(10)).toBe(colorOfRank(0));
  });
});

describe("url state", () => {
  it("round-trips a full selection", () => {
    const state = {
      node: "c-mt-parser",
      search: "Mt",
      hidden: ["c-logger"],
      kinds: ["class" as const],
      extractedOnly: true,
      from: "c-dist-controller",
      to: "t-distribution",
      fullscreen: true,
    };
    expect(parseCodeMapState(serializeCodeMapState(state))).toEqual(state);
  });

  it("writes nothing for a default view, so a plain link stays plain", () => {
    const state = parseCodeMapState(new URLSearchParams());
    expect(serializeCodeMapState(state).toString()).toBe("");
  });

  it("ignores a node kind it does not know", () => {
    expect(parseCodeMapState(new URLSearchParams("types=class,licorne")).kinds).toEqual(["class"]);
  });
});
