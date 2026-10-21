"use client";

import {
  type CodeGraph,
  degreesOf,
  detectCommunities,
  explainNode,
  godNodes,
  shortestPath,
} from "@cairn/shared";
import {
  Background,
  BackgroundVariant,
  Controls,
  type Edge,
  type NodeMouseHandler,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { CommunityPanel } from "./communities";
import { visibleGraph } from "./filters";
import { Explanation } from "./inspector";
import { clusterLayout, colorOfRank } from "./layout";
import { CodeDotNode, CodeHaloNode } from "./node";
import { CodeMapToolbar, PathBar } from "./toolbar";
import type { CodeFlowNode, HaloFlowNode } from "./types";
import { useCodeMapState } from "./use-code-map-state";

const NODE_TYPES = { dot: CodeDotNode, halo: CodeHaloNode };

/** Above this degree a symbol earns a permanent label; the rest speak when spoken to. */
const LABEL_DEGREE = 8;

function CodeMap({ graph }: { graph: CodeGraph }) {
  const { state, update } = useCodeMapState();
  const { fitView } = useReactFlow();
  const shellRef = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState<string | null>(null);

  // Communities and degrees describe the *whole* graph, never the filtered one: a
  // cluster that shrinks because you typed in a search box is a lie about the code.
  const communities = useMemo(() => detectCommunities(graph.nodes, graph.edges), [graph]);
  const degrees = useMemo(() => degreesOf(graph.nodes, graph.edges), [graph]);
  const gods = useMemo(
    () => godNodes(graph.nodes, graph.edges, communities, { limit: 8 }),
    [graph, communities],
  );

  const rankOf = useMemo(() => {
    const out: Record<string, number> = {};
    for (const c of communities) for (const id of c.memberIds) out[id] = c.rank;
    return out;
  }, [communities]);

  const view = useMemo(() => visibleGraph(graph, communities, state), [graph, communities, state]);

  const { positions, hulls } = useMemo(
    () => clusterLayout(view.nodes, view.edges, communities, degrees),
    [view, communities, degrees],
  );

  const labels = useMemo(
    () => Object.fromEntries(graph.nodes.map((n) => [n.id, n.label])),
    [graph],
  );

  const path = useMemo(() => {
    if (!state.from || !state.to) return null;
    return shortestPath(graph.nodes, graph.edges, state.from, state.to);
  }, [graph, state.from, state.to]);

  const explanation = useMemo(
    () => (state.node ? explainNode(graph, communities, state.node) : null),
    [graph, communities, state.node],
  );

  /** What stays bright: the hovered neighbourhood, or the path, or everything. */
  const focus = useMemo(() => {
    if (path) return { nodes: new Set(path.nodeIds), edges: new Set(path.edgeIds) };
    const anchor = hovered ?? state.node;
    if (!anchor) return null;
    const nodes = new Set([anchor]);
    const edges = new Set<string>();
    for (const e of view.edges) {
      if (e.source === anchor) {
        nodes.add(e.target);
        edges.add(e.id);
      } else if (e.target === anchor) {
        nodes.add(e.source);
        edges.add(e.id);
      }
    }
    return { nodes, edges };
  }, [path, hovered, state.node, view.edges]);

  const flowNodes: CodeFlowNode[] = useMemo(
    () =>
      view.nodes.map((n) => {
        const placed = positions[n.id];
        const degree = degrees[n.id] ?? 0;
        const dimmed = focus ? !focus.nodes.has(n.id) : false;
        return {
          id: n.id,
          type: "dot" as const,
          position: { x: placed?.x ?? 0, y: placed?.y ?? 0 },
          data: {
            label: n.label,
            kind: n.kind,
            color: colorOfRank(rankOf[n.id] ?? 0),
            size: placed?.size ?? 14,
            dimmed,
            labelled:
              view.matched.has(n.id) ||
              n.id === state.node ||
              n.id === hovered ||
              (focus?.nodes.has(n.id) ?? false),
            hub: degree >= LABEL_DEGREE,
            selected: n.id === state.node,
            onPath: path?.nodeIds.includes(n.id) ?? false,
          },
          // What you asked about draws last, so its name is never buried under a
          // neighbour's label.
          zIndex: n.id === state.node ? 20 : (path?.nodeIds.includes(n.id) ?? false) ? 10 : 1,
          draggable: false,
        };
      }),
    [view, positions, degrees, rankOf, focus, state.node, hovered, path],
  );

  const flowEdges: Edge[] = useMemo(
    () =>
      view.edges.map((e) => {
        const lit = focus?.edges.has(e.id) ?? false;
        const dimmed = focus ? !lit : false;
        return {
          id: e.id,
          source: e.source,
          target: e.target,
          type: "straight" as const,
          // The guess is dashed. You should be able to see which links were inferred
          // without clicking anything.
          style: {
            stroke: lit ? "#fbbf24" : "var(--muted-foreground)",
            strokeWidth: lit ? 2 : 1,
            strokeDasharray: e.confidence === "inferred" ? "4 3" : undefined,
            opacity: dimmed ? 0.06 : lit ? 0.95 : 0.32,
          },
          interactionWidth: 0,
        };
      }),
    [view.edges, focus],
  );

  const haloNodes: HaloFlowNode[] = useMemo(
    () =>
      hulls.map((hull) => {
        const community = communities.find((c) => c.id === hull.id);
        return {
          id: `halo-${hull.id}`,
          type: "halo" as const,
          position: { x: hull.x - hull.radius, y: hull.y - hull.radius },
          data: {
            diameter: hull.radius * 2,
            color: colorOfRank(community?.rank ?? 0),
            label: community?.label ?? "",
            count: community?.memberIds.length ?? 0,
          },
          draggable: false,
          selectable: false,
          zIndex: -1,
        };
      }),
    [hulls, communities],
  );

  const onNodeClick: NodeMouseHandler = useCallback(
    (_, node) => update({ node: node.id }),
    [update],
  );

  const toggleCommunity = useCallback(
    (id: string) => {
      const hidden = state.hidden.includes(id)
        ? state.hidden.filter((h) => h !== id)
        : [...state.hidden, id];
      update({ hidden });
    },
    [state.hidden, update],
  );

  const onlyCommunity = useCallback(
    (id: string) => update({ hidden: communities.filter((c) => c.id !== id).map((c) => c.id) }),
    [communities, update],
  );

  const fullscreen = state.fullscreen;
  const toggleFullscreen = useCallback(() => {
    if (fullscreen) {
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
      update({ fullscreen: false });
      return;
    }
    void shellRef.current?.requestFullscreen?.().catch(() => {});
    update({ fullscreen: true });
  }, [fullscreen, update]);

  useEffect(() => {
    const onChange = () => {
      if (!document.fullscreenElement) update({ fullscreen: false });
    };
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, [update]);

  // Framing follows the question: a path query frames the path, a selection frames the
  // neighbourhood, otherwise the whole map.
  // biome-ignore lint/correctness/useExhaustiveDependencies: these inputs resize the canvas rather than being read here
  useEffect(() => {
    const target = path
      ? path.nodeIds.map((id) => ({ id }))
      : explanation
        ? [...(focus?.nodes ?? [])].map((id) => ({ id }))
        : undefined;
    const timer = window.setTimeout(
      () =>
        fitView(
          target?.length
            ? { nodes: target, padding: 0.35, duration: 300 }
            : { padding: 0.12, duration: 300 },
        ),
      120,
    );
    return () => window.clearTimeout(timer);
  }, [fitView, view, path, state.node, fullscreen]);

  const inferred = view.edges.filter((e) => e.confidence === "inferred").length;

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
      <CodeMapToolbar
        search={state.search}
        kinds={state.kinds}
        extractedOnly={state.extractedOnly}
        fullscreen={fullscreen}
        stats={{
          shown: view.nodes.length,
          total: graph.nodes.length,
          edges: view.edges.length,
          inferred,
        }}
        onSearch={(search) => update({ search })}
        onToggleKind={(kind) =>
          update({
            kinds: state.kinds.includes(kind)
              ? state.kinds.filter((k) => k !== kind)
              : [...state.kinds, kind],
          })
        }
        onToggleExtracted={() => update({ extractedOnly: !state.extractedOnly })}
        onToggleFullscreen={toggleFullscreen}
      />

      <PathBar
        from={state.from}
        to={state.to}
        labels={labels}
        hops={path ? path.nodeIds : null}
        onClear={() => update({ from: null, to: null })}
        onSelect={(id) => update({ node: id })}
      />

      <div className="flex min-h-0 flex-1">
        <div className="relative min-w-0 flex-1">
          <ReactFlow
            nodes={[...haloNodes, ...flowNodes]}
            edges={flowEdges}
            nodeTypes={NODE_TYPES}
            onNodeClick={onNodeClick}
            onNodeMouseEnter={(_, node) => setHovered(node.id)}
            onNodeMouseLeave={() => setHovered(null)}
            onPaneClick={() => update({ node: null })}
            nodesDraggable={false}
            minZoom={0.05}
            maxZoom={3}
            proOptions={{ hideAttribution: true }}
            fitView
          >
            <Background variant={BackgroundVariant.Dots} gap={28} size={1} />
            <Controls showInteractive={false} />
          </ReactFlow>
          {view.nodes.length === 0 ? (
            <p className="-translate-x-1/2 -translate-y-1/2 absolute top-1/2 left-1/2 text-muted-foreground text-sm">
              Aucun symbole ne passe ces filtres.
            </p>
          ) : null}
        </div>

        {explanation ? (
          <Explanation
            explanation={explanation}
            projectId={graph.projectId}
            onSelect={(id) => update({ node: id })}
            onPathFrom={() => update({ from: explanation.node.id })}
            onPathTo={() => update({ to: explanation.node.id })}
            onClose={() => update({ node: null })}
          />
        ) : (
          <CommunityPanel
            communities={communities}
            hidden={state.hidden}
            gods={gods}
            selected={state.node}
            onToggle={toggleCommunity}
            onOnly={onlyCommunity}
            onReset={() => update({ hidden: [] })}
            onSelect={(id) => update({ node: id })}
          />
        )}
      </div>
    </div>
  );
}

export function CodeMapCanvas({ graph }: { graph: CodeGraph }) {
  return (
    <ReactFlowProvider>
      <CodeMap graph={graph} />
    </ReactFlowProvider>
  );
}
