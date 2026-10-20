import { scoreTone, TONE_TEXT } from "@/lib/format";
import { cn } from "@/lib/utils";

export function ScoreRing({
  score,
  size = 72,
  stroke = 7,
  className,
}: {
  score: number;
  size?: number;
  stroke?: number;
  className?: string;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const tone = TONE_TEXT[scoreTone(score)];
  return (
    <div
      className={cn("relative inline-flex items-center justify-center", tone, className)}
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={`Score ${score} sur 100`}
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          className="stroke-muted"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${(c * score) / 100} ${c}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <span
        className="absolute text-foreground font-semibold tabular-nums"
        style={{ fontSize: size * 0.3 }}
      >
        {score}
      </span>
    </div>
  );
}
