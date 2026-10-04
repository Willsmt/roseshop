import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import type { AdminSession } from "@/lib/auth";
import { createDb } from "@/lib/db/client";
import { remover, renomear } from "@/lib/db/categorias";
import { resetCategorias } from "@/test/db/categorias-fixtures";

// Feature 002, T043 (SC-009, FR-020, FR-019): concorrência real com Promise.all no
// driver HTTP/proxy local, repetida em várias rodadas para expor corrida.
const db = createDb({
  DATABASE_URL: process.env.DATABASE_URL ?? "",
  NEON_FETCH_ENDPOINT: process.env.NEON_FETCH_ENDPOINT,
});
const sessao: AdminSession = { email: "admin@teste.local", name: "Admin" };
const RODADAS = 20;

type Linha = { id: number; versao: number };

async function contar(): Promise<number> {
  const r = await db.execute(sql`SELECT count(*)::int AS n FROM categorias`);
  return (r.rows as { n: number }[])[0].n;
}

async function todas(): Promise<Linha[]> {
  const r = await db.execute(sql`SELECT id, versao FROM categorias ORDER BY id`);
  return r.rows as Linha[];
}

describe("remoção concorrente", () => {
  beforeEach(() => resetCategorias(db));
  afterAll(() => resetCategorias(db));

  it(
    "SC-009/FR-020: com 2 categorias restantes, duas remoções simultâneas ⇒ 1 removido e 1 ultima; tabela com 1 linha",
    async () => {
      for (let i = 0; i < RODADAS; i++) {
        await resetCategorias(db);
        // Setup de teste: deixa só as duas primeiras categorias.
        const [a, b] = await todas();
        await db.execute(sql`DELETE FROM categorias WHERE id NOT IN (${a.id}, ${b.id})`);
        expect(await contar(), `rodada ${i} (setup)`).toBe(2);

        const rs = await Promise.all([
          remover(db, sessao, a.id, a.versao),
          remover(db, sessao, b.id, b.versao),
        ]);

        expect(rs.filter((r) => r.tipo === "removido"), `rodada ${i}: ${JSON.stringify(rs)}`).toHaveLength(1);
        expect(rs.filter((r) => r.tipo === "ultima"), `rodada ${i}: ${JSON.stringify(rs)}`).toHaveLength(1);
        expect(await contar(), `rodada ${i}`).toBe(1);
      }
    },
    120_000,
  );

  it(
    "FR-019: remover e renomear a mesma categoria (mesma versao) ⇒ exatamente 1 vence; o outro devolve versao_diferente/ausente",
    async () => {
      for (let i = 0; i < RODADAS; i++) {
        await resetCategorias(db);
        const [alvo] = await todas();
        const antes = await contar();

        const [rRemocao, rRename] = await Promise.all([
          remover(db, sessao, alvo.id, alvo.versao),
          renomear(db, sessao, alvo.id, alvo.versao, "Categoria Renomeada"),
        ]);
        const ctx = `rodada ${i}: ${JSON.stringify([rRemocao, rRename])}`;

        const renomeou = rRename.tipo === "ok";
        const removeu = rRemocao.tipo === "removido";
        expect(renomeou !== removeu, ctx).toBe(true); // exatamente um vence

        if (renomeou) {
          expect(rRemocao, ctx).toEqual({ tipo: "versao_diferente" });
          expect(await contar(), ctx).toBe(antes);
        } else {
          expect(rRename, ctx).toEqual({ tipo: "ausente" });
          expect(await contar(), ctx).toBe(antes - 1);
        }
      }
    },
    120_000,
  );
});
