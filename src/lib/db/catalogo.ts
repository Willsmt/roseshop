import { sql } from "drizzle-orm";

import type { Db } from "./client";

// SQL público do catálogo (feature 005, data-model.md §2). Só lê `categorias`, `produtos` e
// `produto_fotos`; nunca `fotos_envio`. Os tipos de saída não têm campo interno (DM§1):
// `versao`, `fotos_versao`, `fotos_operacao`, `destaque_vaga`, `criado_por`, `atualizado_por`,
// `atualizado_em`, `enviado_por` e `enviado_em` nem são selecionados. Um statement por função,
// sem `db.transaction()` (ADR-008). O µs do cursor trafega como texto (cast `::bigint` no SQL)
// e nunca passa por `Date` nem `number`.

/** Tamanho do bloco da lista; a consulta pede um a mais só para calcular `haMais`. */
export const TAMANHO_BLOCO = 24;

export type CartaoDb = {
  id: number;
  nome: string;
  precoCentavos: number | null;
  aPartirDe: boolean;
  esgotado: boolean;
  /** `produto_fotos.chave_objeto` da posição 1, ou `null` (produto legado sem foto). */
  capaChave: string | null;
};

export type CursorDb = { us: string; id: number };

export type CategoriaFiltroDb = { id: number; nome: string; slug: string };

export type ProdutoPublicoDb = Omit<CartaoDb, "capaChave"> & {
  categoria: string;
  descricao: string | null;
  /** Chaves das fotos, por `posicao` (capa primeiro). */
  fotos: string[];
};

type LinhaCartao = {
  id: number;
  nome: string;
  preco_centavos: number | null;
  a_partir_de: boolean;
  esgotado: boolean;
  capa_chave: string | null;
  us?: string;
};

function cartao(l: LinhaCartao): CartaoDb {
  return {
    id: l.id,
    nome: l.nome,
    precoCentavos: l.preco_centavos,
    aPartirDe: l.a_partir_de,
    esgotado: l.esgotado,
    capaChave: l.capa_chave,
  };
}

const CAPA = sql`(SELECT f.chave_objeto FROM produto_fotos f
                  WHERE f.produto_id = p.id AND f.posicao = 1)`;

export async function listarDestaques(db: Db): Promise<CartaoDb[]> {
  const r = await db.execute(sql`
    SELECT p.id, p.nome, p.preco_centavos, p.a_partir_de, p.esgotado, ${CAPA} AS capa_chave
    FROM produtos p
    WHERE p.destaque_vaga IS NOT NULL
    ORDER BY p.destaque_vaga ASC`);
  return (r.rows as LinhaCartao[]).map(cartao);
}

export async function listarBloco(
  db: Db,
  filtro: { categoriaId?: number; depois?: CursorDb },
): Promise<{ itens: CartaoDb[]; haMais: boolean; proximo: CursorDb | null }> {
  const porCategoria =
    filtro.categoriaId === undefined ? sql`` : sql`AND p.categoria_id = ${filtro.categoriaId}::integer`;
  const aposCursor = filtro.depois
    ? sql`AND (p.criado_em, p.id) < ('epoch'::timestamptz
            + ${filtro.depois.us}::bigint * interval '1 microsecond', ${filtro.depois.id}::integer)`
    : sql``;
  const r = await db.execute(sql`
    SELECT p.id, p.nome, p.preco_centavos, p.a_partir_de, p.esgotado, ${CAPA} AS capa_chave,
           floor(extract(epoch from p.criado_em) * 1e6)::bigint::text AS us
    FROM produtos p
    WHERE true ${porCategoria} ${aposCursor}
    ORDER BY p.criado_em DESC, p.id DESC
    LIMIT ${TAMANHO_BLOCO + 1}`);
  const linhas = r.rows as LinhaCartao[];
  const haMais = linhas.length > TAMANHO_BLOCO;
  const pagina = haMais ? linhas.slice(0, TAMANHO_BLOCO) : linhas;
  const ultima = pagina[pagina.length - 1];
  return {
    itens: pagina.map(cartao),
    haMais,
    proximo: haMais && ultima?.us ? { us: ultima.us, id: ultima.id } : null,
  };
}

// Ordem igual à do painel (`categorias.ts`): pela `chave` normalizada, collation "C".
// O `id` da categoria fica só no servidor, para filtrar `listarBloco`; nunca sai na resposta.
export async function categoriasComProdutos(db: Db): Promise<CategoriaFiltroDb[]> {
  const r = await db.execute(sql`
    SELECT c.id, c.nome, replace(c.chave, ' ', '-') AS slug
    FROM categorias c
    WHERE EXISTS (SELECT 1 FROM produtos p WHERE p.categoria_id = c.id)
    ORDER BY c.chave COLLATE "C", c.id`);
  return r.rows as CategoriaFiltroDb[];
}

export async function obterPublico(db: Db, id: number): Promise<ProdutoPublicoDb | null> {
  const r = await db.execute(sql`
    SELECT p.id, p.nome, p.descricao, p.preco_centavos, p.a_partir_de, p.esgotado,
           c.nome AS categoria,
           coalesce((SELECT json_agg(f.chave_objeto ORDER BY f.posicao)
                     FROM produto_fotos f WHERE f.produto_id = p.id), '[]'::json) AS fotos
    FROM produtos p
    INNER JOIN categorias c ON c.id = p.categoria_id
    WHERE p.id = ${id}::integer
    LIMIT 1`);
  const l = (r.rows as (LinhaCartao & { descricao: string | null; categoria: string; fotos: string[] })[])[0];
  if (!l) return null;
  return {
    id: l.id,
    nome: l.nome,
    precoCentavos: l.preco_centavos,
    aPartirDe: l.a_partir_de,
    esgotado: l.esgotado,
    categoria: l.categoria,
    descricao: l.descricao,
    fotos: l.fotos,
  };
}

// Conferência da sacola (feature 006, contracts/conferencia.md §5, research D8): uma consulta com
// `IN` pela PK, sem `ORDER BY` (a ordem vem do pedido). Id ausente fica fora do resultado.
export type ConferenciaDb = CartaoDb;

export async function conferirProdutos(db: Db, ids: number[]): Promise<ConferenciaDb[]> {
  if (ids.length === 0) return [];
  const lista = sql.join(
    ids.map((id) => sql`${id}::integer`),
    sql`, `,
  );
  const r = await db.execute(sql`
    SELECT p.id, p.nome, p.preco_centavos, p.a_partir_de, p.esgotado, ${CAPA} AS capa_chave
    FROM produtos p
    WHERE p.id IN (${lista})`);
  return (r.rows as LinhaCartao[]).map(cartao);
}

// Só `produto_fotos`: envio pendente ou confirmado e ainda não adotado não é público (US6).
export async function fotoPublica(db: Db, chave: string): Promise<boolean> {
  const r = await db.execute(sql`
    SELECT EXISTS (SELECT 1 FROM produto_fotos WHERE chave_objeto = ${chave}::text) AS publica`);
  return (r.rows as { publica: boolean }[])[0].publica;
}
