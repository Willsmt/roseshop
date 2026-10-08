import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDb } from "@/lib/db/client";
import { listar } from "@/lib/db/produtos";

import { resetCategorias } from "./categorias-fixtures";
import { limparProdutos } from "./produtos-fixtures";

// Feature 003, T038 (SF6, SC-007 nível de banco): medição de `listar` com 500 produtos.
// Só stack local (ADR-006); popula e limpa a própria massa. Meta: < 2 s por consulta. A
// medição no `preview` fica na SF9.
const db = createDb({
  DATABASE_URL: process.env.DATABASE_URL ?? "",
  NEON_FETCH_ENDPOINT: process.env.NEON_FETCH_ENDPOINT,
});
const TOTAL = 500;
const META_MS = 2000;
const RODADAS = 5;

let cat1 = 0;

async function medir(rotulo: string, consulta: () => Promise<{ itens: unknown[]; haMais: boolean }>) {
  const tempos: number[] = [];
  let resultado = await consulta(); // aquece conexão e cache
  for (let i = 0; i < RODADAS; i++) {
    const inicio = performance.now();
    resultado = await consulta();
    tempos.push(performance.now() - inicio);
  }
  const maximo = Math.max(...tempos);
  const media = tempos.reduce((a, b) => a + b, 0) / tempos.length;
  console.log(
    `[medição ${TOTAL}] ${rotulo}: média ${media.toFixed(1)} ms, máx ${maximo.toFixed(1)} ms, ${resultado.itens.length} itens`,
  );
  return { maximo, resultado };
}

beforeAll(async () => {
  await resetCategorias(db);
  const r = await db.execute(sql`SELECT id FROM categorias ORDER BY id LIMIT 1`);
  cat1 = (r.rows as { id: number }[])[0].id;
  await limparProdutos(db);
  await db.execute(sql`
    INSERT INTO produtos (categoria_id, nome, esgotado, criado_por, atualizado_por)
    SELECT ${cat1}, 'Meia soquete modelo ' || n, n % 5 = 0, 'admin@teste.local', 'admin@teste.local'
    FROM generate_series(1, ${TOTAL}) AS n`);
});
afterAll(async () => {
  await limparProdutos(db);
  await resetCategorias(db);
});

describe(`listar com ${TOTAL} produtos (meta < 2 s)`, () => {
  it("primeira página, próxima página, filtro e busca", async () => {
    const pagina = await medir("página 1", () => listar(db, {}));
    expect(pagina.resultado.itens).toHaveLength(20);
    expect(pagina.resultado.haMais).toBe(true);

    const ids = (pagina.resultado.itens as { id: number }[]).map((i) => i.id);
    const proxima = await medir("próxima página (keyset)", () =>
      listar(db, { antes: ids[ids.length - 1] }),
    );
    expect(proxima.resultado.itens).toHaveLength(20);

    const filtro = await medir("filtro categoria + esgotado", () =>
      listar(db, { categoriaId: cat1, esgotado: true }),
    );
    expect(filtro.resultado.itens).toHaveLength(20);

    const nome = await medir("busca por nome", () =>
      listar(db, { busca: { texto: "meia soquete modelo 42", codigo: null } }),
    );
    expect(nome.resultado.itens.length).toBeGreaterThan(0);

    const codigo = await medir("busca por código", () =>
      listar(db, { busca: { texto: "#0042", codigo: 42 } }),
    );
    expect(codigo.resultado.itens.length).toBeGreaterThan(0);

    for (const { maximo } of [pagina, proxima, filtro, nome, codigo]) {
      expect(maximo).toBeLessThan(META_MS);
    }
  });
});
