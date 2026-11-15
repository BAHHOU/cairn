"use server";

import {
  addTrackerConnection,
  listTrackerConnections,
  removeTrackerConnection,
  type StoredTrackerConnection,
} from "@cairn/db";
import { can, TRACKERS, type TrackerKind } from "@cairn/shared";
import { createTracker, TrackerError } from "@cairn/tracker";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { isLiveTracker, TRACKER_INPUT } from "@/lib/changes/tracker-fields";
import { sealSecret, toConnection } from "@/lib/changes/trackers";
import { getDb, isImportConfigured } from "@/lib/import/runtime";
import { getViewer } from "@/lib/session";

/** Rendered as `integrations.result.<code>`. */
export type TrackerResultCode =
  | "connected"
  | "tested"
  | "removed"
  | "forbidden"
  | "invalid"
  | "noDatabase"
  | TrackerError["code"];

export type TrackerOutcome = { ok: boolean; code: TrackerResultCode; who?: string };

/** Connections hold credentials: only the superadmin manages them, whatever the UI shows. */
async function guard(): Promise<{ actor: string } | TrackerOutcome> {
  if (!isImportConfigured()) return { ok: false, code: "noDatabase" };
  const viewer = await getViewer();
  if (!can(viewer.role, "manage.users")) return { ok: false, code: "forbidden" };
  return { actor: viewer.name };
}

const failure = (error: unknown): TrackerOutcome => ({
  ok: false,
  code: error instanceof TrackerError ? error.code : "provider_error",
});

/** Validates, proves the credentials work, and only then stores the connection. */
export async function connectTrackerAction(
  kind: TrackerKind,
  input: Record<string, string>,
): Promise<TrackerOutcome> {
  const allowed = await guard();
  if ("code" in allowed) return allowed;
  if (!isLiveTracker(kind)) return { ok: false, code: "invalid" };
  const parsed = TRACKER_INPUT[kind].safeParse(input);
  const label = z.string().trim().min(1).max(80).safeParse(input.label);
  if (!parsed.success) return { ok: false, code: "invalid" };

  const id = crypto.randomUUID();
  const row: StoredTrackerConnection = {
    id,
    kind,
    label: label.success ? label.data : TRACKERS[kind].name,
    settings: parsed.data.settings,
    secretEnc: sealSecret(id, parsed.data.secret as Record<string, string>),
    createdBy: allowed.actor,
    createdAt: new Date(),
  };
  try {
    const me = await createTracker(toConnection(row)).check();
    await addTrackerConnection(getDb(), allowed.actor, row);
    revalidatePath("/settings/integrations");
    return { ok: true, code: "connected", who: me.displayName };
  } catch (error) {
    return failure(error);
  }
}

export async function testTrackerAction(id: string): Promise<TrackerOutcome> {
  const allowed = await guard();
  if ("code" in allowed) return allowed;
  const row = (await listTrackerConnections(getDb())).find((c) => c.id === id);
  if (!row) return { ok: false, code: "not_found" };
  try {
    const me = await createTracker(toConnection(row)).check();
    return { ok: true, code: "tested", who: me.displayName };
  } catch (error) {
    return failure(error);
  }
}

export async function removeTrackerAction(id: string): Promise<TrackerOutcome> {
  const allowed = await guard();
  if ("code" in allowed) return allowed;
  const removed = await removeTrackerConnection(getDb(), allowed.actor, id);
  revalidatePath("/settings/integrations");
  return removed ? { ok: true, code: "removed" } : { ok: false, code: "not_found" };
}
