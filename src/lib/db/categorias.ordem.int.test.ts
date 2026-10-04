import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDb } from "@/lib/db/client";

// Feature 002, T004 (US1-6, FR-012): ordenação por chave em collation "C", com id de
// desempate. Não assume tabela vazia: dados de teste usam o prefixo "Zt" e o filtro
// restringe a consulta a eles.
const db = createDb({
  DATABASE_URL: process.env.DATABASE_URL ?? "",
  NEON_FETCH_ENDPOINT: process.env.NEON_FETCH_ENDPOINT,
});

async function limpar() {
  await db.execute(sql`DELETE FROM categorias WHERE chave LIKE 'zt%'`);
}

describe("ordenação da lista (US1-6, FR-012)", () => {
  beforeAll(async () => {
    await limpar();
    await db.execute(sql`INSERT INTO categorias (nome) VALUES ('Zt meias'), ('Zt Bolsas'), ('Zt Água')`);
  });
  afterAll(limpar);

  it("ORDER BY chave COLLATE \"C\", id ordena 'meias', 'Bolsas', 'Água' como Água, Bolsas, meias", async () => {
    const r = await db.execute(
      sql`SELECT nome FROM categorias WHERE chave LIKE 'zt%' ORDER BY chave COLLATE "C", id`,
    );
    expect((r.rows as { nome: string }[]).map((l) => l.nome)).toEqual(["Zt Água", "Zt Bolsas", "Zt meias"]);
  });

  it("a ordem não é a do nome cru: ordenar por nome em \"C\" põe 'Água' por último", async () => {
    const r = await db.execute(
      sql`SELECT nome FROM categorias WHERE chave LIKE 'zt%' ORDER BY nome COLLATE "C"`,
    );
    expect((r.rows as { nome: string }[]).map((l) => l.nome)).toEqual(["Zt Bolsas", "Zt meias", "Zt Água"]);
  });

  it("é estável: duas execuções devolvem a mesma sequência de ids", async () => {
    const consulta = sql`SELECT id FROM categorias WHERE chave LIKE 'zt%' ORDER BY chave COLLATE "C", id`;
    const a = await db.execute(consulta);
    const b = await db.execute(consulta);
    expect(b.rows).toEqual(a.rows);
  });

  it("empate de chave é impossível (UNIQUE), mas o id desempata de forma estável", async () => {
    const r = await db.execute(sql`
      SELECT id FROM (VALUES (2, 'a'), (3, 'b'), (1, 'a')) AS v(id, chave)
      ORDER BY chave COLLATE "C", id`);
    expect((r.rows as { id: number }[]).map((l) => l.id)).toEqual([1, 2, 3]);
  });
});
