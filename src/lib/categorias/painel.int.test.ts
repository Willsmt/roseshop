import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { createDb } from "@/lib/db/client";
import { resetCategorias } from "@/test/db/categorias-fixtures";

import { listarCategorias } from "@/lib/categorias";
import { listarCategoriasDoPainel, obterCategoriaDoPainel } from "@/lib/categorias/painel";

// Feature 002, T017 (H4-A, FR-019, FR-012). Integração com o banco local.
const db = createDb({
  DATABASE_URL: process.env.DATABASE_URL ?? "",
  NEON_FETCH_ENDPOINT: process.env.NEON_FETCH_ENDPOINT,
});

vi.mock("@/lib/db/contexto", () => ({
  dbDoContexto: async () =>
    createDb({
      DATABASE_URL: process.env.DATABASE_URL ?? "",
      NEON_FETCH_ENDPOINT: process.env.NEON_FETCH_ENDPOINT,
    }),
}));

async function idDe(nome: string): Promise<number> {
  const r = await db.execute(sql`SELECT id FROM categorias WHERE nome = ${nome}`);
  return (r.rows as { id: number }[])[0].id;
}

describe("leitura do painel", () => {
  beforeEach(() => resetCategorias(db));
  afterAll(() => resetCategorias(db));

  it("listarCategoriasDoPainel devolve { id, nome, versao } na mesma ordem de listarCategorias (FR-012/FR-019)", async () => {
    await db.execute(sql`INSERT INTO categorias (nome) VALUES ('Água')`);
    const painel = await listarCategoriasDoPainel();
    const publica = await listarCategorias();
    expect(painel.map((c) => c.id)).toEqual(publica.map((c) => c.id));
    expect(painel.map((c) => c.nome)).toEqual(publica.map((c) => c.nome));
    for (const c of painel) {
      expect(Object.keys(c).sort()).toEqual(["id", "nome", "versao"]);
      expect(c.versao).toBe(1);
    }
  });

  it("obterCategoriaDoPainel aceita o id em string e devolve { id: number, nome, versao } (contrato §2)", async () => {
    const id = await idDe("Tupperware");
    expect(await obterCategoriaDoPainel(String(id))).toEqual({ id, nome: "Tupperware", versao: 1 });
  });

  it.each([
    ["inexistente", "999999"],
    ["zero", "0"],
    ["negativo", "-1"],
    ["não numérico", "abc"],
  ])("obterCategoriaDoPainel devolve null para id %s", async (_rotulo, id) => {
    expect(await obterCategoriaDoPainel(id)).toBeNull();
  });

  it("versao reflete o incremento após um rename (FR-019)", async () => {
    const id = await idDe("Bolsas");
    await db.execute(
      sql`UPDATE categorias SET nome = 'Carteiras', versao = versao + 1 WHERE id = ${id}`,
    );
    expect(await obterCategoriaDoPainel(String(id))).toEqual({ id, nome: "Carteiras", versao: 2 });
    const item = (await listarCategoriasDoPainel()).find((c) => c.id === id);
    expect(item).toEqual({ id, nome: "Carteiras", versao: 2 });
  });
});
