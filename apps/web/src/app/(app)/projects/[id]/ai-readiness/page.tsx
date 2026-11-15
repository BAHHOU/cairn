import { computeAutonomy, computeReadiness } from "@cairn/shared";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { AutonomyLadder } from "@/components/ai-readiness/autonomy-ladder";
import { Gaps, ReadinessAxes, VerdictPanel } from "@/components/import/overview/sections";
import { PageHeader } from "@/components/page";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { getApi } from "@/lib/api";
import { loadImportedScan } from "@/lib/import/scan";

export const dynamic = "force-dynamic";

/**
 * AI readiness of one project, answered as a decision: what an AI may be trusted with here today,
 * what exactly unlocks the next level, and the evidence behind it.
 */
export default async function ProjectAiReadinessPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const t = await getTranslations("aiReadiness.project");
  const imported = await loadImportedScan(id);

  if (!imported) {
    // Demo projects carry a score but no checks: the ladder needs a real scan.
    const demo = await (await getApi()).projects.get(id);
    if (!demo) notFound();
    return (
      <>
        <PageHeader title={t("title")} description={demo.name} />
        <Notice
          title={t("demo.title")}
          body={t("demo.body")}
          href={`/projects/${id}`}
          action={t("demo.action")}
        />
      </>
    );
  }

  const { scan, aiIgnoreFiles, source, name } = imported;
  if (!scan) {
    return (
      <>
        <PageHeader title={t("title")} description={name} />
        <Notice
          title={t("pending.title")}
          body={t("pending.body")}
          href={`/projects/${id}`}
          action={t("pending.action")}
        />
      </>
    );
  }

  const readiness = computeReadiness({
    report: scan.report,
    docs: scan.docs,
    onboarding: scan.onboarding,
    aiIgnoreFiles,
  });
  const autonomy = computeAutonomy(readiness);

  return (
    <>
      <PageHeader title={t("title")} description={t("description", { name })} />
      <VerdictPanel readiness={readiness} />
      <section className="grid items-start gap-4 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <AutonomyLadder readiness={readiness} autonomy={autonomy} />
        <div className="flex flex-col gap-4">
          <Gaps readiness={readiness} base={source} />
          <ReadinessAxes readiness={readiness} base={source} />
        </div>
      </section>
    </>
  );
}

function Notice({
  title,
  body,
  href,
  action,
}: {
  title: string;
  body: string;
  href: string;
  action: string;
}) {
  return (
    <Card className="border-dashed">
      <CardHeader className="flex flex-col gap-3">
        <CardTitle className="text-base">{title}</CardTitle>
        <p className="text-muted-foreground text-sm">{body}</p>
        <Link href={href} className={buttonVariants({ variant: "outline", className: "w-fit" })}>
          {action}
        </Link>
      </CardHeader>
    </Card>
  );
}
