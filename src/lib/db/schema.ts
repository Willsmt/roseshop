// Schema do banco. As tabelas nascem com as features (specs/NNN-nome/).
import { sql } from "drizzle-orm";
import { check, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

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
