import { listImportViews, listTeamNames } from "@cairn/db";
import { loadGitConfig, PROVIDERS } from "@cairn/git";
import { TriangleAlert } from "lucide-react";
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
  const viewer = await getViewer();
  const header = (
    <PageHeader
      title="Importer un dépôt"
      description="Clone réel d'une branche depuis GitLab ou GitHub, puis analyse de la pile technique."
    />
  );

  if (!viewerMayImport(viewer)) {
    const demoBlocked = process.env.NODE_ENV === "production" && isDemo();
    return (
      <>
        {header}
        <LockedCard
          title="Import de dépôts"
          reason={
            demoBlocked
              ? "Le rôle de démonstration (cookie) ne peut pas autoriser un import réel en production. Configurez l'authentification OIDC."
              : "Réservé au super administrateur."
          }
        />
      </>
    );
  }

  if (!isImportConfigured()) {
    return (
      <>
        {header}
        <Notice title="Base de données non configurée">
          Définissez <code>DATABASE_URL</code> et <code>CAIRN_SECRET_KEY</code>, appliquez les
          migrations (<code>pnpm db:migrate</code>) et démarrez le worker (
          <code>pnpm dev:worker</code>).
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
        <Notice title="Base de données injoignable">
          Vérifiez que PostgreSQL tourne (
          <code>docker compose -f infra/docker-compose.yml up -d</code>) et que{" "}
          <code>DATABASE_URL</code> est correct.
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
              <h2 className="text-sm font-semibold">Imports récents</h2>
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
