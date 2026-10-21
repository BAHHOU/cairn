import type { CodeNodeKind } from "@cairn/shared";
import type { Node } from "@xyflow/react";

export interface CodeNodeData extends Record<string, unknown> {
  label: string;
  kind: CodeNodeKind;
  color: string;
  size: number;
  dimmed: boolean;
  /** The label is owed no matter the zoom: you asked for this symbol. */
  labelled: boolean;
  /** A hub worth naming once there is room on screen for the name. */
  hub: boolean;
  selected: boolean;
  onPath: boolean;
}

export type CodeFlowNode = Node<CodeNodeData, "dot">;

export interface HaloData extends Record<string, unknown> {
  diameter: number;
  color: string;
  label: string;
  count: number;
}

export type HaloFlowNode = Node<HaloData, "halo">;
