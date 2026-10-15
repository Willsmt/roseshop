// Infra de teste de integração da feature 005 (SQL público do catálogo). Não é teste nem produção.
// SQL direto de propósito: não depende dos writers de `produtos.ts` nem de `catalogo.ts`.
import { sql } from "drizzle-orm";

import type { Db } from "@/lib/db/client";

import { inserirEnvio } from "./fotos-fixtures";
import { resetCategorias } from "./categorias-fixtures";
import { chaveFotoFixture } from "./produtos-fixtures";

const AUTOR = "admin@teste.local";

export type ProdutoCatalogoFixture = {
  categoriaId: number;
  nome: string;
  /** Texto aceito pelo Postgres, com microssegundos (ex.: "2026-03-01 10:00:00.123456+00"). */
  criadoEm: string;
  descricao?: string | null;
  precoCentavos?: number | null;
  aPartirDe?: boolean;
  esgotado?: boolean;
  destaqueVaga?: number | null;
  /** Quantidade de fotos, nas posições 1..n. Padrão 1. */
  fotos?: 0 | 1 | 2 | 3;
};

export async function inserirProdutoCatalogo(
  db: Db,
  p: ProdutoCatalogoFixture,
): Promise<{ id: number; chaves: string[] }> {
  const total = p.fotos ?? 1;
  const r = await db.execute(sql`
    INSERT INTO produtos (categoria_id, nome, descricao, preco_centavos, a_partir_de, esgotado,
                          destaque_vaga, criado_por, atualizado_por, criado_em, atualizado_em)
    VALUES (${p.categoriaId}, ${p.nome}, ${p.descricao ?? null}, ${p.precoCentavos ?? null},
            ${p.aPartirDe ?? false}, ${p.esgotado ?? false}, ${p.destaqueVaga ?? null},
            ${AUTOR}, ${AUTOR}, ${p.criadoEm}::timestamptz, ${p.criadoEm}::timestamptz)
    RETURNING id`);
  const id = (r.rows as { id: number }[])[0].id;
  const chaves: string[] = [];
  for (let posicao = 1; posicao <= total; posicao++) {
    const chave = chaveFotoFixture();
    await db.execute(sql`
      INSERT INTO produto_fotos (produto_id, posicao, chave_objeto, enviado_por, enviado_em)
      VALUES (${id}, ${posicao}, ${chave}, ${AUTOR}, now())`);
    chaves.push(chave);
  }
  return { id, chaves };
}

export type CatalogoFixture = {
  categorias: {
    meias: number;
    guardaChuvas: number;
    vazia: number;
    soEsgotados: number;
    agua: number;
    bolsas: number;
  };
  /** Meias, do mais novo ao mais antigo (ordem esperada da lista). */
  meias: { id: number; nome: string; chaves: string[] }[];
  /** Os dois produtos com o mesmo `criado_em` (µs ≠ 0), do maior id para o menor. */
  empatados: [number, number];
  guardaChuva: { id: number; chaves: string[] };
  esgotado: { id: number };
  semFoto: { id: number };
  /** Produtos de Bolsas (10/jan) e de Água (11/jan). */
  bolsa: { id: number };
  garrafa: { id: number };
  /** Destaques em ordem de vaga ascendente (cadastrados fora de ordem). */
  destaques: { id: number; vaga: number }[];
  envioPendente: { chave: string };
  envioNaoAdotado: { chave: string };
};

/** Recria categorias e monta o cenário do catálogo. Limpe com `limparCatalogo` no `afterAll`. */
export async function montarCatalogo(db: Db): Promise<CatalogoFixture> {
  await resetCategorias(db);
  await db.execute(sql.raw("DELETE FROM produtos"));
  await db.execute(sql.raw("DELETE FROM categorias"));
  const cat = async (nome: string) =>
    (
      (
        await db.execute(sql`INSERT INTO categorias (nome) VALUES (${nome}) RETURNING id`)
      ).rows as { id: number }[]
    )[0].id;
  const meias = await cat("Meias");
  const guardaChuvas = await cat("Guarda-chuvas");
  const vazia = await cat("Vazia");
  const soEsgotados = await cat("Só esgotados");
  // Cadastradas com Bolsas antes de Água: a ordem esperada não é a do id nem a do nome com acento.
  const bolsas = await cat("Bolsas");
  const agua = await cat("Água");

  // Cadastro em ordem de id crescente: os dois primeiros empatam em `criado_em`, os destaques
  // entram com vagas 3, 1, 2 (fora da ordem de cadastro).
  const a = await inserirProdutoCatalogo(db, {
    categoriaId: meias, nome: "Meia empatada A", criadoEm: "2026-03-01 10:00:00.123456+00",
    precoCentavos: 1290, fotos: 3,
  });
  const b = await inserirProdutoCatalogo(db, {
    categoriaId: meias, nome: "Meia empatada B", criadoEm: "2026-03-01 10:00:00.123456+00",
    precoCentavos: 1590, aPartirDe: true, fotos: 1, destaqueVaga: 3,
  });
  const c = await inserirProdutoCatalogo(db, {
    categoriaId: meias, nome: "Meia antiga C", criadoEm: "2026-02-01 09:00:00.000001+00",
    fotos: 2, destaqueVaga: 1,
  });
  const d = await inserirProdutoCatalogo(db, {
    categoriaId: meias, nome: "Meia nova D", criadoEm: "2026-04-01 08:00:00.999999+00", fotos: 0,
    destaqueVaga: 2,
  });
  const e = await inserirProdutoCatalogo(db, {
    categoriaId: meias, nome: "Meia muito antiga E", criadoEm: "2026-01-01 08:00:00.5+00",
    fotos: 0,
  });
  const g = await inserirProdutoCatalogo(db, {
    categoriaId: guardaChuvas, nome: "Guarda-chuva F", criadoEm: "2026-03-15 12:00:00.000500+00",
    descricao: "Dobrável",
  });
  const esg = await inserirProdutoCatalogo(db, {
    categoriaId: soEsgotados, nome: "Produto esgotado G", criadoEm: "2026-02-15 12:00:00.000100+00",
    esgotado: true,
  });

  const h = await inserirProdutoCatalogo(db, {
    categoriaId: bolsas, nome: "Bolsa H", criadoEm: "2026-01-10 08:00:00+00",
  });
  const i = await inserirProdutoCatalogo(db, {
    categoriaId: agua, nome: "Garrafa I", criadoEm: "2026-01-11 08:00:00+00",
  });

  const AUTORIA = AUTOR;
  const pendente = await inserirEnvio(db, { enviadoPor: AUTORIA, estado: "emitido" });
  const naoAdotado = await inserirEnvio(db, { enviadoPor: AUTORIA, estado: "confirmado" });

  const [maior, menor] = a.id > b.id ? [a.id, b.id] : [b.id, a.id];
  return {
    categorias: { meias, guardaChuvas, vazia, soEsgotados, agua, bolsas },
    // Por `criado_em DESC, id DESC`: D (abr), empatados (mar; maior id primeiro), C (fev), E (jan).
    meias: [
      { id: d.id, nome: "Meia nova D", chaves: d.chaves },
      { id: maior, nome: maior === a.id ? "Meia empatada A" : "Meia empatada B", chaves: maior === a.id ? a.chaves : b.chaves },
      { id: menor, nome: menor === a.id ? "Meia empatada A" : "Meia empatada B", chaves: menor === a.id ? a.chaves : b.chaves },
      { id: c.id, nome: "Meia antiga C", chaves: c.chaves },
      { id: e.id, nome: "Meia muito antiga E", chaves: e.chaves },
    ],
    empatados: [maior, menor],
    guardaChuva: { id: g.id, chaves: g.chaves },
    esgotado: { id: esg.id },
    semFoto: { id: e.id },
    bolsa: { id: h.id },
    garrafa: { id: i.id },
    destaques: [
      { id: c.id, vaga: 1 },
      { id: d.id, vaga: 2 },
      { id: b.id, vaga: 3 },
    ],
    envioPendente: { chave: pendente.chave },
    envioNaoAdotado: { chave: naoAdotado.chave },
  };
}

/** Remove produtos, fotos e envios criados pelo cenário; deixa as categorias do seed. */
export async function limparCatalogo(db: Db): Promise<void> {
  await db.execute(sql.raw("DELETE FROM produtos"));
  await db.execute(sql.raw("DELETE FROM fotos_envio"));
  await resetCategorias(db);
}
