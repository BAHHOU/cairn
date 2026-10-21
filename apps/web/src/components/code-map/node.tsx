"use client";

import type { CodeNodeKind } from "@cairn/shared";
import { Handle, type NodeProps, Position, useStore } from "@xyflow/react";
import { memo } from "react";
import type { CodeFlowNode, HaloFlowNode } from "./types";

/**
 * A symbol is a dot, not a card.
 *
 * Seventy labelled boxes is a wall of text where a map should be; the reader needs
 * shape and colour first, and words only where they help. At the overview the names
 * that matter are the community names on the halos — individual symbols speak when
 * you zoom in, hover, search, or select them.
 */

const KIND_GLYPH: Partial<Record<CodeNodeKind, string>> = {
  table: "▤",
  config: "⚙",
  doc: "¶",
  adr: "§",
  rationale: "?",
  external: "↗",
};

function CodeDot({ data }: NodeProps<CodeFlowNode>) {
  const { label, color, size, dimmed, labelled, hub, selected, onPath, kind } = data;
  const glyph = KIND_GLYPH[kind];

  // The whole map fits the screen at roughly half zoom, which turned every label into
  // an unreadable smudge. Counter-scaling by the viewport zoom keeps a name the same
  // physical size whether you are looking at seventy symbols or at three. Capped,
  // because at the far end of zoom-out the correction would print billboards.
  const zoom = useStore((s) => s.transform[2] ?? 1);
  const labelScale = Math.min(Math.max(1 / zoom, 0.6), 1.8);
  // Hub names only once the viewport has room for them; below that they collide with
  // their own cluster and with each other, which is worse than no label at all.
  const show = labelled || (hub && zoom >= 0.75);

  return (
    <div
      className="relative flex items-center justify-center transition-opacity"
      style={{ width: size, height: size, opacity: dimmed ? 0.12 : 1 }}
    >
      <Handle type="target" position={Position.Top} className="!opacity-0" style={{ top: "50%" }} />
      <div
        className="flex items-center justify-center rounded-full"
        style={{
          width: size,
          height: size,
          background: color,
          // Rings rather than a different fill: the community colour has to survive selection.
          boxShadow: selected
            ? "0 0 0 3px var(--background), 0 0 0 6px var(--foreground)"
            : onPath
              ? "0 0 0 3px var(--background), 0 0 0 5px #fbbf24"
              : "0 0 0 1.5px rgba(0,0,0,.35)",
          fontSize: Math.max(9, size * 0.5),
          lineHeight: 1,
          color: "rgba(0,0,0,.65)",
        }}
      >
        {glyph}
      </div>
      {show ? (
        <span
          className="pointer-events-none absolute top-full left-1/2 max-w-[12rem] truncate rounded bg-background/85 px-1 text-[11px] text-foreground"
          style={{
            transform: `translate(-50%, 4px) scale(${labelScale})`,
            transformOrigin: "top center",
            fontWeight: selected ? 700 : 600,
          }}
        >
          {label}
        </span>
      ) : null}
      <Handle
        type="source"
        position={Position.Bottom}
        className="!opacity-0"
        style={{ top: "50%" }}
      />
    </div>
  );
}

export const CodeDotNode = memo(CodeDot);

/**
 * The coloured disc behind a cluster, and the only name on screen at overview zoom.
 *
 * Without it the communities are only readable from the legend, which means reading
 * a colour chip and then hunting for that colour among seventy dots. The halo makes
 * the grouping the first thing you see, which is what a map is for.
 */
function Halo({ data }: NodeProps<HaloFlowNode>) {
  const { diameter, color, label, count } = data;
  const zoom = useStore((s) => s.transform[2] ?? 1);
  return (
    <div
      className="pointer-events-none relative rounded-full"
      style={{
        width: diameter,
        height: diameter,
        background: `radial-gradient(circle, ${color}22 0%, ${color}0d 60%, transparent 72%)`,
      }}
    >
      <span
        className="-translate-x-1/2 absolute left-1/2 whitespace-nowrap font-semibold text-[11px] text-muted-foreground uppercase tracking-wide"
        style={{
          top: -6,
          transform: `translate(-50%, -100%) scale(${Math.min(Math.max(1 / zoom, 0.6), 2.2)})`,
          transformOrigin: "bottom center",
        }}
      >
        {label} · {count}
      </span>
    </div>
  );
}

export const CodeHaloNode = memo(Halo);
