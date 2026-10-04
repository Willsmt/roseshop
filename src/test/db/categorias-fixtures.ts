// Infra de teste de integração da feature 002 (categorias). Não é teste nem produção.
//
// Recuperação: se uma execução for interrompida antes do `afterAll` (Ctrl+C, timeout),
// a tabela `produtos` criada por `criarFixtureProdutos` sobra no banco local e quebra
// tanto a próxima `criarFixtureProdutos` (tabela já existe) quanto o `TRUNCATE` de
// `resetCategorias` (FK). Recuperar com `npm run db:reset` (DESTRUTIVO, só local)
// seguido de `npm run db:migrate`.
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { sql } from "drizzle-orm";

import type { Db } from "@/lib/db/client";

const DIR_MIGRATIONS = fileURLToPath(new URL("../../lib/db/migrations/", import.meta.url));
const MARCADOR_INICIO = "-- seed:categorias:start";
const MARCADOR_FIM = "-- seed:categorias:end";
const BREAKPOINT = "--> statement-breakpoint";

/** Trecho entre os marcadores de seed (exclusivos). Falha se faltar ou repetir marcador. */
export function extrairBlocoSeed(sqlTexto: string): string {
  const inicio = sqlTexto.indexOf(MARCADOR_INICIO);
  const fim = sqlTexto.indexOf(MARCADOR_FIM);
  if (inicio === -1 || fim === -1) {
    throw new Error(`Marcadores "${MARCADOR_INICIO}" / "${MARCADOR_FIM}" não encontrados na migration`);
  }
  if (sqlTexto.indexOf(MARCADOR_INICIO, inicio + 1) !== -1 || sqlTexto.indexOf(MARCADOR_FIM, fim + 1) !== -1) {
    throw new Error("Marcadores de seed de categorias repetidos na migration");
  }
  if (fim < inicio) {
    throw new Error(`"${MARCADOR_FIM}" aparece antes de "${MARCADOR_INICIO}" na migration`);
  }
  const bloco = sqlTexto.slice(inicio + MARCADOR_INICIO.length, fim).trim();
  if (!bloco) {
    throw new Error("Bloco de seed de categorias vazio na migration");
  }
  return bloco;
}

/** Caminho absoluto da única `0000_*.sql` em `src/lib/db/migrations/`. */
export function caminhoMigrationInicial(): string {
  let nomes: string[];
  try {
    nomes = readdirSync(DIR_MIGRATIONS);
  } catch {
    throw new Error(`Diretório de migrations não encontrado: ${DIR_MIGRATIONS} (rode db:generate)`);
  }
  const candidatas = nomes.filter((n) => /^0000_.*\.sql$/.test(n));
  if (candidatas.length !== 1) {
    throw new Error(
      `Esperada exatamente uma migration 0000_*.sql em ${DIR_MIGRATIONS}, encontradas ${candidatas.length}`,
    );
  }
  return DIR_MIGRATIONS + candidatas[0];
}

/** Bloco de seed lido da migration inicial (o mesmo SQL que o `db:migrate` aplica). */
export function lerBlocoSeedCategorias(): string {
  return extrairBlocoSeed(readFileSync(caminhoMigrationInicial(), "utf8"));
}

// neon-http executa um statement por requisição: divide pelo breakpoint do drizzle-kit
// e descarta trechos só de comentário. O bloco esperado é um único INSERT multi-VALUES.
function statementsDoBloco(bloco: string): string[] {
  return bloco
    .split(BREAKPOINT)
    .map((s) => s.trim())
    .filter((s) => s.split("\n").some((l) => l.trim() && !l.trim().startsWith("--")));
}

/** TRUNCATE + seed da migration. Nunca descarta tabelas (a fixture sai antes, no afterAll). */
export async function resetCategorias(db: Db): Promise<void> {
  const statements = statementsDoBloco(lerBlocoSeedCategorias());
  await db.execute(sql.raw("TRUNCATE categorias RESTART IDENTITY"));
  for (const s of statements) {
    await db.execute(sql.raw(s));
  }
}

// Estado do módulo: só descarta `produtos` quem a criou nesta execução.
let produtosCriadaPeloHelper = false;

/**
 * Tabela COMUM (não TEMP: FK de temp para permanente é recusada e, no neon-http, cada
 * statement é uma sessão nova). Sem IF NOT EXISTS: se existir uma `produtos` real
 * (feature 003), falha de propósito e sinaliza que a fixture deve sair (contrato §5).
 */
export async function criarFixtureProdutos(db: Db): Promise<void> {
  await db.execute(
    sql.raw(
      "CREATE TABLE produtos (id integer generated always as identity primary key, " +
        "categoria_id integer NOT NULL REFERENCES categorias(id) ON DELETE RESTRICT)",
    ),
  );
  produtosCriadaPeloHelper = true;
}

/** DROP da `produtos` somente se foi este helper que a criou. */
export async function descartarFixtureProdutos(db: Db): Promise<void> {
  if (!produtosCriadaPeloHelper) return;
  await db.execute(sql.raw("DROP TABLE produtos"));
  produtosCriadaPeloHelper = false;
}
