import { and, desc, eq, lt, or, sql, type SQL } from "drizzle-orm";

import type { AdminSession } from "@/lib/auth";

import type { Db } from "./client";
import { codigoSqlstate, nomeConstraint } from "./erros-pg";
import { categorias, produtos } from "./schema";

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
export type ResultadoEsgotar =
  | { tipo: "ok"; saiuDoDestaque: boolean }
  | Ausente
  | VersaoDiferente;
export type ResultadoStatus = { tipo: "ok" } | Ausente | VersaoDiferente;
export type ResultadoDestacar =
  | { tipo: "ok" }
  | Ausente
  | VersaoDiferente
  | { tipo: "esgotado" }
  | { tipo: "ja_em_destaque" }
  | { tipo: "limite" }
  | { tipo: "vaga_disputada" };
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

// Status e destaque (contrato §2, D1): statement único, sem lock e sem retry. Premissa: todo
// writer de `produtos` incrementa `versao`. Dela dependem `saiuDoDestaque` (CTE `antes`) e a
// precedência da leitura após 0 linhas; uma escrita futura sem `versao+1` quebra as duas. O teto de 8 e
// "esgotado fora do destaque" são do banco (CHECKs e índice único parcial da vaga).
const VAGA_UNICA = "produtos_destaque_vaga_unique";

// A CTE `antes` e o UPDATE enxergam o mesmo snapshot e filtram pelo mesmo `versao`: se outra
// escrita ganhou, o UPDATE reavalia o WHERE, não casa e `antes` também veio sem linha (0 linhas).
export async function esgotar(
  db: Db,
  sessao: AdminSession,
  id: number,
  versao: number,
): Promise<ResultadoEsgotar> {
  const r = await db.execute(sql`
    WITH antes AS (
      SELECT destaque_vaga IS NOT NULL AS estava
      FROM produtos WHERE id = ${id} AND versao = ${versao}
    )
    UPDATE produtos
    SET esgotado = true, destaque_vaga = NULL, versao = versao + 1,
        atualizado_por = ${sessao.email}, atualizado_em = now()
    WHERE id = ${id} AND versao = ${versao}
    RETURNING (SELECT estava FROM antes) AS estava`);
  const linha = (r.rows as { estava: boolean | null }[])[0];
  if (linha) return { tipo: "ok", saiuDoDestaque: linha.estava === true };
  return ausenteOuVersaoDiferente(db, id);
}

async function atualizarStatus(
  db: Db,
  sessao: AdminSession,
  id: number,
  versao: number,
  set: { esgotado: boolean } | { destaqueVaga: null },
): Promise<ResultadoStatus> {
  const linhas = await db
    .update(produtos)
    .set({
      ...set,
      versao: sql`${produtos.versao} + 1`,
      atualizadoPor: sessao.email,
      atualizadoEm: sql`now()`,
    })
    .where(and(eq(produtos.id, id), eq(produtos.versao, versao)))
    .returning({ id: produtos.id });
  if (linhas.length > 0) return { tipo: "ok" };
  return ausenteOuVersaoDiferente(db, id);
}

// Não toca `destaque_vaga`: voltar a ficar disponível não recoloca no destaque (FR-017).
export function disponibilizar(
  db: Db,
  sessao: AdminSession,
  id: number,
  versao: number,
): Promise<ResultadoStatus> {
  return atualizarStatus(db, sessao, id, versao, { esgotado: false });
}

export function tirarDoDestaque(
  db: Db,
  sessao: AdminSession,
  id: number,
  versao: number,
): Promise<ResultadoStatus> {
  return atualizarStatus(db, sessao, id, versao, { destaqueVaga: null });
}

// Depois de 0 linhas a leitura só escolhe a mensagem, nesta precedência (contrato §2).
async function motivoDoDestaqueRecusado(
  db: Db,
  id: number,
  versao: number,
): Promise<Exclude<ResultadoDestacar, { tipo: "ok" } | { tipo: "vaga_disputada" }>> {
  const [linha] = await db
    .select({
      versao: produtos.versao,
      esgotado: produtos.esgotado,
      destaqueVaga: produtos.destaqueVaga,
    })
    .from(produtos)
    .where(eq(produtos.id, id))
    .limit(1);
  if (!linha) return { tipo: "ausente" };
  if (linha.versao !== versao) return { tipo: "versao_diferente" };
  if (linha.esgotado) return { tipo: "esgotado" };
  if (linha.destaqueVaga !== null) return { tipo: "ja_em_destaque" };
  return { tipo: "limite" };
}

// Menor vaga livre de 1..8 escolhida no próprio UPDATE. Duas pessoas na mesma vaga: o índice
// único faz a segunda esperar o commit da primeira e falhar com 23505 ⇒ `vaga_disputada`.
// O `SET` só grava `destaque_vaga` entre as colunas únicas, mas o 23505 é conferido pela
// constraint (ADR-008): qualquer outra unicidade é erro inesperado e propaga.
export async function destacar(
  db: Db,
  sessao: AdminSession,
  id: number,
  versao: number,
): Promise<ResultadoDestacar> {
  try {
    const r = await db.execute(sql`
      UPDATE produtos
      SET destaque_vaga = livre.vaga, versao = produtos.versao + 1,
          atualizado_por = ${sessao.email}, atualizado_em = now()
      FROM (
        SELECT min(v) AS vaga FROM generate_series(1, 8) AS v
        WHERE NOT EXISTS (SELECT 1 FROM produtos o WHERE o.destaque_vaga = v)
      ) AS livre
      WHERE produtos.id = ${id} AND produtos.versao = ${versao}
        AND NOT produtos.esgotado AND produtos.destaque_vaga IS NULL
        AND livre.vaga IS NOT NULL
      RETURNING produtos.id`);
    if (r.rows.length > 0) return { tipo: "ok" };
  } catch (erro) {
    if (codigoSqlstate(erro) === VIOLACAO_DE_UNICIDADE && nomeConstraint(erro) === VAGA_UNICA) {
      return { tipo: "vaga_disputada" };
    }
    throw erro;
  }
  return motivoDoDestaqueRecusado(db, id, versao);
}

// Leitura (contrato §2). Sem lock nem transação; `JOIN` só para o nome da categoria.
export type FiltroDb = {
  categoriaId?: number;
  esgotado?: boolean;
  // `texto` é comparado por strpos(chave, categoria_chave(texto)) > 0 (mesma função da coluna
  // `chave`, então acento, caixa e hífen se comportam como na unicidade); `codigo` entra em OR.
  busca?: { texto: string; codigo: number | null };
  antes?: number; // cursor keyset: id < antes
};

export const TAMANHO_PAGINA = 20;

const colunas = {
  id: produtos.id,
  categoriaId: produtos.categoriaId,
  categoriaNome: categorias.nome,
  nome: produtos.nome,
  descricao: produtos.descricao,
  precoCentavos: produtos.precoCentavos,
  aPartirDe: produtos.aPartirDe,
  esgotado: produtos.esgotado,
  destaqueVaga: produtos.destaqueVaga,
  versao: produtos.versao,
  criadoPor: produtos.criadoPor,
  atualizadoPor: produtos.atualizadoPor,
  criadoEm: produtos.criadoEm,
  atualizadoEm: produtos.atualizadoEm,
};

export async function obterPorId(db: Db, id: number): Promise<ProdutoDb | null> {
  const [linha] = await db
    .select(colunas)
    .from(produtos)
    .innerJoin(categorias, eq(categorias.id, produtos.categoriaId))
    .where(eq(produtos.id, id))
    .limit(1);
  return linha ?? null;
}

// Keyset por `id DESC` (D3): `id < antes` não repete nem pula item quando há cadastro ou
// remoção entre páginas. `LIMIT 21` só serve para calcular `haMais`.
export async function listar(
  db: Db,
  filtro: FiltroDb,
): Promise<{ itens: ProdutoDb[]; haMais: boolean }> {
  const condicoes: (SQL | undefined)[] = [
    filtro.categoriaId === undefined ? undefined : eq(produtos.categoriaId, filtro.categoriaId),
    filtro.esgotado === undefined ? undefined : eq(produtos.esgotado, filtro.esgotado),
    filtro.antes === undefined ? undefined : lt(produtos.id, filtro.antes),
  ];
  if (filtro.busca) {
    const { texto, codigo } = filtro.busca;
    condicoes.push(
      or(
        sql`strpos(${produtos.chave}, categoria_chave(${texto})) > 0`,
        codigo === null ? undefined : eq(produtos.id, codigo),
      ),
    );
  }
  const linhas = await db
    .select(colunas)
    .from(produtos)
    .innerJoin(categorias, eq(categorias.id, produtos.categoriaId))
    .where(and(...condicoes))
    .orderBy(desc(produtos.id))
    .limit(TAMANHO_PAGINA + 1);
  return { itens: linhas.slice(0, TAMANHO_PAGINA), haMais: linhas.length > TAMANHO_PAGINA };
}
