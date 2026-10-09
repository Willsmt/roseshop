import { and, desc, eq, lt, or, sql, type SQL } from "drizzle-orm";

import type { AdminSession } from "@/lib/auth";

import type { Db } from "./client";
import { codigoSqlstate, nomeConstraint } from "./erros-pg";
import { envioValido, enviosValidos } from "./fotos";
import { LOCK_FOTOS } from "./locks";
import { categorias, produtoFotos, produtos } from "./schema";

// Camada SQL de produtos, parte de escrita (contrato §2). Toda função recebe `db`; cada
// escrita da 003 é um único statement (ADR-008: sem transação interativa) e a garantia de
// concorrência está no WHERE/UNIQUE/FK. Os writers que tocam fotos (`inserirComFotos`,
// `remover` e `substituirConjunto` em fotos.ts) são `db.batch` sob LOCK_FOTOS (feature 004,
// emenda de 2026-10-09 do ADR-008).
// A leitura depois de 0 linhas só escolhe a mensagem. Erros inesperados do banco propagam.

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
export type FotoExpirada = { tipo: "foto_expirada"; envioIds: string[] };

export type ResultadoInserir = { tipo: "ok"; id: number } | NomeRepetido | CategoriaAusente;
export type ResultadoInserirComFotos = ResultadoInserir | FotoExpirada;
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
// `chaves`: objetos das fotos do produto removido, em ordem de posição (D14).
export type ResultadoRemover =
  | { tipo: "removido"; chaves: string[] }
  | Ausente
  | VersaoDiferente;

const VIOLACAO_DE_UNICIDADE = "23505";
const VIOLACAO_DE_FK = "23503";
// Única unicidade que vira `nome_repetido` no cadastro com fotos, por comparação exata do nome
// (ADR-008): `produto_fotos_objeto_unique` ou qualquer outra propaga.
const NOME_UNICO = "produtos_chave_unique";
// Única FK que vira `categoria_ausente` no cadastro com fotos, também por nome exato.
const FK_CATEGORIA = "produtos_categoria_id_categorias_id_fk";

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

// Linha sumida entre o erro (ou o 0 linhas) e a leitura ⇒ resultado sem código.
async function nomeRepetido(db: Db, nome: string): Promise<NomeRepetido> {
  const codigoExistente = await codigoPorNome(db, nome);
  return codigoExistente === undefined
    ? { tipo: "nome_repetido" }
    : { tipo: "nome_repetido", codigoExistente };
}

// O UNIQUE da `chave` decide a duplicidade, inclusive sob concorrência; aqui só se descobre
// o código para a mensagem.
async function traduzirErroDeEscrita(
  db: Db,
  nome: string,
  erro: unknown,
): Promise<NomeRepetido | CategoriaAusente> {
  const sqlstate = codigoSqlstate(erro);
  if (sqlstate === VIOLACAO_DE_FK) return { tipo: "categoria_ausente" };
  if (sqlstate !== VIOLACAO_DE_UNICIDADE) throw erro;
  return nomeRepetido(db, nome);
}

async function ausenteOuVersaoDiferente(db: Db, id: number): Promise<Ausente | VersaoDiferente> {
  const [linha] = await db
    .select({ id: produtos.id })
    .from(produtos)
    .where(eq(produtos.id, id))
    .limit(1);
  return linha ? { tipo: "versao_diferente" } : { tipo: "ausente" };
}

/**
 * Cadastro com fotos (contracts/fotos.md §2.2); substituiu o `inserir` da 003. `campos` chega
 * normalizado e validado pelo domínio (src/lib/produtos/validacao.ts). Batch sob LOCK_FOTOS:
 * o INSERT de `produtos` só ocorre se os N envios são `VALIDO` e grava o token; a adoção é um
 * DELETE … RETURNING de `fotos_envio` (VALIDO repetido, TL-11, e guarda pelo token) que
 * alimenta o INSERT de `produto_fotos` nas posições 1..N, na ordem de `envioIds`. Sem o INSERT
 * de `produtos` nada mais muda; um erro aborta o batch inteiro.
 */
export async function inserirComFotos(
  db: Db,
  sessao: AdminSession,
  campos: CamposProduto,
  envioIdsRecebidos: string[],
): Promise<ResultadoInserirComFotos> {
  // O Postgres devolve o uuid em minúsculas: sem normalizar, um id válido em maiúsculas
  // sairia em `foto_expirada` e duas grafias do mesmo uuid passariam como distintas.
  const envioIds = envioIdsRecebidos.map((id) => id.toLowerCase());
  if (envioIds.length < 1 || envioIds.length > 3 || new Set(envioIds).size !== envioIds.length) {
    throw new Error("inserirComFotos: envioIds deve ter de 1 a 3 ids distintos");
  }
  const tok = crypto.randomUUID();
  const ids = sql`${sql.param(envioIds)}::uuid[]`;
  let inseridos: { id: number }[];
  try {
    const [, produto] = await db.batch([
      db.execute(sql`SELECT pg_advisory_xact_lock(${LOCK_FOTOS}::bigint)`),
      db.execute(sql`
        INSERT INTO produtos (categoria_id, nome, descricao, preco_centavos, a_partir_de,
                              criado_por, atualizado_por, fotos_operacao)
        SELECT ${campos.categoriaId}::integer, ${campos.nome}::text, ${campos.descricao}::text,
               ${campos.precoCentavos}::integer, ${campos.aPartirDe}::boolean,
               ${sessao.email}::text, ${sessao.email}::text, ${tok}::uuid
        WHERE (SELECT count(*) FROM fotos_envio e
               WHERE e.id = ANY(${ids}) AND ${envioValido(sessao)}) = ${envioIds.length}
        RETURNING id`),
      db.execute(sql`
        WITH adotados AS (
          DELETE FROM fotos_envio e
          WHERE e.id = ANY(${ids}) AND ${envioValido(sessao)}
            AND EXISTS (SELECT 1 FROM produtos WHERE fotos_operacao = ${tok}::uuid)
          RETURNING e.id, e.chave, e.enviado_por, e.criado_em)
        INSERT INTO produto_fotos (produto_id, posicao, chave_objeto, enviado_por, enviado_em)
        SELECT (SELECT id FROM produtos WHERE fotos_operacao = ${tok}::uuid), o.ord,
               a.chave, a.enviado_por, a.criado_em
        FROM adotados a JOIN unnest(${ids}) WITH ORDINALITY AS o(id, ord) ON o.id = a.id`),
    ]);
    inseridos = produto.rows as { id: number }[];
  } catch (erro) {
    const sqlstate = codigoSqlstate(erro);
    const constraint = nomeConstraint(erro);
    if (sqlstate === VIOLACAO_DE_FK && constraint === FK_CATEGORIA) {
      return { tipo: "categoria_ausente" };
    }
    if (sqlstate === VIOLACAO_DE_UNICIDADE && constraint === NOME_UNICO) {
      return nomeRepetido(db, campos.nome);
    }
    throw erro;
  }
  if (inseridos.length > 0) return { tipo: "ok", id: inseridos[0].id };
  // 0 linhas: nome primeiro (duplo "Salvar": os envios já foram adotados pelo primeiro e o
  // INSERT nem chega ao UNIQUE), depois os envios que não são VALIDO.
  // Lista vazia é corrida (envio confirmado entre o batch e esta leitura); a action responde
  // `falha_geral` (F§2.2).
  const codigoExistente = await codigoPorNome(db, campos.nome);
  if (codigoExistente !== undefined) return { tipo: "nome_repetido", codigoExistente };
  const validos = await enviosValidos(db, sessao, envioIds);
  return { tipo: "foto_expirada", envioIds: envioIds.filter((id) => !validos.has(id)) };
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

// Fotos saem em cascata pela FK; remover não grava autoria. A confirmação é da UI. Sob
// LOCK_FOTOS, as chaves capturadas na CTE são exatamente as que saíram (contracts/fotos.md
// §2.5): nenhum writer de fotos intercala.
export async function remover(
  db: Db,
  sessao: AdminSession,
  id: number,
  versao: number,
): Promise<ResultadoRemover> {
  const [, r] = await db.batch([
    db.execute(sql`SELECT pg_advisory_xact_lock(${LOCK_FOTOS}::bigint)`),
    db.execute(sql`
      WITH f AS (SELECT chave_objeto, posicao FROM produto_fotos WHERE produto_id = ${id}),
           d AS (DELETE FROM produtos WHERE id = ${id} AND versao = ${versao} RETURNING id)
      SELECT (SELECT id FROM d) AS id, ARRAY(SELECT chave_objeto FROM f ORDER BY posicao) AS chaves`),
  ]);
  const linha = (r.rows as { id: number | null; chaves: string[] }[])[0];
  if (linha.id !== null) return { tipo: "removido", chaves: linha.chaves };
  return ausenteOuVersaoDiferente(db, id);
}

// Status e destaque (contrato §2, D1): statement único, sem lock e sem retry. Premissa: todo
// writer que altera campos, status ou destaque de `produtos` incrementa `versao`. Dela dependem
// `saiuDoDestaque` (CTE `antes`) e a precedência da leitura após 0 linhas; uma escrita futura
// dessas sem `versao+1` quebra as duas. O writer de fotos (`substituirConjunto` em fotos.ts)
// altera só `fotos_versao`, `fotos_operacao`, `atualizado_por` e `atualizado_em`, nunca `versao`
// (emenda de 2026-10-09 do ADR-008): não afeta as duas, que leem só `versao`, `esgotado` e
// `destaque_vaga`. O teto de 8 e "esgotado fora do destaque" são do banco (CHECKs e índice único
// parcial da vaga).
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

// `capa`: chave da posição 1; `null` só em produto legado sem foto (D10).
export type ProdutoListado = ProdutoDb & { capa: string | null };
export type ProdutoDetalhe = ProdutoDb & {
  fotosVersao: number;
  fotos: { posicao: number; chave: string }[];
};

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

// As fotos vêm no mesmo statement (um snapshot só para produto e conjunto).
export async function obterPorId(db: Db, id: number): Promise<ProdutoDetalhe | null> {
  const [linha] = await db
    .select({
      ...colunas,
      fotosVersao: produtos.fotosVersao,
      fotos: sql<ProdutoDetalhe["fotos"]>`coalesce((
        SELECT json_agg(json_build_object('posicao', f.posicao, 'chave', f.chave_objeto)
                        ORDER BY f.posicao)
        FROM produto_fotos f WHERE f.produto_id = ${produtos.id}), '[]'::json)`,
    })
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
): Promise<{ itens: ProdutoListado[]; haMais: boolean }> {
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
    .select({ ...colunas, capa: produtoFotos.chaveObjeto })
    .from(produtos)
    .innerJoin(categorias, eq(categorias.id, produtos.categoriaId))
    .leftJoin(
      produtoFotos,
      and(eq(produtoFotos.produtoId, produtos.id), eq(produtoFotos.posicao, 1)),
    )
    .where(and(...condicoes))
    .orderBy(desc(produtos.id))
    .limit(TAMANHO_PAGINA + 1);
  return { itens: linhas.slice(0, TAMANHO_PAGINA), haMais: linhas.length > TAMANHO_PAGINA };
}
