import { randomBytes } from "node:crypto";

import { sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

import { createDb } from "@/lib/db/client";
import { codigoSqlstate } from "@/lib/db/erros-pg";

// Feature 003, T007 (US7; D9, ADR-008 emenda de 2026-10-07): prova que a FK
// produtos.categoria_id é ON DELETE RESTRICT (23001) e que o db.batch reverte tudo.
// Reutilizado contra o Neon dev no CI do PR (vitest.probe.config.mts). Não usa TRUNCATE:
// toda linha criada leva o marcador único da execução no nome, e a limpeza só apaga
// pelo marcador.
const db = createDb({
  DATABASE_URL: process.env.DATABASE_URL ?? "",
  NEON_FETCH_ENDPOINT: process.env.NEON_FETCH_ENDPOINT,
});

const marcador = `probe fk ${randomBytes(4).toString("hex")}`;
const padrao = `%${marcador}%`;

async function contar(tabela: "categorias" | "produtos"): Promise<number> {
  const r =
    tabela === "categorias"
      ? await db.execute(sql`SELECT count(*)::int AS n FROM categorias WHERE nome LIKE ${padrao}`)
      : await db.execute(sql`SELECT count(*)::int AS n FROM produtos WHERE nome LIKE ${padrao}`);
  return Number((r.rows[0] as { n: number }).n);
}

describe("FK produtos.categoria_id ON DELETE RESTRICT (US7)", () => {
  afterAll(async () => {
    // Só sobra linha se a FK não existir (o teste já falhou): produto antes da categoria.
    if ((await contar("produtos")) > 0) {
      await db.execute(sql`DELETE FROM produtos WHERE nome LIKE ${padrao}`);
    }
    if ((await contar("categorias")) > 0) {
      await db.execute(sql`DELETE FROM categorias WHERE nome LIKE ${padrao}`);
    }
  });

  it("batch que apaga categoria com produto falha com 23001 e reverte tudo", async () => {
    let erro: unknown;
    let rejeitou = false;
    try {
      await db.batch([
        db.execute(sql`INSERT INTO categorias (nome) VALUES (${marcador})`),
        db.execute(sql`
          INSERT INTO produtos (categoria_id, nome, criado_por, atualizado_por)
          SELECT id, ${marcador}, 'probe@teste.local', 'probe@teste.local'
          FROM categorias WHERE nome = ${marcador}`),
        db.execute(sql`DELETE FROM categorias WHERE nome = ${marcador}`),
      ]);
    } catch (e) {
      rejeitou = true;
      erro = e;
    }
    expect(rejeitou, "o batch deveria rejeitar").toBe(true);
    expect(codigoSqlstate(erro)).toBe("23001");

    expect(await contar("categorias")).toBe(0);
    expect(await contar("produtos")).toBe(0);
  });
});
