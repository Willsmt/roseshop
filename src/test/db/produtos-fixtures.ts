// Infra de teste de integração da feature 003 (produtos). Não é teste nem produção.
import { sql } from "drizzle-orm";

import type { Db } from "@/lib/db/client";
import { produtos } from "@/lib/db/schema";

const AUTOR_PADRAO = "admin@teste.local";
let sequencia = 0;

export type NovoProdutoFixture = {
  nome?: string;
  criadoPor?: string;
  atualizadoPor?: string;
};

/** Nome único por processo (a `chave` gerada tem unicidade global). */
export function nomeUnicoProduto(prefixo = "Produto"): string {
  sequencia += 1;
  return `${prefixo} ${process.pid}-${Date.now()}-${sequencia}`;
}

/** Insere um produto real na categoria e devolve o id. */
export async function inserirProduto(
  db: Db,
  categoriaId: number,
  { nome, criadoPor = AUTOR_PADRAO, atualizadoPor = criadoPor }: NovoProdutoFixture = {},
): Promise<number> {
  const [linha] = await db
    .insert(produtos)
    .values({ categoriaId, nome: nome ?? nomeUnicoProduto(), criadoPor, atualizadoPor })
    .returning({ id: produtos.id });
  return linha.id;
}

/** Insere `quantidade` produtos na categoria e devolve os ids. */
export async function inserirProdutos(
  db: Db,
  categoriaId: number,
  quantidade: number,
  autoria: Omit<NovoProdutoFixture, "nome"> = {},
): Promise<number[]> {
  const ids: number[] = [];
  for (let i = 0; i < quantidade; i++) {
    ids.push(await inserirProduto(db, categoriaId, autoria));
  }
  return ids;
}

/** Limpa `produtos` (as fotos saem por CASCADE) sem tocar em `categorias`. */
export async function limparProdutos(db: Db): Promise<void> {
  await db.execute(sql.raw("DELETE FROM produtos"));
}
