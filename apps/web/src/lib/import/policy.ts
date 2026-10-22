import { can, type Role } from "@cairn/shared";

/**
 * Pure authorisation rule for repository import, so it can be tested without Next.js.
 * The demo role comes from a cookie anyone can edit: it may drive the demo UI, but it must never
 * authorise a real action (clone, token storage) on a production build.
 */
export function mayImport(role: Role, env: { production: boolean; demo: boolean }): boolean {
  if (!can(role, "import.repositories")) return false;
  if (env.production && env.demo) return false;
  return true;
}
