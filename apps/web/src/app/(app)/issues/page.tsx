import { SEVERITIES } from "@cairn/shared";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { IssueTable } from "@/components/issue-table";
import { PageHeader } from "@/components/page";
import { Card } from "@/components/ui/card";
import { getApi } from "@/lib/api";
import { cn } from "@/lib/utils";

export default async function IssuesPage({
  searchParams,
}: {
  searchParams: Promise<{ severity?: string }>;
}) {
  const t = await getTranslations("issues.page");
  const { severity } = await searchParams;
  const active = SEVERITIES.find((s) => s === severity);
  const issues = await (await getApi()).issues.list(active ? { severity: active } : undefined);

  const chip = (href: string, label: string, on: boolean) => (
    <Link
      key={label}
      href={href}
      aria-current={on ? "true" : undefined}
      className={cn(
        "rounded-full border px-3 py-1 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50",
        on ? "border-transparent bg-primary text-primary-foreground" : "hover:bg-accent",
      )}
    >
      {label}
    </Link>
  );

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <div className="flex flex-wrap gap-2">
        {chip("/issues", t("all"), !active)}
        {SEVERITIES.map((s) => chip(`/issues?severity=${s}`, t(`filter.${s}`), active === s))}
      </div>
      <Card className="gap-0 py-0">
        <IssueTable issues={issues} />
      </Card>
    </>
  );
}
