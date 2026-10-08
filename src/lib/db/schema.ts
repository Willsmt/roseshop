// Schema do banco. As tabelas nascem com as features (specs/NNN-nome/).
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// Feature 002 (data-model.md, ADR-008). A função `categoria_chave(text)` vive só na
// migration 0000 (o drizzle-kit não modela funções); declarar a coluna gerada aqui
// impede que gerações futuras proponham removê-la.
export const categorias = pgTable(
  "categorias",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    nome: text("nome").notNull(),
    chave: text("chave")
      .notNull()
      .unique()
      .generatedAlwaysAs(sql`categoria_chave(nome)`),
    versao: integer("versao").notNull().default(1),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("categorias_nome_tamanho", sql`char_length(${t.nome}) BETWEEN 2 AND 40`),
    check("categorias_nome_sem_pontas", sql`${t.nome} = btrim(${t.nome})`),
    // Barra dupla no TS: o SQL recebe '\s{2,}'.
    check("categorias_nome_sem_espacos_duplos", sql`${t.nome} !~ '\\s{2,}'`),
  ],
);

// Feature 003 (data-model.md, ADR-008). `produtos.id` é também o código de referência.
// `chave` reaproveita `categoria_chave` (migration 0000). O `restrict` da FK é explícito:
// o default do Drizzle é `no action` (23503) e só `23001` vira `tem_produtos` na 002.
export const produtos = pgTable(
  "produtos",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    categoriaId: integer("categoria_id")
      .notNull()
      .references(() => categorias.id, { onDelete: "restrict" }),
    nome: text("nome").notNull(),
    chave: text("chave")
      .notNull()
      .generatedAlwaysAs(sql`categoria_chave(nome)`),
    descricao: text("descricao"),
    precoCentavos: integer("preco_centavos"),
    aPartirDe: boolean("a_partir_de").notNull().default(false),
    esgotado: boolean("esgotado").notNull().default(false),
    destaqueVaga: smallint("destaque_vaga"),
    versao: integer("versao").notNull().default(1),
    criadoPor: text("criado_por").notNull(),
    atualizadoPor: text("atualizado_por").notNull(),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("produtos_chave_unique").on(t.chave),
    index("produtos_categoria_id_idx").on(t.categoriaId),
    uniqueIndex("produtos_destaque_vaga_unique")
      .on(t.destaqueVaga)
      .where(sql`${t.destaqueVaga} IS NOT NULL`),
    check("produtos_nome_tamanho", sql`char_length(${t.nome}) BETWEEN 3 AND 80`),
    check("produtos_nome_sem_pontas", sql`${t.nome} = btrim(${t.nome})`),
    check("produtos_nome_sem_espacos_duplos", sql`${t.nome} !~ '\\s{2,}'`),
    check(
      "produtos_descricao_tamanho",
      sql`${t.descricao} IS NULL OR char_length(${t.descricao}) <= 1000`,
    ),
    check(
      "produtos_preco_faixa",
      sql`${t.precoCentavos} IS NULL OR ${t.precoCentavos} BETWEEN 1 AND 9999999`,
    ),
    check(
      "produtos_a_partir_de_com_preco",
      sql`NOT ${t.aPartirDe} OR ${t.precoCentavos} IS NOT NULL`,
    ),
    check("produtos_destaque_vaga_faixa", sql`${t.destaqueVaga} BETWEEN 1 AND 8`),
    check(
      "produtos_destaque_disponivel",
      sql`NOT (${t.esgotado} AND ${t.destaqueVaga} IS NOT NULL)`,
    ),
  ],
);

// Só modelo nesta feature: nenhum código grava aqui antes da 004 (fotos/R2).
export const produtoFotos = pgTable(
  "produto_fotos",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    produtoId: integer("produto_id")
      .notNull()
      .references(() => produtos.id, { onDelete: "cascade" }),
    posicao: smallint("posicao").notNull(),
    chaveObjeto: text("chave_objeto").notNull(),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("produto_fotos_produto_posicao_unique").on(t.produtoId, t.posicao),
    check("produto_fotos_posicao_faixa", sql`${t.posicao} BETWEEN 1 AND 3`),
  ],
);
