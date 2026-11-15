import { notFound } from "next/navigation";
import { PlannedFeature, type PlannedKey } from "@/components/planned-feature";
import { navFor, plannedAt, SETTINGS } from "@/lib/nav";
import { getViewer } from "@/lib/session";

/** Workspace features on the roadmap. Any other path is a 404, as before this route existed. */
export default async function PlannedWorkspacePage({
  params,
}: {
  params: Promise<{ feature: string[] }>;
}) {
  const { feature } = await params;
  const viewer = await getViewer();
  const settings = SETTINGS.roles.includes(viewer.role) ? [SETTINGS] : [];
  const item = plannedAt(navFor(viewer.role), settings, `/${feature.join("/")}`);
  if (!item) notFound();
  return <PlannedFeature feature={item.key as PlannedKey} back="/" />;
}
