import type { TopologyBrand, TopologyRole } from "@cairn/shared";
import {
  Archive,
  Box,
  CircleHelp,
  Cloud,
  Cog,
  Database,
  Gauge,
  GitBranch,
  GitMerge,
  Layers,
  type LucideIcon,
  MessagesSquare,
  Network,
  Package,
  Rocket,
  Server,
  Workflow,
} from "lucide-react";
import { BRAND_ICONS } from "@/lib/brand-icons";
import { cn } from "@/lib/utils";

const ROLE_ICON: Record<TopologyRole, LucideIcon> = {
  repository: GitBranch,
  pipeline: Workflow,
  step: Cog,
  registry: Package,
  artifacts: Archive,
  quality: Gauge,
  gitops: GitMerge,
  deploy: Rocket,
  infrastructure: Server,
  cluster: Network,
  environment: Layers,
  workload: Box,
  datastore: Database,
  queue: MessagesSquare,
  external: Cloud,
  unknown: CircleHelp,
};

/**
 * The logo of a tool on a white tile, in its own colour. A tool without a logo gets the generic icon of
 * its role, so the picture never shows a blank square.
 */
export function BrandMark({
  brand,
  role,
  size = 36,
  muted = false,
  className,
}: {
  brand?: TopologyBrand | undefined;
  role: TopologyRole;
  size?: number;
  /** Greyed out, for what the repository does not describe. */
  muted?: boolean;
  className?: string;
}) {
  const icon = brand ? BRAND_ICONS[brand] : undefined;
  const Fallback = ROLE_ICON[role];
  const glyph = Math.round(size * 0.6);
  return (
    <span
      className={cn(
        "grid shrink-0 place-items-center rounded-lg border bg-white shadow-xs",
        muted && "opacity-60 grayscale",
        className,
      )}
      style={{ width: size, height: size }}
      role="img"
      aria-label={icon?.title ?? role}
    >
      {icon ? (
        <svg width={glyph} height={glyph} viewBox="0 0 24 24" fill={`#${icon.hex}`} aria-hidden>
          <path d={icon.path} />
        </svg>
      ) : (
        <Fallback className="text-slate-500" width={glyph} height={glyph} aria-hidden />
      )}
    </span>
  );
}
