"use server";

import { type BlastRadius, roleSchema } from "@cairn/shared";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { getApi } from "@/lib/api";
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
  return api.projects.blastRadius(projectId, nodeId);
}

/** Demo only: lets testers look at the product as each role. */
export async function setDemoRole(role: string): Promise<void> {
  if (!isDemo()) return;
  const parsed = roleSchema.safeParse(role);
  if (!parsed.success) return;
  (await cookies()).set(ROLE_COOKIE, parsed.data, { httpOnly: true, sameSite: "lax", path: "/" });
  revalidatePath("/", "layout");
}
