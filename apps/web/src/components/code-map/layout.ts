import type { CodeCommunity, CodeEdge, CodeNode } from "@cairn/shared";

export interface Placed {
  x: number;
  y: number;
  /** Diameter in pixels. Grows with degree, so the hubs are visible before you read them. */
  size: number;
}

export interface ClusterLayout {
  positions: Record<string, Placed>;
  /** One halo per community, for the background behind the dots. */
  hulls: { id: string; x: number; y: number; radius: number }[];
}

const RING_GAP = 68;
const COMMUNITY_GAP = 170;

/** A dot big enough to click, bigger when the symbol is connected to everything. */
export function nodeSize(degree: number): number {
  return Math.round(14 + Math.sqrt(degree) * 7);
}

/**
 * Deterministic cluster layout.
 *
 * A force simulation looks livelier, but it settles differently on every run: the same
 * commit would produce a different picture each time you opened it, and nobody can
 * build a mental map of something that moves. So communities are packed as discs —
 * hub at the centre, then concentric rings by decreasing degree — and the discs are
 * laid around a circle with room proportional to their size. Same graph, same drawing,
 * and the whole thing stays a pure function we can assert on.
 */
export function clusterLayout(
  nodes: CodeNode[],
  edges: CodeEdge[],
  communities: CodeCommunity[],
  degrees: Record<string, number>,
): ClusterLayout {
  void edges;
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const visible = communities
    .map((c) => ({ ...c, memberIds: c.memberIds.filter((id) => byId.has(id)) }))
    .filter((c) => c.memberIds.length > 0);

  // Lay each community out around its own origin first, so its radius is known before
  // we decide where to put it.
  const discs = visible.map((community) => {
    const members = [...community.memberIds].sort(
      (a, b) =>
        (degrees[b] ?? 0) - (degrees[a] ?? 0) ||
        (byId.get(a)?.label ?? a).localeCompare(byId.get(b)?.label ?? b),
    );

    const local: { id: string; x: number; y: number; size: number }[] = [];
    let index = 0;
    let ring = 0;
    let radius = 0;

    while (index < members.length) {
      // Ring 0 is the hub alone; after that each ring holds six more slots than the last.
      const capacity = ring === 0 ? 1 : ring * 6;
      const ringRadius = ring * RING_GAP;
      const slots = Math.min(capacity, members.length - index);
      for (let slot = 0; slot < slots; slot += 1) {
        const id = members[index + slot];
        if (!id) continue;
        const angle = capacity === 1 ? 0 : (2 * Math.PI * slot) / capacity;
        const size = nodeSize(degrees[id] ?? 0);
        local.push({
          id,
          x: Math.cos(angle) * ringRadius,
          y: Math.sin(angle) * ringRadius,
          size,
        });
        radius = Math.max(radius, ringRadius + size / 2);
      }
      index += slots;
      ring += 1;
    }

    return { id: community.id, members: local, radius: radius + 24 };
  });

  // Circumference needed to seat every disc side by side, turned back into a radius.
  const needed = discs.reduce((sum, d) => sum + 2 * d.radius + COMMUNITY_GAP, 0);
  const orbit = discs.length <= 1 ? 0 : needed / (2 * Math.PI);

  const positions: Record<string, Placed> = {};
  const hulls: ClusterLayout["hulls"] = [];
  let travelled = 0;

  for (const disc of discs) {
    const arc = 2 * disc.radius + COMMUNITY_GAP;
    const angle = orbit === 0 ? 0 : ((travelled + arc / 2) / needed) * 2 * Math.PI;
    travelled += arc;
    const cx = Math.cos(angle) * orbit;
    const cy = Math.sin(angle) * orbit;
    hulls.push({ id: disc.id, x: cx, y: cy, radius: disc.radius });
    for (const member of disc.members) {
      positions[member.id] = {
        // React Flow anchors on the top-left corner; everything above is centre-based.
        x: cx + member.x - member.size / 2,
        y: cy + member.y - member.size / 2,
        size: member.size,
      };
    }
  }

  return { positions, hulls };
}

/**
 * Ten hues, assigned by community rank.
 *
 * Rank rather than id, so the biggest cluster is always the same colour between two
 * runs. Past the tenth community the palette repeats: ten colours is already more
 * than a reader can hold, and a legend is what disambiguates.
 */
export const COMMUNITY_COLORS = [
  "#60a5fa",
  "#f472b6",
  "#34d399",
  "#fbbf24",
  "#a78bfa",
  "#fb923c",
  "#22d3ee",
  "#f87171",
  "#4ade80",
  "#c084fc",
] as const;

export function colorOfRank(rank: number): string {
  return COMMUNITY_COLORS[rank % COMMUNITY_COLORS.length] ?? COMMUNITY_COLORS[0];
}
