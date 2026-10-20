"use client";

import { ARCH_LAYERS, ARCH_VIEWS, type ArchLayer, type ArchView } from "@cairn/shared";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";

/**
 * The whole state of the viewer lives in the URL.
 *
 * View, filters and selection are shareable: a colleague opening your link sees the
 * exact diagram you were looking at, not a default one. That is the difference
 * between "look at the architecture tab" and "look at this".
 *
 * Deliberately written against `useSearchParams` rather than a query-state library:
 * one less dependency for a hook this small, and the call sites would not change
 * if we swapped it later.
 */

export interface GraphState {
  view: ArchView;
  /** Selected node. Drives both the inspector and the impact view. */
  node: string | null;
  layers: ArchLayer[];
  search: string;
  crossRepoOnly: boolean;
  /** Which bottom panel tab is open. */
  panel: "contract" | "violations" | "inventory" | null;
  /**
   * Full-bleed presentation mode. In the URL rather than in component state so that
   * "open this diagram on the big screen" is a link you can send to someone.
   */
  fullscreen: boolean;
}

const PANELS = ["contract", "violations", "inventory"] as const;

export function parseGraphState(params: URLSearchParams): GraphState {
  const rawView = params.get("vue");
  const rawPanel = params.get("panneau");
  const rawLayers = (params.get("couches") ?? "")
    .split(",")
    .filter((l): l is ArchLayer => ARCH_LAYERS.includes(l as ArchLayer));

  return {
    view: ARCH_VIEWS.includes(rawView as ArchView) ? (rawView as ArchView) : "conteneurs",
    node: params.get("noeud") || null,
    layers: rawLayers,
    search: params.get("q") ?? "",
    crossRepoOnly: params.get("inter") === "1",
    panel: PANELS.includes(rawPanel as (typeof PANELS)[number])
      ? (rawPanel as GraphState["panel"])
      : null,
    fullscreen: params.get("plein") === "1",
  };
}

export function serializeGraphState(state: GraphState): URLSearchParams {
  const params = new URLSearchParams();
  // Only non-default values are written, so a plain link stays readable.
  if (state.view !== "conteneurs") params.set("vue", state.view);
  if (state.node) params.set("noeud", state.node);
  if (state.layers.length) params.set("couches", state.layers.join(","));
  if (state.search.trim()) params.set("q", state.search.trim());
  if (state.crossRepoOnly) params.set("inter", "1");
  if (state.panel) params.set("panneau", state.panel);
  if (state.fullscreen) params.set("plein", "1");
  return params;
}

export function useGraphState() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const state = useMemo(
    () => parseGraphState(new URLSearchParams(searchParams.toString())),
    [searchParams],
  );

  const update = useCallback(
    (patch: Partial<GraphState>) => {
      const next = serializeGraphState({ ...state, ...patch });
      const query = next.toString();
      // `replace` keeps the back button meaningful: it steps out of the page,
      // not through forty filter changes.
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [pathname, router, state],
  );

  return { state, update };
}
