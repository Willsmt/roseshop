import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import type { AdminSession } from "@/lib/auth";
import { createDb } from "@/lib/db/client";
import { inserir, renomear } from "@/lib/db/categorias";
import { resetCategorias } from "@/test/db/categorias-fixtures";

// Feature 002, T032 (FR-005, FR-019, SC-003): concorrência real com Promise.all, repetida
// em várias rodadas para expor corrida. Integração com o banco local.
const db = createDb({
  DATABASE_URL: process.env.DATABASE_URL ?? "",
  NEON_FETCH_ENDPOINT: process.env.NEON_FETCH_ENDPOINT,
});
const sessao: AdminSession = { email: "admin@teste.local", name: "Admin" };
const RODADAS = 10;

async function contar(): Promise<number> {
  const r = await db.execute(sql`SELECT count(*)::int AS n FROM categorias`);
  return (r.rows as { n: number }[])[0].n;
}

describe("escrita concorrente", () => {
  beforeEach(() => resetCategorias(db));
  afterAll(() => resetCategorias(db));

  it(
    "FR-005/SC-003: duas criações simultâneas de nomes equivalentes ⇒ 1 ok e 1 nome_repetido (nome do vencedor)",
    async () => {
      for (let i = 0; i < RODADAS; i++) {
        await resetCategorias(db);
        const base = await contar();
        const entradas = ["Bolsas de Praia", "bolsas de praia"];
        const rs = await Promise.all(entradas.map((n) => inserir(db, sessao, n)));

        const oks = rs.filter((r) => r.tipo === "ok");
        const repetidos = rs.filter((r) => r.tipo === "nome_repetido");
        expect(oks, `rodada ${i}`).toHaveLength(1);
        expect(repetidos, `rodada ${i}`).toHaveLength(1);

        const idxVencedor = rs.findIndex((r) => r.tipo === "ok");
        const perdedor = rs[1 - idxVencedor];
        expect(perdedor).toEqual({ tipo: "nome_repetido", nomeExistente: entradas[idxVencedor] });
        expect(await contar(), `rodada ${i}`).toBe(base + 1);
      }
    },
    60_000,
  );

  it(
    "FR-019: dois renames simultâneos da mesma categoria e versao ⇒ 1 ok e 1 versao_diferente; versao 2",
    async () => {
      for (let i = 0; i < RODADAS; i++) {
        await resetCategorias(db);
        const r0 = await db.execute(sql`SELECT id FROM categorias WHERE nome = 'Meias'`);
        const id = (r0.rows as { id: number }[])[0].id;
        const nomes = ["Carteiras", "Mochilas"];
        const rs = await Promise.all(nomes.map((n) => renomear(db, sessao, id, 1, n)));

        expect(rs.filter((r) => r.tipo === "ok"), `rodada ${i}`).toHaveLength(1);
        expect(rs.filter((r) => r.tipo === "versao_diferente"), `rodada ${i}`).toHaveLength(1);

        const idxVencedor = rs.findIndex((r) => r.tipo === "ok");
        const f = await db.execute(sql`SELECT nome, versao FROM categorias WHERE id = ${id}`);
        expect((f.rows as { nome: string; versao: number }[])[0]).toEqual({
          nome: nomes[idxVencedor],
          versao: 2,
        });
      }
    },
    60_000,
  );
});
