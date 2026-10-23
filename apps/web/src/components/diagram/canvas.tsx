"use client";

import type { BlastRadius, ProjectArchitecture } from "@cairn/shared";
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  type Node,
  type NodeMouseHandler,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { blastRadiusAction } from "@/app/actions";
import { cn } from "@/lib/utils";
import { BottomPanel } from "./bottom-panel";
import { toFlowEdge } from "./edges/arch-edge";
import { copyMermaid, copyShareLink, downloadMermaid } from "./export";
import { Inspector } from "./inspector";
import { autoLayout } from "./layout";
import { ArchNodeCard } from "./nodes/arch-node";
import type { MermaidText } from "./to-mermaid";
import { DiagramToolbar } from "./toolbar";
import type { ArchFlowNode, ArchNodeData } from "./types";
import { useGraphState } from "./use-graph-state";
import { isDataEdge, neighboursOf, projectGraph, provenanceMix } from "./views";

const NODE_TYPES = { arch: ArchNodeCard };

function Canvas({ architecture }: { architecture: ProjectArchitecture }) {
  const t = useTranslations("diagram.canvas");
  const td = useTranslations("domain");
  const mermaidText: MermaidText = {
    header: (title) => t("mermaidHeader", { title }),
    payload: (payload) => td(`archPayload.${payload}`),
  };
  const { state, update } = useGraphState();
  const { fitView } = useReactFlow();
  const [hovered, setHovered] = useState<string | null>(null);
  const [radius, setRadius] = useState<BlastRadius | null>(null);
  const [loadingRadius, setLoadingRadius] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const fullscreen = state.fullscreen;

  const graph = useMemo(
    () =>
      projectGraph(architecture, state.view, {
        layers: state.layers,
        search: state.search,
        crossRepoOnly: state.crossRepoOnly,
      }),
    [architecture, state.view, state.layers, state.search, state.crossRepoOnly],
  );

  /** The node actually on screen for the selected id: it may have been folded into a parent. */
  const selectedId = state.node ? (graph.representative[state.node] ?? null) : null;
  const selectedNode = selectedId ? (graph.nodes.find((n) => n.id === selectedId) ?? null) : null;

  const positions = useMemo(() => autoLayout(graph.nodes, graph.edges, "LR"), [graph]);

  /** Impact is resolved on the server so that invisible nodes still count. */
  useEffect(() => {
    if (!state.node) {
      setRadius(null);
      setLoadingRadius(false);
      return;
    }
    let active = true;
    setLoadingRadius(true);
    blastRadiusAction(architecture.projectId, state.node)
      .then((result) => {
        if (active) setRadius(result);
      })
      .catch(() => {
        if (active) setRadius(null);
      })
      .finally(() => {
        if (active) setLoadingRadius(false);
      });
    return () => {
      active = false;
    };
  }, [architecture.projectId, state.node]);

  const highlight = useMemo(() => {
    const focus = hovered ?? selectedId;
    if (!focus) return null;
    return neighboursOf(graph, focus);
  }, [graph, hovered, selectedId]);

  const impactHops = useMemo(() => {
    if (state.view !== "impact" || !radius) return null;
    const hops: Record<string, number> = {};
    for (const [sourceId, hop] of Object.entries(radius.hops)) {
      const rep = graph.representative[sourceId];
      if (!rep) continue;
      hops[rep] = Math.min(hops[rep] ?? Number.POSITIVE_INFINITY, hop);
    }
    return hops;
  }, [graph, radius, state.view]);

  const flowNodes: ArchFlowNode[] = useMemo(
    () =>
      graph.nodes.map((n) => {
        const pos = positions[n.id];
        const inRadius = impactHops ? impactHops[n.id] !== undefined : true;
        const dimmed = impactHops ? !inRadius : highlight ? !highlight.nodes.has(n.id) : false;
        return {
          id: n.id,
          type: "arch" as const,
          position: { x: pos?.x ?? 0, y: pos?.y ?? 0 },
          width: pos?.width,
          height: pos?.height,
          selected: n.id === selectedId,
          data: {
            label: n.label,
            kind: n.kind,
            layer: n.layer,
            provenance: n.provenance,
            description: n.description,
            tech: n.tech,
            mergedCount: n.mergedIds.length,
            issueCount: n.issueIds?.length ?? 0,
            dimmed,
            violating: architecture.violations.some(
              (v) => v.sourceId === n.id || v.targetId === n.id,
            ),
            hop: impactHops?.[n.id],
          },
        };
      }),
    [graph.nodes, positions, highlight, impactHops, selectedId, architecture.violations],
  );

  const flowEdges = useMemo(() => {
    // Labelling forty edges at once produces a wall of overlapping text. Below a
    // handful of links every label is readable; above it, only what the reader is
    // pointing at — or what is broken — earns the right to speak.
    const labelAll = graph.edges.length <= 12;
    return graph.edges.map((e) => {
      const inRadius = impactHops ? radius?.edgeIds.some((id) => e.mergedIds.includes(id)) : true;
      const dimmed = impactHops ? !inRadius : highlight ? !highlight.edges.has(e.id) : false;
      const highlighted = highlight?.edges.has(e.id) ?? false;
      return toFlowEdge(e, {
        dimmed,
        highlighted,
        showLabel: labelAll || highlighted || e.violating,
        animated: state.view === "flux" && isDataEdge(e),
        ...(e.payload ? { payloadLabel: td(`archPayload.${e.payload}`) } : {}),
      });
    });
  }, [graph.edges, highlight, impactHops, radius, state.view, td]);

  // A new projection deserves a new framing, otherwise the camera stays on empty space.
  // In the impact view we frame the blast radius rather than the whole graph: the
  // point of the view is what breaks, not what exists. Opening a panel changes the
  // size of the canvas, so that has to re-frame too.
  // biome-ignore lint/correctness/useExhaustiveDependencies: graph, panel, selection and fullscreen resize the canvas rather than being read here
  useEffect(() => {
    const focus = impactHops ? Object.keys(impactHops).map((id) => ({ id })) : undefined;
    const id = window.setTimeout(
      () =>
        fitView(
          focus?.length
            ? { nodes: focus, padding: 0.3, duration: 300 }
            : { padding: 0.15, duration: 300 },
        ),
      120,
    );
    return () => window.clearTimeout(id);
  }, [fitView, graph, impactHops, state.panel, selectedId, fullscreen]);

  /**
   * Full screen, with a fallback.
   *
   * The overlay is what actually enlarges the diagram, so the feature works even when
   * the native API is refused — an iframe, a kiosk policy, a browser that never
   * implemented it. The native call is a bonus on top: it also hides the browser
   * chrome, which is a few hundred more pixels of graph on a laptop. It needs a user
   * gesture, so a shared `?plein=1` link gets the overlay and nothing more.
   */
  const toggleFullscreen = useCallback(() => {
    if (fullscreen) {
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
      update({ fullscreen: false });
      return;
    }
    void shellRef.current?.requestFullscreen?.().catch(() => {});
    update({ fullscreen: true });
  }, [fullscreen, update]);

  /** Leaving native full screen (Escape, F11, window manager) must not leave the overlay behind. */
  useEffect(() => {
    const onChange = () => {
      if (!document.fullscreenElement) update({ fullscreen: false });
    };
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, [update]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      // Never steal a keystroke meant for the search field.
      const target = event.target as HTMLElement | null;
      if (target?.tagName === "INPUT" || target?.isContentEditable) return;
      if (event.key === "f" || event.key === "F") {
        event.preventDefault();
        toggleFullscreen();
      }
      // Native full screen handles Escape itself and fires `fullscreenchange`.
      if (event.key === "Escape" && fullscreen && !document.fullscreenElement) {
        update({ fullscreen: false });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fullscreen, toggleFullscreen, update]);

  const onNodeClick: NodeMouseHandler = useCallback(
    (_, node: Node) => update({ node: node.id }),
    [update],
  );
  const onNodeDoubleClick: NodeMouseHandler = useCallback(
    (_, node: Node) => update({ node: node.id, view: "impact" }),
    [update],
  );

  const flash = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(null), 2500);
  };

  const title = `${architecture.projectId} — ${state.view}`;
  const mix = provenanceMix(graph.nodes);
  const hiddenCount = architecture.nodes.length - graph.nodes.length;

  return (
    <div
      ref={shellRef}
      className={cn(
        "flex flex-col overflow-hidden border bg-card",
        fullscreen
          ? "fixed inset-0 z-50 h-dvh w-dvw rounded-none"
          : "h-[calc(100vh-12rem)] min-h-[34rem] rounded-xl",
      )}
    >
      <DiagramToolbar
        state={state}
        update={update}
        nodeCount={graph.nodes.length}
        edgeCount={graph.edges.length}
        hiddenCount={hiddenCount}
        notice={notice}
        fullscreen={fullscreen}
        onToggleFullscreen={toggleFullscreen}
        onCopyLink={async () => flash((await copyShareLink()) ? t("linkCopied") : t("copyRefused"))}
        onCopyMermaid={async () =>
          flash(
            (await copyMermaid(graph, title, mermaidText)) ? t("mermaidCopied") : t("copyRefused"),
          )
        }
        onDownloadMermaid={() =>
          downloadMermaid(graph, title, `${architecture.projectId}-${state.view}.mmd`, mermaidText)
        }
      />

      <div className="flex min-h-0 flex-1">
        <div className="relative min-w-0 flex-1">
          <ReactFlow
            nodes={flowNodes}
            edges={flowEdges}
            nodeTypes={NODE_TYPES}
            onNodeClick={onNodeClick}
            onNodeDoubleClick={onNodeDoubleClick}
            onNodeMouseEnter={(_, node) => setHovered(node.id)}
            onNodeMouseLeave={() => setHovered(null)}
            onPaneClick={() => update({ node: null })}
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable
            proOptions={{ hideAttribution: false }}
            minZoom={0.15}
            fitView
          >
            <Background variant={BackgroundVariant.Dots} gap={18} size={1} />
            <Controls showInteractive={false} />
            <MiniMap
              pannable
              zoomable
              className="!bg-background"
              nodeStrokeWidth={2}
              nodeColor={(n) =>
                (n.data as ArchNodeData).violating
                  ? "var(--destructive)"
                  : "var(--muted-foreground)"
              }
            />
          </ReactFlow>

          <div className="pointer-events-none absolute top-3 left-3 rounded-md border bg-background/90 px-2.5 py-1.5 text-[11px] leading-relaxed shadow-sm">
            <div className="font-medium">{t("provenanceTitle")}</div>
            <div className="flex gap-3 text-muted-foreground">
              <span className="flex items-center gap-1">
                <span className="size-1.5 rounded-full bg-primary" />{" "}
                {t("extracted", { count: mix.extracted })}
              </span>
              <span className="flex items-center gap-1">
                <span className="size-1.5 rounded-full bg-warning" />{" "}
                {t("inferred", { count: mix.inferred })}
              </span>
              <span className="flex items-center gap-1">
                <span className="size-1.5 rounded-full bg-muted-foreground" />{" "}
                {t("declared", { count: mix.declared })}
              </span>
            </div>
          </div>

          {graph.nodes.length === 0 && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <p className="rounded-md border bg-background px-4 py-2 text-muted-foreground text-sm">
                {t("noMatch")}
              </p>
            </div>
          )}
        </div>

        {selectedNode && (
          <Inspector
            node={selectedNode}
            graph={graph}
            architecture={architecture}
            blastRadius={radius}
            loadingRadius={loadingRadius}
            onClose={() => update({ node: null })}
            onSelect={(id) => update({ node: id })}
            onShowImpact={() => update({ view: "impact" })}
          />
        )}
      </div>

      <BottomPanel architecture={architecture} state={state} update={update} />
    </div>
  );
}

export function ArchitectureCanvas({ architecture }: { architecture: ProjectArchitecture }) {
  return (
    <ReactFlowProvider>
      <Canvas architecture={architecture} />
    </ReactFlowProvider>
  );
}
