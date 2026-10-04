import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

// Se `criarFixtureProdutos` falhar porque `produtos` já existe (execução interrompida),
// recuperar com `npm run db:reset` + `npm run db:migrate`.
import type { AdminSession } from "@/lib/auth";
import { createDb } from "@/lib/db/client";
import { contarProdutosDaCategoria, remover } from "@/lib/db/categorias";
import {
  criarFixtureProdutos,
  descartarFixtureProdutos,
  resetCategorias,
} from "@/test/db/categorias-fixtures";

// Feature 002, T042 (US4-4, SC-009, H3-A, D4-A): bloqueio por produtos via FK (23001, ON DELETE RESTRICT) e
// contagem real, com tabela `produtos` comum criada/descartada pela própria suíte.
const db = createDb({
  DATABASE_URL: process.env.DATABASE_URL ?? "",
  NEON_FETCH_ENDPOINT: process.env.NEON_FETCH_ENDPOINT,
});
const sessao: AdminSession = { email: "admin@teste.local", name: "Admin" };

type Linha = { id: number; versao: number };

async function categoriaPorNome(nome: string): Promise<Linha> {
  const r = await db.execute(sql`SELECT id, versao FROM categorias WHERE nome = ${nome}`);
  return (r.rows as Linha[])[0];
}

async function existe(id: number): Promise<boolean> {
  const r = await db.execute(sql`SELECT 1 FROM categorias WHERE id = ${id}`);
  return r.rows.length === 1;
}

async function vincular(id: number, quantidade: number): Promise<void> {
  for (let i = 0; i < quantidade; i++) {
    await db.execute(sql`INSERT INTO produtos (categoria_id) VALUES (${id})`);
  }
}

describe("remover com produtos vinculados (fixture)", () => {
  beforeAll(async () => {
    await resetCategorias(db);
    await criarFixtureProdutos(db);
  });
  // A fixture sai ANTES de qualquer resetCategorias (a FK bloquearia o TRUNCATE).
  afterAll(async () => {
    await descartarFixtureProdutos(db);
    await resetCategorias(db);
  });
  beforeEach(async () => {
    await db.execute(sql`DELETE FROM produtos`);
  });

  it("US4-4: 3 produtos vinculados ⇒ contagem 3 e remover ⇒ tem_produtos(3) sem apagar a categoria", async () => {
    const cat = await categoriaPorNome("Meias");
    await vincular(cat.id, 3);
    expect(await contarProdutosDaCategoria(db, cat.id)).toBe(3);
    const r = await remover(db, sessao, cat.id, cat.versao);
    expect(r).toEqual({ tipo: "tem_produtos", quantidade: 3 });
    expect(await existe(cat.id)).toBe(true);
  });

  it("US4-4: 1 produto vinculado ⇒ tem_produtos com quantidade 1", async () => {
    const cat = await categoriaPorNome("Meias");
    await vincular(cat.id, 1);
    expect(await contarProdutosDaCategoria(db, cat.id)).toBe(1);
    const r = await remover(db, sessao, cat.id, cat.versao);
    expect(r).toEqual({ tipo: "tem_produtos", quantidade: 1 });
    expect(await existe(cat.id)).toBe(true);
  });

  it("US4-1: categoria sem produtos (outra categoria tem) ⇒ removido; a vinculada permanece", async () => {
    const comProdutos = await categoriaPorNome("Meias");
    const vazia = await categoriaPorNome("Panos de prato");
    await vincular(comProdutos.id, 2);
    expect(await contarProdutosDaCategoria(db, vazia.id)).toBe(0);
    const r = await remover(db, sessao, vazia.id, vazia.versao);
    expect(r).toEqual({ tipo: "removido" });
    expect(await existe(vazia.id)).toBe(false);
    expect(await existe(comProdutos.id)).toBe(true);
  });
});
