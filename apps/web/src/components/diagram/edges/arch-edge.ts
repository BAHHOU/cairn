"use client";

import type { ArchEdge } from "@cairn/shared";
import type { Edge } from "@xyflow/react";
import { MarkerType } from "@xyflow/react";
import type { ViewEdge } from "../views";

/**
 * Edge styling lives here rather than in a custom edge component.
 *
 * React Flow's built-in smoothstep edge already draws labels and markers correctly;
 * a hand-written edge would only be a chance to get the path maths wrong.
 *
 * Colours are read from the raw theme variables, not from the `--color-*` aliases:
 * the stylesheet declares `@theme inline`, so those aliases exist at build time only.
 */

const STROKE: Record<ArchEdge["kind"], string> = {
  sync: "var(--foreground)",
  async: "var(--info)",
  data: "var(--primary)",
  build: "var(--muted-foreground)",
  deploy: "var(--muted-foreground)",
};

const DASH: Partial<Record<ArchEdge["kind"], string>> = {
  async: "6 4",
  build: "2 4",
  deploy: "2 4",
};

export function toFlowEdge(
  edge: ViewEdge,
  opts: {
    dimmed: boolean;
    highlighted: boolean;
    showLabel: boolean;
    animated: boolean;
    /** The payload in the reader's language, when the edge carries one. */
    payloadLabel?: string;
  },
): Edge {
  const stroke = edge.violating ? "var(--destructive)" : STROKE[edge.kind];
  const width = edge.violating ? 2.2 : opts.highlighted ? 2 : 1.2;
  const label = opts.payloadLabel ? `${edge.label} · ${opts.payloadLabel}` : edge.label;

  return {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    type: "smoothstep",
    animated: opts.animated,
    label: opts.showLabel ? label : undefined,
    labelShowBg: true,
    labelBgPadding: [4, 2],
    labelBgBorderRadius: 4,
    labelStyle: { fontSize: 10, fill: "var(--muted-foreground)" },
    labelBgStyle: { fill: "var(--background)", fillOpacity: 0.9 },
    style: {
      stroke,
      strokeWidth: width,
      // Cross-repo links are drawn long-dashed whatever their kind: leaving the
      // repository is the fact a reader most often needs to spot.
      strokeDasharray: edge.crossRepo ? "10 5" : DASH[edge.kind],
      opacity: opts.dimmed ? 0.12 : 1,
    },
    markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14, color: stroke },
  };
}
