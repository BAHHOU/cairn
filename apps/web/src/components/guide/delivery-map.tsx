"use client";

import type { DeliveryView, TopologyBasis, TopologyNode, TopologyView } from "@cairn/shared";
import {
  Background,
  BackgroundVariant,
  Controls,
  type Edge,
  Handle,
  MarkerType,
  type Node,
  type NodeProps,
  Panel,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { AlertTriangle, Maximize2, Minimize2 } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { useEffect, useMemo, useState } from "react";
import { SourceRef } from "@/components/guide/bits";
import { BrandMark } from "@/components/guide/brand-mark";
import { JobDetail } from "@/components/guide/pipeline-flow";
import { Modal } from "@/components/ui/dialog";
import type { SourceBase } from "@/lib/import/source-link";
import { layoutTopology, NODE_H, NODE_W, PAD } from "@/lib/import/topology-layout";
import { cn } from "@/lib/utils";

/**
 * Colours are the raw theme variables, not the `--color-*` aliases: the stylesheet declares
 * `@theme inline`, so the aliases exist at build time only.
 */
const EDGE_STROKE: Record<TopologyBasis, string> = {
  found: "var(--muted-foreground)",
  inferred: "var(--warning)",
  missing: "var(--muted-foreground)",
};
const EDGE_OPACITY: Record<TopologyBasis, number> = { found: 0.8, inferred: 0.9, missing: 0.5 };
const EDGE_DASH: Record<TopologyBasis, string | undefined> = {
  found: undefined,
  inferred: "6 4",
  missing: "2 5",
};
const NODE_CLASS: Record<TopologyBasis, string> = {
  found: "border-border bg-card",
  inferred: "border-dashed border-warning/60 bg-card",
  missing: "border-dashed border-muted-foreground/40 bg-muted/40",
};
const BASIS_DOT: Record<TopologyBasis, string> = {
  found: "bg-primary",
  inferred: "bg-warning",
  missing: "bg-muted-foreground/50",
};

/* ------------------------------ node types ------------------------------ */

type TopoNode = Node<{ node: TopologyNode; dim: boolean }, "topo">;
type LaneNode = Node<{ label: string; hint: string }, "lane">;

const SIDES = [
  ["l", Position.Left],
  ["r", Position.Right],
  ["t", Position.Top],
  ["b", Position.Bottom],
] as const;

function TopoNodeCard({ data }: NodeProps<TopoNode>) {
  const { node, dim } = data;
  return (
    <div
      className={cn(
        "flex h-full w-full cursor-pointer items-center gap-3 rounded-xl border px-3 shadow-xs transition-[opacity,box-shadow]",
        "hover:shadow-md",
        NODE_CLASS[node.basis],
        dim && "opacity-30",
      )}
    >
      {SIDES.map(([side, position]) => (
        <span key={side}>
          <Handle
            id={`s-${side}`}
            type="source"
            position={position}
            className="!size-1 !min-h-0 !min-w-0 !border-0 !bg-transparent"
          />
          <Handle
            id={`t-${side}`}
            type="target"
            position={position}
            className="!size-1 !min-h-0 !min-w-0 !border-0 !bg-transparent"
          />
        </span>
      ))}
      <BrandMark brand={node.brand} role={node.role} muted={node.basis === "missing"} />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span
          className={cn(
            "truncate font-medium text-[13px] leading-tight",
            node.basis === "missing" && "text-muted-foreground",
          )}
        >
          {node.label}
        </span>
        {node.detail ? (
          <span className="line-clamp-2 text-[11px] text-muted-foreground leading-snug">
            {node.detail}
          </span>
        ) : null}
      </span>
      {node.alerts ? (
        <span
          className="absolute -top-2 -right-2 flex items-center gap-0.5 rounded-full border bg-card px-1.5 py-0.5 font-medium text-[10px] text-warning shadow-xs"
          title={`${node.alerts} point(s) d'attention`}
        >
          <AlertTriangle className="size-3" aria-hidden />
          {node.alerts}
        </span>
      ) : null}
    </div>
  );
}

function LaneBand({ data }: NodeProps<LaneNode>) {
  return (
    <div className="h-full w-full rounded-xl border border-dashed bg-muted/25">
      <div className="px-3 pt-2.5">
        <p className="font-semibold text-[11px] uppercase tracking-wider">{data.label}</p>
        <p className="text-[11px] text-muted-foreground">{data.hint}</p>
      </div>
    </div>
  );
}

const NODE_TYPES = { topo: TopoNodeCard, lane: LaneBand };

/* -------------------------------- the modal -------------------------------- */

function NodeDetail({
  node,
  view,
  delivery,
  id,
  base,
  onSelect,
}: {
  node: TopologyNode;
  view: TopologyView;
  delivery: DeliveryView;
  id: string;
  base: SourceBase | null;
  onSelect: (id: string) => void;
}) {
  const t = useTranslations("deliveryMap");
  const tp = useTranslations("pipeline");
  const td = useTranslations("domain");
  const byId = new Map(view.nodes.map((n) => [n.id, n]));
  const incoming = view.edges.filter((e) => e.to === node.id);
  const outgoing = view.edges.filter((e) => e.from === node.id);
  const jobs = delivery.stages.flatMap((s) => s.jobs).filter((j) => node.jobs?.includes(j.name));

  const links = (list: typeof incoming, end: "from" | "to") => (
    <div className="flex flex-wrap gap-1.5">
      {list.length === 0 ? <span className="text-muted-foreground">—</span> : null}
      {list.map((e) => (
        <button
          key={e.id}
          type="button"
          onClick={() => onSelect(e[end])}
          className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs hover:bg-muted"
        >
          {byId.get(e[end])?.label ?? e[end]}
          {e.label ? <span className="text-muted-foreground">· {e.label}</span> : null}
        </button>
      ))}
    </div>
  );

  return (
    <>
      {node.detail ? <p className="text-sm">{node.detail}</p> : null}
      {node.chips && node.chips.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5">
          {node.chips.map((c) => (
            <li key={c} className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]">
              {c}
            </li>
          ))}
        </ul>
      ) : null}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        {node.source ? <SourceRef source={node.source} base={base} /> : null}
        {node.archNodeId ? (
          <Link
            href={`/projects/${id}/architecture?vue=flux&noeud=${encodeURIComponent(node.archNodeId)}`}
            className="text-xs underline underline-offset-4 hover:text-primary"
          >
            {t("seeInArchitecture")}
          </Link>
        ) : null}
      </div>
      {incoming.length + outgoing.length > 0 ? (
        <div className="grid gap-3 text-xs sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <span className="text-muted-foreground uppercase tracking-wide">
              {t("receivesFrom")}
            </span>
            {links(incoming, "from")}
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-muted-foreground uppercase tracking-wide">{t("sendsTo")}</span>
            {links(outgoing, "to")}
          </div>
        </div>
      ) : null}
      {jobs.map((job) => (
        <div key={job.name} className="flex flex-col gap-3 rounded-lg border p-3">
          <p className="flex flex-wrap items-baseline gap-2">
            <span className="font-medium font-mono text-sm">{job.name}</span>
            <span className="text-muted-foreground text-xs">
              {tp("roleAndStage", {
                role: td(`pipelineJobRole.${job.role}`),
                stage: job.stage,
              })}
            </span>
          </p>
          <JobDetail job={job} path={delivery.path} base={base} bare />
        </div>
      ))}
    </>
  );
}

/* ---------------------------------- the map ---------------------------------- */

function Legend() {
  const td = useTranslations("domain");
  return (
    <ul className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-muted-foreground text-xs">
      {(["found", "inferred", "missing"] as const).map((basis) => (
        <li key={basis} className="flex items-center gap-2">
          <svg width="30" height="8" aria-hidden>
            <line
              x1="0"
              y1="4"
              x2="30"
              y2="4"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeDasharray={EDGE_DASH[basis]}
              stroke={EDGE_STROKE[basis]}
              strokeOpacity={EDGE_OPACITY[basis]}
            />
          </svg>
          {td(`topologyBasis.${basis}`)}
        </li>
      ))}
    </ul>
  );
}

function TopologyCanvas({
  view,
  delivery,
  id,
  base,
}: {
  view: TopologyView;
  delivery: DeliveryView;
  id: string;
  base: SourceBase | null;
}) {
  const t = useTranslations("deliveryMap");
  const td = useTranslations("domain");
  const layout = useMemo(() => layoutTopology(view), [view]);
  const { fitView } = useReactFlow();
  const { resolvedTheme } = useTheme();
  const [hover, setHover] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [full, setFull] = useState(false);
  const open = view.nodes.find((n) => n.id === openId) ?? null;

  const related = useMemo(() => {
    if (!hover) return null;
    const ids = new Set([hover]);
    for (const e of view.edges) {
      if (e.from === hover) ids.add(e.to);
      if (e.to === hover) ids.add(e.from);
    }
    return ids;
  }, [hover, view.edges]);

  const nodes = useMemo<(TopoNode | LaneNode)[]>(
    () => [
      ...layout.lanes.map(
        (lane): LaneNode => ({
          id: `lane-${lane.lane}`,
          type: "lane",
          position: { x: lane.x, y: PAD },
          style: { width: lane.width, height: layout.height - PAD * 2 },
          data: {
            label: td(`topologyLane.${lane.lane}`),
            hint: td(`topologyLaneHint.${lane.lane}`),
          },
          draggable: false,
          selectable: false,
          focusable: false,
          zIndex: -1,
        }),
      ),
      ...layout.nodes.map(
        ({ node, x, y }): TopoNode => ({
          id: node.id,
          type: "topo",
          position: { x, y },
          width: NODE_W,
          height: NODE_H,
          data: { node, dim: related !== null && !related.has(node.id) },
          draggable: false,
        }),
      ),
    ],
    [layout, related, td],
  );

  const edges = useMemo<Edge[]>(
    () =>
      layout.edges.map((e) => {
        const on = hover !== null && (e.edge.from === hover || e.edge.to === hover);
        const dim = hover !== null && !on;
        const color = on ? "var(--primary)" : EDGE_STROKE[e.edge.basis];
        return {
          id: e.edge.id,
          source: e.edge.from,
          target: e.edge.to,
          sourceHandle: `s-${e.fromSide}`,
          targetHandle: `t-${e.toSide}`,
          type: "default",
          animated: on,
          label: e.edge.label,
          labelStyle: { fontSize: 10, fill: "var(--muted-foreground)" },
          labelBgPadding: [4, 2],
          labelBgBorderRadius: 4,
          labelBgStyle: { fill: "var(--background)", fillOpacity: 0.92 },
          style: {
            stroke: color,
            strokeWidth: on ? 2.2 : 1.5,
            strokeOpacity: dim ? 0.12 : on ? 1 : EDGE_OPACITY[e.edge.basis],
            strokeDasharray: EDGE_DASH[e.edge.basis],
          },
          markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14, color },
        };
      }),
    [layout, hover],
  );

  // Opening or closing the full-screen view changes the size of the canvas: frame it again.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `full` only triggers the framing
  useEffect(() => {
    const t = window.setTimeout(() => fitView({ padding: 0.08, duration: 250 }), 80);
    return () => window.clearTimeout(t);
  }, [fitView, full, layout]);

  useEffect(() => {
    if (!full) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !openId) setFull(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [full, openId]);

  return (
    <div className="flex flex-col gap-4">
      <div
        className={cn(
          "overflow-hidden border bg-background",
          full ? "fixed inset-0 z-50 h-dvh w-dvw rounded-none" : "h-[34rem] rounded-lg",
        )}
      >
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={NODE_TYPES}
          colorMode={resolvedTheme === "dark" ? "dark" : "light"}
          onNodeClick={(_, node) => {
            if (node.type === "topo") setOpenId(node.id);
          }}
          onNodeMouseEnter={(_, node) => {
            if (node.type === "topo") setHover(node.id);
          }}
          onNodeMouseLeave={() => setHover(null)}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          zoomOnScroll={false}
          preventScrolling={false}
          panOnDrag
          minZoom={0.2}
          maxZoom={1.6}
          fitView
          fitViewOptions={{ padding: 0.08 }}
          proOptions={{ hideAttribution: false }}
        >
          <Background variant={BackgroundVariant.Dots} gap={18} size={1} />
          <Controls showInteractive={false} />
          <Panel position="bottom-right">
            <button
              type="button"
              onClick={() => setFull((f) => !f)}
              className="inline-flex items-center gap-1.5 rounded-md border bg-card px-2.5 py-1.5 text-xs shadow-xs hover:bg-muted"
              aria-pressed={full}
            >
              {full ? (
                <Minimize2 className="size-3.5" aria-hidden />
              ) : (
                <Maximize2 className="size-3.5" aria-hidden />
              )}
              {full ? t("exitFullscreen") : t("fullscreen")}
            </button>
          </Panel>
        </ReactFlow>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Legend />
        <span className="text-muted-foreground text-xs">{t("help")}</span>
      </div>

      {view.gaps.length > 0 ? (
        <ul className="flex flex-col gap-1.5 rounded-lg border border-dashed p-3 text-muted-foreground text-sm">
          {view.gaps.map((g) => (
            <li key={g} className="flex gap-2">
              <span className={cn("mt-2 size-1.5 shrink-0 rounded-full", BASIS_DOT.missing)} />
              {g}
            </li>
          ))}
        </ul>
      ) : null}

      <Modal
        open={open !== null}
        onOpenChange={(o) => {
          if (!o) setOpenId(null);
        }}
        wide={Boolean(open?.jobs?.length)}
        title={open?.label ?? ""}
        description={
          open ? (
            <span className="inline-flex items-center gap-1.5">
              <span className={cn("size-2 rounded-full", BASIS_DOT[open.basis])} aria-hidden />
              {td(`topologyBasis.${open.basis}`)}
            </span>
          ) : undefined
        }
        icon={
          open ? (
            <BrandMark
              brand={open.brand}
              role={open.role}
              size={40}
              muted={open.basis === "missing"}
            />
          ) : null
        }
      >
        {open ? (
          <NodeDetail
            node={open}
            view={view}
            delivery={delivery}
            id={id}
            base={base}
            onSelect={setOpenId}
          />
        ) : null}
      </Modal>
    </div>
  );
}

/**
 * The delivery architecture on React Flow, like the architecture view: pan, zoom, full screen, a
 * mini-map, hover to follow a node's links and click for its detail in a modal. The wheel keeps
 * scrolling the page (zoom with Ctrl + wheel or the buttons), so the map never traps the scroll.
 */
export function DeliveryMap(props: {
  view: TopologyView;
  delivery: DeliveryView;
  id: string;
  base: SourceBase | null;
}) {
  return (
    <ReactFlowProvider>
      <TopologyCanvas {...props} />
    </ReactFlowProvider>
  );
}
