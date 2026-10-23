"use client";

import type { ArchNodeKind, ArchProvenance } from "@cairn/shared";
import { Handle, type NodeProps, Position } from "@xyflow/react";
import {
  Boxes,
  Cloud,
  Database,
  GitBranch,
  Inbox,
  Layers,
  Puzzle,
  Server,
  User,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import type { ArchNodeData } from "../types";

const ICON: Record<ArchNodeKind, typeof Server> = {
  system: Boxes,
  service: Server,
  component: Puzzle,
  datastore: Database,
  queue: Inbox,
  external: Cloud,
  actor: User,
  pipeline: GitBranch,
  deployment: Layers,
};

/** Colour carries the layer, never the severity: severity is shown by the ring. */
const LAYER_STYLE: Record<string, string> = {
  experience: "border-info/50 bg-info/5",
  application: "border-primary/50 bg-primary/5",
  domaine: "border-foreground/25 bg-foreground/[0.03]",
  infrastructure: "border-muted-foreground/35 bg-muted/40",
  externe: "border-dashed border-muted-foreground/50 bg-background",
};

const PROVENANCE_DOT: Record<ArchProvenance, string> = {
  extracted: "bg-primary",
  inferred: "bg-warning",
  declared: "bg-muted-foreground",
};

export function ArchNodeCard({ data, selected }: NodeProps & { data: ArchNodeData }) {
  const t = useTranslations("diagram.node");
  const td = useTranslations("domain");
  const Icon = ICON[data.kind];
  const hop = data.hop;

  return (
    <div
      className={cn(
        "group relative flex h-full w-full flex-col justify-center gap-1 rounded-lg border px-3 py-2 shadow-sm transition-opacity",
        LAYER_STYLE[data.layer],
        data.dimmed && "opacity-25",
        selected && "ring-2 ring-ring ring-offset-1 ring-offset-background",
        data.violating && "border-destructive/70",
      )}
      title={data.description}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!h-1.5 !w-1.5 !border-0 !bg-muted-foreground/60"
      />

      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
        <Icon className="size-3 shrink-0" aria-hidden />
        <span className="truncate">{td(`archNodeKind.${data.kind}`)}</span>
        <span
          className={cn("ml-auto size-1.5 shrink-0 rounded-full", PROVENANCE_DOT[data.provenance])}
          title={td(`archProvenance.${data.provenance}`)}
        />
      </div>

      <div className="truncate font-medium text-sm leading-tight">{data.label}</div>

      <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
        {data.tech.length > 0 && (
          <span className="truncate">{data.tech.slice(0, 2).join(" · ")}</span>
        )}
        {data.mergedCount > 1 && (
          <span className="shrink-0">{t("internal", { count: data.mergedCount - 1 })}</span>
        )}
      </div>

      {data.issueCount > 0 && (
        <span
          className="absolute -top-2 -right-2 rounded-full bg-destructive px-1.5 py-px font-medium text-[10px] text-background"
          title={t("openIssues", { count: data.issueCount })}
        >
          {data.issueCount}
        </span>
      )}

      {hop !== undefined && (
        <span className="absolute -top-2 -left-2 rounded-full border bg-background px-1.5 py-px font-medium text-[10px]">
          {hop === 0 ? t("origin") : t("hops", { count: hop })}
        </span>
      )}

      <Handle
        type="source"
        position={Position.Right}
        className="!h-1.5 !w-1.5 !border-0 !bg-muted-foreground/60"
      />
    </div>
  );
}
