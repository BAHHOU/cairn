"use server";

import { saveChangePolicy } from "@cairn/db";
import { can, changePolicySchema, personViewSchema } from "@cairn/shared";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb, isImportConfigured } from "@/lib/import/runtime";
import { getViewer } from "@/lib/session";

/** Rendered as `policies.result.<code>`. */
export type PolicyResultCode = "saved" | "forbidden" | "invalid" | "duplicate" | "noDatabase";

const inputSchema = z.object({
  policy: changePolicySchema,
  people: z.array(personViewSchema).max(2_000),
});

export async function savePolicyAction(
  input: unknown,
): Promise<{ ok: boolean; code: PolicyResultCode }> {
  if (!isImportConfigured()) return { ok: false, code: "noDatabase" };
  const viewer = await getViewer();
  if (!can(viewer.role, "manage.rules")) return { ok: false, code: "forbidden" };
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid" };
  const { policy, people } = parsed.data;
  const unique = (ids: string[]) => new Set(ids).size === ids.length;
  if (!unique(policy.zones.map((z) => z.id)) || !unique(people.map((p) => p.id))) {
    return { ok: false, code: "duplicate" };
  }
  await saveChangePolicy(getDb(), viewer.name, policy, people);
  revalidatePath("/governance/policies");
  return { ok: true, code: "saved" };
}
