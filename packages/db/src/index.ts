import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

export * from "./schema";
export { schema };

export function createDb(connectionString: string = process.env.DATABASE_URL ?? "") {
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  const pool = new Pool({ connectionString });
  return Object.assign(drizzle(pool, { schema }), { pool });
}

export type Db = ReturnType<typeof createDb>;
