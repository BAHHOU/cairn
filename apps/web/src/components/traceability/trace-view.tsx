import {
  type ChangeVerdict,
  type DeliverySummary,
  TRACE_CATEGORIES,
  type Traceability,
  type TraceCategory,
  type TraceFinding,
  type TraceRow,
} from "@cairn/shared";
import {
  Bot,
  CircleCheck,
  FilePenLine,
  GitCommitHorizontal,
  GitMerge,
  type LucideIcon,
  PackageX,
  ShieldX,
  Waypoints,
} from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { TrackerLogo } from "@/components/changes/tracker-logo";
import { Panel } from "@/components/import/overview/dashboard";
import { useFormat } from "@/i18n/format";
import { SEVERITY_PILL } from "@/lib/tone";
import { cn } from "@/lib/utils";

/** Finding texts take different arguments per kind (asserted by the catalog test). */
type DynamicT = (key: string, values?: Record<string, string | number>) => string;

const CATEGORY: Record<TraceCategory, { Icon: LucideIcon; tone: string; tint: string }> = {
  unrequested: { Icon: ShieldX, tone: "text-destructive", tint: "bg-destructive/10" },
  notShipped: { Icon: PackageX, tone: "text-warning-ink", tint: "bg-warning/18" },
  changedAfterReview: { Icon: FilePenLine, tone: "text-warning-ink", tint: "bg-warning/18" },
  agent: { Icon: Bot, tone: "text-info", tint: "bg-info/10" },
};

const VERDICT_TONE: Record<ChangeVerdict, string> = {
  pass: "text-success",
  review: "text-warning-ink",
  blocked: "text-destructive",
};

const pill = "inline-flex shrink-0 items-center rounded-md px-2 py-0.5 font-medium text-xs";

export function parseCategory(value: string | string[] | undefined): TraceCategory | null {
  const v = Array.isArray(value) ? value[0] : value;
  return (TRACE_CATEGORIES as readonly string[]).includes(v ?? "") ? (v as TraceCategory) : null;
}

/** The four questions as counters; each one filters the matrix. */
function Categories({
  trace,
  filter,
  basePath,
}: {
  trace: Traceability;
  filter: TraceCategory | null;
  basePath: string;
}) {
  const t = useTranslations("domain.trace.category");
  return (
    <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {TRACE_CATEGORIES.map((c) => {
        const { Icon, tone, tint } = CATEGORY[c];
        const count = trace.counts[c];
        const selected = filter === c;
        return (
          <li key={c}>
            <Link
              href={selected ? basePath : `${basePath}?c=${c}`}
              aria-current={selected ? "true" : undefined}
              scroll={false}
              className={cn(
                "flex h-full flex-col gap-3 rounded-xl border bg-card p-4 shadow-[0_1px_2px_oklch(0_0_0/0.04)] outline-none transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring/50",
                selected && "border-foreground/60 ring-1 ring-foreground/20",
              )}
            >
              <span className="flex items-center justify-between gap-3">
                <span className={cn("grid size-9 place-items-center rounded-lg", tint)}>
                  <Icon className={cn("size-[18px]", tone)} aria-hidden />
                </span>
                <span
                  className={cn(
                    "font-semibold text-3xl tabular-nums leading-none",
                    count === 0 && "text-muted-foreground",
                  )}
                >
                  {count}
                </span>
              </span>
              <span className="flex flex-col gap-0.5">
                <span className="font-medium text-sm">{t(`${c}.label`)}</span>
                <span className="text-pretty text-muted-foreground text-xs">{t(`${c}.hint`)}</span>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function Request({ row }: { row: TraceRow }) {
  const t = useTranslations("traceability");
  if (!row.ticket) {
    return (
      <span className="flex items-center gap-2 text-muted-foreground text-sm">
        <span className={cn(pill, "bg-destructive/10 text-destructive")}>{t("noTicket")}</span>
      </span>
    );
  }
  const tk = row.ticket;
  const key = tk.url ? (
    <a href={tk.url} target="_blank" rel="noopener noreferrer" className="hover:text-primary">
      {tk.key}
    </a>
  ) : (
    tk.key
  );
  return (
    <span className="flex min-w-0 items-start gap-2.5">
      {tk.tracker ? <TrackerLogo kind={tk.tracker} size={26} /> : null}
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-mono text-xs">{key}</span>
          {tk.status ? (
            <span className={cn(pill, "bg-muted px-1.5 text-muted-foreground")}>{tk.status}</span>
          ) : null}
        </span>
        <span className="text-pretty font-medium text-sm">{tk.title}</span>
      </span>
    </span>
  );
}

function Delivery({ d }: { d: DeliverySummary }) {
  const t = useTranslations("traceability");
  const tv = useTranslations("domain.change.verdict");
  const fmt = useFormat();
  const Icon = d.kind === "merge" ? GitMerge : GitCommitHorizontal;
  const ref = d.url ? (
    <a href={d.url} target="_blank" rel="noopener noreferrer" className="hover:text-primary">
      {d.ref}
    </a>
  ) : (
    d.ref
  );
  return (
    <span className="flex min-w-0 items-start gap-2">
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-mono text-xs">{ref}</span>
          {d.kind === "push" ? (
            <span className={cn(pill, "bg-destructive/10 px-1.5 text-destructive")}>
              {t("directPush")}
            </span>
          ) : null}
          {d.agent ? (
            <span className={cn(pill, "gap-1 bg-info/10 px-1.5 text-info")}>
              <Bot className="size-3" aria-hidden />
              {d.agent.agent}
            </span>
          ) : null}
          {d.verdict ? (
            <span className={cn("text-xs", VERDICT_TONE[d.verdict])}>{tv(d.verdict)}</span>
          ) : null}
        </span>
        <span className="truncate text-sm">{d.title}</span>
        <span className="text-muted-foreground text-xs">
          {d.authorId} · {fmt.date(d.at)}
        </span>
      </span>
    </span>
  );
}

function Finding({ f }: { f: TraceFinding }) {
  const t = useTranslations("domain.trace.finding") as unknown as DynamicT;
  const tsev = useTranslations("domain.severity");
  const params = { count: 0, agent: "", ...(f.params ?? {}) };
  return (
    <li className="flex items-start gap-2">
      <span className={cn(pill, "w-[4.5rem] justify-center", SEVERITY_PILL[f.severity])}>
        {tsev(f.severity)}
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="font-medium text-sm">{t(`${f.kind}.title`, params)}</span>
        <span className="text-pretty text-muted-foreground text-xs">
          {t(`${f.kind}.detail`, params)}
        </span>
      </span>
    </li>
  );
}

function Cell({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <span className="text-muted-foreground text-xs lg:hidden">{label}</span>
      {children}
    </div>
  );
}

/** The request ↔ delivery matrix: one row per ticket, and per delivery nothing asked for. */
export function TraceView({
  trace,
  filter,
  basePath,
  branch,
  aside,
}: {
  trace: Traceability;
  filter: TraceCategory | null;
  basePath: string;
  branch: string;
  aside?: ReactNode;
}) {
  const t = useTranslations("traceability");
  const tc = useTranslations("domain.trace.category");
  const rows = filter
    ? trace.rows.filter((r) => r.findings.some((f) => f.category === filter))
    : trace.rows;
  const columns = {
    request: t("col.request"),
    delivered: t("col.delivered", { branch }),
    findings: t("col.findings"),
  };

  return (
    <div className="flex flex-col gap-5">
      <Categories trace={trace} filter={filter} basePath={basePath} />
      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <Panel
          title={t("matrixTitle")}
          Icon={Waypoints}
          action={
            filter ? (
              <Link
                href={basePath}
                scroll={false}
                className="text-[13px] font-medium hover:text-primary"
              >
                {t("showAll")}
              </Link>
            ) : (
              <span className="text-muted-foreground text-xs">
                {t("totals", {
                  tickets: trace.totals.tickets,
                  deliveries: trace.totals.deliveries,
                  agents: trace.totals.agentDeliveries,
                })}
              </span>
            )
          }
        >
          {filter ? (
            <p className="-mt-2 text-muted-foreground text-xs">
              {t("filtered", { category: tc(`${filter}.label`) })}
            </p>
          ) : null}
          {rows.length === 0 ? (
            <p className="flex items-center gap-2 rounded-lg border border-dashed p-4 text-muted-foreground text-sm">
              <CircleCheck className="size-4 text-success" aria-hidden />
              {filter ? t("emptyFilter") : t("empty", { branch })}
            </p>
          ) : (
            <div className="-mx-5 flex flex-col">
              <div className="hidden grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.2fr)] gap-5 border-b px-5 pb-2 text-muted-foreground text-xs lg:grid">
                <span>{columns.request}</span>
                <span>{columns.delivered}</span>
                <span>{columns.findings}</span>
              </div>
              <ul className="divide-y">
                {rows.map((row) => (
                  <li
                    key={row.key}
                    className="grid grid-cols-[minmax(0,1fr)] gap-4 px-5 py-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.2fr)] lg:gap-5"
                  >
                    <Cell label={columns.request}>
                      <Request row={row} />
                    </Cell>
                    <Cell label={columns.delivered}>
                      {row.deliveries.length === 0 ? (
                        <span className={cn(pill, "self-start bg-warning/18 text-warning-ink")}>
                          {t("notOnMain", { branch })}
                        </span>
                      ) : (
                        <span className="flex flex-col gap-3">
                          {row.deliveries.map((d) => (
                            <Delivery key={d.ref} d={d} />
                          ))}
                        </span>
                      )}
                    </Cell>
                    <Cell label={columns.findings}>
                      {row.findings.length === 0 ? (
                        <span className="flex items-center gap-1.5 text-success text-sm">
                          <CircleCheck className="size-4" aria-hidden />
                          {t("conforms")}
                        </span>
                      ) : (
                        <ul className="flex flex-col gap-2.5">
                          {row.findings
                            .filter((f) => !filter || f.category === filter)
                            .map((f) => (
                              <Finding
                                key={`${f.kind}${f.delivery ?? ""}${f.ticket ?? ""}`}
                                f={f}
                              />
                            ))}
                        </ul>
                      )}
                    </Cell>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Panel>
        {aside}
      </div>
    </div>
  );
}
