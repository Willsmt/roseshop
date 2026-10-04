import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { createDb } from "@/lib/db/client";
import { resetCategorias } from "@/test/db/categorias-fixtures";

import {
  CategoriaInvalidaError,
  exigirCategoriaValida,
  listarCategorias,
  obterCategoria,
} from "@/lib/categorias";

// Feature 002, T016 (FR-012, FR-014, SC-006, US5; US3-6/US5-4). Integração com o banco local.
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

async function contar(): Promise<number> {
  const r = await db.execute(sql`SELECT count(*)::int AS n FROM categorias`);
  return (r.rows as { n: number }[])[0].n;
}

async function idDe(nome: string): Promise<number> {
  const r = await db.execute(sql`SELECT id FROM categorias WHERE nome = ${nome}`);
  return (r.rows as { id: number }[])[0].id;
}

describe("leitura de categorias (barrel)", () => {
  beforeEach(() => resetCategorias(db));
  afterAll(() => resetCategorias(db));

  it("listarCategorias devolve só { id, nome } em ordem alfabética (FR-012)", async () => {
    const lista = await listarCategorias();
    expect(lista.map((c) => c.nome)).toEqual([
      "Bolsas",
      "Guarda-chuvas",
      "Meias",
      "Panos de prato",
      "Tupperware",
    ]);
    for (const c of lista) {
      expect(Object.keys(c).sort()).toEqual(["id", "nome"]);
      expect(c).toEqual({ id: await idDe(c.nome), nome: c.nome });
    }
  });

  it("ordena pela chave normalizada: acento e minúscula não mudam a posição (FR-012)", async () => {
    await db.execute(sql`INSERT INTO categorias (nome) VALUES ('Água'), ('avental')`);
    const nomes = (await listarCategorias()).map((c) => c.nome);
    expect(nomes).toEqual([
      "Água",
      "avental",
      "Bolsas",
      "Guarda-chuvas",
      "Meias",
      "Panos de prato",
      "Tupperware",
    ]);
  });

  it("obterCategoria devolve { id, nome } do id existente e null para inexistente (US5)", async () => {
    const id = await idDe("Meias");
    expect(await obterCategoria(id)).toEqual({ id, nome: "Meias" });
    expect(await obterCategoria(999_999)).toBeNull();
  });

  it("exigirCategoriaValida devolve o próprio id quando válido (FR-014)", async () => {
    const id = await idDe("Bolsas");
    await expect(exigirCategoriaValida(id)).resolves.toBe(id);
  });

  it("exigirCategoriaValida lança CategoriaInvalidaError para id removido (FR-014/SC-006)", async () => {
    const id = await idDe("Meias");
    await db.execute(sql`DELETE FROM categorias WHERE id = ${id}`);
    await expect(exigirCategoriaValida(id)).rejects.toBeInstanceOf(CategoriaInvalidaError);
  });

  it.each([
    ["zero", 0],
    ["negativo", -1],
    ["não inteiro", 1.5],
    ["inexistente", 999_999],
  ])("exigirCategoriaValida lança CategoriaInvalidaError para id %s (FR-014)", async (_rotulo, id) => {
    await expect(exigirCategoriaValida(id)).rejects.toBeInstanceOf(CategoriaInvalidaError);
  });

  it("nunca cria categoria: contagem igual antes e depois de leituras e rejeições (SC-006)", async () => {
    const antes = await contar();
    await listarCategorias();
    await obterCategoria(999_999);
    for (const id of [0, -1, 1.5, 999_999]) {
      await expect(exigirCategoriaValida(id)).rejects.toBeInstanceOf(CategoriaInvalidaError);
    }
    expect(await contar()).toBe(antes);
  });

  it("renomear mantém o id: consumidores que guardam só o id continuam válidos (US3-6/US5-4)", async () => {
    const id = await idDe("Bolsas");
    await db.execute(
      sql`UPDATE categorias SET nome = 'Carteiras', versao = versao + 1 WHERE id = ${id}`,
    );
    expect(await obterCategoria(id)).toEqual({ id, nome: "Carteiras" });
    await expect(exigirCategoriaValida(id)).resolves.toBe(id);
    expect((await listarCategorias()).find((c) => c.id === id)?.nome).toBe("Carteiras");
  });
});
