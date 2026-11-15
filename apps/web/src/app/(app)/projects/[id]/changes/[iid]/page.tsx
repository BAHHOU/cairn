import { ExternalLink, GitBranch } from "lucide-react";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ChangeVerdictBadge } from "@/components/changes/change-list";
import {
  ApprovalPanel,
  FileChanges,
  FindingList,
  SpecPanel,
  VerdictBanner,
} from "@/components/changes/change-review";
import { buttonVariants } from "@/components/ui/button";
import { getFormat } from "@/i18n/format";
import { getApi } from "@/lib/api";
import { loadLiveReview } from "@/lib/changes/live";

const Branch = ({ children }: { children: React.ReactNode }) => (
  <code className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-xs">
    <GitBranch className="size-3" aria-hidden />
    {children}
  </code>
);

/**
 * One merge request under change control. Read top-down: the verdict, why, the spec as approved
 * against the spec today, who had to approve, and the lines in question.
 */
export default async function ChangeReviewPage({
  params,
}: {
  params: Promise<{ id: string; iid: string }>;
}) {
  const { id, iid } = await params;
  const number = Number(iid);
  if (!Number.isInteger(number) || number <= 0) notFound();
  const demo = await (await getApi()).changes.get(id, number);
  const live = demo ? null : await loadLiveReview(id, number);
  if (!demo && !live) notFound();
  if (live && !live.ok) {
    // GitLab answered for the list a moment ago: a failure here is transient or a revoked token.
    const tl = await getTranslations("changeControl.live");
    return <p className="text-muted-foreground text-sm">{tl(`reason.${live.reason}`)}</p>;
  }
  const review = demo ?? (live?.ok ? live.value : null);
  if (!review) notFound();

  const t = await getTranslations("changeControl.detail");
  const fmt = await getFormat();
  const { summary, change } = review;

  return (
    <>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <ChangeVerdictBadge verdict={summary.verdict} />
            <span className="text-muted-foreground text-sm">{summary.projectName}</span>
          </div>
          <h1 className="font-semibold text-2xl tracking-tight">
            {t("title", { iid: summary.iid, title: summary.title })}
          </h1>
          <p className="flex flex-wrap items-center gap-1.5 text-muted-foreground text-sm">
            {t.rich("meta", {
              author: summary.author,
              date: fmt.date(summary.updatedAt),
              source: summary.sourceBranch,
              target: summary.targetBranch,
              branch: (chunks) => <Branch>{chunks}</Branch>,
            })}
          </p>
        </div>
        {change.url ? (
          <a
            href={change.url}
            target="_blank"
            rel="noreferrer"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            <ExternalLink aria-hidden />
            {t("open")}
          </a>
        ) : null}
      </header>

      <VerdictBanner review={review} />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="flex min-w-0 flex-col gap-6">
          <FindingList review={review} />
          <FileChanges review={review} />
        </div>
        <div className="flex min-w-0 flex-col gap-6">
          <SpecPanel review={review} />
          <ApprovalPanel review={review} />
        </div>
      </div>
    </>
  );
}
