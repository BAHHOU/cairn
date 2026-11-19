import type { ChangeSummary, ChangeVerdict } from "@cairn/shared";
import { CircleCheck, Eye, GitPullRequestArrow, OctagonX, Ticket } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { useFormat } from "@/i18n/format";
import { cn } from "@/lib/utils";

export const VERDICT_STYLE: Record<
  ChangeVerdict,
  { icon: typeof OctagonX; badge: "critical" | "warning" | "success"; text: string }
> = {
  blocked: { icon: OctagonX, badge: "critical", text: "text-destructive" },
  review: { icon: Eye, badge: "warning", text: "text-warning-ink" },
  pass: { icon: CircleCheck, badge: "success", text: "text-success" },
};

export function ChangeVerdictBadge({ verdict }: { verdict: ChangeVerdict }) {
  const t = useTranslations("domain.change.verdict");
  const { icon: Icon, badge } = VERDICT_STYLE[verdict];
  return (
    <Badge variant={badge} className="gap-1">
      <Icon className="size-3.5" aria-hidden />
      {t(verdict)}
    </Badge>
  );
}

/**
 * Merge requests as GitLab lists them: one row each, title first, the facts on a quiet second
 * line, the verdict on the right. `showProject` names the project in the workspace-wide queue.
 */
export function ChangeList({
  changes,
  showProject,
}: {
  changes: ChangeSummary[];
  showProject: boolean;
}) {
  const t = useTranslations("changeControl.list");
  const fmt = useFormat();

  if (changes.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 px-6 py-12 text-center text-muted-foreground text-sm">
        <GitPullRequestArrow className="size-6" aria-hidden />
        {t("empty")}
      </div>
    );
  }

  return (
    <ul className="divide-y" aria-label={t("label")}>
      {changes.map((c) => {
        const findings = c.counts.blocker + c.counts.critical + c.counts.major + c.counts.minor;
        const Icon = VERDICT_STYLE[c.verdict].icon;
        return (
          <li
            key={`${c.projectId}!${c.iid}`}
            className="group relative flex gap-3 px-4 py-3 hover:bg-muted/40"
          >
            <Icon
              className={cn("mt-0.5 size-4 shrink-0", VERDICT_STYLE[c.verdict].text)}
              aria-hidden
            />
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <Link
                href={`/projects/${c.projectId}/changes/${c.iid}`}
                className="truncate font-medium text-sm after:absolute after:inset-0 group-hover:text-primary-ink"
              >
                {c.title}
              </Link>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-muted-foreground text-xs">
                {showProject ? (
                  <span className="font-medium text-foreground/80">{c.projectName}</span>
                ) : null}
                <span>
                  {t("meta", { iid: c.iid, author: c.author, date: fmt.date(c.updatedAt) })}
                </span>
                {c.tickets.length > 0 ? (
                  c.tickets.map((key) => (
                    <span key={key} className="inline-flex items-center gap-1 font-mono">
                      <Ticket className="size-3" aria-hidden />
                      {key}
                    </span>
                  ))
                ) : (
                  <span className="text-destructive">{t("noTicket")}</span>
                )}
                {c.zones.map((zone) => (
                  <Badge key={zone} variant="outline" className="px-1.5 py-0 text-[11px]">
                    {zone}
                  </Badge>
                ))}
              </div>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              <ChangeVerdictBadge verdict={c.verdict} />
              <span className="text-muted-foreground text-xs">
                {t("findings", { count: findings })}
                {c.counts.blocker > 0 ? ` · ${t("worst", { count: c.counts.blocker })}` : null}
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
