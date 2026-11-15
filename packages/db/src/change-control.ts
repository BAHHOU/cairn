import {
  type ChangePolicy,
  changePolicySchema,
  EMPTY_POLICY,
  type PersonView,
  personViewSchema,
  TRACKER_KINDS,
  type TrackerKind,
} from "@cairn/shared";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "./index";
import { auditEvents, changeControlSettings, repositories, trackerConnections } from "./schema";

const ROW = "default";

export interface ChangeControlSettings {
  policy: ChangePolicy;
  people: PersonView[];
  updatedBy: string | null;
  updatedAt: Date | null;
}

export async function getChangeControlSettings(db: Db): Promise<ChangeControlSettings> {
  const [row] = await db
    .select()
    .from(changeControlSettings)
    .where(eq(changeControlSettings.id, ROW))
    .limit(1);
  // Stored JSON is re-validated on read: a hand-edited row cannot reach the engine malformed.
  const policy = changePolicySchema.safeParse(row?.policy);
  const people = z.array(personViewSchema).safeParse(row?.people);
  return {
    policy: policy.success ? policy.data : EMPTY_POLICY,
    people: people.success ? people.data : [],
    updatedBy: row?.updatedBy ?? null,
    updatedAt: row?.updatedAt ?? null,
  };
}

async function upsert(
  db: Db,
  actor: string,
  action: string,
  values: Partial<typeof changeControlSettings.$inferInsert>,
  detail: Record<string, unknown>,
): Promise<void> {
  await db.transaction(async (tx) => {
    const now = new Date();
    await tx
      .insert(changeControlSettings)
      .values({ id: ROW, ...values, updatedBy: actor, updatedAt: now })
      .onConflictDoUpdate({
        target: changeControlSettings.id,
        set: { ...values, updatedBy: actor, updatedAt: now },
      });
    await tx.insert(auditEvents).values({ actor, action, target: "change-control", detail });
  });
}

/** Saves the critical zones and who holds which approver role. Validated again here. */
export async function saveChangePolicy(
  db: Db,
  actor: string,
  policy: ChangePolicy,
  people: PersonView[],
): Promise<void> {
  const p = changePolicySchema.parse(policy);
  const pp = z.array(personViewSchema).max(2_000).parse(people);
  await upsert(
    db,
    actor,
    "change-control.policy.save",
    { policy: p, people: pp },
    { zones: p.zones.map((z) => z.id), people: pp.length },
  );
}

/** A repository's forge coordinates and encrypted token, to read its merge requests. */
export async function getRepositorySource(db: Db, id: string) {
  const [repo] = await db
    .select({
      provider: repositories.provider,
      host: repositories.host,
      fullPath: repositories.fullPath,
      credentialEnc: repositories.credentialEnc,
    })
    .from(repositories)
    .where(eq(repositories.id, id))
    .limit(1);
  return repo ?? null;
}

export interface StoredTrackerConnection {
  id: string;
  kind: TrackerKind;
  label: string;
  /** Not secret: addresses, project keys, property names. Safe to show to the superadmin. */
  settings: Record<string, unknown>;
  /** Encrypted with the connection id as context. Never sent to the browser. */
  secretEnc: string;
  createdBy: string;
  createdAt: Date;
}

export async function listTrackerConnections(db: Db): Promise<StoredTrackerConnection[]> {
  const rows = await db
    .select()
    .from(trackerConnections)
    .orderBy(asc(trackerConnections.createdAt));
  // A kind removed from the catalog is ignored rather than crashing every page that reads specs.
  return rows.filter((r) => (TRACKER_KINDS as readonly string[]).includes(r.kind));
}

/** Adds a connection; `secretEnc` must be encrypted with the id passed here as context. */
export async function addTrackerConnection(
  db: Db,
  actor: string,
  connection: {
    id: string;
    kind: TrackerKind;
    label: string;
    settings: Record<string, unknown>;
    secretEnc: string;
  },
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.insert(trackerConnections).values({ ...connection, createdBy: actor });
    await tx.insert(auditEvents).values({
      actor,
      action: "tracker.connect",
      target: connection.id,
      detail: { kind: connection.kind, label: connection.label },
    });
  });
}

export async function removeTrackerConnection(db: Db, actor: string, id: string): Promise<boolean> {
  return db.transaction(async (tx) => {
    const removed = await tx
      .delete(trackerConnections)
      .where(eq(trackerConnections.id, id))
      .returning({ kind: trackerConnections.kind, label: trackerConnections.label });
    const row = removed[0];
    if (!row) return false;
    await tx.insert(auditEvents).values({
      actor,
      action: "tracker.disconnect",
      target: id,
      detail: { kind: row.kind, label: row.label },
    });
    return true;
  });
}
