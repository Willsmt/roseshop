import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import type { AdminSession } from "@/lib/auth";
import { createDb } from "@/lib/db/client";
import { inserir, renomear } from "@/lib/db/categorias";
import { resetCategorias } from "@/test/db/categorias-fixtures";

// Feature 002, T031 (US2-1/2/3/8, US3, FR-005, FR-006, FR-019). Integração com o banco local.
// A camada db recebe o nome JÁ normalizado (nome.ts). Espaços nas pontas são removidos antes,
// pela validação de domínio, e não chegam aqui (violariam o CHECK nome = btrim(nome)); por isso
// a duplicidade é exercitada com "meias"/"MEIAS" em vez de " Meias ".
const db = createDb({
  DATABASE_URL: process.env.DATABASE_URL ?? "",
  NEON_FETCH_ENDPOINT: process.env.NEON_FETCH_ENDPOINT,
});
const sessao: AdminSession = { email: "admin@teste.local", name: "Admin" };

type Linha = { id: number; nome: string; versao: number; criado_em: string; atualizado_em: string };

async function linhaPorNome(nome: string): Promise<Linha | undefined> {
  const r = await db.execute(
    sql`SELECT id, nome, versao, criado_em::text AS criado_em, atualizado_em::text AS atualizado_em FROM categorias WHERE nome = ${nome}`,
  );
  return (r.rows as Linha[])[0];
}

async function linhaPorId(id: number): Promise<Linha | undefined> {
  const r = await db.execute(
    sql`SELECT id, nome, versao, criado_em::text AS criado_em, atualizado_em::text AS atualizado_em FROM categorias WHERE id = ${id}`,
  );
  return (r.rows as Linha[])[0];
}

async function contar(): Promise<number> {
  const r = await db.execute(sql`SELECT count(*)::int AS n FROM categorias`);
  return (r.rows as { n: number }[])[0].n;
}

const esperar = (ms: number) => new Promise((res) => setTimeout(res, ms));

describe("inserir (US2)", () => {
  beforeEach(() => resetCategorias(db));
  afterAll(() => resetCategorias(db));

  it("US2-1: 'Bolsas de Praia' ⇒ ok com id numérico; linha com versao 1 e nome exato", async () => {
    const r = await inserir(db, sessao, "Bolsas de Praia");
    expect(r.tipo).toBe("ok");
    if (r.tipo !== "ok") return;
    expect(typeof r.id).toBe("number");
    const linha = await linhaPorId(r.id);
    expect(linha?.nome).toBe("Bolsas de Praia");
    expect(linha?.versao).toBe(1);
  });

  it.each([
    ["panos de prato", "Panos de prato"],
    ["GUÁRDA-chuvas", "Guarda-chuvas"],
    ["MEIAS", "Meias"],
    ["meias", "Meias"],
  ])("US2-2/8: '%s' ⇒ nome_repetido com o nome gravado '%s' e nenhuma linha nova", async (entrada, gravado) => {
    const antes = await contar();
    const r = await inserir(db, sessao, entrada);
    expect(r).toEqual({ tipo: "nome_repetido", nomeExistente: gravado });
    expect(await contar()).toBe(antes);
  });

  it("US2-3: 'Guarda-chuva' (chave diferente de 'Guarda-chuvas') ⇒ ok", async () => {
    const r = await inserir(db, sessao, "Guarda-chuva");
    expect(r.tipo).toBe("ok");
    expect(await linhaPorNome("Guarda-chuva")).toBeDefined();
  });

  it("nome que viola o CHECK de tamanho ('A') rejeita; o erro propaga e não vira nome_repetido", async () => {
    const antes = await contar();
    await expect(inserir(db, sessao, "A")).rejects.toThrow();
    expect(await contar()).toBe(antes);
  });
});

describe("renomear (US3, FR-006, FR-019)", () => {
  beforeEach(() => resetCategorias(db));
  afterAll(() => resetCategorias(db));

  it("FR-006: 'Bolsas' (versao 1) para 'bolsas' (mesma chave, próprio registro) ⇒ ok; nome gravado 'bolsas'", async () => {
    const antes = (await linhaPorNome("Bolsas"))!;
    const r = await renomear(db, sessao, antes.id, 1, "bolsas");
    expect(r).toEqual({ tipo: "ok" });
    expect((await linhaPorId(antes.id))?.nome).toBe("bolsas");
  });

  it("US3: 'Meias' para 'bolsas' ⇒ nome_repetido com 'Bolsas'; Meias inalterada", async () => {
    const meias = (await linhaPorNome("Meias"))!;
    const r = await renomear(db, sessao, meias.id, meias.versao, "bolsas");
    expect(r).toEqual({ tipo: "nome_repetido", nomeExistente: "Bolsas" });
    const depois = (await linhaPorId(meias.id))!;
    expect(depois.nome).toBe("Meias");
    expect(depois.versao).toBe(1);
  });

  it("rename ok: versao 1 ⇒ 2, atualizado_em estritamente maior, criado_em e id preservados", async () => {
    const antes = (await linhaPorNome("Tupperware"))!;
    expect(antes.versao).toBe(1);
    await esperar(20);
    const r = await renomear(db, sessao, antes.id, 1, "Potes");
    expect(r).toEqual({ tipo: "ok" });
    const depois = (await linhaPorId(antes.id))!;
    expect(depois.id).toBe(antes.id);
    expect(depois.nome).toBe("Potes");
    expect(depois.versao).toBe(2);
    expect(depois.criado_em).toBe(antes.criado_em);
    expect(new Date(depois.atualizado_em).getTime()).toBeGreaterThan(new Date(antes.atualizado_em).getTime());
  });

  it("FR-019: versao velha (1 após já ter virado 2) ⇒ versao_diferente, nada muda", async () => {
    const antes = (await linhaPorNome("Tupperware"))!;
    expect(await renomear(db, sessao, antes.id, 1, "Potes")).toEqual({ tipo: "ok" });
    const meio = (await linhaPorId(antes.id))!;
    const r = await renomear(db, sessao, antes.id, 1, "Vasilhas");
    expect(r).toEqual({ tipo: "versao_diferente" });
    expect(await linhaPorId(antes.id)).toEqual(meio);
  });

  it("FR-019: id inexistente (999999) ⇒ ausente", async () => {
    expect(await renomear(db, sessao, 999999, 1, "Qualquer")).toEqual({ tipo: "ausente" });
  });
});
