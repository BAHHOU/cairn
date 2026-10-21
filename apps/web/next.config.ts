import path from "node:path";
import type { NextConfig } from "next";

try {
  // Next only reads apps/web/.env*; the monorepo keeps a single .env at the root. Never overrides real env vars.
  process.loadEnvFile(path.join(import.meta.dirname, "../../.env"));
} catch {
  // No root .env: rely on the process environment.
}

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.join(import.meta.dirname, "../.."),
  transpilePackages: ["@cairn/shared", "@cairn/llm", "@cairn/db", "@cairn/git", "@cairn/scanner"],
  serverExternalPackages: ["pg", "pg-boss"],
  poweredByHeader: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
