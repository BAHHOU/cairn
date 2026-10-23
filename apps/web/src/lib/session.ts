import { type Role, roleSchema, type Viewer } from "@cairn/shared";
import { cookies } from "next/headers";
import { cache } from "react";

export const ROLE_COOKIE = "cairn-role";

/** Fictitious people for the demo. In production the viewer comes from the OIDC session. */
export const DEMO_VIEWERS: Record<Role, Viewer> = {
  superadmin: { name: "Claire Dubois", role: "superadmin", team: "Plateforme" },
  admin: { name: "Karim Benali", role: "admin", team: "Plateforme" },
  manager: { name: "Sophie Laurent", role: "manager", team: "Paiements" },
  dev: { name: "Alex Martin", role: "dev", team: "Paiements" },
};

export const isDemo = () => process.env.DEMO_MODE !== "false";

export const getViewer = cache(async (): Promise<Viewer> => {
  const raw = (await cookies()).get(ROLE_COOKIE)?.value;
  const parsed = roleSchema.safeParse(raw);
  return DEMO_VIEWERS[parsed.success ? parsed.data : "admin"];
});
