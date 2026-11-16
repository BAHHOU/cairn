import { listTrackerConnections } from "@cairn/db";
import { can } from "@cairn/shared";
import { getTranslations } from "next-intl/server";
import { PageHeader, Restricted } from "@/components/page";
import { getFormat } from "@/i18n/format";
import { getDb, isImportConfigured } from "@/lib/import/runtime";
import { getViewer } from "@/lib/session";
import { type ConnectionRow, TrackerSettings } from "./tracker-settings";

/** What may be shown of a connection's settings: an address or a project, never a credential. */
const detailOf = (settings: Record<string, unknown>): string | null => {
  for (const key of ["baseUrl", "orgUrl", "workspace", "defaultRepo", "project", "apiUrl"]) {
    const v = settings[key];
    if (typeof v === "string" && v) return v;
  }
  return null;
};

/**
 * The project-management tools Cairn reads specifications from. Superadmin only: connections
 * hold credentials, which never reach this page (only labels and addresses do).
 */
export default async function IntegrationsPage() {
  const t = await getTranslations("integrations");
  const viewer = await getViewer();
  if (!can(viewer.role, "manage.users")) return <Restricted title={t("title")} />;
  if (!isImportConfigured()) {
    return (
      <>
        <PageHeader title={t("title")} description={t("description")} />
        <p className="text-muted-foreground text-sm">{t("noDatabase")}</p>
      </>
    );
  }

  const fmt = await getFormat();
  const connections: ConnectionRow[] = (await listTrackerConnections(getDb())).map((c) => ({
    id: c.id,
    kind: c.kind,
    label: c.label,
    detail: detailOf(c.settings),
    createdBy: c.createdBy,
    createdAt: fmt.date(c.createdAt.toISOString()),
  }));

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <TrackerSettings connections={connections} />
    </>
  );
}
