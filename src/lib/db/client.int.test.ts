import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { createDb } from "./client";
import { checkDb } from "./health";

const env = {
  DATABASE_URL: process.env.DATABASE_URL ?? "",
  NEON_FETCH_ENDPOINT: process.env.NEON_FETCH_ENDPOINT,
};

describe("cliente do banco (driver Neon via proxy local)", () => {
  it("executa uma query pelo protocolo HTTP do Neon", async () => {
    const result = await createDb(env).execute(sql`select 1 as ok`);
    expect(result.rows[0]).toEqual({ ok: 1 });
  });

  it("checkDb confirma o banco disponível", async () => {
    await expect(checkDb(createDb(env))).resolves.toBe(true);
  });
});
