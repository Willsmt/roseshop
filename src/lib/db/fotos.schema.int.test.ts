import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createDb } from "@/lib/db/client";
import { codigoSqlstate, nomeConstraint } from "@/lib/db/erros-pg";
import { resetCategorias } from "@/test/db/categorias-fixtures";
import { inserirProduto, limparProdutos } from "@/test/db/produtos-fixtures";

// Feature 004, T015 (SF1): migration 0002 (fotos_envio, produto_fotos.enviado_*, produtos.fotos_*,
// ia_uso). SQL cru de propósito: prova o banco, não o schema Drizzle. Uma prova por linha.
// No neon-http o erro vem embrulhado (error.cause); codigoSqlstate/nomeConstraint leem as duas formas.
const db = createDb({
  DATABASE_URL: process.env.DATABASE_URL ?? "",
  NEON_FETCH_ENDPOINT: process.env.NEON_FETCH_ENDPOINT,
});

const AUTOR = "zt-fotos@example.com";
const UUID_V7 = "01890a5d-ac96-774b-bcce-b302099a8057";

async function falha(consulta: Promise<unknown>): Promise<unknown> {
  try {
    await consulta;
  } catch (error) {
    return error;
  }
  throw new Error("a consulta deveria ter falhado, mas teve sucesso");
}

async function erroPg(consulta: Promise<unknown>): Promise<{ code?: string; constraint?: string }> {
  const e = await falha(consulta);
  return { code: codigoSqlstate(e), constraint: nomeConstraint(e) };
}

type Linhas = { rows: Record<string, unknown>[] };

function envio(c: {
  id?: string;
  formato?: string;
  tamanho?: number;
  estado?: string;
  confirmadoEm?: boolean;
}): Promise<Linhas> {
  const id = c.id ?? randomUUID();
  const confirmado = c.confirmadoEm ? sql`now()` : sql`NULL`;
  return db.execute(sql`
    INSERT INTO fotos_envio (id, formato, tamanho, enviado_por, estado, confirmado_em)
    VALUES (${id}, ${c.formato ?? "webp"}, ${c.tamanho ?? 1000}, ${AUTOR}, ${c.estado ?? "emitido"}, ${confirmado})
    RETURNING id, chave, estado, confirmado_em, criado_em`) as Promise<Linhas>;
}

// Durante o red as tabelas ainda não existem: a limpeza não pode mascarar as falhas dos testes.
async function limparTolerante(consulta: Promise<unknown>): Promise<void> {
  try {
    await consulta;
  } catch (error) {
    if (codigoSqlstate(error) !== "42P01") throw error;
  }
}

async function limpar(): Promise<void> {
  await limparTolerante(db.execute(sql`DELETE FROM fotos_envio WHERE enviado_por = ${AUTOR}`));
  await limparTolerante(db.execute(sql`DELETE FROM ia_uso WHERE email LIKE 'zt-fotos-%'`));
  await limparProdutos(db);
}

let categoriaId = 0;

beforeAll(async () => {
  await resetCategorias(db);
  const r = await db.execute(sql`SELECT id FROM categorias ORDER BY id LIMIT 1`);
  categoriaId = (r.rows[0] as { id: number }).id;
});

beforeEach(limpar);

afterAll(async () => {
  await limpar();
  await resetCategorias(db);
});

describe("fotos_envio: checks", () => {
  it("id uuid v4 aceito", async () => {
    const r = await envio({});
    expect(r.rows).toHaveLength(1);
  });

  it("id uuid v7 => 23514 fotos_envio_id_v4", async () => {
    expect(await erroPg(envio({ id: UUID_V7 }))).toEqual({ code: "23514", constraint: "fotos_envio_id_v4" });
  });

  it("formato fora de (webp, jpeg), ex. png => 23514 fotos_envio_formato", async () => {
    expect(await erroPg(envio({ formato: "png" }))).toEqual({
      code: "23514",
      constraint: "fotos_envio_formato",
    });
  });

  it("tamanho 0 => 23514 fotos_envio_tamanho", async () => {
    expect(await erroPg(envio({ tamanho: 0 }))).toEqual({ code: "23514", constraint: "fotos_envio_tamanho" });
  });

  it("tamanho 1048577 => 23514 fotos_envio_tamanho", async () => {
    expect(await erroPg(envio({ tamanho: 1048577 }))).toEqual({
      code: "23514",
      constraint: "fotos_envio_tamanho",
    });
  });

  it("tamanho 1 e 1048576 aceitos", async () => {
    await envio({ tamanho: 1 });
    await envio({ tamanho: 1048576 });
  });

  it("estado fora de (emitido, confirmado) => 23514 fotos_envio_estado", async () => {
    expect(await erroPg(envio({ estado: "pendente" }))).toEqual({
      code: "23514",
      constraint: "fotos_envio_estado",
    });
  });

  it("estado emitido (confirmado_em NULL) aceito por fotos_envio_estado", async () => {
    const r = await envio({ estado: "emitido", confirmadoEm: false });
    expect(r.rows[0].estado).toBe("emitido");
    expect(r.rows[0].confirmado_em).toBeNull();
  });

  it("estado confirmado (com confirmado_em) aceito por fotos_envio_estado", async () => {
    const r = await envio({ estado: "confirmado", confirmadoEm: true });
    expect(r.rows[0].estado).toBe("confirmado");
  });

  it("estado confirmado sem confirmado_em => 23514 fotos_envio_confirmacao", async () => {
    expect(await erroPg(envio({ estado: "confirmado", confirmadoEm: false }))).toEqual({
      code: "23514",
      constraint: "fotos_envio_confirmacao",
    });
  });

  it("estado emitido com confirmado_em => 23514 fotos_envio_confirmacao", async () => {
    expect(await erroPg(envio({ estado: "emitido", confirmadoEm: true }))).toEqual({
      code: "23514",
      constraint: "fotos_envio_confirmacao",
    });
  });

  it("estado confirmado com confirmado_em aceito", async () => {
    const r = await envio({ estado: "confirmado", confirmadoEm: true });
    expect(r.rows[0].estado).toBe("confirmado");
    expect(r.rows[0].confirmado_em).toBeTruthy();
  });

  it("defaults: estado emitido, confirmado_em NULL e criado_em preenchido", async () => {
    const id = randomUUID();
    const r = (await db.execute(sql`
      INSERT INTO fotos_envio (id, formato, tamanho, enviado_por)
      VALUES (${id}, 'webp', 10, ${AUTOR})
      RETURNING estado, confirmado_em, criado_em`)) as Linhas;
    expect(r.rows[0].estado).toBe("emitido");
    expect(r.rows[0].confirmado_em).toBeNull();
    expect(r.rows[0].criado_em).toBeTruthy();
  });
});

describe("fotos_envio: coluna chave gerada", () => {
  it("formato webp => chave = 'fotos/' || id || '.webp'", async () => {
    const id = randomUUID();
    const r = await envio({ id, formato: "webp" });
    expect(r.rows[0].chave).toBe(`fotos/${id}.webp`);
    const s = (await db.execute(sql`SELECT chave FROM fotos_envio WHERE id = ${id}`)) as Linhas;
    expect(s.rows[0].chave).toBe(`fotos/${id}.webp`);
  });

  it("formato jpeg => extensão .jpg", async () => {
    const id = randomUUID();
    const r = await envio({ id, formato: "jpeg" });
    expect(r.rows[0].chave).toBe(`fotos/${id}.jpg`);
  });

  it("INSERT informando chave => 428C9 (coluna gerada)", async () => {
    const id = randomUUID();
    const e = await erroPg(
      db.execute(sql`INSERT INTO fotos_envio (id, formato, chave, tamanho, enviado_por)
        VALUES (${id}, 'webp', 'fotos/x.webp', 10, ${AUTOR})`),
    );
    expect(e.code).toBe("428C9");
  });

  it("existe a constraint UNIQUE fotos_envio_chave_unique (pg_constraint, contype u)", async () => {
    const r = (await db.execute(sql`
      SELECT c.contype FROM pg_constraint c
      WHERE c.conname = 'fotos_envio_chave_unique' AND c.conrelid = 'fotos_envio'::regclass`)) as Linhas;
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].contype).toBe("u");
  });

  it("chave é STORED: pg_attribute.attgenerated = 's'", async () => {
    const r = (await db.execute(sql`
      SELECT attgenerated FROM pg_attribute
      WHERE attrelid = 'fotos_envio'::regclass AND attname = 'chave'`)) as Linhas;
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].attgenerated).toBe("s");
  });
});

describe("produto_fotos: chave_objeto e autoria do envio", () => {
  async function foto(
    produtoId: number,
    posicao: number,
    chave: string,
    extra: { semEnviadoPor?: boolean; semEnviadoEm?: boolean } = {},
  ) {
    if (extra.semEnviadoPor) {
      return db.execute(sql`INSERT INTO produto_fotos (produto_id, posicao, chave_objeto, enviado_em)
        VALUES (${produtoId}, ${posicao}, ${chave}, now())`);
    }
    if (extra.semEnviadoEm) {
      return db.execute(sql`INSERT INTO produto_fotos (produto_id, posicao, chave_objeto, enviado_por)
        VALUES (${produtoId}, ${posicao}, ${chave}, ${AUTOR})`);
    }
    return db.execute(sql`INSERT INTO produto_fotos (produto_id, posicao, chave_objeto, enviado_por, enviado_em)
      VALUES (${produtoId}, ${posicao}, ${chave}, ${AUTOR}, now())`);
  }

  it("chave_objeto duplicada em produtos diferentes => 23505 produto_fotos_objeto_unique", async () => {
    const a = await inserirProduto(db, categoriaId, { fotos: 0 });
    const b = await inserirProduto(db, categoriaId, { fotos: 0 });
    const chave = `fotos/${randomUUID()}.webp`;
    await foto(a, 1, chave);
    expect(await erroPg(foto(b, 1, chave))).toEqual({
      code: "23505",
      constraint: "produto_fotos_objeto_unique",
    });
  });

  it("chave válida .webp e .jpg aceitas", async () => {
    const p = await inserirProduto(db, categoriaId, { fotos: 0 });
    await foto(p, 1, `fotos/${randomUUID()}.webp`);
    await foto(p, 2, `fotos/${randomUUID()}.jpg`);
  });

  const formato = { code: "23514", constraint: "produto_fotos_objeto_formato" };

  it("extensão .png => 23514 produto_fotos_objeto_formato", async () => {
    const p = await inserirProduto(db, categoriaId, { fotos: 0 });
    expect(await erroPg(foto(p, 1, `fotos/${randomUUID()}.png`))).toEqual(formato);
  });

  it("uuid v7 na chave => 23514 produto_fotos_objeto_formato", async () => {
    const p = await inserirProduto(db, categoriaId, { fotos: 0 });
    expect(await erroPg(foto(p, 1, `fotos/${UUID_V7}.webp`))).toEqual(formato);
  });

  it("uuid em maiúsculas => 23514 produto_fotos_objeto_formato", async () => {
    const p = await inserirProduto(db, categoriaId, { fotos: 0 });
    expect(await erroPg(foto(p, 1, `fotos/${randomUUID().toUpperCase()}.webp`))).toEqual(formato);
  });

  it("prefixo errado => 23514 produto_fotos_objeto_formato", async () => {
    const p = await inserirProduto(db, categoriaId, { fotos: 0 });
    expect(await erroPg(foto(p, 1, `imagens/${randomUUID()}.webp`))).toEqual(formato);
  });

  it("ponto trocado por outro caractere (xwebp) => 23514 (ponto da regex escapado)", async () => {
    const p = await inserirProduto(db, categoriaId, { fotos: 0 });
    expect(await erroPg(foto(p, 1, `fotos/${randomUUID()}xwebp`))).toEqual(formato);
  });

  it("insert sem enviado_por => 23502", async () => {
    const p = await inserirProduto(db, categoriaId, { fotos: 0 });
    const e = await erroPg(foto(p, 1, `fotos/${randomUUID()}.webp`, { semEnviadoPor: true }));
    expect(e.code).toBe("23502");
  });

  it("insert sem enviado_em => 23502", async () => {
    const p = await inserirProduto(db, categoriaId, { fotos: 0 });
    const e = await erroPg(foto(p, 1, `fotos/${randomUUID()}.webp`, { semEnviadoEm: true }));
    expect(e.code).toBe("23502");
  });
});

describe("produtos: fotos_versao e fotos_operacao", () => {
  it("fotos_versao nasce com 1 (NOT NULL DEFAULT 1)", async () => {
    const id = await inserirProduto(db, categoriaId, { fotos: 0 });
    const r = (await db.execute(sql`SELECT fotos_versao FROM produtos WHERE id = ${id}`)) as Linhas;
    expect(r.rows[0].fotos_versao).toBe(1);
  });

  it("UPDATE de fotos_versao para NULL => 23502", async () => {
    const id = await inserirProduto(db, categoriaId, { fotos: 0 });
    const e = await erroPg(db.execute(sql`UPDATE produtos SET fotos_versao = NULL WHERE id = ${id}`));
    expect(e.code).toBe("23502");
  });

  it("fotos_operacao nasce NULL e aceita uuid", async () => {
    const id = await inserirProduto(db, categoriaId, { fotos: 0 });
    const antes = (await db.execute(sql`SELECT fotos_operacao FROM produtos WHERE id = ${id}`)) as Linhas;
    expect(antes.rows[0].fotos_operacao).toBeNull();
    const op = randomUUID();
    await db.execute(sql`UPDATE produtos SET fotos_operacao = ${op} WHERE id = ${id}`);
    const depois = (await db.execute(sql`SELECT fotos_operacao FROM produtos WHERE id = ${id}`)) as Linhas;
    expect(depois.rows[0].fotos_operacao).toBe(op);
  });
});

describe("ia_uso", () => {
  function uso(email: string, n: number, dia = "2030-01-01") {
    return db.execute(sql`INSERT INTO ia_uso (dia, email, n) VALUES (${dia}::date, ${email}, ${n})`);
  }

  it("PK (dia, email): segunda linha igual => 23505", async () => {
    await uso("zt-fotos-a@example.com", 1);
    expect(await erroPg(uso("zt-fotos-a@example.com", 2))).toEqual({
      code: "23505",
      constraint: "ia_uso_pkey",
    });
  });

  it("mesmo email em outro dia passa", async () => {
    await uso("zt-fotos-b@example.com", 1);
    await uso("zt-fotos-b@example.com", 1, "2030-01-02");
  });

  it("CHECK n >= 1: n=0 => 23514 ia_uso_n_minimo", async () => {
    expect(await erroPg(uso("zt-fotos-c@example.com", 0))).toEqual({
      code: "23514",
      constraint: "ia_uso_n_minimo",
    });
  });
});
