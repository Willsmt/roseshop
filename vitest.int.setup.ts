import { existsSync } from "node:fs";

if (!process.env.DATABASE_URL && existsSync(".dev.vars")) {
  process.loadEnvFile(".dev.vars");
}

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL ausente: rode `npm run db:up` e configure o .dev.vars");
}
