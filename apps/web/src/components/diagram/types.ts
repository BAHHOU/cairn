import type { ArchLayer, ArchNodeKind, ArchProvenance } from "@cairn/shared";
import type { Node } from "@xyflow/react";

/** What a node needs to draw itself. Kept apart so the canvas and the node agree on one shape. */
export interface ArchNodeData extends Record<string, unknown> {
  label: string;
  kind: ArchNodeKind;
  layer: ArchLayer;
  provenance: ArchProvenance;
  description: string;
  tech: string[];
  /** How many nodes of the source graph this box stands for, itself included. */
  mergedCount: number;
  issueCount: number;
  dimmed: boolean;
  violating: boolean;
  /** Distance from the selected node in the impact view. Undefined elsewhere. */
  hop?: number;
}

export type ArchFlowNode = Node<ArchNodeData, "arch">;
