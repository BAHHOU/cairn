import type { TopologyEdge, TopologyLane, TopologyNode, TopologyView } from "@cairn/shared";
import { TOPOLOGY_LANES } from "@cairn/shared";

export const NODE_W = 216;
export const NODE_H = 76;
export const GAP_X = 100;
export const GAP_Y = 22;
export const PAD = 16;
export const HEAD = 58;
const LANE_INSET = 12;

export interface PlacedNode {
  node: TopologyNode;
  x: number;
  y: number;
}

type Side = "l" | "r" | "t" | "b";

export interface PlacedEdge {
  edge: TopologyEdge;
  /** The side of each node the link leaves and enters by. */
  fromSide: Side;
  toSide: Side;
  /** SVG path, from the source node to the target node. */
  d: string;
  /** Where the label sits: the middle of the curve. */
  lx: number;
  ly: number;
  /** The label is pushed to the right of the point, for the vertical links of a column. */
  labelAnchor: "middle" | "start";
}

export interface PlacedLane {
  lane: TopologyLane;
  x: number;
  width: number;
  count: number;
}

export interface TopologyLayout {
  width: number;
  height: number;
  lanes: PlacedLane[];
  nodes: PlacedNode[];
  edges: PlacedEdge[];
}

interface Route {
  edge: TopologyEdge;
  from: PlacedNode;
  to: PlacedNode;
  fromSide: Side;
  toSide: Side;
  sameLane: boolean;
}

/**
 * Columns left to right in the order of the lanes (an empty lane takes no room), nodes stacked in the
 * order the scan gave them. Links leave by the side that faces their target, and several links on one
 * side are spread along it so they do not run on top of each other.
 */
export function layoutTopology(view: TopologyView): TopologyLayout {
  const lanes = TOPOLOGY_LANES.filter((lane) => view.nodes.some((n) => n.lane === lane));
  const laneIndex = new Map<TopologyLane, number>(lanes.map((lane, i) => [lane, i]));

  const rows = new Map<TopologyLane, number>();
  const placed = new Map<string, PlacedNode>();
  const order = new Map<string, number>();
  for (const node of view.nodes) {
    const column = laneIndex.get(node.lane) ?? 0;
    const row = rows.get(node.lane) ?? 0;
    rows.set(node.lane, row + 1);
    order.set(node.id, row);
    placed.set(node.id, {
      node,
      x: PAD + LANE_INSET + column * (NODE_W + GAP_X),
      y: PAD + HEAD + row * (NODE_H + GAP_Y),
    });
  }

  const tallest = Math.max(1, ...rows.values());
  const height = PAD * 2 + HEAD + tallest * NODE_H + (tallest - 1) * GAP_Y + LANE_INSET;
  const width = PAD * 2 + LANE_INSET * 2 + lanes.length * NODE_W + (lanes.length - 1) * GAP_X;

  const routes: Route[] = [];
  for (const edge of view.edges) {
    const from = placed.get(edge.from);
    const to = placed.get(edge.to);
    if (!from || !to) continue;
    const fl = laneIndex.get(from.node.lane) ?? 0;
    const tl = laneIndex.get(to.node.lane) ?? 0;
    let fromSide: Side;
    let toSide: Side;
    if (fl === tl) {
      const gap = (order.get(edge.to) ?? 0) - (order.get(edge.from) ?? 0);
      if (Math.abs(gap) === 1) {
        fromSide = gap > 0 ? "b" : "t";
        toSide = gap > 0 ? "t" : "b";
      } else {
        fromSide = "r";
        toSide = "r";
      }
    } else if (fl < tl) {
      fromSide = "r";
      toSide = "l";
    } else {
      fromSide = "l";
      toSide = "r";
    }
    routes.push({ edge, from, to, fromSide, toSide, sameLane: fl === tl });
  }

  // Ports: every (node, side) with several links spreads them, ordered by where the other end is.
  const ports = new Map<string, { key: string; other: number }[]>();
  const addPort = (node: PlacedNode, side: Side, key: string, other: PlacedNode) => {
    const k = `${node.node.id}:${side}`;
    const list = ports.get(k) ?? [];
    list.push({ key, other: other.y + other.x / 1000 });
    ports.set(k, list);
  };
  for (const r of routes) {
    addPort(r.from, r.fromSide, `${r.edge.id}:from`, r.to);
    addPort(r.to, r.toSide, `${r.edge.id}:to`, r.from);
  }
  const portPoint = (node: PlacedNode, side: Side, key: string) => {
    const list = (ports.get(`${node.node.id}:${side}`) ?? []).sort((a, b) => a.other - b.other);
    const i = Math.max(
      0,
      list.findIndex((p) => p.key === key),
    );
    const t = (i + 1) / (list.length + 1);
    switch (side) {
      case "r":
        return { x: node.x + NODE_W, y: node.y + NODE_H * t };
      case "l":
        return { x: node.x, y: node.y + NODE_H * t };
      case "t":
        return { x: node.x + NODE_W * t, y: node.y };
      case "b":
        return { x: node.x + NODE_W * t, y: node.y + NODE_H };
    }
  };

  const edges: PlacedEdge[] = routes.map((r) => {
    const a = portPoint(r.from, r.fromSide, `${r.edge.id}:from`);
    const b = portPoint(r.to, r.toSide, `${r.edge.id}:to`);
    let c1: { x: number; y: number };
    let c2: { x: number; y: number };
    if (r.sameLane && r.fromSide === "r") {
      const bow = 34 + Math.min(40, Math.abs(b.y - a.y) * 0.12);
      c1 = { x: a.x + bow, y: a.y };
      c2 = { x: b.x + bow, y: b.y };
    } else if (r.fromSide === "b" || r.fromSide === "t") {
      const d = Math.max(10, Math.abs(b.y - a.y) / 2);
      const s = r.fromSide === "b" ? 1 : -1;
      c1 = { x: a.x, y: a.y + s * d };
      c2 = { x: b.x, y: b.y - s * d };
    } else {
      const d = Math.max(36, Math.abs(b.x - a.x) / 2);
      const s = r.fromSide === "r" ? 1 : -1;
      c1 = { x: a.x + s * d, y: a.y };
      c2 = { x: b.x - s * d, y: b.y };
    }
    const mid = (p: number, q: number, u: number, v: number) => (p + 3 * q + 3 * u + v) / 8;
    const vertical = r.fromSide === "b" || r.fromSide === "t";
    return {
      edge: r.edge,
      fromSide: r.fromSide,
      toSide: r.toSide,
      d: `M${a.x},${a.y} C${c1.x},${c1.y} ${c2.x},${c2.y} ${b.x},${b.y}`,
      lx: mid(a.x, c1.x, c2.x, b.x) + (vertical ? 8 : 0),
      ly: mid(a.y, c1.y, c2.y, b.y),
      labelAnchor: vertical ? "start" : "middle",
    };
  });

  return {
    width: width + (routes.some((r) => r.sameLane && r.fromSide === "r") ? 56 : 0),
    height,
    lanes: lanes.map((lane, i) => ({
      lane,
      x: PAD + i * (NODE_W + GAP_X),
      width: NODE_W + LANE_INSET * 2,
      count: rows.get(lane) ?? 0,
    })),
    nodes: [...placed.values()],
    edges,
  };
}
