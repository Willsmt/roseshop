import { and, eq, sql } from "drizzle-orm";

import type { AdminSession } from "@/lib/auth";

import type { Db } from "./client";
import { codigoSqlstate } from "./erros-pg";
import { produtos } from "./schema";

// Camada SQL de produtos, parte de escrita (contrato §2). Toda função recebe `db`; cada
// escrita é um único statement (ADR-008: sem transação interativa nem lock advisory) e a
// garantia de concorrência está no WHERE/UNIQUE/FK. A leitura depois de 0 linhas só escolhe
// a mensagem. Erros inesperados do banco propagam.

export type ProdutoDb = {
  id: number; // = código de referência (D2)
  categoriaId: number;
  categoriaNome: string;
  nome: string;
  descricao: string | null;
  precoCentavos: number | null;
  aPartirDe: boolean;
  esgotado: boolean;
  destaqueVaga: number | null; // null = fora do destaque (D1)
  versao: number;
  criadoPor: string;
  atualizadoPor: string;
  criadoEm: Date;
  atualizadoEm: Date;
};

export type CamposProduto = {
  nome: string;
  categoriaId: number;
  descricao: string | null;
  precoCentavos: number | null;
  aPartirDe: boolean;
};

// Sem código quando o lookup após 23505 não acha a linha (removida ou renomeada no meio).
export type NomeRepetido = { tipo: "nome_repetido"; codigoExistente?: number };
export type CategoriaAusente = { tipo: "categoria_ausente" };
export type Ausente = { tipo: "ausente" };
export type VersaoDiferente = { tipo: "versao_diferente" };

export type ResultadoInserir = { tipo: "ok"; id: number } | NomeRepetido | CategoriaAusente;
export type ResultadoEditar =
  | { tipo: "ok" }
  | NomeRepetido
  | CategoriaAusente
  | Ausente
  | VersaoDiferente;
export type ResultadoRemover = { tipo: "removido" } | Ausente | VersaoDiferente;

const VIOLACAO_DE_UNICIDADE = "23505";
const VIOLACAO_DE_FK = "23503";

function valores(campos: CamposProduto) {
  return {
    nome: campos.nome,
    categoriaId: campos.categoriaId,
    descricao: campos.descricao,
    precoCentavos: campos.precoCentavos,
    aPartirDe: campos.aPartirDe,
  };
}

// A equivalência de nomes é do banco: a mesma função que gera a coluna `chave`.
async function codigoPorNome(db: Db, nome: string): Promise<number | undefined> {
  const [linha] = await db
    .select({ id: produtos.id })
    .from(produtos)
    .where(sql`${produtos.chave} = categoria_chave(${nome})`)
    .limit(1);
  return linha?.id;
}

// O UNIQUE da `chave` decide a duplicidade, inclusive sob concorrência; aqui só se descobre
// o código para a mensagem. Linha sumida entre o erro e a leitura ⇒ resultado sem código.
async function traduzirErroDeEscrita(
  db: Db,
  nome: string,
  erro: unknown,
): Promise<NomeRepetido | CategoriaAusente> {
  const sqlstate = codigoSqlstate(erro);
  if (sqlstate === VIOLACAO_DE_FK) return { tipo: "categoria_ausente" };
  if (sqlstate !== VIOLACAO_DE_UNICIDADE) throw erro;
  const codigoExistente = await codigoPorNome(db, nome);
  return codigoExistente === undefined
    ? { tipo: "nome_repetido" }
    : { tipo: "nome_repetido", codigoExistente };
}

async function ausenteOuVersaoDiferente(db: Db, id: number): Promise<Ausente | VersaoDiferente> {
  const [linha] = await db
    .select({ id: produtos.id })
    .from(produtos)
    .where(eq(produtos.id, id))
    .limit(1);
  return linha ? { tipo: "versao_diferente" } : { tipo: "ausente" };
}

/** `campos` chega normalizado e validado pelo domínio (src/lib/produtos/validacao.ts). */
export async function inserir(
  db: Db,
  sessao: AdminSession,
  campos: CamposProduto,
): Promise<ResultadoInserir> {
  try {
    const [linha] = await db
      .insert(produtos)
      .values({ ...valores(campos), criadoPor: sessao.email, atualizadoPor: sessao.email })
      .returning({ id: produtos.id });
    return { tipo: "ok", id: linha.id };
  } catch (erro) {
    return traduzirErroDeEscrita(db, campos.nome, erro);
  }
}

// Concorrência otimista: só grava se a `versao` lida pelo formulário ainda é a atual.
// `chave` nunca entra no SET; `destaque_vaga` e `esgotado` também não.
export async function editar(
  db: Db,
  sessao: AdminSession,
  id: number,
  versao: number,
  campos: CamposProduto,
): Promise<ResultadoEditar> {
  try {
    const linhas = await db
      .update(produtos)
      .set({
        ...valores(campos),
        // Defesa do SQL só na edição (o domínio já entrega `aPartirDe = false` sem preço);
        // no cadastro o CHECK `produtos_a_partir_de_com_preco` recusa e o erro propaga.
        aPartirDe: campos.precoCentavos === null ? false : campos.aPartirDe,
        versao: sql`${produtos.versao} + 1`,
        atualizadoPor: sessao.email,
        atualizadoEm: sql`now()`,
      })
      .where(and(eq(produtos.id, id), eq(produtos.versao, versao)))
      .returning({ id: produtos.id });
    if (linhas.length > 0) return { tipo: "ok" };
  } catch (erro) {
    return traduzirErroDeEscrita(db, campos.nome, erro);
  }
  return ausenteOuVersaoDiferente(db, id);
}

// Fotos saem em cascata pela FK; remover não grava autoria. A confirmação é da UI.
export async function remover(
  db: Db,
  sessao: AdminSession,
  id: number,
  versao: number,
): Promise<ResultadoRemover> {
  const linhas = await db
    .delete(produtos)
    .where(and(eq(produtos.id, id), eq(produtos.versao, versao)))
    .returning({ id: produtos.id });
  if (linhas.length > 0) return { tipo: "removido" };
  return ausenteOuVersaoDiferente(db, id);
}
