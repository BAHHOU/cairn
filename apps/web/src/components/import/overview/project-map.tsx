import type { ScanView } from "@cairn/shared";
import { ArrowUpRight, Boxes, FileText, GitBranch, Network, Rocket } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";

export function ProjectMap({ projectId, scan }: { projectId: string; scan: ScanView }) {
  const t = useTranslations("overview.projectMap");
  const items = [
    {
      key: "architecture",
      href: "architecture",
      Icon: Boxes,
      detail: t("architectureDetail", { count: scan.report.counts.archNodes }),
    },
    {
      key: "code",
      href: "code-map",
      Icon: Network,
      detail: t("codeDetail", { count: scan.report.counts.codeNodes }),
    },
    {
      key: "delivery",
      href: "delivery",
      Icon: Rocket,
      detail: scan.delivery
        ? t("deliveryDetail", { count: scan.delivery.counts.jobs })
        : t("unavailable"),
    },
    {
      key: "onboarding",
      href: "onboarding",
      Icon: GitBranch,
      detail: scan.onboarding
        ? t("onboardingDetail", { count: scan.onboarding.steps.length })
        : t("unavailable"),
    },
    {
      key: "docs",
      href: "docs",
      Icon: FileText,
      detail: scan.docs ? t("docsAvailable") : t("unavailable"),
    },
  ] as const;

  return (
    <nav aria-labelledby="project-map-title" className="border-y border-border py-4">
      <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 id="project-map-title" className="font-semibold text-sm">
          {t("title")}
        </h2>
        <p className="text-xs text-muted-foreground">{t("description")}</p>
      </div>
      <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2 xl:grid-cols-5">
        {items.map(({ key, href, Icon, detail }) => (
          <li key={key} className="min-w-0">
            <Link
              href={`/projects/${projectId}/${href}`}
              className="group flex min-h-16 items-start gap-3 rounded-md px-3 py-3 outline-none transition-colors hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-foreground">
                <Icon className="size-4" aria-hidden />
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="font-medium text-sm">{t(key)}</span>
                <span className="text-xs leading-4 text-muted-foreground">{detail}</span>
              </span>
              <ArrowUpRight
                className="mt-0.5 size-3.5 shrink-0 text-muted-foreground group-hover:text-foreground"
                aria-hidden
              />
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
