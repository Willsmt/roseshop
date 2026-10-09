// Infra de teste de integração das features 003 e 004 (produtos). Não é teste nem produção.
import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";

import type { Db } from "@/lib/db/client";

const AUTOR_PADRAO = "admin@teste.local";
let sequencia = 0;

export type NovoProdutoFixture = {
  nome?: string;
  criadoPor?: string;
  atualizadoPor?: string;
  /**
   * Fotos criadas com o produto (feature 004: todo produto nasce com foto). Padrão 1. Use 0 só
   * para produto legado sem foto (D10) ou quando o teste insere as próprias fotos.
   */
  fotos?: 0 | 1;
};

/** Nome único por processo (a `chave` gerada tem unicidade global). */
export function nomeUnicoProduto(prefixo = "Produto"): string {
  sequencia += 1;
  return `${prefixo} ${process.pid}-${Date.now()}-${sequencia}`;
}

/** Chave sintética no formato de `produto_fotos_objeto_formato` (uuid v4 em minúsculas). */
export function chaveFotoFixture(): string {
  return `fotos/${randomUUID()}.jpg`;
}

/**
 * Insere um produto real na categoria, com a foto na posição 1 no mesmo statement, e devolve o
 * id. SQL direto: não depende dos writers de `produtos.ts`.
 */
export async function inserirProduto(
  db: Db,
  categoriaId: number,
  { nome, criadoPor = AUTOR_PADRAO, atualizadoPor = criadoPor, fotos = 1 }: NovoProdutoFixture = {},
): Promise<number> {
  const r = await db.execute(sql`
    WITH p AS (
      INSERT INTO produtos (categoria_id, nome, criado_por, atualizado_por)
      VALUES (${categoriaId}, ${nome ?? nomeUnicoProduto()}, ${criadoPor}, ${atualizadoPor})
      RETURNING id),
    f AS (
      INSERT INTO produto_fotos (produto_id, posicao, chave_objeto, enviado_por, enviado_em)
      SELECT id, 1, ${chaveFotoFixture()}, ${criadoPor}, now() FROM p WHERE ${fotos}::int = 1)
    SELECT id FROM p`);
  return (r.rows as { id: number }[])[0].id;
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
