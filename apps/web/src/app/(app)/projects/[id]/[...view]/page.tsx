import { notFound } from "next/navigation";
import { PlannedFeature, type PlannedKey } from "@/components/planned-feature";
import { getApi } from "@/lib/api";
import { loadImportedScan } from "@/lib/import/scan";
import { plannedAt, projectNavFor, SETTINGS } from "@/lib/nav";
import { getViewer } from "@/lib/session";

/** Project views on the roadmap, for demo and imported projects alike. */
export default async function PlannedProjectPage({
  params,
}: {
  params: Promise<{ id: string; view: string[] }>;
}) {
  const { id, view } = await params;
  const viewer = await getViewer();
  const settings = SETTINGS.roles.includes(viewer.role) ? [SETTINGS] : [];
  const item = plannedAt(projectNavFor(viewer.role), settings, `/${view.join("/")}`);
  if (!item) notFound();
  const project = await (await getApi()).projects.get(id);
  if (!project && !(await loadImportedScan(id))) notFound();
  return <PlannedFeature feature={item.key as PlannedKey} back={`/projects/${id}`} />;
}
