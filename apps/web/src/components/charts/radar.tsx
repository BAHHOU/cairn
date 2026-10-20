import { AXES, AXIS_LABEL, type Axis } from "@cairn/shared";

export function Radar({ values }: { values: Record<Axis, number> }) {
  const cx = 200;
  const cy = 125;
  const R = 68;
  const angle = (i: number) => -Math.PI / 2 + (i * 2 * Math.PI) / AXES.length;
  const point = (i: number, ratio: number) => {
    const a = angle(i);
    return [cx + Math.cos(a) * R * ratio, cy + Math.sin(a) * R * ratio] as const;
  };
  const polygon = (ratio: (i: number) => number) =>
    AXES.map((_, i) =>
      point(i, ratio(i))
        .map((n) => n.toFixed(1))
        .join(","),
    ).join(" ");

  return (
    <svg viewBox="0 0 400 250" className="w-full" role="img" aria-label="Radar des cinq axes">
      {[0.25, 0.5, 0.75, 1].map((r) => (
        <polygon
          key={r}
          points={polygon(() => r)}
          fill="none"
          className="stroke-border"
          strokeWidth={1}
        />
      ))}
      {AXES.map((axis, i) => {
        const [x, y] = point(i, 1);
        return (
          <line
            key={axis}
            x1={cx}
            y1={cy}
            x2={x}
            y2={y}
            className="stroke-border"
            strokeWidth={1}
          />
        );
      })}
      <polygon
        points={polygon((i) => (values[AXES[i] as Axis] ?? 0) / 100)}
        className="fill-primary/20 stroke-primary"
        strokeWidth={2}
        strokeLinejoin="round"
      />
      {AXES.map((axis, i) => {
        const [x, y] = point(i, 1.22);
        const cos = Math.cos(angle(i));
        const anchor = Math.abs(cos) < 0.2 ? "middle" : cos > 0 ? "start" : "end";
        return (
          <text
            key={axis}
            x={x}
            y={y}
            textAnchor={anchor}
            fontSize={13}
            className="fill-muted-foreground"
          >
            <tspan x={x} dy="-0.2em">
              {AXIS_LABEL[axis]}
            </tspan>
            <tspan x={x} dy="1.3em" className="fill-foreground font-medium">
              {values[axis]}
            </tspan>
          </text>
        );
      })}
    </svg>
  );
}
