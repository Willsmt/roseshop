import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { AdminSession } from "@/lib/auth";
import { createDb } from "@/lib/db/client";
import { resetCategorias } from "@/test/db/categorias-fixtures";
import { inserirProduto, limparProdutos, nomeUnicoProduto } from "@/test/db/produtos-fixtures";

import { editar, inserir, remover } from "./produtos";

// Feature 003, T023 (SF4): US1-AC1/4/7/8, US4-AC1-5, US6-AC3-6, SC-005. Integração com o banco local.
// A camada db recebe os campos JÁ normalizados pelo domínio (ADR-008: um statement por função).
const db = createDb({
  DATABASE_URL: process.env.DATABASE_URL ?? "",
  NEON_FETCH_ENDPOINT: process.env.NEON_FETCH_ENDPOINT,
});
const sessao: AdminSession = { email: "ana@teste.local", name: "Ana" };
const outra: AdminSession = { email: "bia@teste.local", name: "Bia" };

type Linha = {
  id: number;
  categoria_id: number;
  nome: string;
  descricao: string | null;
  preco_centavos: number | null;
  a_partir_de: boolean;
  versao: number;
  criado_por: string;
  atualizado_por: string;
  criado_em: string;
  atualizado_em: string;
};

let cat1 = 0;
let cat2 = 0;

function campos(extra: Partial<Parameters<typeof inserir>[2]> = {}) {
  return {
    nome: nomeUnicoProduto(),
    categoriaId: cat1,
    descricao: null,
    precoCentavos: 1500,
    aPartirDe: false,
    ...extra,
  };
}

async function linha(id: number): Promise<Linha | undefined> {
  const r = await db.execute(
    sql`SELECT id, categoria_id, nome, descricao, preco_centavos, a_partir_de, versao, criado_por, atualizado_por,
        criado_em::text AS criado_em, atualizado_em::text AS atualizado_em FROM produtos WHERE id = ${id}`,
  );
  return (r.rows as Linha[])[0];
}

async function contar(): Promise<number> {
  const r = await db.execute(sql`SELECT count(*)::int AS n FROM produtos`);
  return (r.rows as { n: number }[])[0].n;
}

const esperar = (ms: number) => new Promise((res) => setTimeout(res, ms));

beforeAll(async () => {
  await resetCategorias(db);
  const r = await db.execute(sql`SELECT id FROM categorias ORDER BY id LIMIT 2`);
  [cat1, cat2] = (r.rows as { id: number }[]).map((x) => x.id);
});
beforeEach(() => limparProdutos(db));
afterAll(() => resetCategorias(db));

describe("inserir (US1)", () => {
  it("US1-AC1: ok com id numérico; versao 1 e criado_por = atualizado_por = e-mail da sessão", async () => {
    const c = campos({ descricao: "Linda", precoCentavos: 2590 });
    const r = await inserir(db, sessao, c);
    expect(r.tipo).toBe("ok");
    if (r.tipo !== "ok") return;
    expect(typeof r.id).toBe("number");
    const l = (await linha(r.id))!;
    expect(l).toMatchObject({
      nome: c.nome,
      categoria_id: cat1,
      descricao: "Linda",
      preco_centavos: 2590,
      a_partir_de: false,
      versao: 1,
      criado_por: sessao.email,
      atualizado_por: sessao.email,
    });
  });

  it("US1-AC1: sem preço (NULL) e a_partir_de true no campo é recusado pelo banco (erro propaga)", async () => {
    await expect(inserir(db, sessao, campos({ precoCentavos: null, aPartirDe: true }))).rejects.toThrow();
    expect(await contar()).toBe(0);
  });

  it("US1-AC4/SC-005: nome equivalente (caixa/acento) ⇒ nome_repetido com codigoExistente = id do existente; sem linha nova", async () => {
    const id = await inserirProduto(db, cat1, { nome: "Bolsa de Praia" });
    const r = await inserir(db, sessao, campos({ nome: "BOLSÁ de praia" }));
    expect(r).toEqual({ tipo: "nome_repetido", codigoExistente: id });
    expect(await contar()).toBe(1);
  });

  it("US1-AC7: categoria inexistente (23503) ⇒ categoria_ausente; nada gravado", async () => {
    const r = await inserir(db, sessao, campos({ categoriaId: 999999 }));
    expect(r).toEqual({ tipo: "categoria_ausente" });
    expect(await contar()).toBe(0);
  });

  it("US1-AC8/SC-005: código (id) nunca reaproveitado após remover", async () => {
    const a = await inserir(db, sessao, campos());
    if (a.tipo !== "ok") throw new Error("setup");
    expect(await remover(db, sessao, a.id, 1)).toEqual({ tipo: "removido" });
    const b = await inserir(db, sessao, campos());
    if (b.tipo !== "ok") throw new Error("setup");
    expect(b.id).toBeGreaterThan(a.id);
  });

  it("violação de CHECK (nome 'A') propaga e não vira nome_repetido", async () => {
    await expect(inserir(db, sessao, campos({ nome: "A" }))).rejects.toThrow();
    expect(await contar()).toBe(0);
  });
});

describe("editar (US4)", () => {
  it("US4-AC1: incrementa versao, grava atualizado_por e atualizado_em; troca de categoria mantém o id; criado_* preservados", async () => {
    const id = await inserirProduto(db, cat1, { criadoPor: sessao.email });
    const antes = (await linha(id))!;
    await esperar(20);
    const c = campos({ categoriaId: cat2, descricao: "Nova", precoCentavos: 3000 });
    const r = await editar(db, outra, id, 1, c);
    expect(r).toEqual({ tipo: "ok" });
    const depois = (await linha(id))!;
    expect(depois).toMatchObject({
      id,
      categoria_id: cat2,
      nome: c.nome,
      descricao: "Nova",
      preco_centavos: 3000,
      versao: 2,
      criado_por: sessao.email,
      atualizado_por: outra.email,
      criado_em: antes.criado_em,
    });
    expect(new Date(depois.atualizado_em).getTime()).toBeGreaterThan(new Date(antes.atualizado_em).getTime());
  });

  it("US4-AC2: preço NULL com aPartirDe true no campo ⇒ ok e a_partir_de gravado false (defesa do SQL)", async () => {
    const id = await inserirProduto(db, cat1);
    const r = await editar(db, sessao, id, 1, campos({ precoCentavos: null, aPartirDe: true }));
    expect(r).toEqual({ tipo: "ok" });
    const l = (await linha(id))!;
    expect(l.preco_centavos).toBeNull();
    expect(l.a_partir_de).toBe(false);
  });

  it("US4-AC3: versao velha ⇒ versao_diferente; linha inalterada", async () => {
    const id = await inserirProduto(db, cat1);
    expect(await editar(db, sessao, id, 1, campos())).toEqual({ tipo: "ok" });
    const meio = (await linha(id))!;
    expect(await editar(db, sessao, id, 1, campos())).toEqual({ tipo: "versao_diferente" });
    expect(await linha(id)).toEqual(meio);
  });

  it("US4-AC3: id inexistente ⇒ ausente", async () => {
    expect(await editar(db, sessao, 999999, 1, campos())).toEqual({ tipo: "ausente" });
  });

  it("US4-AC4: nome de outro produto ⇒ nome_repetido com codigoExistente; inalterado", async () => {
    const outro = await inserirProduto(db, cat1, { nome: "Carteira Azul" });
    const id = await inserirProduto(db, cat1);
    const antes = (await linha(id))!;
    const r = await editar(db, sessao, id, 1, campos({ nome: "carteira azul" }));
    expect(r).toEqual({ tipo: "nome_repetido", codigoExistente: outro });
    expect(await linha(id)).toEqual(antes);
  });

  it("US4-AC4: renomear para a mesma chave do próprio registro (caixa) ⇒ ok", async () => {
    const id = await inserirProduto(db, cat1, { nome: "Carteira Azul" });
    const r = await editar(db, sessao, id, 1, campos({ nome: "CARTEIRA AZUL" }));
    expect(r).toEqual({ tipo: "ok" });
    expect((await linha(id))?.nome).toBe("CARTEIRA AZUL");
  });

  it("US4-AC5: categoria inexistente ⇒ categoria_ausente; inalterado", async () => {
    const id = await inserirProduto(db, cat1);
    const antes = (await linha(id))!;
    const r = await editar(db, sessao, id, 1, campos({ categoriaId: 999999 }));
    expect(r).toEqual({ tipo: "categoria_ausente" });
    expect(await linha(id)).toEqual(antes);
  });
});

describe("remover (US6)", () => {
  it("US6-AC3: remove a linha ⇒ removido; fotos saem em cascata", async () => {
    const id = await inserirProduto(db, cat1);
    await db.execute(
      sql`INSERT INTO produto_fotos (produto_id, posicao, chave_objeto, enviado_por, enviado_em) VALUES (${id}, 1, ${`fotos/${randomUUID()}.jpg`}, 'zt@example.com', now()), (${id}, 2, ${`fotos/${randomUUID()}.jpg`}, 'zt@example.com', now())`,
    );
    expect(await remover(db, sessao, id, 1)).toEqual({ tipo: "removido" });
    expect(await linha(id)).toBeUndefined();
    const f = await db.execute(sql`SELECT count(*)::int AS n FROM produto_fotos WHERE produto_id = ${id}`);
    expect((f.rows as { n: number }[])[0].n).toBe(0);
  });

  it("US6-AC4: id inexistente ou já removido ⇒ ausente", async () => {
    expect(await remover(db, sessao, 999999, 1)).toEqual({ tipo: "ausente" });
    const id = await inserirProduto(db, cat1);
    await remover(db, sessao, id, 1);
    expect(await remover(db, sessao, id, 1)).toEqual({ tipo: "ausente" });
  });

  it("US6-AC5: versao velha ⇒ versao_diferente; produto permanece", async () => {
    const id = await inserirProduto(db, cat1);
    await editar(db, sessao, id, 1, campos());
    const meio = (await linha(id))!;
    expect(await remover(db, sessao, id, 1)).toEqual({ tipo: "versao_diferente" });
    expect(await linha(id)).toEqual(meio);
  });

  it("US6-AC6: remover não grava autoria em outros produtos; só o alvo some", async () => {
    const alvo = await inserirProduto(db, cat1);
    const outroId = await inserirProduto(db, cat1, { criadoPor: sessao.email });
    const antes = (await linha(outroId))!;
    expect(await remover(db, outra, alvo, 1)).toEqual({ tipo: "removido" });
    expect(await linha(outroId)).toEqual(antes);
    expect(await contar()).toBe(1);
  });
});
