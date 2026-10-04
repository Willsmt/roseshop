import { and, eq, sql } from "drizzle-orm";

import type { AdminSession } from "@/lib/auth";

import type { Db } from "./client";
import { codigoSqlstate } from "./erros-pg";
import { categorias } from "./schema";

// Camada SQL de categorias (contrato §4). Toda função recebe `db`; nada aqui conhece
// motivos nem mensagens de UI: a escrita devolve resultado discriminado, traduzido em
// src/lib/categorias/erros.ts. Erros inesperados do banco propagam.
//
// `sessao` entra na assinatura da escrita por contrato, mas ainda não é usada: não há
// auditoria nesta feature.

export type CategoriaDb = { id: number; nome: string; versao: number };

export type NomeRepetido = { tipo: "nome_repetido"; nomeExistente: string };
export type ResultadoInserir = { tipo: "ok"; id: number } | NomeRepetido;
export type ResultadoRenomear =
  | { tipo: "ok" }
  | NomeRepetido
  | { tipo: "ausente" }
  | { tipo: "versao_diferente" };

const VIOLACAO_DE_UNICIDADE = "23505";

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

// A equivalência de nomes é do banco: a mesma função que gera a coluna `chave`.
async function buscarPorChave(db: Db, nome: string): Promise<CategoriaDb | null> {
  const [linha] = await db
    .select(colunas)
    .from(categorias)
    .where(sql`${categorias.chave} = categoria_chave(${nome})`)
    .limit(1);
  return linha ?? null;
}

// O UNIQUE da `chave` é quem decide a duplicidade (FR-005), inclusive sob concorrência;
// aqui só se descobre o nome gravado para a mensagem. Se a outra categoria sumiu entre o
// erro e a leitura, não há o que citar: o erro original propaga.
async function nomeRepetidoOuPropaga(db: Db, nome: string, erro: unknown): Promise<NomeRepetido> {
  if (codigoSqlstate(erro) !== VIOLACAO_DE_UNICIDADE) throw erro;
  const existente = await buscarPorChave(db, nome);
  if (!existente) throw erro;
  return { tipo: "nome_repetido", nomeExistente: existente.nome };
}

/** `nome` chega já normalizado e validado (src/lib/categorias/nome.ts). */
export async function inserir(
  db: Db,
  sessao: AdminSession,
  nome: string,
): Promise<ResultadoInserir> {
  try {
    const [linha] = await db.insert(categorias).values({ nome }).returning({ id: categorias.id });
    return { tipo: "ok", id: linha.id };
  } catch (erro) {
    return nomeRepetidoOuPropaga(db, nome, erro);
  }
}

// Concorrência otimista (FR-019): só grava se a `versao` lida pelo formulário ainda é a
// atual. A `chave` nunca entra no SET; o banco a recalcula a partir do `nome`.
export async function renomear(
  db: Db,
  sessao: AdminSession,
  id: number,
  versao: number,
  nome: string,
): Promise<ResultadoRenomear> {
  try {
    const linhas = await db
      .update(categorias)
      .set({ nome, versao: sql`${categorias.versao} + 1`, atualizadoEm: sql`now()` })
      .where(and(eq(categorias.id, id), eq(categorias.versao, versao)))
      .returning({ id: categorias.id });
    if (linhas.length > 0) return { tipo: "ok" };
  } catch (erro) {
    return nomeRepetidoOuPropaga(db, nome, erro);
  }
  // Nenhuma linha: a categoria sumiu ou outra pessoa já gravou outra versão.
  return (await obterPorId(db, id)) ? { tipo: "versao_diferente" } : { tipo: "ausente" };
}
