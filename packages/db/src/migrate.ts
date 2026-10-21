import path from "node:path";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createDb } from "./index";

/** Applies ./drizzle/*.sql. Used by `pnpm db:migrate` and safe to run at every deploy. */
const db = createDb();
try {
  await migrate(db, { migrationsFolder: path.join(import.meta.dirname, "../drizzle") });
  console.log("migrations applied");
} finally {
  await db.pool.end();
}
