import { existsSync } from "node:fs";

import { vi } from "vitest";

// "server-only" lança fora da condição `react-server`; nos testes vira no-op
// (mesmo tratamento do vitest.setup.ts dos unitários).
vi.mock("server-only", () => ({}));

if (!process.env.DATABASE_URL && existsSync(".dev.vars")) {
  process.loadEnvFile(".dev.vars");
}

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL ausente: rode `npm run db:up` e configure o .dev.vars");
}
