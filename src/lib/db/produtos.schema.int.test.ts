import { sql, type SQL } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createDb } from "@/lib/db/client";
import { codigoSqlstate } from "@/lib/db/erros-pg";
import { resetCategorias } from "@/test/db/categorias-fixtures";
import { limparProdutos } from "@/test/db/produtos-fixtures";

// Feature 003, T001 (SF1): tabelas produtos e produto_fotos (SQL cru de propósito: prova o
// banco, não o schema Drizzle). Uma prova por linha de "Invariantes" do data-model.md.
// No neon-http cada statement é uma sessão e o erro vem embrulhado (error.cause.code);
// codigoSqlstate lê as duas formas.
const db = createDb({
  DATABASE_URL: process.env.DATABASE_URL ?? "",
  NEON_FETCH_ENDPOINT: process.env.NEON_FETCH_ENDPOINT,
});

async function falha(consulta: Promise<unknown>): Promise<unknown> {
  try {
    await consulta;
  } catch (error) {
    return error;
  }
  throw new Error("a consulta deveria ter falhado, mas teve sucesso");
}

async function sqlstate(consulta: Promise<unknown>): Promise<string | undefined> {
  return codigoSqlstate(await falha(consulta));
}

let categoriaId = 0;

type Campos = {
  nome?: string;
  categoria?: number;
  descricao?: string | null;
  preco?: number | null;
  aPartirDe?: boolean;
  esgotado?: boolean;
  vaga?: number | null;
};

function inserir(c: Campos = {}): Promise<{ rows: Record<string, unknown>[] }> {
  const q: SQL = sql`
    INSERT INTO produtos
      (categoria_id, nome, descricao, preco_centavos, a_partir_de, esgotado, destaque_vaga, criado_por, atualizado_por)
    VALUES (
      ${c.categoria ?? categoriaId},
      ${c.nome ?? "Zt Produto"},
      ${c.descricao ?? null},
      ${c.preco === undefined ? 1000 : c.preco},
      ${c.aPartirDe ?? false},
      ${c.esgotado ?? false},
      ${c.vaga ?? null},
      'zt@example.com',
      'zt@example.com'
    ) RETURNING id, chave, versao, a_partir_de, esgotado, destaque_vaga, criado_em, atualizado_em`;
  return db.execute(q) as Promise<{ rows: Record<string, unknown>[] }>;
}

beforeAll(async () => {
  await resetCategorias(db);
  const r = await db.execute(sql`SELECT id FROM categorias ORDER BY id LIMIT 1`);
  categoriaId = (r.rows[0] as { id: number }).id;
});

beforeEach(() => limparProdutos(db));

afterAll(async () => {
  await resetCategorias(db);
});

describe("tabela produtos: defaults e coluna gerada", () => {
  it("versao=1, a_partir_de/esgotado=false, vaga NULL e timestamps preenchidos por default", async () => {
    const r = await inserir({ nome: "Zt Defaults" });
    const l = r.rows[0];
    expect(l.versao).toBe(1);
    expect(l.a_partir_de).toBe(false);
    expect(l.esgotado).toBe(false);
    expect(l.destaque_vaga).toBeNull();
    expect(l.criado_em).toBeTruthy();
    expect(l.atualizado_em).toBeTruthy();
  });

  it("chave é gerada por categoria_chave(nome); INSERT informando chave falha", async () => {
    const r = await inserir({ nome: "Zt GUÁRDA-Gerada" });
    expect(r.rows[0].chave).toBe("zt guarda gerada");
    const erro = await falha(
      db.execute(sql`INSERT INTO produtos (categoria_id, nome, chave, criado_por, atualizado_por)
        VALUES (${categoriaId}, 'Zt Manual', 'x', 'a@b.c', 'a@b.c')`),
    );
    // generated_always: não se grava coluna gerada.
    expect(codigoSqlstate(erro)).toBe("428C9");
  });
});

describe("invariantes de produtos", () => {
  it("código único, imutável: UPDATE de id é recusado (identity ALWAYS)", async () => {
    const r = await inserir({ nome: "Zt Imutavel" });
    const id = r.rows[0].id as number;
    const erro = await falha(db.execute(sql`UPDATE produtos SET id = ${id + 100000} WHERE id = ${id}`));
    // generated_always: a identity só aceita DEFAULT no UPDATE.
    expect(codigoSqlstate(erro)).toBe("428C9");
  });

  it("código não é reaproveitado: depois de apagar A, o próximo produto tem id maior", async () => {
    const a = (await inserir({ nome: "Zt Codigo A" })).rows[0].id as number;
    await db.execute(sql`DELETE FROM produtos WHERE id = ${a}`);
    const b = (await inserir({ nome: "Zt Codigo B" })).rows[0].id as number;
    expect(b).toBeGreaterThan(a);
  });

  it("nome único por equivalência: UNIQUE(chave) => 23505", async () => {
    await inserir({ nome: "Zt Panos de prato" });
    expect(await sqlstate(inserir({ nome: "zt PANOS-de prato" }))).toBe("23505");
  });

  it("categoria inexistente => FK 23503", async () => {
    expect(await sqlstate(inserir({ nome: "Zt Sem Categoria", categoria: 999999999 }))).toBe("23503");
  });

  it("DELETE de categoria com produto => 23001 (ON DELETE RESTRICT)", async () => {
    await inserir({ nome: "Zt Com Categoria" });
    expect(await sqlstate(db.execute(sql`DELETE FROM categorias WHERE id = ${categoriaId}`))).toBe("23001");
  });

  it("CHECK nome 3..80: 2 e 81 falham; 3 e 80 passam", async () => {
    expect(await sqlstate(inserir({ nome: "Zt" }))).toBe("23514");
    expect(await sqlstate(inserir({ nome: "Zt" + "a".repeat(79) }))).toBe("23514");
    await inserir({ nome: "Ztb" });
    await inserir({ nome: "Zt" + "c".repeat(78) });
  });

  it("CHECK nome sem espaço nas pontas => 23514", async () => {
    expect(await sqlstate(inserir({ nome: " Zt Ponta" }))).toBe("23514");
    expect(await sqlstate(inserir({ nome: "Zt Ponta " }))).toBe("23514");
  });

  it("CHECK nome sem espaços duplos => 23514", async () => {
    expect(await sqlstate(inserir({ nome: "Zt  Dupla" }))).toBe("23514");
  });

  it("CHECK descricao <= 1000: 1001 falha; NULL e 1000 passam", async () => {
    expect(await sqlstate(inserir({ nome: "Zt Desc Longa", descricao: "d".repeat(1001) }))).toBe("23514");
    await inserir({ nome: "Zt Desc Limite", descricao: "d".repeat(1000) });
    await inserir({ nome: "Zt Desc Nula", descricao: null });
  });

  it("CHECK preço 1..9999999: 0 e 10000000 falham; 1, 9999999 e NULL passam", async () => {
    expect(await sqlstate(inserir({ nome: "Zt Preco Zero", preco: 0 }))).toBe("23514");
    expect(await sqlstate(inserir({ nome: "Zt Preco Alto", preco: 10000000 }))).toBe("23514");
    await inserir({ nome: "Zt Preco Min", preco: 1 });
    await inserir({ nome: "Zt Preco Max", preco: 9999999 });
    await inserir({ nome: "Zt Sem Preco", preco: null });
  });

  it("CHECK a_partir_de só com preço: sem preço => 23514; com preço passa", async () => {
    expect(await sqlstate(inserir({ nome: "Zt Apartir Sem", preco: null, aPartirDe: true }))).toBe("23514");
    await inserir({ nome: "Zt Apartir Com", preco: 500, aPartirDe: true });
  });

  it("CHECK destaque_vaga 1..8: 0 e 9 falham; 1 e 8 passam", async () => {
    expect(await sqlstate(inserir({ nome: "Zt Vaga Zero", vaga: 0 }))).toBe("23514");
    expect(await sqlstate(inserir({ nome: "Zt Vaga Nove", vaga: 9 }))).toBe("23514");
    await inserir({ nome: "Zt Vaga Um", vaga: 1 });
    await inserir({ nome: "Zt Vaga Oito", vaga: 8 });
  });

  it("vaga repetida => índice único parcial 23505; várias NULL coexistem", async () => {
    await inserir({ nome: "Zt Vaga A", vaga: 3 });
    expect(await sqlstate(inserir({ nome: "Zt Vaga B", vaga: 3 }))).toBe("23505");
    await inserir({ nome: "Zt Nula A" });
    await inserir({ nome: "Zt Nula B" });
  });

  it("esgotado nunca em destaque: esgotado com vaga => 23514 (INSERT e UPDATE)", async () => {
    expect(await sqlstate(inserir({ nome: "Zt Esg Vaga", esgotado: true, vaga: 2 }))).toBe("23514");
    const r = await inserir({ nome: "Zt Esg Update", vaga: 4 });
    const id = r.rows[0].id as number;
    expect(await sqlstate(db.execute(sql`UPDATE produtos SET esgotado = true WHERE id = ${id}`))).toBe("23514");
    await db.execute(sql`UPDATE produtos SET esgotado = true, destaque_vaga = NULL WHERE id = ${id}`);
  });
});

describe("tabela produto_fotos", () => {
  async function foto(produtoId: number, posicao: number) {
    return db.execute(
      sql`INSERT INTO produto_fotos (produto_id, posicao, chave_objeto) VALUES (${produtoId}, ${posicao}, ${`zt/${produtoId}/${posicao}`})`,
    );
  }

  it("posições 1..3 passam; posição 4 (e 0) => 23514", async () => {
    const id = (await inserir({ nome: "Zt Fotos" })).rows[0].id as number;
    await foto(id, 1);
    await foto(id, 2);
    await foto(id, 3);
    expect(await sqlstate(foto(id, 4))).toBe("23514");
    expect(await sqlstate(foto(id, 0))).toBe("23514");
  });

  it("posição repetida no mesmo produto => 23505; em outro produto passa", async () => {
    const a = (await inserir({ nome: "Zt Foto A" })).rows[0].id as number;
    const b = (await inserir({ nome: "Zt Foto B" })).rows[0].id as number;
    await foto(a, 1);
    expect(await sqlstate(foto(a, 1))).toBe("23505");
    await foto(b, 1);
  });

  it("produto inexistente => FK 23503", async () => {
    expect(await sqlstate(foto(999999999, 1))).toBe("23503");
  });

  it("remover o produto apaga as fotos (ON DELETE CASCADE)", async () => {
    const id = (await inserir({ nome: "Zt Cascade" })).rows[0].id as number;
    await foto(id, 1);
    await foto(id, 2);
    await db.execute(sql`DELETE FROM produtos WHERE id = ${id}`);
    const r = await db.execute(sql`SELECT count(*)::int AS n FROM produto_fotos WHERE produto_id = ${id}`);
    expect((r.rows[0] as { n: number }).n).toBe(0);
  });
});
