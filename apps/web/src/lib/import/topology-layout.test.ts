import type { TopologyNode, TopologyView } from "@cairn/shared";
import { describe, expect, it } from "vitest";
import { layoutTopology, NODE_H, NODE_W } from "./topology-layout";

const node = (id: string, lane: TopologyNode["lane"]): TopologyNode => ({
  id,
  lane,
  label: id,
  role: "step",
  basis: "found",
});

const view: TopologyView = {
  nodes: [
    node("repo", "source"),
    node("ci", "pipeline"),
    node("build", "pipeline"),
    node("pack", "pipeline"),
    node("registry", "services"),
  ],
  edges: [
    { id: "repo->ci", from: "repo", to: "ci", basis: "found" },
    { id: "ci->build", from: "ci", to: "build", basis: "found" },
    { id: "ci->pack", from: "ci", to: "pack", basis: "inferred" },
    { id: "pack->registry", from: "pack", to: "registry", label: "publie", basis: "found" },
    { id: "ghost->ci", from: "ghost", to: "ci", basis: "found" },
  ],
  gaps: [],
};

describe("layoutTopology", () => {
  it("puts one column per lane that has nodes, left to right, and stacks nodes in a column", () => {
    const layout = layoutTopology(view);
    expect(layout.lanes.map((l) => l.lane)).toEqual(["source", "pipeline", "services"]);
    const at = (id: string) => layout.nodes.find((n) => n.node.id === id);
    expect(at("repo")?.x).toBeLessThan(at("ci")?.x ?? 0);
    expect(at("ci")?.x).toBeLessThan(at("registry")?.x ?? 0);
    expect(at("ci")?.x).toBe(at("build")?.x);
    expect(at("build")?.y).toBeGreaterThan((at("ci")?.y ?? 0) + NODE_H - 1);
    expect(layout.width).toBeGreaterThan(3 * NODE_W);
  });

  it("draws one path per link whose ends exist, and skips the others", () => {
    const layout = layoutTopology(view);
    expect(layout.edges.map((e) => e.edge.id)).toEqual([
      "repo->ci",
      "ci->build",
      "ci->pack",
      "pack->registry",
    ]);
    for (const e of layout.edges) expect(e.d).toMatch(/^M[\d.]+,[\d.]+ C/);
  });

  it("goes around a column for a link that skips a node", () => {
    const layout = layoutTopology(view);
    const skip = layout.edges.find((e) => e.edge.id === "ci->pack");
    const direct = layout.edges.find((e) => e.edge.id === "ci->build");
    const ci = layout.nodes.find((n) => n.node.id === "ci");
    // the direct link leaves by the bottom, the skipping one by the right side
    expect(direct?.d.startsWith(`M${(ci?.x ?? 0) + NODE_W / 2},${(ci?.y ?? 0) + NODE_H} `)).toBe(
      true,
    );
    expect(skip?.d.startsWith(`M${(ci?.x ?? 0) + NODE_W},`)).toBe(true);
  });
});
