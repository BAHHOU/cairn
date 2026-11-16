"use server";

import { addTrackerLink, listTrackerConnections, removeTrackerLink } from "@cairn/db";
import { can, DEFAULT_DONE_STATUSES } from "@cairn/shared";
import { createTracker, TrackerError } from "@cairn/tracker";
import { revalidatePath } from "next/cache";
import { toConnection } from "@/lib/changes/trackers";
import { getDb, isImportConfigured } from "@/lib/import/runtime";
import { getViewer } from "@/lib/session";
import { isListable, parseScope } from "@/lib/traceability/scope";

/** Rendered as `traceability.link.result.<code>`. */
export type LinkResultCode =
  | "linked"
  | "removed"
  | "forbidden"
  | "invalid"
  | "noDatabase"
  | "unsupported"
  | TrackerError["code"];

export type LinkOutcome = { ok: boolean; code: LinkResultCode; count?: number };

/** Linking a board decides what counts as "asked for": a governance setting, like the policy. */
async function guard(): Promise<{ actor: string } | LinkOutcome> {
  if (!isImportConfigured()) return { ok: false, code: "noDatabase" };
  const viewer = await getViewer();
  if (!can(viewer.role, "manage.rules")) return { ok: false, code: "forbidden" };
  return { actor: viewer.name };
}

/** Parses the board, proves it can be listed with the connection, then links it. */
export async function linkBoardAction(
  repositoryId: string,
  connectionId: string,
  rawScope: string,
): Promise<LinkOutcome> {
  const allowed = await guard();
  if ("code" in allowed) return allowed;
  const row = (await listTrackerConnections(getDb())).find((c) => c.id === connectionId);
  if (!row) return { ok: false, code: "not_found" };
  if (!isListable(row.kind)) return { ok: false, code: "unsupported" };
  const scope = parseScope(row.kind, rawScope);
  if (!scope) return { ok: false, code: "invalid" };

  try {
    const adapter = createTracker(toConnection(row));
    if (!adapter.list) return { ok: false, code: "unsupported" };
    const since = new Date(Date.now() - 365 * 86_400_000).toISOString();
    const sample = await adapter.list(scope, {
      since,
      doneStatuses: DEFAULT_DONE_STATUSES,
      limit: 20,
    });
    await addTrackerLink(getDb(), allowed.actor, { repositoryId, connectionId, scope });
    revalidatePath(`/projects/${repositoryId}/traceability`);
    return { ok: true, code: "linked", count: sample.length };
  } catch (error) {
    return { ok: false, code: error instanceof TrackerError ? error.code : "provider_error" };
  }
}

export async function unlinkBoardAction(
  repositoryId: string,
  linkId: string,
): Promise<LinkOutcome> {
  const allowed = await guard();
  if ("code" in allowed) return allowed;
  const removed = await removeTrackerLink(getDb(), allowed.actor, repositoryId, linkId);
  if (!removed) return { ok: false, code: "not_found" };
  revalidatePath(`/projects/${repositoryId}/traceability`);
  return { ok: true, code: "removed" };
}
