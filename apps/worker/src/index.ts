import { createLlmClient, loadLlmConfig } from "@cairn/llm";
import { detectStack } from "@cairn/scanner";
import { PgBoss } from "pg-boss";
import pino from "pino";

const log = pino({ name: "cairn-worker" });

const SCAN_QUEUE = "scan";

interface ScanJob {
  path: string;
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is not set");

  const llm = createLlmClient(loadLlmConfig(), (event) => {
    log.info({ usage: event }, "llm usage recorded");
  });
  log.info({ llmEnabled: llm.enabled }, "internal LLM status");

  const boss = new PgBoss(databaseUrl);
  boss.on("error", (error) => log.error({ error }, "pg-boss error"));
  await boss.start();
  await boss.createQueue(SCAN_QUEUE);

  await boss.work<ScanJob>(SCAN_QUEUE, async (jobs) => {
    for (const job of jobs) {
      const facts = await detectStack(job.data.path);
      log.info({ jobId: job.id, facts }, "scan done");
    }
  });

  log.info("worker started");

  const stop = async () => {
    await boss.stop();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

main().catch((error) => {
  log.error({ error }, "worker crashed");
  process.exit(1);
});
