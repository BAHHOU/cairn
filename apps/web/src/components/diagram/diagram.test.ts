import { computeBlastRadius, findCycles } from "@cairn/shared";
import { describe, expect, it } from "vitest";
import { ARCHITECTURES } from "../../lib/api/architecture-data";
import { autoLayout } from "./layout";
import { toMermaid } from "./to-mermaid";
import { parseGraphState, serializeGraphState } from "./use-graph-state";
import { isDataEdge, projectGraph } from "./views";

const graph = ARCHITECTURES["qis-dist-cms"];
if (!graph) throw new Error("flagship architecture missing from the seed");

describe("seed", () => {
  it("is dense enough to be worth a diagram", () => {
    expect(graph.nodes.length).toBeGreaterThanOrEqual(25);
    expect(graph.edges.length).toBeGreaterThanOrEqual(40);
  });

  it("never points an edge at a node that does not exist", () => {
    const ids = new Set(graph.nodes.map((n) => n.id));
    for (const e of graph.edges) {
      expect(ids.has(e.source), `${e.id} source ${e.source}`).toBe(true);
      expect(ids.has(e.target), `${e.id} target ${e.target}`).toBe(true);
    }
  });

  it("shows an honest provenance mix, not a wall of 'extracted'", () => {
    const kinds = new Set(graph.nodes.map((n) => n.provenance));
    expect(kinds.size).toBe(3);
  });

  it("anchors every violation on an edge that really breaks the contract", () => {
    const byId = new Map(graph.nodes.map((n) => [n.id, n]));
    const forbidden = new Set(graph.contract.forbidden.map((r) => `${r.from}->${r.to}`));
    expect(graph.violations.length).toBeGreaterThanOrEqual(2);
    for (const v of graph.violations) {
      const edge = graph.edges.find((e) => e.id === v.edgeId);
      expect(edge, `violation ${v.id} has no edge`).toBeDefined();
      const from = byId.get(v.sourceId)?.layer;
      const to = byId.get(v.targetId)?.layer;
      expect(forbidden.has(`${from}->${to}`), `${from}->${to} is not forbidden`).toBe(true);
    }
  });
});

describe("projectGraph", () => {
  it("collapses the whole system into a single box in the context view", () => {
    const view = projectGraph(graph, "contexte");
    expect(view.nodes.some((n) => n.id === "sys-qis")).toBe(true);
    expect(view.nodes.some((n) => n.id === "cmp-rest")).toBe(false);
    // Only the system and what sits outside it.
    expect(view.nodes.every((n) => n.id === "sys-qis" || n.layer === "externe")).toBe(true);
  });

  it("shows deployable units, with the queues folded into their broker", () => {
    const view = projectGraph(graph, "conteneurs");
    expect(view.nodes.some((n) => n.id === "app-api")).toBe(true);
    expect(view.nodes.some((n) => n.id === "mq-broker")).toBe(true);
    expect(view.nodes.some((n) => n.id === "mq-in")).toBe(false);
    expect(view.representative["cmp-rest"]).toBe("app-api");
    // The system box has no edges of its own at this level, so it is dropped.
    expect(view.nodes.some((n) => n.id === "sys-qis")).toBe(false);
  });

  it("keeps only data-carrying links in the flow view", () => {
    const view = projectGraph(graph, "flux");
    expect(view.edges.length).toBeGreaterThan(0);
    for (const e of view.edges) expect(isDataEdge(e)).toBe(true);
    // The build chain carries no business data.
    expect(view.nodes.some((n) => n.id === "ci-gitlab")).toBe(false);
  });

  it("never keeps an edge whose two ends folded into the same box", () => {
    for (const view of ["contexte", "conteneurs", "flux", "impact"] as const) {
      const projected = projectGraph(graph, view);
      for (const e of projected.edges) expect(e.source).not.toBe(e.target);
    }
  });

  it("restricts the graph to the requested layers", () => {
    const view = projectGraph(graph, "impact", { layers: ["domaine", "infrastructure"] });
    expect(view.nodes.length).toBeGreaterThan(0);
    for (const n of view.nodes) expect(["domaine", "infrastructure"]).toContain(n.layer);
  });

  it("keeps the neighbours of a search hit, because a lone box explains nothing", () => {
    const view = projectGraph(graph, "impact", { search: "MtMapper" });
    expect(view.nodes.some((n) => n.id === "cmp-mapper")).toBe(true);
    expect(view.nodes.length).toBeGreaterThan(1);
  });

  it("marks a folded edge as violating when any of its parts is", () => {
    const view = projectGraph(graph, "impact");
    const edge = view.edges.find((e) => e.mergedIds.includes("e18"));
    expect(edge?.violating).toBe(true);
  });
});

describe("impact", () => {
  it("travels in both directions: breaking a queue breaks its producers too", () => {
    const radius = computeBlastRadius(graph, "mq-in");
    expect(radius.hops["inj-sender"]).toBe(1);
    expect(radius.hops["cmp-mqlistener"]).toBe(1);
  });

  it("crosses repository boundaries", () => {
    const radius = computeBlastRadius(graph, "cmp-service");
    expect(radius.impactedRepoIds).toContain("qis-job");
  });

  it("returns an empty radius for an unknown node rather than throwing", () => {
    const radius = computeBlastRadius(graph, "nope");
    expect(radius.hops).toEqual({});
  });

  it("finds the cycle the contract violation created", () => {
    const cycles = findCycles(graph.edges);
    const flat = cycles.map((c) => [...c].sort().join(","));
    expect(flat.some((c) => c.includes("cmp-mapper") && c.includes("cmp-rest"))).toBe(true);
  });
});

describe("layout", () => {
  it("gives every node a distinct position", () => {
    const view = projectGraph(graph, "conteneurs");
    const positions = autoLayout(view.nodes, view.edges);
    expect(Object.keys(positions)).toHaveLength(view.nodes.length);
    const seen = new Set(Object.values(positions).map((p) => `${p.x}:${p.y}`));
    expect(seen.size).toBe(view.nodes.length);
  });
});

describe("toMermaid", () => {
  it("produces a flowchart whose nodes and links are all declared", () => {
    const view = projectGraph(graph, "conteneurs");
    const text = toMermaid(view, "test");
    expect(text).toContain("flowchart LR");
    for (const n of view.nodes) expect(text).toContain(n.id.replace(/[^a-zA-Z0-9_]/g, "_"));
    expect(text.split("\n").filter((l) => l.includes("-->") || l.includes("-.->")).length).toBe(
      view.edges.length,
    );
  });

  it("escapes quotes so the generated block stays parseable", () => {
    const view = projectGraph(graph, "flux");
    const text = toMermaid(view, 'un "titre" risqué');
    expect(text).not.toMatch(/%% .*".*"/);
  });
});

describe("graph state in the URL", () => {
  it("survives a round trip, so a shared link reopens the same diagram", () => {
    const state = {
      view: "flux",
      node: "mq-in",
      layers: ["domaine", "infrastructure"],
      search: "mapper",
      crossRepoOnly: true,
      panel: "violations",
      fullscreen: true,
    } as const;
    expect(parseGraphState(serializeGraphState({ ...state, layers: [...state.layers] }))).toEqual(
      state,
    );
  });

  it("writes nothing for a default view, so a plain link stays readable", () => {
    const params = serializeGraphState({
      view: "conteneurs",
      node: null,
      layers: [],
      search: "",
      crossRepoOnly: false,
      panel: null,
      fullscreen: false,
    });
    expect(params.toString()).toBe("");
  });

  it("opens full screen straight from the link", () => {
    expect(parseGraphState(new URLSearchParams("plein=1")).fullscreen).toBe(true);
    expect(parseGraphState(new URLSearchParams("")).fullscreen).toBe(false);
  });
});
