// Schema do banco. As tabelas nascem com as features (specs/NNN-nome/).
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
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
    // Feature 004 (research D5): só o writer de fotos muda estas duas, e nunca `versao`.
    fotosVersao: integer("fotos_versao").notNull().default(1),
    fotosOperacao: uuid("fotos_operacao"),
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

// Feature 003 criou a tabela; a 004 dá os writers (sob LOCK_FOTOS). `enviado_por` e
// `enviado_em` são NOT NULL sem default: a tabela estava vazia quando a 0002 entrou.
export const produtoFotos = pgTable(
  "produto_fotos",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    produtoId: integer("produto_id")
      .notNull()
      .references(() => produtos.id, { onDelete: "cascade" }),
    posicao: smallint("posicao").notNull(),
    chaveObjeto: text("chave_objeto").notNull(),
    enviadoPor: text("enviado_por").notNull(),
    enviadoEm: timestamp("enviado_em", { withTimezone: true }).notNull(),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("produto_fotos_produto_posicao_unique").on(t.produtoId, t.posicao),
    unique("produto_fotos_objeto_unique").on(t.chaveObjeto),
    check("produto_fotos_posicao_faixa", sql`${t.posicao} BETWEEN 1 AND 3`),
    // Mesmo formato da `fotos_envio.chave` (uuid v4 minúsculo). Barra dupla no TS: o SQL
    // recebe '\.'.
    check(
      "produto_fotos_objeto_formato",
      sql`${t.chaveObjeto} ~ '^fotos/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\\.(webp|jpg)$'`,
    ),
  ],
);

// Feature 004 (data-model.md). Envio emitido para a área temporária do R2; some ao ser
// adotado, recusado ou limpo após 24 h. A `chave` usa nomes de coluna crus e o
// `id::text`: com o cast o `||` resolve para `textcat` (IMMUTABLE), exigido em coluna
// gerada. STORED porque coluna virtual (padrão no PG 18) não aceita UNIQUE.
export const fotosEnvio = pgTable(
  "fotos_envio",
  {
    id: uuid("id").primaryKey(),
    formato: text("formato").notNull(),
    chave: text("chave")
      .notNull()
      .generatedAlwaysAs(
        sql`'fotos/' || id::text || CASE formato WHEN 'webp' THEN '.webp' ELSE '.jpg' END`,
      ),
    tamanho: integer("tamanho").notNull(),
    enviadoPor: text("enviado_por").notNull(),
    estado: text("estado").notNull().default("emitido"),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
    confirmadoEm: timestamp("confirmado_em", { withTimezone: true }),
  },
  (t) => [
    unique("fotos_envio_chave_unique").on(t.chave),
    check("fotos_envio_id_v4", sql`uuid_extract_version(${t.id}) = 4`),
    check("fotos_envio_formato", sql`${t.formato} IN ('webp', 'jpeg')`),
    check("fotos_envio_tamanho", sql`${t.tamanho} BETWEEN 1 AND 1048576`),
    check("fotos_envio_estado", sql`${t.estado} IN ('emitido', 'confirmado')`),
    check(
      "fotos_envio_confirmacao",
      sql`(${t.estado} = 'confirmado') = (${t.confirmadoEm} IS NOT NULL)`,
    ),
  ],
);

// Feature 004 (contracts/ia.md §3). `dia` é a data de Brasília, calculada pelo writer
// (sob LOCK_IA_USO); linhas antigas ficam.
export const iaUso = pgTable(
  "ia_uso",
  {
    dia: date("dia").notNull(),
    email: text("email").notNull(),
    n: integer("n").notNull(),
  },
  (t) => [
    primaryKey({ name: "ia_uso_pkey", columns: [t.dia, t.email] }),
    check("ia_uso_n_minimo", sql`${t.n} >= 1`),
  ],
);
