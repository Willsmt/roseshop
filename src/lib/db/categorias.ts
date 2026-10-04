import { eq, sql } from "drizzle-orm";

import type { Db } from "./client";
import { categorias } from "./schema";

// Camada SQL de categorias (contrato §4). Toda função recebe `db`; nada aqui conhece
// motivos nem mensagens de UI. Nesta sub-fase (SF2) só há leitura.

export type CategoriaDb = { id: number; nome: string; versao: number };

const colunas = {
  id: categorias.id,
  nome: categorias.nome,
  versao: categorias.versao,
};

// Ordem alfabética pela chave normalizada (FR-012). Collation "C" torna a ordem
// independente do locale do servidor; `id` desempata de forma estável.
export async function listar(db: Db): Promise<CategoriaDb[]> {
  return db
    .select(colunas)
    .from(categorias)
    .orderBy(sql`${categorias.chave} COLLATE "C"`, categorias.id);
}

export async function obterPorId(db: Db, id: number): Promise<CategoriaDb | null> {
  const [linha] = await db.select(colunas).from(categorias).where(eq(categorias.id, id)).limit(1);
  return linha ?? null;
}
