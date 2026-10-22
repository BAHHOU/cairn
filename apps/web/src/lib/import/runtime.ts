import { createDb, createQueueSender, type Db } from "@cairn/db";
import type { Viewer } from "@cairn/shared";
import { getViewer, isDemo } from "@/lib/session";
import { mayImport } from "./policy";

type Queue = Awaited<ReturnType<typeof createQueueSender>>;

// One pool per server process, surviving dev hot reloads.
const globals = globalThis as { __cairnDb?: Db; __cairnQueue?: Promise<Queue> };

export const isImportConfigured = (): boolean => Boolean(process.env.DATABASE_URL);

export function getDb(): Db {
  globals.__cairnDb ??= createDb();
  return globals.__cairnDb;
}

export function getQueue(): Promise<Queue> {
  if (!globals.__cairnQueue) {
    const started = createQueueSender(process.env.DATABASE_URL ?? "");
    started.catch(() => {
      globals.__cairnQueue = undefined;
    });
    globals.__cairnQueue = started;
  }
  return globals.__cairnQueue;
}

export class ForbiddenError extends Error {
  constructor(message = "Forbidden") {
    super(message);
    this.name = "ForbiddenError";
  }
}

/** Whether this viewer may import. The server actions enforce it again: the UI is never the gate. */
export function viewerMayImport(viewer: Viewer): boolean {
  return mayImport(viewer.role, {
    production: process.env.NODE_ENV === "production",
    demo: isDemo(),
  });
}

export async function requireImporter(): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewerMayImport(viewer)) throw new ForbiddenError("Import is reserved to the superadmin");
  return viewer;
}
