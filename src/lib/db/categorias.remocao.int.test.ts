import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import type { AdminSession } from "@/lib/auth";
import { createDb } from "@/lib/db/client";
import { remover } from "@/lib/db/categorias";
import { resetCategorias } from "@/test/db/categorias-fixtures";

// Feature 002, T041 (US4, FR-010, FR-011, FR-019, FR-020). Integração com o banco local.
const db = createDb({
  DATABASE_URL: process.env.DATABASE_URL ?? "",
  NEON_FETCH_ENDPOINT: process.env.NEON_FETCH_ENDPOINT,
});
const sessao: AdminSession = { email: "admin@teste.local", name: "Admin" };

type Linha = { id: number; nome: string; versao: number };

async function primeira(): Promise<Linha> {
  const r = await db.execute(sql`SELECT id, nome, versao FROM categorias ORDER BY id LIMIT 1`);
  return (r.rows as Linha[])[0];
}

async function linhaPorId(id: number): Promise<Linha | undefined> {
  const r = await db.execute(sql`SELECT id, nome, versao FROM categorias WHERE id = ${id}`);
  return (r.rows as Linha[])[0];
}

async function contar(): Promise<number> {
  const r = await db.execute(sql`SELECT count(*)::int AS n FROM categorias`);
  return (r.rows as { n: number }[])[0].n;
}

describe("remover (US4)", () => {
  beforeEach(() => resetCategorias(db));
  afterAll(() => resetCategorias(db));

  it("US4-1: id + versão corretos ⇒ removido e a linha some; as demais permanecem", async () => {
    const alvo = await primeira();
    const antes = await contar();
    const r = await remover(db, sessao, alvo.id, alvo.versao);
    expect(r).toEqual({ tipo: "removido" });
    expect(await linhaPorId(alvo.id)).toBeUndefined();
    expect(await contar()).toBe(antes - 1);
  });

  it("FR-019: versão velha ⇒ versao_diferente e nada é apagado", async () => {
    const alvo = await primeira();
    const antes = await contar();
    const r = await remover(db, sessao, alvo.id, alvo.versao + 1);
    expect(r).toEqual({ tipo: "versao_diferente" });
    expect(await linhaPorId(alvo.id)).toBeDefined();
    expect(await contar()).toBe(antes);
  });

  it("US4-3: id ausente ⇒ ausente e nada é apagado", async () => {
    const antes = await contar();
    const r = await remover(db, sessao, 999_999, 1);
    expect(r).toEqual({ tipo: "ausente" });
    expect(await contar()).toBe(antes);
  });

  it("FR-011: id e versão batem mas só resta 1 categoria ⇒ ultima e a linha continua", async () => {
    const alvo = await primeira();
    await db.execute(sql`DELETE FROM categorias WHERE id <> ${alvo.id}`);
    expect(await contar()).toBe(1);
    const r = await remover(db, sessao, alvo.id, alvo.versao);
    expect(r).toEqual({ tipo: "ultima" });
    expect(await linhaPorId(alvo.id)).toBeDefined();
    expect(await contar()).toBe(1);
  });
});
