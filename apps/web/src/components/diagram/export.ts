"use client";

import { toMermaid } from "./to-mermaid";
import type { ViewGraph } from "./views";

/**
 * Export is deliberately text-first.
 *
 * A Mermaid block can be pasted into a README, reviewed in a merge request and
 * diffed six months later. An image can only be looked at — and it is exactly the
 * kind of artefact that goes stale without anyone noticing.
 */

export async function copyMermaid(graph: ViewGraph, title: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(toMermaid(graph, title));
    return true;
  } catch {
    return false;
  }
}

export function downloadMermaid(graph: ViewGraph, title: string, filename: string): void {
  const blob = new Blob([toMermaid(graph, title)], { type: "text/vnd.mermaid;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

/** The link already carries the view, the filters and the selection. */
export async function copyShareLink(): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(window.location.href);
    return true;
  } catch {
    return false;
  }
}
