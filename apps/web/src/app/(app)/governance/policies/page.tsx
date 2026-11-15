import { getChangeControlSettings } from "@cairn/db";
import { can } from "@cairn/shared";
import { getTranslations } from "next-intl/server";
import { PageHeader, Restricted } from "@/components/page";
import { DEMO_PEOPLE, DEMO_POLICY } from "@/lib/api/change-data";
import { getDb, isImportConfigured } from "@/lib/import/runtime";
import { getViewer } from "@/lib/session";
import { PolicyEditor } from "./policy-editor";

/**
 * The critical zones and who signs them off. Rule managers edit; leads read. Without a database
 * the demo policy is shown read-only, so the page still explains itself.
 */
export default async function PoliciesPage() {
  const t = await getTranslations("policies");
  const viewer = await getViewer();
  if (!can(viewer.role, "see.tokens")) return <Restricted title={t("title")} />;

  const stored = isImportConfigured() ? await getChangeControlSettings(getDb()) : null;
  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <PolicyEditor
        initialPolicy={stored?.policy ?? DEMO_POLICY}
        initialPeople={stored?.people ?? DEMO_PEOPLE}
        editable={stored !== null && can(viewer.role, "manage.rules")}
        template={DEMO_POLICY.zones}
      />
    </>
  );
}
