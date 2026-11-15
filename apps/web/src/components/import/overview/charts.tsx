"use client";

import { FILE_KINDS, type FileKind } from "@cairn/shared";
import { useTranslations } from "next-intl";
import {
  Bar,
  BarChart,
  Cell,
  LabelList,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useFormat } from "@/i18n/format";

/**
 * The token charts of an imported repository. Colours come from the validated `--viz-*` slots;
 * a file kind always keeps the slot of its position in `FILE_KINDS`, so a kind never changes colour
 * between repositories. Every chart has its values written next to the marks: some light-mode slots
 * sit below 3:1 on the card, and colour alone must never be the only way to read a value.
 */

export const kindColor = (kind: FileKind) => `var(--viz-${FILE_KINDS.indexOf(kind) + 1})`;

interface TooltipRow {
  label: string;
  value: string;
  color?: string;
}

function TooltipBox({ rows }: { rows: TooltipRow[] }) {
  return (
    <div className="rounded-md border bg-popover px-2.5 py-1.5 text-popover-foreground text-xs shadow-md">
      {rows.map((r) => (
        <div key={r.label} className="flex items-center gap-2">
          {r.color ? (
            <span className="size-2 shrink-0 rounded-[2px]" style={{ background: r.color }} />
          ) : null}
          <span className="text-muted-foreground">{r.label}</span>
          <span className="ml-auto pl-3 font-medium tabular-nums">{r.value}</span>
        </div>
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------- useful vs noise */

export function UsefulNoiseDonut({ useful, noise }: { useful: number; noise: number }) {
  const t = useTranslations("overview.charts");
  const fmt = useFormat();
  const total = useful + noise;
  const data = [
    { key: "useful", label: t("useful"), tokens: useful, color: "var(--viz-1)" },
    { key: "noise", label: t("noise"), tokens: noise, color: "var(--viz-2)" },
  ];
  const pct = (v: number) => (total > 0 ? Math.round((v / total) * 100) : 0);

  return (
    <div className="flex flex-wrap items-center gap-6">
      <div className="relative size-44 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="tokens"
              nameKey="label"
              innerRadius="62%"
              outerRadius="100%"
              startAngle={90}
              endAngle={-270}
              stroke="var(--card)"
              strokeWidth={2}
              isAnimationActive={false}
            >
              {data.map((d) => (
                <Cell key={d.key} fill={d.color} />
              ))}
            </Pie>
            <Tooltip
              content={({ active, payload }) => {
                const d = payload?.[0]?.payload as (typeof data)[number] | undefined;
                return active && d ? (
                  <TooltipBox
                    rows={[
                      {
                        label: d.label,
                        value: t("tokensPct", { value: fmt.tokens(d.tokens), pct: pct(d.tokens) }),
                        color: d.color,
                      },
                    ]}
                  />
                ) : null;
              }}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-semibold text-2xl tabular-nums">{pct(useful)} %</span>
          <span className="text-muted-foreground text-xs">{t("usefulShort")}</span>
        </div>
      </div>
      <ul className="flex min-w-40 flex-1 flex-col gap-2 text-sm">
        {data.map((d) => (
          <li key={d.key} className="flex items-center gap-2">
            <span className="size-2.5 shrink-0 rounded-[3px]" style={{ background: d.color }} />
            <span>{d.label}</span>
            <span className="ml-auto text-muted-foreground tabular-nums">
              {t("tokensPct", { value: fmt.tokens(d.tokens), pct: pct(d.tokens) })}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ---------------------------------------------------------------- tokens by kind */

export function KindStackedBar({
  kinds,
}: {
  kinds: { kind: FileKind; tokens: number; files: number; noise: boolean }[];
}) {
  const t = useTranslations("overview.charts");
  const td = useTranslations("domain.fileKind");
  const fmt = useFormat();
  const total = kinds.reduce((s, k) => s + k.tokens, 0);
  const row = Object.fromEntries([["name", "tokens"], ...kinds.map((k) => [k.kind, k.tokens])]);
  const pct = (v: number) => (total > 0 ? Math.round((v / total) * 100) : 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="h-10">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={[row]}
            layout="vertical"
            margin={{ top: 0, right: 0, bottom: 0, left: 0 }}
          >
            <XAxis type="number" hide domain={[0, total]} />
            <YAxis type="category" dataKey="name" hide />
            <Tooltip
              cursor={false}
              content={({ active, payload }) =>
                active && payload?.length ? (
                  <TooltipBox
                    rows={kinds.map((k) => ({
                      label: td(k.kind),
                      value: t("tokensPct", { value: fmt.tokens(k.tokens), pct: pct(k.tokens) }),
                      color: kindColor(k.kind),
                    }))}
                  />
                ) : null
              }
            />
            {kinds.map((k) => (
              <Bar
                key={k.kind}
                dataKey={k.kind}
                stackId="kinds"
                fill={kindColor(k.kind)}
                stroke="var(--card)"
                strokeWidth={2}
                isAnimationActive={false}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <ul className="flex flex-col gap-1.5 text-sm">
        {kinds.map((k) => (
          <li key={k.kind} className="flex items-center gap-2">
            <span
              className="size-2.5 shrink-0 rounded-[3px]"
              style={{ background: kindColor(k.kind) }}
            />
            <span>{td(k.kind)}</span>
            {k.noise ? (
              <span className="rounded bg-muted px-1 text-[10px] text-muted-foreground uppercase">
                {t("noiseTag")}
              </span>
            ) : null}
            <span className="ml-auto text-muted-foreground tabular-nums">
              {t("tokensPct", { value: fmt.tokens(k.tokens), pct: pct(k.tokens) })}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ---------------------------------------------------------------- top N bars */

export interface BarItem {
  name: string;
  tokens: number;
  /** Shown in the tooltip under the name, for example "42 files". */
  detail?: string;
}

const ROW = 28;

export function TopBars({ items, label }: { items: BarItem[]; label: string }) {
  const fmt = useFormat();
  const t = useTranslations("overview.charts");
  const short = (s: string) => (s.length > 22 ? `${s.slice(0, 21)}…` : s);

  return (
    <div style={{ height: items.length * ROW + 8 }} role="img" aria-label={label}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={items} layout="vertical" margin={{ top: 4, right: 56, bottom: 4, left: 0 }}>
          <XAxis type="number" hide />
          <YAxis
            type="category"
            dataKey="name"
            width={150}
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
            tickFormatter={short}
          />
          <Tooltip
            cursor={{ fill: "var(--muted)", opacity: 0.6 }}
            content={({ active, payload }) => {
              const d = payload?.[0]?.payload as BarItem | undefined;
              return active && d ? (
                <TooltipBox
                  rows={[
                    {
                      label: d.name,
                      value: t("tokens", { value: fmt.tokens(d.tokens) }),
                      color: "var(--viz-1)",
                    },
                    ...(d.detail ? [{ label: d.detail, value: "" }] : []),
                  ]}
                />
              ) : null;
            }}
          />
          <Bar
            dataKey="tokens"
            fill="var(--viz-1)"
            radius={[0, 4, 4, 0]}
            barSize={14}
            isAnimationActive={false}
          >
            <LabelList
              dataKey="tokens"
              position="right"
              formatter={(v: unknown) => fmt.tokens(Number(v))}
              style={{ fontSize: 11, fill: "var(--muted-foreground)" }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
