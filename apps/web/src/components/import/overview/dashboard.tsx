import type {
  HealthArea,
  HealthBrief,
  HealthLight,
  HealthVerdict,
  ImportStatus,
  ImportView,
  ModuleStat,
  Readiness,
  ScanView,
  Severity,
} from "@cairn/shared";
import {
  Activity,
  ArrowRight,
  Boxes,
  ChartColumn,
  ChevronRight,
  Cloud,
  Gauge,
  HeartPulse,
  Info,
  KeyRound,
  Layers,
  type LucideIcon,
  Rocket,
  Shield,
  ShieldAlert,
  ShieldCheck,
  ShieldQuestion,
  ShieldX,
  Sparkles,
  TriangleAlert,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { CSSProperties, ReactNode } from "react";
import { useFormat } from "@/i18n/format";
import { cn } from "@/lib/utils";

/** Reason and gap ids take different arguments per id (asserted by the catalog test). */
type DynamicT = (key: string, values?: Record<string, number>) => string;

const _providerName = (p: string) => (p === "github" ? "GitHub" : "GitLab");

/* ---------------------------------------------------------------- shared */

export function Panel({
  title,
  Icon,
  action,
  className,
  children,
}: {
  title: string;
  Icon: LucideIcon;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={cn(
        "flex min-w-0 flex-col gap-4 rounded-xl border bg-card p-5 shadow-[0_1px_2px_oklch(0_0_0/0.04)]",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-semibold text-[15px]">
          <Icon className="size-[18px] text-muted-foreground" aria-hidden />
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function ViewAll({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1 rounded font-medium text-[13px] outline-none hover:text-primary focus-visible:ring-2 focus-visible:ring-ring/50"
    >
      {label}
      <ArrowRight className="size-3.5" aria-hidden />
    </Link>
  );
}

const pill = "inline-flex shrink-0 items-center rounded-md px-2 py-0.5 font-medium text-xs";

/* ---------------------------------------------------------------- posture banner */

/** Light-on-dark tones: the banner is dark in both themes. */
const VERDICT: Record<HealthVerdict, { Icon: LucideIcon; tone: string }> = {
  notSafe: { Icon: ShieldX, tone: "oklch(0.72 0.17 25)" },
  atRisk: { Icon: ShieldAlert, tone: "oklch(0.72 0.17 25)" },
  watch: { Icon: ShieldAlert, tone: "oklch(0.84 0.14 80)" },
  healthy: { Icon: ShieldCheck, tone: "oklch(0.8 0.14 162)" },
  unknown: { Icon: ShieldQuestion, tone: "oklch(0.78 0.01 255)" },
};

export function PostureBanner({
  brief,
  readiness,
  scan,
  className,
}: {
  brief: HealthBrief;
  readiness: Readiness;
  scan: ScanView;
  className?: string;
}) {
  const t = useTranslations("health");
  const td = useTranslations("overview.dash");
  const counts = brief.signals.reduce(
    (acc, s) => {
      acc[s.light] += 1;
      return acc;
    },
    { good: 0, watch: 0, risk: 0, unknown: 0 } as Record<HealthLight, number>,
  );
  const { stats } = scan.report;
  const noisePct = stats.tokens > 0 ? Math.round((stats.tokensNoise / stats.tokens) * 100) : 0;
  const { Icon, tone } = VERDICT[brief.verdict];
  const stat: { Icon: LucideIcon; value: ReactNode; label: string }[] = [
    { Icon: KeyRound, value: readiness.blockers, label: td("blockers") },
    {
      Icon: Gauge,
      value: (
        <>
          {readiness.score ?? "—"}
          <span className="font-normal text-base text-white/55">/100</span>
        </>
      ),
      label: td("readiness"),
    },
    { Icon: Layers, value: `${noisePct} %`, label: td("noise") },
  ];

  return (
    <section
      aria-labelledby="posture-title"
      className={cn(
        "relative isolate flex flex-wrap items-center justify-between gap-x-8 gap-y-6 overflow-hidden rounded-xl p-6 text-white shadow-[0_8px_24px_-12px_oklch(0.2_0.03_220/0.55)]",
        className,
      )}
      style={
        {
          "--tone": tone,
          background:
            "radial-gradient(90% 160% at 100% 0%, color-mix(in oklch, var(--tone) 26%, transparent), transparent 60%), linear-gradient(120deg, oklch(0.25 0.03 200), oklch(0.17 0.015 235))",
        } as CSSProperties
      }
    >
      <div className="flex min-w-0 max-w-xl items-start gap-4">
        <span
          className="grid size-14 shrink-0 place-items-center rounded-xl"
          style={{ background: "color-mix(in oklch, var(--tone) 18%, transparent)" }}
        >
          <Icon className="size-8" style={{ color: "var(--tone)" }} aria-hidden />
        </span>
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-[13px] text-white/65">{td("posture")}</p>
          <h2
            id="posture-title"
            className="text-balance font-semibold text-2xl leading-tight tracking-[-0.015em]"
          >
            {t(`verdict.${brief.verdict}.title`)}
          </h2>
          <p className="text-pretty text-sm text-white/75">
            {t(`verdict.${brief.verdict}.message`, counts)}
          </p>
        </div>
      </div>
      <dl className="flex flex-wrap gap-y-4">
        {stat.map(({ Icon: StatIcon, value, label }, i) => (
          <div
            key={label}
            className={cn(
              "flex flex-col-reverse justify-end gap-1 pr-6",
              i > 0 && "border-white/15 border-l pl-6",
            )}
          >
            <dt className="text-[13px] text-white/65">{label}</dt>
            <dd className="flex items-center gap-2 font-semibold text-2xl tabular-nums">
              <StatIcon className="size-5 text-white/70" aria-hidden />
              {value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/* ---------------------------------------------------------------- tokens per module */

function moduleOf(path: string, modules: ModuleStat[]): string {
  let best = ".";
  for (const m of modules) {
    if (m.path === ".") continue;
    if ((path === m.path || path.startsWith(`${m.path}/`)) && m.path.length > best.length) {
      best = m.path;
    }
  }
  return best;
}

export function TokensByModule({ scan, className }: { scan: ScanView; className?: string }) {
  const t = useTranslations("overview.dash");
  const fmt = useFormat();
  const { modules, noise } = scan.report.stats;
  const approx = modules.some((m) => m.tokensNoise === undefined);
  const fallback = new Map<string, number>();
  if (approx) {
    for (const f of noise) {
      const key = moduleOf(f.path, modules);
      fallback.set(key, (fallback.get(key) ?? 0) + f.tokens);
    }
  }
  const rows = modules
    .filter((m) => m.tokens > 0)
    .slice(0, 8)
    .map((m) => {
      const noiseTokens = Math.min(m.tokens, m.tokensNoise ?? fallback.get(m.path) ?? 0);
      return { key: m.path, name: m.name, tokens: m.tokens, noise: noiseTokens };
    });
  const rest = modules.filter((m) => m.tokens > 0).length - rows.length;
  const max = Math.max(1, ...rows.map((r) => r.tokens));

  return (
    <Panel
      title={t("tokensTitle")}
      Icon={ChartColumn}
      className={className}
      action={
        <span className="flex items-center gap-3 text-muted-foreground text-xs">
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-primary" aria-hidden />
            {t("useful")}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-warning" aria-hidden />
            {t("noiseLegend")}
          </span>
        </span>
      }
    >
      <p className="-mt-2 text-muted-foreground text-xs">{t("tokensHint")}</p>
      <ul className="flex flex-col gap-2.5">
        {rows.map((r) => (
          <li
            key={r.key}
            className="grid grid-cols-[minmax(0,7.5rem)_minmax(0,1fr)_3.5rem] items-center gap-3 text-sm"
            title={`${r.name}: ${fmt.tokens(r.tokens)}`}
          >
            <span className="truncate">{r.name}</span>
            <span className="flex h-2.5 overflow-hidden rounded-full bg-muted">
              <span
                className="h-full bg-primary"
                style={{ width: `${((r.tokens - r.noise) / max) * 100}%` }}
              />
              <span className="h-full bg-warning" style={{ width: `${(r.noise / max) * 100}%` }} />
            </span>
            <span className="text-right text-muted-foreground tabular-nums">
              {fmt.tokens(r.tokens)}
            </span>
          </li>
        ))}
      </ul>
      {rest > 0 || approx ? (
        <p className="mt-auto flex flex-col gap-1 border-t pt-3 text-muted-foreground text-xs">
          {rest > 0 ? <span>{t("otherModules", { count: rest })}</span> : null}
          {approx ? (
            <span className="flex items-start gap-1.5">
              <Info className="mt-px size-3.5 shrink-0" aria-hidden />
              {t("noiseApprox")}
            </span>
          ) : null}
        </p>
      ) : null}
    </Panel>
  );
}

/* ---------------------------------------------------------------- top risks */

const SEVERITY_PILL: Record<Severity, string> = {
  blocker: "bg-destructive/12 text-destructive",
  critical: "bg-destructive/10 text-destructive",
  major: "bg-warning/18 text-warning-ink",
  minor: "bg-muted text-muted-foreground",
};

export function TopRisks({
  readiness,
  projectId,
  className,
}: {
  readiness: Readiness;
  projectId: string;
  className?: string;
}) {
  const t = useTranslations("overview.dash");
  const tg = useTranslations("overview.gaps") as unknown as DynamicT;
  const tsev = useTranslations("domain.severity");
  const fmt = useFormat();
  const href = `/projects/${projectId}/ai-readiness`;
  const gaps = readiness.gaps.slice(0, 5);
  const saved = readiness.gaps.reduce((n, g) => n + (g.tokensSaved ?? 0), 0);

  return (
    <Panel
      title={t("risksTitle")}
      Icon={TriangleAlert}
      className={className}
      action={readiness.gaps.length > 0 ? <ViewAll href={href} label={t("viewAll")} /> : null}
    >
      {gaps.length === 0 ? (
        <p className="flex items-center gap-2 text-muted-foreground text-sm">
          <ShieldCheck className="size-4 text-primary" aria-hidden />
          {t("noRisks")}
        </p>
      ) : (
        <ul className="-mx-2 -my-1 flex flex-col divide-y">
          {gaps.map((gap) => {
            const params = gap.params ?? {};
            const sub =
              gap.tokensSaved !== null
                ? t("saves", { value: fmt.tokens(gap.tokensSaved) })
                : gap.file
                  ? gap.file.create
                    ? t("toCreate", { path: gap.file.path })
                    : gap.file.path
                  : null;
            return (
              <li key={gap.id}>
                <Link
                  href={href}
                  className="group flex items-center gap-3 rounded-lg px-2 py-3 outline-none hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring/50"
                >
                  <span
                    className={cn(pill, "w-[4.75rem] justify-center", SEVERITY_PILL[gap.severity])}
                  >
                    {tsev(gap.severity)}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-medium text-sm">
                      {tg(`item.${gap.id}.title`, params)}
                    </span>
                    {sub ? (
                      <span className="truncate text-muted-foreground text-xs">{sub}</span>
                    ) : null}
                  </span>
                  <ChevronRight
                    className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                    aria-hidden
                  />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {readiness.gaps.length > 0 ? (
        <p className="mt-auto border-t pt-3 text-muted-foreground text-xs">
          {t("risksFooter", { count: readiness.gaps.length, tokens: fmt.tokens(saved) })}
        </p>
      ) : null}
    </Panel>
  );
}

/* ---------------------------------------------------------------- health by area */

const AREA_ICON: Record<HealthArea, LucideIcon> = {
  security: Shield,
  aiReadiness: Sparkles,
  architecture: Boxes,
  delivery: Rocket,
  infrastructure: Cloud,
  knowledge: Users,
};

const AREA_HREF: Record<HealthArea, string> = {
  security: "/ai-readiness",
  aiReadiness: "/ai-readiness",
  architecture: "/architecture",
  delivery: "/delivery",
  infrastructure: "/delivery",
  knowledge: "/docs",
};

const LIGHT_PILL: Record<HealthLight, string> = {
  risk: "bg-destructive/10 text-destructive",
  watch: "bg-warning/18 text-warning-ink",
  good: "bg-primary/10 text-primary",
  unknown: "bg-muted text-muted-foreground",
};

export function AreaHealth({
  brief,
  projectId,
  className,
}: {
  brief: HealthBrief;
  projectId: string;
  className?: string;
}) {
  const t = useTranslations("health");
  const td = useTranslations("overview.dash");
  const reason = useTranslations("health.reason") as unknown as DynamicT;

  return (
    <Panel title={td("areasTitle")} Icon={HeartPulse} className={className}>
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {brief.signals.map((s) => {
          const Icon = AREA_ICON[s.area];
          return (
            <li key={s.area} className="min-w-0">
              <Link
                href={`/projects/${projectId}${AREA_HREF[s.area]}`}
                className="flex h-full flex-col gap-2 rounded-lg border p-3 outline-none transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring/50"
              >
                <span className="flex items-center gap-2.5">
                  <span className="grid size-8 shrink-0 place-items-center rounded-md bg-muted">
                    <Icon className="size-4 text-muted-foreground" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1 text-pretty font-medium text-sm leading-5">
                    {t(`area.${s.area}`)}
                  </span>
                  <span className={cn(pill, LIGHT_PILL[s.light])}>{t(`light.${s.light}`)}</span>
                </span>
                <span className="line-clamp-2 text-pretty text-muted-foreground text-xs leading-[1.125rem]">
                  {reason(`${s.area}.${s.reason}`, s.params)}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      <p className="text-muted-foreground text-xs">
        {td("notChecked", {
          items: brief.notChecked.map((id) => t(`notChecked.item.${id}`)).join(", "),
        })}
      </p>
    </Panel>
  );
}

/* ---------------------------------------------------------------- latest scan */

const STATUS_DOT: Record<ImportStatus, string> = {
  queued: "bg-muted-foreground/50",
  cloning: "bg-info",
  scanning: "bg-info",
  done: "bg-primary",
  failed: "bg-destructive",
};

/** How the latest scan was made, then every run: the provenance of the figures above. */
export function LatestScan({
  runs,
  scan,
  technologies,
  className,
}: {
  runs: ImportView[];
  scan: ScanView | null;
  technologies: string[];
  className?: string;
}) {
  const t = useTranslations("overview.dash");
  const th = useTranslations("overview.health");
  const ts = useTranslations("import.status");
  const fmt = useFormat();
  const facts: [string, ReactNode][] = scan
    ? [
        [
          t("commit"),
          <span key="c" className="font-mono text-[13px]">
            {scan.report.commit.slice(0, 8)}
          </span>,
        ],
        [
          t("scanMode"),
          scan.report.incremental.mode === "incremental"
            ? th("incremental", {
                commit: scan.report.incremental.previousCommit?.slice(0, 7) ?? "—",
              })
            : th("full"),
        ],
        [t("files"), fmt.number(scan.report.incremental.analysed)],
        [t("lines"), fmt.compact(scan.report.stats.lines)],
        [t("languages"), fmt.number(scan.report.stats.byLanguage.length)],
        [t("modulesLabel"), fmt.number(scan.report.stats.modules.length)],
        [
          th("unreadable"),
          <span key="u" className={cn(scan.report.counts.unreadable > 0 && "text-warning-ink")}>
            {fmt.number(scan.report.counts.unreadable)}
          </span>,
        ],
        [t("duration"), t("durationValue", { value: fmt.seconds(scan.report.durationMs) })],
      ]
    : [];

  return (
    <Panel title={t("scanTitle")} Icon={Activity} className={className}>
      {facts.length > 0 ? (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
          {facts.map(([label, value]) => (
            <div key={label} className="flex min-w-0 flex-col gap-0.5">
              <dt className="text-muted-foreground text-xs">{label}</dt>
              <dd className="min-w-0 truncate text-sm">{value}</dd>
            </div>
          ))}
          {technologies.length > 0 ? (
            <div className="col-span-2 flex flex-col gap-1.5">
              <dt className="text-muted-foreground text-xs">{t("stack")}</dt>
              <dd className="flex flex-wrap gap-1.5">
                {technologies.map((tech) => (
                  <span key={tech} className={cn(pill, "bg-muted text-foreground")}>
                    {tech}
                  </span>
                ))}
              </dd>
            </div>
          ) : null}
        </dl>
      ) : null}
      <div className="mt-auto flex flex-col gap-3 border-t pt-4">
        <h3 className="text-muted-foreground text-xs">{t("activityTitle")}</h3>
        <ol className="flex flex-col">
          {runs.slice(0, 4).map((run, i, list) => (
            <li key={run.id} className="relative flex gap-3 pb-3 last:pb-0">
              {i < list.length - 1 ? (
                <span
                  className="absolute top-3.5 bottom-0 left-[4.5px] w-px bg-border"
                  aria-hidden
                />
              ) : null}
              <span
                className={cn(
                  "relative mt-1.5 size-2.5 shrink-0 rounded-full",
                  STATUS_DOT[run.status],
                )}
                aria-hidden
              />
              <Link
                href={`/projects/import/${run.id}`}
                className="flex min-w-0 flex-1 items-baseline justify-between gap-3 rounded text-sm outline-none hover:text-primary focus-visible:ring-2 focus-visible:ring-ring/50"
              >
                <span className="min-w-0 truncate">
                  <span className="font-medium">{ts(run.status)}</span>
                  <span className="text-muted-foreground text-xs">
                    {" "}
                    · {t("by", { who: run.requestedBy })}
                  </span>
                </span>
                <span className="shrink-0 text-muted-foreground text-xs">
                  {fmt.ago(run.createdAt)}
                </span>
              </Link>
            </li>
          ))}
        </ol>
      </div>
    </Panel>
  );
}
