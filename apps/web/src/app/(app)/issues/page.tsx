import { SEVERITIES, type Severity } from "@cairn/shared";
import Link from "next/link";
import { IssueTable } from "@/components/issue-table";
import { PageHeader } from "@/components/page";
import { Card } from "@/components/ui/card";
import { getApi } from "@/lib/api";
import { cn } from "@/lib/utils";

const LABEL: Record<Severity, string> = {
  blocker: "Bloquants",
  critical: "Critiques",
  major: "Majeurs",
  minor: "Mineurs",
};

export default async function IssuesPage({
  searchParams,
}: {
  searchParams: Promise<{ severity?: string }>;
}) {
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
      <PageHeader
        title="Problèmes"
        description="Ce qui gêne un assistant IA ou un nouvel arrivant dans vos dépôts"
      />
      <div className="flex flex-wrap gap-2">
        {chip("/issues", "Tous", !active)}
        {SEVERITIES.map((s) => chip(`/issues?severity=${s}`, LABEL[s], active === s))}
      </div>
      <Card className="gap-0 py-0">
        <IssueTable issues={issues} />
      </Card>
    </>
  );
}
