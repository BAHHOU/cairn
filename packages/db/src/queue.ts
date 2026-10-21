import { PgBoss } from "pg-boss";

export const IMPORT_QUEUE = "repository-import";

export interface ImportJob {
  importId: string;
}

/**
 * Send-only client for the web app: no supervision, no scheduling. Jobs are consumed by the
 * worker. Creating the queue here is idempotent, so a web request never races a cold worker.
 */
export async function createQueueSender(connectionString: string): Promise<PgBoss> {
  const boss = new PgBoss({ connectionString, supervise: false, schedule: false });
  boss.on("error", () => {
    // Surfaced to the caller on the next send; avoids an unhandled 'error' event crashing Next.
  });
  await boss.start();
  await boss.createQueue(IMPORT_QUEUE);
  return boss;
}

export async function sendImportJob(boss: PgBoss, importId: string): Promise<void> {
  const jobId = await boss.send(
    IMPORT_QUEUE,
    { importId } satisfies ImportJob,
    // Failures here are deterministic (bad token, missing branch): a blind retry would not help.
    { retryLimit: 0, expireInSeconds: 3600 },
  );
  if (!jobId) throw new Error("The job queue refused the import job");
}
