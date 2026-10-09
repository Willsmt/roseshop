import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createDb } from "@/lib/db/client";
import { resetCategorias } from "@/test/db/categorias-fixtures";
import { inserirEnvio, limparEnvios } from "@/test/db/fotos-fixtures";
import { inserirProduto, limparProdutos } from "@/test/db/produtos-fixtures";

import { chaveExibivel } from "./fotos";

// Feature 004, T064 (SF6): chaveExibivel (contracts/fotos.md §5). Integração com o banco local.
const db = createDb({
  DATABASE_URL: process.env.DATABASE_URL ?? "",
  NEON_FETCH_ENDPOINT: process.env.NEON_FETCH_ENDPOINT,
});
const AUTOR = "ana@teste.local";
let cat = 0;

beforeAll(async () => {
  await resetCategorias(db);
  const r = await db.execute(
    sql`SELECT id FROM categorias ORDER BY id LIMIT 1`,
  );
  cat = (r.rows as { id: number }[])[0].id;
});
beforeEach(async () => {
  await limparProdutos(db);
  await limparEnvios(db);
});
afterAll(async () => {
  await limparProdutos(db);
  await limparEnvios(db);
  await resetCategorias(db);
});

describe("chaveExibivel (T064)", () => {
  it("true para chave presente em produto_fotos", async () => {
    const id = await inserirProduto(db, cat);
    const r = await db.execute(
      sql`SELECT chave_objeto FROM produto_fotos WHERE produto_id = ${id}`,
    );
    const chave = (r.rows as { chave_objeto: string }[])[0].chave_objeto;
    expect(await chaveExibivel(db, chave)).toBe(true);
  });

  it("true para envio confirmado em fotos_envio", async () => {
    const e = await inserirEnvio(db, {
      enviadoPor: AUTOR,
      estado: "confirmado",
    });
    expect(await chaveExibivel(db, e.chave)).toBe(true);
  });

  it("false para envio apenas emitido", async () => {
    const e = await inserirEnvio(db, { enviadoPor: AUTOR, estado: "emitido" });
    expect(await chaveExibivel(db, e.chave)).toBe(false);
  });

  it("false para chave inexistente", async () => {
    expect(await chaveExibivel(db, `fotos/${randomUUID()}.webp`)).toBe(false);
  });
});
