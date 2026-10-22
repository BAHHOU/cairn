import path from "node:path";
import { defineConfig } from "drizzle-kit";

try {
  process.loadEnvFile(path.join(import.meta.dirname, "../../.env"));
} catch {
  // No .env file: rely on the process environment.
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgresql://cairn:cairn@localhost:5432/cairn",
  },
});
