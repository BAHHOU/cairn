import { createDb, failStaleImports, IMPORT_QUEUE, type ImportJob } from "@cairn/db";
import { loadGitConfig, loadSecretKey } from "@cairn/git";
import { createLlmClient, loadLlmConfig } from "@cairn/llm";
import { detectStack } from "@cairn/scanner";
import { PgBoss } from "pg-boss";
import pino from "pino";
import { processImport } from "./import";

const log = pino({ name: "cairn-worker" });

const SCAN_QUEUE = "scan";
const STALE_IMPORT_MS = 15 * 60_000;

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

  const db = createDb(databaseUrl);
  const key = loadSecretKey();
  const gitConfig = loadGitConfig();
  log.info(
    { gitHosts: gitConfig.hosts.map((h) => `${h.scheme}://${h.host}`) },
    "git egress allowlist",
  );

  const interrupted = await failStaleImports(db, STALE_IMPORT_MS);
  if (interrupted > 0) log.warn({ interrupted }, "marked interrupted imports as failed");

  const boss = new PgBoss(databaseUrl);
  boss.on("error", (error) => log.error({ error }, "pg-boss error"));
  await boss.start();
  await boss.createQueue(SCAN_QUEUE);
  await boss.createQueue(IMPORT_QUEUE);

  await boss.work<ScanJob>(SCAN_QUEUE, async (jobs) => {
    for (const job of jobs) {
      const facts = await detectStack(job.data.path);
      log.info({ jobId: job.id, facts }, "scan done");
    }
  });

  await boss.work<ImportJob>(IMPORT_QUEUE, { batchSize: 1, localConcurrency: 2 }, async (jobs) => {
    for (const job of jobs) {
      await processImport({ db, key, config: gitConfig, log }, job.data.importId);
    }
  });

  log.info("worker started");

  const stop = async () => {
    await boss.stop();
    await db.pool.end();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

main().catch((error) => {
  log.error({ error }, "worker crashed");
  process.exit(1);
});
