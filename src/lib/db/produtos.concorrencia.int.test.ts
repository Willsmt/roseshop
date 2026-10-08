import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { AdminSession } from "@/lib/auth";
import { createDb } from "@/lib/db/client";
import { inserir as inserirCategoria, remover as removerCategoria } from "@/lib/db/categorias";
import { resetCategorias } from "@/test/db/categorias-fixtures";
import { inserirProduto, limparProdutos, nomeUnicoProduto } from "@/test/db/produtos-fixtures";

import { editar, inserir, remover } from "./produtos";

// Feature 003, T024 (SF4): concorrência real com Promise.all, em várias rodadas. Integração com o
// banco local. Roda em série com os demais arquivos de integração.
const db = createDb({
  DATABASE_URL: process.env.DATABASE_URL ?? "",
  NEON_FETCH_ENDPOINT: process.env.NEON_FETCH_ENDPOINT,
});
const sessao: AdminSession = { email: "admin@teste.local", name: "Admin" };
const RODADAS = 10;

let cat1 = 0;

const campos = (extra: Record<string, unknown> = {}) => ({
  nome: nomeUnicoProduto(),
  categoriaId: cat1,
  descricao: null,
  precoCentavos: 1000,
  aPartirDe: false,
  ...extra,
});

async function contar(): Promise<number> {
  const r = await db.execute(sql`SELECT count(*)::int AS n FROM produtos`);
  return (r.rows as { n: number }[])[0].n;
}

async function orfaos(): Promise<number> {
  const r = await db.execute(
    sql`SELECT count(*)::int AS n FROM produtos p WHERE NOT EXISTS (SELECT 1 FROM categorias c WHERE c.id = p.categoria_id)`,
  );
  return (r.rows as { n: number }[])[0].n;
}

async function novaCategoria(): Promise<number> {
  const r = await inserirCategoria(db, sessao, `Cat ${nomeUnicoProduto("Corrida")}`);
  if (r.tipo !== "ok") throw new Error("setup: categoria");
  return r.id;
}

beforeAll(async () => {
  await resetCategorias(db);
  const r = await db.execute(sql`SELECT id FROM categorias ORDER BY id LIMIT 1`);
  cat1 = (r.rows as { id: number }[])[0].id;
});
beforeEach(() => limparProdutos(db));
afterAll(() => resetCategorias(db));

describe("cadastro concorrente (US1)", () => {
  it(
    "SC-005: duas inserções de nome equivalente ⇒ 1 ok e 1 nome_repetido com o código do outro",
    async () => {
      for (let i = 0; i < RODADAS; i++) {
        await limparProdutos(db);
        const base = nomeUnicoProduto("Mesmo");
        const rs = await Promise.all([
          inserir(db, sessao, campos({ nome: base })),
          inserir(db, sessao, campos({ nome: base.toUpperCase() })),
        ]);
        const ctx = `rodada ${i}: ${JSON.stringify(rs)}`;
        const idxOk = rs.findIndex((r) => r.tipo === "ok");
        expect(rs.filter((r) => r.tipo === "ok"), ctx).toHaveLength(1);
        const ok = rs[idxOk] as { tipo: "ok"; id: number };
        expect(rs[1 - idxOk], ctx).toEqual({ tipo: "nome_repetido", codigoExistente: ok.id });
        expect(await contar(), ctx).toBe(1);
      }
    },
    120_000,
  );

  it(
    "SC-005: N cadastros simultâneos ⇒ todos ok com códigos distintos",
    async () => {
      const N = 8;
      const rs = await Promise.all(Array.from({ length: N }, () => inserir(db, sessao, campos())));
      const ids = rs.map((r) => (r.tipo === "ok" ? r.id : null));
      expect(ids.every((x) => x !== null), JSON.stringify(rs)).toBe(true);
      expect(new Set(ids).size).toBe(N);
      expect(await contar()).toBe(N);
    },
    60_000,
  );

  it("SC-005: código de produto removido não volta", async () => {
    const a = await inserir(db, sessao, campos());
    if (a.tipo !== "ok") throw new Error("setup");
    expect(await remover(db, sessao, a.id, 1)).toEqual({ tipo: "removido" });
    const rs = await Promise.all([inserir(db, sessao, campos()), inserir(db, sessao, campos())]);
    for (const r of rs) {
      expect(r.tipo).toBe("ok");
      if (r.tipo === "ok") expect(r.id).toBeGreaterThan(a.id);
    }
  });
});

describe("versão otimista concorrente (FR-026)", () => {
  it(
    "dois editar com a mesma versao ⇒ 1 ok e 1 versao_diferente; versao 2 e nome do vencedor",
    async () => {
      for (let i = 0; i < RODADAS; i++) {
        await limparProdutos(db);
        const id = await inserirProduto(db, cat1);
        const nomes = [nomeUnicoProduto("A"), nomeUnicoProduto("B")];
        const rs = await Promise.all(nomes.map((nome) => editar(db, sessao, id, 1, campos({ nome }))));
        const ctx = `rodada ${i}: ${JSON.stringify(rs)}`;
        expect(rs.filter((r) => r.tipo === "ok"), ctx).toHaveLength(1);
        expect(rs.filter((r) => r.tipo === "versao_diferente"), ctx).toHaveLength(1);
        const venc = rs.findIndex((r) => r.tipo === "ok");
        const f = await db.execute(sql`SELECT nome, versao FROM produtos WHERE id = ${id}`);
        expect((f.rows as { nome: string; versao: number }[])[0], ctx).toEqual({ nome: nomes[venc], versao: 2 });
      }
    },
    60_000,
  );

  it(
    "dois remover com a mesma versao ⇒ 1 removido; o outro recebe ausente (a linha já sumiu)",
    async () => {
      for (let i = 0; i < RODADAS; i++) {
        await limparProdutos(db);
        const id = await inserirProduto(db, cat1);
        const rs = await Promise.all([remover(db, sessao, id, 1), remover(db, sessao, id, 1)]);
        const ctx = `rodada ${i}: ${JSON.stringify(rs)}`;
        expect(rs.filter((r) => r.tipo === "removido"), ctx).toHaveLength(1);
        const outro = rs.find((r) => r.tipo !== "removido")!;
        expect(outro, ctx).toEqual({ tipo: "ausente" });
        expect(await contar(), ctx).toBe(0);
      }
    },
    60_000,
  );

  it(
    "editar × remover da mesma versao ⇒ exatamente 1 vence; nada sobrescrito",
    async () => {
      for (let i = 0; i < RODADAS; i++) {
        await limparProdutos(db);
        const id = await inserirProduto(db, cat1);
        const [rEd, rRem] = await Promise.all([
          editar(db, sessao, id, 1, campos()),
          remover(db, sessao, id, 1),
        ]);
        const ctx = `rodada ${i}: ${JSON.stringify([rEd, rRem])}`;
        expect((rEd.tipo === "ok") !== (rRem.tipo === "removido"), ctx).toBe(true);
        if (rEd.tipo === "ok") {
          expect(rRem, ctx).toEqual({ tipo: "versao_diferente" });
          expect(await contar(), ctx).toBe(1);
        } else {
          expect(rEd, ctx).toEqual({ tipo: "ausente" });
          expect(await contar(), ctx).toBe(0);
        }
      }
    },
    60_000,
  );
});

describe("corrida com a remoção da categoria (US7-AC3, contrato §4 da 002)", () => {
  it(
    "inserir × remover da categoria ⇒ (produto gravado + tem_produtos) ou (categoria removida + categoria_ausente); nunca órfão",
    async () => {
      for (let i = 0; i < RODADAS; i++) {
        await limparProdutos(db);
        const cat = await novaCategoria();
        const [rIns, rCat] = await Promise.all([
          inserir(db, sessao, campos({ categoriaId: cat })),
          removerCategoria(db, sessao, cat, 1),
        ]);
        const ctx = `rodada ${i}: ${JSON.stringify([rIns, rCat])}`;
        const gravou = rIns.tipo === "ok" && rCat.tipo === "tem_produtos";
        const removeu = rIns.tipo === "categoria_ausente" && rCat.tipo === "removido";
        expect(gravou || removeu, ctx).toBe(true);
        expect(await orfaos(), ctx).toBe(0);
        expect(await contar(), ctx).toBe(gravou ? 1 : 0);
      }
    },
    120_000,
  );

  it(
    "editar trocando para a categoria × remover dela ⇒ (troca feita + tem_produtos) ou (categoria removida + categoria_ausente); nunca órfão",
    async () => {
      for (let i = 0; i < RODADAS; i++) {
        await limparProdutos(db);
        const cat = await novaCategoria();
        const id = await inserirProduto(db, cat1);
        const [rEd, rCat] = await Promise.all([
          editar(db, sessao, id, 1, campos({ categoriaId: cat })),
          removerCategoria(db, sessao, cat, 1),
        ]);
        const ctx = `rodada ${i}: ${JSON.stringify([rEd, rCat])}`;
        const trocou = rEd.tipo === "ok" && rCat.tipo === "tem_produtos";
        const removeu = rEd.tipo === "categoria_ausente" && rCat.tipo === "removido";
        expect(trocou || removeu, ctx).toBe(true);
        expect(await orfaos(), ctx).toBe(0);
        const f = await db.execute(sql`SELECT categoria_id FROM produtos WHERE id = ${id}`);
        expect((f.rows as { categoria_id: number }[])[0].categoria_id, ctx).toBe(trocou ? cat : cat1);
      }
    },
    120_000,
  );
});
