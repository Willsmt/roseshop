import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { AdminSession } from "@/lib/auth";
import { createDb } from "@/lib/db/client";

import { consumirSugestao } from "./ia-uso";

// Feature 004, T125 (SF13): contador diário de sugestões da IA (contracts/ia.md §3).
// Concorrência REAL (Promise.all); limites são parâmetros. Integração com o banco local.
const db = createDb({
  DATABASE_URL: process.env.DATABASE_URL ?? "",
  NEON_FETCH_ENDPOINT: process.env.NEON_FETCH_ENDPOINT,
});
const TIMEOUT = 120_000;

const sessao = (nome: string): AdminSession => ({
  email: `${nome}@teste.local`,
  name: nome,
});
const ana = sessao("ana");
const bia = sessao("bia");
const cris = sessao("cris");
const duda = sessao("duda");

async function diaDeBrasilia(): Promise<string> {
  const r = await db.execute(
    sql`SELECT ((now() AT TIME ZONE 'America/Sao_Paulo')::date)::text AS dia`,
  );
  return (r.rows as { dia: string }[])[0].dia;
}

async function nDe(email: string, dia?: string): Promise<number | undefined> {
  const d = dia ?? (await diaDeBrasilia());
  const r = await db.execute(
    sql`SELECT n FROM ia_uso WHERE email = ${email} AND dia = ${d}::date`,
  );
  return (r.rows as { n: number }[])[0]?.n;
}

async function linhas(): Promise<{ dia: string; email: string; n: number }[]> {
  const r = await db.execute(
    sql`SELECT dia::text AS dia, email, n FROM ia_uso ORDER BY email, dia`,
  );
  return r.rows as { dia: string; email: string; n: number }[];
}

async function semear(email: string, n: number, diaOffset = 0): Promise<void> {
  await db.execute(
    sql`INSERT INTO ia_uso (dia, email, n)
        VALUES (((now() AT TIME ZONE 'America/Sao_Paulo')::date + ${diaOffset}::int), ${email}, ${n})`,
  );
}

const contar = (resultados: boolean[]) => resultados.filter(Boolean).length;
const somaN = async () =>
  (await linhas()).reduce((s, l) => s + Number(l.n), 0);

beforeAll(async () => {
  await db.execute(sql`DELETE FROM ia_uso`);
});
beforeEach(async () => {
  await db.execute(sql`DELETE FROM ia_uso`);
});
afterAll(async () => {
  await db.execute(sql`DELETE FROM ia_uso`);
});

describe("consumirSugestao: limite por pessoa e contagem (contracts/ia.md §3)", () => {
  it("a 1ª chamada cria a linha com n=1 no dia de Brasília; as seguintes incrementam", async () => {
    const dia = await diaDeBrasilia();
    expect(await consumirSugestao(db, ana, { porPessoa: 30, total: 100 })).toBe(true);
    expect(await linhas()).toEqual([{ dia, email: ana.email, n: 1 }]);
    expect(await consumirSugestao(db, ana, { porPessoa: 30, total: 100 })).toBe(true);
    expect(await consumirSugestao(db, ana, { porPessoa: 30, total: 100 })).toBe(true);
    expect(await nDe(ana.email)).toBe(3);
  }, TIMEOUT);

  it("os limites são parâmetros: com porPessoa 2 a 3ª chamada devolve false e n fica 2", async () => {
    const lim = { porPessoa: 2, total: 5 };
    expect(await consumirSugestao(db, ana, lim)).toBe(true);
    expect(await consumirSugestao(db, ana, lim)).toBe(true);
    expect(await consumirSugestao(db, ana, lim)).toBe(false);
    expect(await nDe(ana.email)).toBe(2);
    expect(await consumirSugestao(db, ana, lim)).toBe(false);
    expect(await nDe(ana.email)).toBe(2);
  }, TIMEOUT);

  it("com porPessoa 3 (e total 5) a mesma 3ª chamada passa", async () => {
    const lim = { porPessoa: 3, total: 5 };
    expect(await consumirSugestao(db, ana, lim)).toBe(true);
    expect(await consumirSugestao(db, ana, lim)).toBe(true);
    expect(await consumirSugestao(db, ana, lim)).toBe(true);
    expect(await consumirSugestao(db, ana, lim)).toBe(false);
    expect(await nDe(ana.email)).toBe(3);
  }, TIMEOUT);

  it("false não cria linha nova nem altera n", async () => {
    expect(await consumirSugestao(db, ana, { porPessoa: 0, total: 5 })).toBe(false);
    expect(await linhas()).toEqual([]);
  }, TIMEOUT);

  it("linhas de outra pessoa não afetam o limite por pessoa", async () => {
    const lim = { porPessoa: 2, total: 100 };
    await semear(bia.email, 2);
    await semear(cris.email, 2);
    expect(await consumirSugestao(db, ana, lim)).toBe(true);
    expect(await consumirSugestao(db, ana, lim)).toBe(true);
    expect(await consumirSugestao(db, ana, lim)).toBe(false);
    expect(await nDe(bia.email)).toBe(2);
    expect(await nDe(cris.email)).toBe(2);
  }, TIMEOUT);
});

describe("consumirSugestao: total do dia", () => {
  it("depois de 100 consumos somados, a 101ª (qualquer pessoa, inclusive nova) devolve false e não cria linha", async () => {
    const lim = { porPessoa: 40, total: 100 };
    await semear(ana.email, 40);
    await semear(bia.email, 40);
    await semear(cris.email, 19);
    // o 100º consumo, de verdade
    expect(await consumirSugestao(db, cris, lim)).toBe(true);
    expect(await nDe(cris.email)).toBe(20);
    // 101ª: cris (abaixo do limite pessoal), bia, ana e uma 4ª pessoa nova
    expect(await consumirSugestao(db, cris, lim)).toBe(false);
    expect(await consumirSugestao(db, bia, lim)).toBe(false);
    expect(await consumirSugestao(db, duda, lim)).toBe(false);
    expect(await nDe(duda.email)).toBeUndefined();
    expect((await linhas()).length).toBe(3);
    expect(await somaN()).toBe(100);
  }, TIMEOUT);

  it("com limite por pessoa 30 e 3 pessoas o total 100 é atingido por uma 4ª pessoa; a 5ª fica de fora", async () => {
    const lim = { porPessoa: 30, total: 100 };
    await semear(ana.email, 30);
    await semear(bia.email, 30);
    await semear(cris.email, 30);
    await semear(duda.email, 9);
    expect(await consumirSugestao(db, duda, lim)).toBe(true); // 100
    expect(await consumirSugestao(db, duda, lim)).toBe(false);
    expect(await consumirSugestao(db, sessao("edu"), lim)).toBe(false);
    expect(await nDe("edu@teste.local")).toBeUndefined();
    expect(await somaN()).toBe(100);
  }, TIMEOUT);
});

describe("consumirSugestao: concorrência real (Promise.all)", () => {
  it("(a) uma pessoa, 45 chamadas simultâneas com {30,100}: exatamente 30 true e n=30", async () => {
    const r = await Promise.all(
      Array.from({ length: 45 }, () =>
        consumirSugestao(db, ana, { porPessoa: 30, total: 100 }),
      ),
    );
    expect(contar(r)).toBe(30);
    expect(await nDe(ana.email)).toBe(30);
  }, TIMEOUT);

  it("(b) 3 pessoas x 15 simultâneas com {10,25}: exatamente 25 true, soma de n = 25, ninguém acima de 10", async () => {
    const lim = { porPessoa: 10, total: 25 };
    const r = await Promise.all(
      [ana, bia, cris].flatMap((s) =>
        Array.from({ length: 15 }, () => consumirSugestao(db, s, lim)),
      ),
    );
    expect(contar(r)).toBe(25);
    expect(await somaN()).toBe(25);
    for (const l of await linhas()) expect(Number(l.n)).toBeLessThanOrEqual(10);
  }, TIMEOUT);

  it("(c) caso exato {30,100}: o TOTAL é quem recusa. Semeado ana 25, bia 25, cris 20 (sobra 30); 45 simultâneas (ana 10, bia 10, cris 10, duda 15; capacidade por pessoa 35 > 30) => 30 true, soma 100, ninguém acima de 30", async () => {
    const lim = { porPessoa: 30, total: 100 };
    await semear(ana.email, 25);
    await semear(bia.email, 25);
    await semear(cris.email, 20);
    const chamadas = [
      ...Array.from({ length: 10 }, () => ana),
      ...Array.from({ length: 10 }, () => bia),
      ...Array.from({ length: 10 }, () => cris),
      ...Array.from({ length: 15 }, () => duda),
    ];
    const r = await Promise.all(chamadas.map((s) => consumirSugestao(db, s, lim)));
    expect(contar(r)).toBe(30);
    expect(await somaN()).toBe(100);
    for (const l of await linhas()) expect(Number(l.n)).toBeLessThanOrEqual(30);
  }, TIMEOUT);
});

describe("consumirSugestao: outro dia zera", () => {
  it("linhas de ontem (n=30 da pessoa, total 100) não pesam hoje", async () => {
    await semear(ana.email, 30, -1);
    await semear(bia.email, 40, -1);
    await semear(cris.email, 30, -1);
    const lim = { porPessoa: 30, total: 100 };
    expect(await consumirSugestao(db, ana, lim)).toBe(true);
    expect(await nDe(ana.email)).toBe(1);
    expect(await consumirSugestao(db, duda, lim)).toBe(true);
    const ls = await linhas();
    // ontem preservado, hoje separado por (dia, email)
    expect(ls.filter((l) => l.email === ana.email)).toHaveLength(2);
  }, TIMEOUT);
});
