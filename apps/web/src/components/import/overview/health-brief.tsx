import type { HealthArea, HealthBrief, HealthLight, HealthVerdict } from "@cairn/shared";
import {
  ArrowRight,
  Boxes,
  CircleCheck,
  CircleDashed,
  CircleHelp,
  Cloud,
  type LucideIcon,
  Rocket,
  Shield,
  ShieldAlert,
  Sparkles,
  TriangleAlert,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

/** Reason sentences take different arguments per id; every id has its message (catalog test). */
type DynamicT = (key: string, values?: Record<string, number>) => string;

const AREA_ICON: Record<HealthArea, LucideIcon> = {
  security: Shield,
  aiReadiness: Sparkles,
  architecture: Boxes,
  delivery: Rocket,
  infrastructure: Cloud,
  knowledge: Users,
};

/** Where to read the evidence, relative to the project. */
const AREA_HREF: Record<HealthArea, string> = {
  security: "#actions",
  aiReadiness: "#readiness",
  architecture: "/architecture",
  delivery: "/delivery",
  infrastructure: "/delivery",
  knowledge: "/docs",
};

const LIGHT_STYLE: Record<HealthLight, { dot: string; card: string }> = {
  good: { dot: "bg-primary", card: "border-border" },
  watch: { dot: "bg-warning", card: "border-warning/50" },
  risk: { dot: "bg-destructive", card: "border-destructive/50 bg-destructive/5" },
  unknown: { dot: "bg-muted-foreground/40", card: "border-dashed" },
};

const VERDICT_STYLE: Record<HealthVerdict, { Icon: LucideIcon; tone: string; ring: string }> = {
  notSafe: {
    Icon: ShieldAlert,
    tone: "text-destructive",
    ring: "border-destructive/40 bg-destructive/5",
  },
  atRisk: { Icon: TriangleAlert, tone: "text-destructive", ring: "border-destructive/40" },
  watch: { Icon: TriangleAlert, tone: "text-warning", ring: "border-warning/50 bg-warning/5" },
  healthy: { Icon: CircleCheck, tone: "text-primary", ring: "border-primary/40 bg-primary/5" },
  unknown: { Icon: CircleDashed, tone: "text-muted-foreground", ring: "border-dashed" },
};

/**
 * The answer a non-specialist came for, before any chart: can this project be trusted, which part
 * is the problem, and who should act. Every light links to the evidence behind it.
 */
export function HealthBriefPanel({ brief, projectId }: { brief: HealthBrief; projectId: string }) {
  const t = useTranslations("health");
  const reason = useTranslations("health.reason") as unknown as DynamicT;
  const style = VERDICT_STYLE[brief.verdict];
  const counts = brief.signals.reduce(
    (acc, s) => {
      acc[s.light] += 1;
      return acc;
    },
    { good: 0, watch: 0, risk: 0, unknown: 0 } as Record<HealthLight, number>,
  );

  return (
    <section aria-labelledby="health-title" className="flex flex-col gap-4">
      <div className={cn("flex flex-wrap items-start gap-4 rounded-xl border p-5", style.ring)}>
        <style.Icon className={cn("mt-0.5 size-7 shrink-0", style.tone)} aria-hidden />
        <div className="flex min-w-60 flex-1 flex-col gap-1">
          <p className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
            {t("eyebrow")}
          </p>
          <h2 id="health-title" className="font-semibold text-xl">
            {t(`verdict.${brief.verdict}.title`)}
          </h2>
          <p className="text-sm">{t(`verdict.${brief.verdict}.message`, counts)}</p>
        </div>
        <span className="text-xs text-muted-foreground">{t("derivedFromScan")}</span>
      </div>

      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {brief.signals.map((s) => {
          const Icon = AREA_ICON[s.area];
          const light = LIGHT_STYLE[s.light];
          const href = AREA_HREF[s.area];
          return (
            <li
              key={s.area}
              className={cn("flex flex-col gap-2 rounded-xl border bg-card p-4", light.card)}
            >
              <div className="flex items-center gap-2">
                <Icon className="size-4 text-muted-foreground" aria-hidden />
                <h3 className="flex-1 font-medium text-sm">{t(`area.${s.area}`)}</h3>
                <span className="flex items-center gap-1.5 text-muted-foreground text-xs">
                  <span className={cn("size-2.5 rounded-full", light.dot)} aria-hidden />
                  {t(`light.${s.light}`)}
                </span>
              </div>
              <p className="flex-1 text-sm">{reason(`${s.area}.${s.reason}`, s.params)}</p>
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="text-muted-foreground">
                  {t("owner.label", { owner: t(`owner.${s.owner}`) })}
                </span>
                <Link
                  href={href.startsWith("#") ? href : `/projects/${projectId}${href}`}
                  className="inline-flex items-center gap-1 font-medium hover:text-primary"
                >
                  {t("open")}
                  <ArrowRight className="size-3" aria-hidden />
                </Link>
              </div>
            </li>
          );
        })}
      </ul>

      <div className="flex flex-col gap-2 rounded-xl border border-dashed p-4">
        <p className="flex items-center gap-2 font-medium text-sm">
          <CircleHelp className="size-4 text-muted-foreground" aria-hidden />
          {t("notChecked.title")}
        </p>
        <p className="text-muted-foreground text-xs">{t("notChecked.hint")}</p>
        <ul className="flex flex-wrap gap-2">
          {brief.notChecked.map((id) => (
            <li key={id} className="rounded-md bg-muted px-2 py-1 text-muted-foreground text-xs">
              {t(`notChecked.item.${id}`)}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
