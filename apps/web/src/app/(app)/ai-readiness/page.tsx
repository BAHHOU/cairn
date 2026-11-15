import { can, computePortfolio, computeReadiness } from "@cairn/shared";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import {
  LevelDistribution,
  PortfolioFixes,
  PortfolioKpis,
  type PortfolioRow,
  PortfolioTable,
} from "@/components/ai-readiness/portfolio";
import { PageHeader, Restricted } from "@/components/page";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { viewerMayImport } from "@/lib/import/runtime";
import { loadReadinessScans } from "@/lib/import/scan";
import { getViewer } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * AI readiness of every imported repository: where the portfolio stands, which projects an agent
 * can work on today, and the few fixes that would move the most projects at once.
 */
export default async function AiReadinessPage() {
  const t = await getTranslations("aiReadiness.portfolio");
  const viewer = await getViewer();
  // Scans span every team: a viewer limited to their own team gets the access screen, not "empty".
  if (!can(viewer.role, "see.allTeams")) return <Restricted title={t("title")} />;
  const scans = await loadReadinessScans();
  const rows: PortfolioRow[] = scans.map((s) => ({
    id: s.repositoryId,
    name: s.fullPath,
    team: s.team,
    readiness: computeReadiness({
      report: s.report,
      docs: s.docs,
      onboarding: s.onboarding,
      aiIgnoreFiles: s.aiIgnoreFiles,
    }),
  }));
  const portfolio = computePortfolio(rows);

  if (rows.length === 0) {
    const canImport = viewerMayImport(viewer);
    return (
      <>
        <PageHeader title={t("title")} description={t("description")} />
        <Card className="border-dashed">
          <CardHeader className="flex flex-col gap-3">
            <CardTitle className="text-base">{t("empty.title")}</CardTitle>
            <p className="text-muted-foreground text-sm">{t("empty.body")}</p>
            {canImport ? (
              <Link href="/projects/import" className={buttonVariants({ className: "w-fit" })}>
                {t("empty.action")}
              </Link>
            ) : null}
          </CardHeader>
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <PortfolioKpis portfolio={portfolio} />
      <section className="grid items-start gap-4 xl:grid-cols-2">
        <LevelDistribution portfolio={portfolio} />
        <PortfolioFixes portfolio={portfolio} />
      </section>
      <PortfolioTable rows={rows} portfolio={portfolio} />
    </>
  );
}
