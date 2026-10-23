"use server";

import { type BlastRadius, computeBlastRadius, roleSchema } from "@cairn/shared";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { getApi } from "@/lib/api";
import { loadImportedScan } from "@/lib/import/scan";
import { isDemo, ROLE_COOKIE } from "@/lib/session";

/**
 * Impact analysis stays on the server, next to the data.
 *
 * The client could walk the graph it already holds, but then the answer would depend
 * on what the UI happened to receive: a node the viewer is not allowed to see would
 * silently drop out of the blast radius instead of being counted.
 */
export async function blastRadiusAction(
  projectId: string,
  nodeId: string,
): Promise<BlastRadius | null> {
  const api = await getApi();
  const radius = await api.projects.blastRadius(projectId, nodeId);
  if (radius) return radius;
  // Imported repositories are not known to the demo API: compute from their stored scan.
  const imported = await loadImportedScan(projectId);
  const architecture = imported?.scan?.architecture;
  if (!architecture?.nodes.some((n) => n.id === nodeId)) return null;
  return computeBlastRadius(architecture, nodeId);
}

/** Demo only: lets testers look at the product as each role. */
export async function setDemoRole(role: string): Promise<void> {
  if (!isDemo()) return;
  const parsed = roleSchema.safeParse(role);
  if (!parsed.success) return;
  (await cookies()).set(ROLE_COOKIE, parsed.data, { httpOnly: true, sameSite: "lax", path: "/" });
  revalidatePath("/", "layout");
}
