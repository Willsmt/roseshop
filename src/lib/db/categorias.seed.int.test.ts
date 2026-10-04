import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDb } from "@/lib/db/client";
import { resetCategorias } from "@/test/db/categorias-fixtures";

// Feature 002, T003 (FR-002/003, SC-001/008). Mexe em dados reais de `categorias`:
// reseta via T001 antes e depois (arquivos de integração não rodam em paralelo, T007).
const db = createDb({
  DATABASE_URL: process.env.DATABASE_URL ?? "",
  NEON_FETCH_ENDPOINT: process.env.NEON_FETCH_ENDPOINT,
});

const INICIAIS = ["Bolsas", "Guarda-chuvas", "Tupperware", "Panos de prato", "Meias"];

function lerBlocoDeSeed(): string {
  const dir = path.resolve(process.cwd(), "src/lib/db/migrations");
  const arquivo = readdirSync(dir).find((f) => /^0000_.*\.sql$/.test(f));
  if (!arquivo) throw new Error("migration 0000_*.sql não encontrada");
  const sqlTexto = readFileSync(path.join(dir, arquivo), "utf8");
  const inicio = sqlTexto.indexOf("-- seed:categorias:start");
  const fim = sqlTexto.indexOf("-- seed:categorias:end");
  if (inicio === -1 || fim === -1 || fim < inicio) throw new Error("marcadores de seed ausentes na migration 0000");
  return sqlTexto.slice(inicio, fim);
}

async function nomes(): Promise<string[]> {
  const r = await db.execute(sql`SELECT nome FROM categorias ORDER BY chave COLLATE "C", id`);
  return (r.rows as { nome: string }[]).map((l) => l.nome);
}

const ordenados = (lista: string[]) => [...lista].sort((a, b) => a.localeCompare(b));

describe("seed das categorias iniciais", () => {
  beforeAll(() => resetCategorias(db));
  afterAll(() => resetCategorias(db));

  it("o bloco de seed da migration 0000 contém as cinco categorias iniciais (FR-002/003)", () => {
    const bloco = lerBlocoDeSeed();
    for (const nome of INICIAIS) {
      expect(bloco).toContain(nome);
    }
  });

  it("após resetCategorias (executa o bloco da migration), a tabela tem exatamente as cinco iniciais (SC-001/008)", async () => {
    await resetCategorias(db);
    expect(ordenados(await nomes())).toEqual(ordenados(INICIAIS));
  });

  it(
    "migrate repetido não recria a removida, não desfaz o rename e não duplica linhas (FR-003)",
    { timeout: 90_000 },
    async () => {
      await resetCategorias(db);
      await db.execute(sql`DELETE FROM categorias WHERE nome = 'Bolsas'`);
      await db.execute(sql`UPDATE categorias SET nome = 'Tupperware Grande' WHERE nome = 'Tupperware'`);

      execFileSync("npx", ["drizzle-kit", "migrate"], { env: process.env, timeout: 60_000 });

      const depois = await nomes();
      expect(depois).not.toContain("Bolsas");
      expect(depois).toContain("Tupperware Grande");
      expect(depois).not.toContain("Tupperware");
      expect(depois).toHaveLength(4);
      expect(new Set(depois).size).toBe(depois.length);
      expect(ordenados(depois)).toEqual(ordenados(["Guarda-chuvas", "Tupperware Grande", "Panos de prato", "Meias"]));
    },
  );
});
