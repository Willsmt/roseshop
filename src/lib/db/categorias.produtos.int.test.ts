import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import type { AdminSession } from "@/lib/auth";
import { createDb } from "@/lib/db/client";
import { contarProdutosDaCategoria, remover } from "@/lib/db/categorias";
import { codigoSqlstate } from "@/lib/db/erros-pg";
import { resetCategorias } from "@/test/db/categorias-fixtures";
import { inserirProduto, inserirProdutos } from "@/test/db/produtos-fixtures";

// Feature 003, T003 (US7-AC2/AC3, SC-005; origem 002 T042: US4-4, US4-1, SC-009, H3-A, D4-A):
// bloqueio por produtos via FK (ON DELETE RESTRICT) e contagem real com produtos reais.
const db = createDb({
  DATABASE_URL: process.env.DATABASE_URL ?? "",
  NEON_FETCH_ENDPOINT: process.env.NEON_FETCH_ENDPOINT,
});
const sessao: AdminSession = { email: "admin@teste.local", name: "Admin" };
const RODADAS = 10;

type Linha = { id: number; versao: number };

async function categoriaPorNome(nome: string): Promise<Linha> {
  const r = await db.execute(sql`SELECT id, versao FROM categorias WHERE nome = ${nome}`);
  return (r.rows as Linha[])[0];
}

async function todasCategorias(): Promise<Linha[]> {
  const r = await db.execute(sql`SELECT id, versao FROM categorias ORDER BY id`);
  return r.rows as Linha[];
}

async function existe(id: number): Promise<boolean> {
  const r = await db.execute(sql`SELECT 1 FROM categorias WHERE id = ${id}`);
  return r.rows.length === 1;
}

async function produtosOrfaos(): Promise<number> {
  const r = await db.execute(
    sql`SELECT count(*)::int AS n FROM produtos p WHERE NOT EXISTS (SELECT 1 FROM categorias c WHERE c.id = p.categoria_id)`,
  );
  return (r.rows as { n: number }[])[0].n;
}

describe("remover com produtos vinculados", () => {
  beforeEach(async () => {
    await resetCategorias(db);
  });
  afterAll(async () => {
    await resetCategorias(db);
  });

  it("US4-4/US7-AC1: 3 produtos vinculados ⇒ contagem 3 e remover ⇒ tem_produtos(3) sem apagar a categoria", async () => {
    const cat = await categoriaPorNome("Meias");
    await inserirProdutos(db, cat.id, 3);
    expect(await contarProdutosDaCategoria(db, cat.id)).toBe(3);
    const r = await remover(db, sessao, cat.id, cat.versao);
    expect(r).toEqual({ tipo: "tem_produtos", quantidade: 3 });
    expect(await existe(cat.id)).toBe(true);
  });

  it("US4-4/US7-AC1: 1 produto vinculado ⇒ tem_produtos com quantidade 1", async () => {
    const cat = await categoriaPorNome("Meias");
    await inserirProduto(db, cat.id);
    expect(await contarProdutosDaCategoria(db, cat.id)).toBe(1);
    const r = await remover(db, sessao, cat.id, cat.versao);
    expect(r).toEqual({ tipo: "tem_produtos", quantidade: 1 });
    expect(await existe(cat.id)).toBe(true);
  });

  it("US4-1: categoria sem produtos (outra categoria tem) ⇒ removido; a vinculada permanece", async () => {
    const comProdutos = await categoriaPorNome("Meias");
    const vazia = await categoriaPorNome("Panos de prato");
    await inserirProdutos(db, comProdutos.id, 2);
    expect(await contarProdutosDaCategoria(db, vazia.id)).toBe(0);
    const r = await remover(db, sessao, vazia.id, vazia.versao);
    expect(r).toEqual({ tipo: "removido" });
    expect(await existe(vazia.id)).toBe(false);
    expect(await existe(comProdutos.id)).toBe(true);
  });

  it("US7-AC2: depois de apagar o último produto, remover a categoria segue as regras da 002", async () => {
    const cat = await categoriaPorNome("Meias");
    const [produtoId] = await inserirProdutos(db, cat.id, 1);
    expect(await remover(db, sessao, cat.id, cat.versao)).toEqual({ tipo: "tem_produtos", quantidade: 1 });
    await db.execute(sql`DELETE FROM produtos WHERE id = ${produtoId}`);
    expect(await remover(db, sessao, cat.id, cat.versao)).toEqual({ tipo: "removido" });
    expect(await existe(cat.id)).toBe(false);
  });

  it("US7-AC3: inserir produto depois da remoção da categoria falha com FK (23503)", async () => {
    const cat = await categoriaPorNome("Meias");
    expect(await remover(db, sessao, cat.id, cat.versao)).toEqual({ tipo: "removido" });
    const erro = await inserirProduto(db, cat.id).then(
      () => undefined,
      (e: unknown) => e,
    );
    expect(codigoSqlstate(erro)).toBe("23503");
  });

  it(
    "US7-AC3/SC-005: cadastro simultâneo à remoção nunca deixa produto órfão",
    async () => {
      for (let i = 0; i < RODADAS; i++) {
        await resetCategorias(db);
        const categorias = await todasCategorias();
        // Seed tem várias categorias; a regra "não remover a última" não interfere aqui.
        expect(categorias.length, `rodada ${i}: seed insuficiente`).toBeGreaterThanOrEqual(2);
        const cat = categorias[i % categorias.length];

        const [rRemocao, rInsercao] = await Promise.all([
          remover(db, sessao, cat.id, cat.versao),
          inserirProduto(db, cat.id).then(
            (id) => ({ ok: true as const, id }),
            (erro: unknown) => ({ ok: false as const, erro }),
          ),
        ]);
        const ctx = `rodada ${i}: ${JSON.stringify([rRemocao, rInsercao.ok ? rInsercao : String(rInsercao.erro)])}`;

        expect(await produtosOrfaos(), ctx).toBe(0);
        if (rRemocao.tipo === "removido") {
          // Remoção venceu: a inserção só pode ter falhado por FK (23503).
          expect(rInsercao.ok, ctx).toBe(false);
          if (!rInsercao.ok) expect(codigoSqlstate(rInsercao.erro), ctx).toBe("23503");
          expect(await existe(cat.id), ctx).toBe(false);
        } else {
          // Inserção venceu: categoria permanece com o produto e remover devolveu tem_produtos.
          expect(rRemocao, ctx).toEqual({ tipo: "tem_produtos", quantidade: 1 });
          expect(rInsercao.ok, ctx).toBe(true);
          expect(await existe(cat.id), ctx).toBe(true);
          expect(await contarProdutosDaCategoria(db, cat.id), ctx).toBe(1);
        }
      }
    },
    120_000,
  );
});
