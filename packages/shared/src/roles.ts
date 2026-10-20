import { z } from "zod";

export const ROLES = ["superadmin", "admin", "manager", "dev"] as const;
export type Role = (typeof ROLES)[number];
export const roleSchema = z.enum(ROLES);

export type Capability =
  | "see.allTeams"
  | "see.tokens"
  | "see.euros"
  | "manage.rules"
  | "manage.users"
  | "see.audit";

const MATRIX: Record<Role, readonly Capability[]> = {
  superadmin: [
    "see.allTeams",
    "see.tokens",
    "see.euros",
    "manage.rules",
    "manage.users",
    "see.audit",
  ],
  admin: ["see.allTeams", "see.tokens", "manage.rules"],
  manager: ["see.tokens", "see.euros"],
  dev: [],
};

export function can(role: Role, capability: Capability): boolean {
  return MATRIX[role].includes(capability);
}
