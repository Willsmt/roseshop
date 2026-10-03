import { existsSync } from "node:fs";

import { defineConfig } from "drizzle-kit";

// Local: lê do .dev.vars. CI/dev online/produção: DATABASE_URL vem do ambiente
// (connection string DIRETA do Neon, não a pooled — ADR-002).
if (!process.env.DATABASE_URL && existsSync(".dev.vars")) {
  process.loadEnvFile(".dev.vars");
}

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error("DATABASE_URL não definida (local: .dev.vars; CI: variável de ambiente)");
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/lib/db/schema.ts",
  out: "./src/lib/db/migrations",
  dbCredentials: { url },
  strict: true,
  verbose: true,
});
