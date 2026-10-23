import { listImportViews, listTeamNames } from "@cairn/db";
import { loadGitConfig, PROVIDERS } from "@cairn/git";
import { TriangleAlert } from "lucide-react";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { ImportsTable } from "@/components/import/imports-table";
import { LockedCard, PageHeader } from "@/components/page";
import { Card, CardContent } from "@/components/ui/card";
import { getDb, isImportConfigured, viewerMayImport } from "@/lib/import/runtime";
import { getViewer, isDemo } from "@/lib/session";
import { ImportForm } from "./import-form";

export const dynamic = "force-dynamic";

interface SearchParams {
  provider?: string;
  url?: string;
  branch?: string;
}

function Notice({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card className="border-warning/40">
      <CardContent className="flex items-start gap-2.5 text-sm">
        <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
        <div className="flex flex-col gap-1">
          <span className="font-medium">{title}</span>
          <span className="text-muted-foreground">{children}</span>
        </div>
      </CardContent>
    </Card>
  );
}

export default async function ImportPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const t = await getTranslations("import.page");
  const viewer = await getViewer();
  const header = <PageHeader title={t("title")} description={t("description")} />;

  if (!viewerMayImport(viewer)) {
    const demoBlocked = process.env.NODE_ENV === "production" && isDemo();
    return (
      <>
        {header}
        <LockedCard
          title={t("lockedTitle")}
          reason={demoBlocked ? t("lockedDemo") : t("lockedRole")}
        />
      </>
    );
  }

  if (!isImportConfigured()) {
    return (
      <>
        {header}
        <Notice title={t("dbMissingTitle")}>
          {t.rich("dbMissingBody", { code: (chunks) => <code>{chunks}</code> })}
        </Notice>
      </>
    );
  }

  const params = await searchParams;
  const initialProvider = PROVIDERS.find((p) => p === params.provider);

  let teams: string[] = [];
  let recent: Awaited<ReturnType<typeof listImportViews>> = [];
  let dbError = false;
  try {
    const db = getDb();
    [teams, recent] = await Promise.all([listTeamNames(db), listImportViews(db, 10)]);
  } catch {
    dbError = true;
  }

  const hosts = loadGitConfig().hosts.map((h) => h.host);

  return (
    <>
      {header}
      {dbError ? (
        <Notice title={t("dbDownTitle")}>
          {t.rich("dbDownBody", { code: (chunks) => <code>{chunks}</code> })}
        </Notice>
      ) : (
        <>
          <ImportForm
            teams={teams}
            hosts={hosts}
            initial={{ provider: initialProvider, url: params.url, branch: params.branch }}
          />
          {recent.length > 0 ? (
            <section className="flex flex-col gap-2">
              <h2 className="text-sm font-semibold">{t("recent")}</h2>
              <Card className="gap-0 py-0">
                <ImportsTable imports={recent} />
              </Card>
            </section>
          ) : null}
        </>
      )}
    </>
  );
}
