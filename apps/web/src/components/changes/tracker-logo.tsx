import { TRACKERS, type TrackerKind } from "@cairn/shared";
import { KanbanSquare } from "lucide-react";
import { TRACKER_ICONS } from "@/lib/tracker-icons";

/** A tool's mark on a white tile, in its own colour; a neutral glyph for tools without one. */
export function TrackerLogo({ kind, size = 32 }: { kind: TrackerKind; size?: number }) {
  const icon = TRACKER_ICONS[kind];
  const glyph = Math.round(size * 0.58);
  return (
    <span
      className="grid shrink-0 place-items-center rounded-lg border bg-white shadow-xs"
      style={{ width: size, height: size }}
      role="img"
      aria-label={TRACKERS[kind].name}
    >
      {icon ? (
        <svg width={glyph} height={glyph} viewBox="0 0 24 24" fill={`#${icon.hex}`} aria-hidden>
          <path d={icon.path} />
        </svg>
      ) : (
        <KanbanSquare className="text-slate-500" width={glyph} height={glyph} aria-hidden />
      )}
    </span>
  );
}
