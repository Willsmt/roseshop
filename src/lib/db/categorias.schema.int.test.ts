import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDb } from "@/lib/db/client";

// Feature 002, T002: função categoria_chave e tabela categorias (SQL cru; o schema
// Drizzle é declarado depois). Não assume tabela vazia: todo dado de teste usa o
// prefixo "Zt" e é removido antes e depois.
const db = createDb({
  DATABASE_URL: process.env.DATABASE_URL ?? "",
  NEON_FETCH_ENDPOINT: process.env.NEON_FETCH_ENDPOINT,
});

async function limpar() {
  await db.execute(sql`DELETE FROM categorias WHERE chave LIKE 'zt%'`);
}

async function chave(texto: string): Promise<string> {
  const r = await db.execute(sql`SELECT categoria_chave(${texto}) AS chave`);
  return (r.rows[0] as { chave: string }).chave;
}

type PgErro = { code?: unknown; cause?: { code?: unknown } };

/** Onde o SQLSTATE chegou (pendência de research.md: "Erros do driver"). */
function localizarSqlstate(error: unknown): { onde: "error.code" | "error.cause.code" | "ausente"; code?: string } {
  const e = error as PgErro;
  if (typeof e?.code === "string") return { onde: "error.code", code: e.code };
  if (typeof e?.cause?.code === "string") return { onde: "error.cause.code", code: e.cause.code };
  return { onde: "ausente" };
}

async function falha(consulta: Promise<unknown>): Promise<unknown> {
  try {
    await consulta;
  } catch (error) {
    return error;
  }
  throw new Error("a consulta deveria ter falhado, mas teve sucesso");
}

describe("categoria_chave (US2-2/3, US3-2/3, FR-005/006)", () => {
  it("minúscula, sem acento e espaços colapsados: 'GUÁRDA  chuvas' => 'guarda chuvas'", async () => {
    expect(await chave("GUÁRDA  chuvas")).toBe("guarda chuvas");
  });

  it("'Panos de prato', 'panos de prato' e ' Panos  de prato ' têm a mesma chave", async () => {
    const chaves = await Promise.all(["Panos de prato", "panos de prato", " Panos  de prato "].map(chave));
    expect(new Set(chaves).size).toBe(1);
    expect(chaves[0]).toBe("panos de prato");
  });

  it("hífen vira espaço: 'Guarda-chuvas' => 'guarda chuvas'", async () => {
    expect(await chave("Guarda-chuvas")).toBe("guarda chuvas");
  });

  it("'Guarda-chuva' é diferente de 'Guarda-chuvas' (US2-3)", async () => {
    expect(await chave("Guarda-chuva")).not.toBe(await chave("Guarda-chuvas"));
  });

  it("premissa NFD: ß, æ, ø e ł não decompõem e ficam distintos de ss, ae, o, l (research.md)", async () => {
    expect(await chave("ß")).not.toBe(await chave("ss"));
    expect(await chave("æ")).not.toBe(await chave("ae"));
    expect(await chave("ø")).not.toBe(await chave("o"));
    expect(await chave("ł")).not.toBe(await chave("l"));
  });
});

describe("tabela categorias (FR-005/006/008)", () => {
  beforeAll(limpar);
  afterAll(limpar);

  it("versao tem default 1 e criado_em/atualizado_em são timestamptz com default now()", async () => {
    const r = await db.execute(
      sql`INSERT INTO categorias (nome) VALUES ('Zt Defaults') RETURNING versao, criado_em, atualizado_em`,
    );
    const linha = r.rows[0] as { versao: number; criado_em: unknown; atualizado_em: unknown };
    expect(linha.versao).toBe(1);
    expect(linha.criado_em).toBeTruthy();
    expect(linha.atualizado_em).toBeTruthy();

    const cols = await db.execute(sql`
      SELECT column_name, data_type, column_default
      FROM information_schema.columns
      WHERE table_name = 'categorias'
        AND column_name IN ('versao', 'criado_em', 'atualizado_em')`);
    const porNome = Object.fromEntries(
      (cols.rows as { column_name: string; data_type: string; column_default: string | null }[]).map((c) => [
        c.column_name,
        c,
      ]),
    );
    expect(porNome.versao.column_default).toBe("1");
    expect(porNome.criado_em.data_type).toBe("timestamp with time zone");
    expect(porNome.criado_em.column_default).toMatch(/now\(\)/i);
    expect(porNome.atualizado_em.data_type).toBe("timestamp with time zone");
    expect(porNome.atualizado_em.column_default).toMatch(/now\(\)/i);
  });

  it("chave é gerada pelo banco a partir do nome", async () => {
    const r = await db.execute(sql`INSERT INTO categorias (nome) VALUES ('Zt GUÁRDA Gerada') RETURNING chave`);
    expect((r.rows[0] as { chave: string }).chave).toBe("zt guarda gerada");
  });

  it("chave é gerada: INSERT informando chave falha", async () => {
    const erro = await falha(db.execute(sql`INSERT INTO categorias (nome, chave) VALUES ('Zt Manual', 'qualquer')`));
    expect(erro).toBeInstanceOf(Error);
  });

  it("UNIQUE(chave) => SQLSTATE 23505 (registra onde o código chega: error.code ou error.cause.code)", async () => {
    await db.execute(sql`INSERT INTO categorias (nome) VALUES ('Zt Panos de prato')`);
    const erro = await falha(db.execute(sql`INSERT INTO categorias (nome) VALUES ('zt PANOS-de prato')`));
    const { onde, code } = localizarSqlstate(erro);
    // Observado: o SQLSTATE chega em error.cause.code (DrizzleQueryError -> NeonDbError), nunca em error.code.
    // O helper aceita os dois locais por robustez.
    console.info(`[T002] SQLSTATE ${String(code)} chegou em: ${onde}`);
    expect(["error.code", "error.cause.code"]).toContain(onde);
    expect(code).toBe("23505");
  });

  it("CHECK char_length(nome) BETWEEN 2 AND 40: 1 e 41 caracteres falham; 2 e 40 passam", async () => {
    const curto = await falha(db.execute(sql`INSERT INTO categorias (nome) VALUES ('Z')`));
    expect(localizarSqlstate(curto).code).toBe("23514");

    const longo = await falha(db.execute(sql`INSERT INTO categorias (nome) VALUES (${"Zt" + "a".repeat(39)})`));
    expect(localizarSqlstate(longo).code).toBe("23514");

    await db.execute(sql`INSERT INTO categorias (nome) VALUES ('Zt')`);
    await db.execute(sql`INSERT INTO categorias (nome) VALUES (${"Zt" + "b".repeat(38)})`);
  });

  it("CHECK nome = btrim(nome): espaço nas pontas falha", async () => {
    const antes = await falha(db.execute(sql`INSERT INTO categorias (nome) VALUES (' Zt Ponta')`));
    expect(localizarSqlstate(antes).code).toBe("23514");
    const depois = await falha(db.execute(sql`INSERT INTO categorias (nome) VALUES ('Zt Ponta ')`));
    expect(localizarSqlstate(depois).code).toBe("23514");
  });

  it("CHECK nome !~ '\\s{2,}': dois ou mais espaços seguidos falham", async () => {
    const dupla = await falha(db.execute(sql`INSERT INTO categorias (nome) VALUES ('Zt  Dupla')`));
    expect(localizarSqlstate(dupla).code).toBe("23514");
    const tab = await falha(db.execute(sql`INSERT INTO categorias (nome) VALUES (E'Zt \tTab')`));
    expect(localizarSqlstate(tab).code).toBe("23514");
  });
});
