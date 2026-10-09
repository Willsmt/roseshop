import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { AdminSession } from "@/lib/auth";
import { createDb } from "@/lib/db/client";
import { resetCategorias } from "@/test/db/categorias-fixtures";
import { inserirEnvio, limparEnvios } from "@/test/db/fotos-fixtures";
import { inserirProduto, limparProdutos, nomeUnicoProduto } from "@/test/db/produtos-fixtures";

import { type FotoLinha, lerConjunto, substituirConjunto } from "./fotos";
import { editar, remover } from "./produtos";

// Feature 004, T053 (SF5): concorrência REAL (Promise.all) sobre o conjunto de fotos.
// US5-AC2 (adicionar x adicionar), US5-AC3 (remover x remover), US5-AC4 (fotos x editar campos),
// US5-AC5 (fotos x remover produto). Integração com o banco local; roda em série com os demais.
const db = createDb({
  DATABASE_URL: process.env.DATABASE_URL ?? "",
  NEON_FETCH_ENDPOINT: process.env.NEON_FETCH_ENDPOINT,
});
const ana: AdminSession = { email: "ana@teste.local", name: "Ana" };
const bia: AdminSession = { email: "bia@teste.local", name: "Bia" };
const RODADAS = 10;
const TIMEOUT = 120_000;

let cat1 = 0;

async function adicionarFoto(produtoId: number, posicao: number): Promise<void> {
  await db.execute(
    sql`INSERT INTO produto_fotos (produto_id, posicao, chave_objeto, enviado_por, enviado_em)
        VALUES (${produtoId}, ${posicao}, ${`fotos/${randomUUID()}.webp`}, ${ana.email}, now())`,
  );
}

/** Produto com `qtd` fotos (1..3). */
async function criar(qtd: 1 | 2 | 3): Promise<number> {
  const id = await inserirProduto(db, cat1);
  for (let p = 2; p <= qtd; p++) await adicionarFoto(id, p);
  return id;
}

async function ler(id: number) {
  const c = await lerConjunto(db, id);
  if (!c) throw new Error("produto de teste não encontrado");
  return c;
}

const valido = (email: string) => inserirEnvio(db, { enviadoPor: email, estado: "confirmado" });

function linhaDoEnvio(
  e: { chave: string; criadoEm: Date },
  posicao: number,
  email: string,
): FotoLinha {
  return { posicao, chave: e.chave, enviadoPor: email, enviadoEm: e.criadoEm };
}

const reposicionar = (fotos: FotoLinha[]): FotoLinha[] =>
  fotos.map((f, i) => ({ ...f, posicao: i + 1 }));

async function chavesDe(id: number): Promise<string[]> {
  const r = await db.execute(
    sql`SELECT chave_objeto FROM produto_fotos WHERE produto_id = ${id} ORDER BY posicao`,
  );
  return (r.rows as { chave_objeto: string }[]).map((x) => x.chave_objeto);
}

async function enviosRestantes(): Promise<string[]> {
  const r = await db.execute(sql`SELECT id::text AS id FROM fotos_envio`);
  return (r.rows as { id: string }[]).map((x) => x.id);
}

async function versoes(id: number): Promise<{ versao: number; fotos_versao: number } | undefined> {
  const r = await db.execute(sql`SELECT versao, fotos_versao FROM produtos WHERE id = ${id}`);
  return (r.rows as { versao: number; fotos_versao: number }[])[0];
}

/** Invariantes globais do banco, checadas ao final de CADA rodada. */
async function verificarInvariantes(): Promise<void> {
  const q = async (consulta: ReturnType<typeof sql>) =>
    (await db.execute(consulta)).rows as { produto_id: number }[];

  // produtos criados por estes testes sempre têm de 1 a 3 fotos
  expect(
    await q(sql`SELECT p.id AS produto_id FROM produtos p
                LEFT JOIN produto_fotos f ON f.produto_id = p.id
                GROUP BY p.id HAVING count(f.*) = 0 OR count(f.*) > 3`),
    "produto com 0 ou mais de 3 fotos",
  ).toEqual([]);
  expect(
    await q(
      sql`SELECT produto_id FROM produto_fotos GROUP BY produto_id, posicao HAVING count(*) > 1`,
    ),
    "posição repetida",
  ).toEqual([]);
  expect(
    await q(sql`SELECT produto_id FROM produto_fotos GROUP BY produto_id
                HAVING min(posicao) <> 1 OR max(posicao) <> count(*)`),
    "buraco nas posições",
  ).toEqual([]);
  expect(
    await q(sql`SELECT p.id AS produto_id FROM produtos p
                WHERE p.destaque_vaga IS NOT NULL
                  AND NOT EXISTS (SELECT 1 FROM produto_fotos f WHERE f.produto_id = p.id)`),
    "produto em destaque sem foto",
  ).toEqual([]);
}

beforeAll(async () => {
  await resetCategorias(db);
  const r = await db.execute(sql`SELECT id FROM categorias ORDER BY id LIMIT 1`);
  cat1 = (r.rows as { id: number }[])[0].id;
});
beforeEach(async () => {
  await limparProdutos(db);
  await limparEnvios(db);
});
afterAll(async () => {
  await limparProdutos(db);
  await limparEnvios(db);
  await resetCategorias(db);
});

describe("concorrência de fotos (T053)", () => {
  it(
    "US5-AC2: adicionar x adicionar (envios válidos diferentes) ⇒ exatamente 1 ok, o outro alterado; a foto e o envio do perdedor ficam como estavam",
    async () => {
      for (let rodada = 0; rodada < RODADAS; rodada++) {
        await limparEnvios(db); // isola os envios de cada rodada
        const id = await criar(1);
        const c = await ler(id);
        const e1 = await valido(ana.email);
        const e2 = await valido(rodada % 2 === 0 ? ana.email : bia.email);
        const quem2 = rodada % 2 === 0 ? ana : bia;
        const atuais = c.fotos.map((f) => f.chave);
        const [r1, r2] = await Promise.all([
          substituirConjunto(db, ana, {
            produtoId: id,
            fotosVersao: c.fotosVersao,
            atuais,
            novas: [...c.fotos, linhaDoEnvio(e1, 2, ana.email)],
            envioId: e1.id,
          }),
          substituirConjunto(db, quem2, {
            produtoId: id,
            fotosVersao: c.fotosVersao,
            atuais,
            novas: [...c.fotos, linhaDoEnvio(e2, 2, quem2.email)],
            envioId: e2.id,
          }),
        ]);
        expect([r1.tipo, r2.tipo].sort(), `rodada ${rodada}`).toEqual(["alterado", "ok"]);

        const [vencedor, perdedor] = r1.tipo === "ok" ? [e1, e2] : [e2, e1];
        const chaves = await chavesDe(id);
        expect(chaves).toEqual([c.fotos[0].chave, vencedor.chave]);
        expect(chaves).not.toContain(perdedor.chave);
        expect(await enviosRestantes()).toEqual([perdedor.id]);
        expect((await versoes(id))?.fotos_versao).toBe(c.fotosVersao + 1);
        await verificarInvariantes();
      }
    },
    TIMEOUT,
  );

  it(
    "US5-AC3: remover x remover de fotos diferentes (3 fotos) ⇒ só 1 ok, o outro alterado; sobram 2 fotos",
    async () => {
      for (let rodada = 0; rodada < RODADAS; rodada++) {
        await limparEnvios(db); // isola os envios de cada rodada
        const id = await criar(3);
        const c = await ler(id);
        const atuais = c.fotos.map((f) => f.chave);
        const sem = (i: number) => reposicionar(c.fotos.filter((_, j) => j !== i));
        const [r1, r2] = await Promise.all([
          substituirConjunto(db, ana, {
            produtoId: id,
            fotosVersao: c.fotosVersao,
            atuais,
            novas: sem(0),
          }),
          substituirConjunto(db, bia, {
            produtoId: id,
            fotosVersao: c.fotosVersao,
            atuais,
            novas: sem(2),
          }),
        ]);
        expect([r1.tipo, r2.tipo].sort(), `rodada ${rodada}`).toEqual(["alterado", "ok"]);
        const esperado = (r1.tipo === "ok" ? sem(0) : sem(2)).map((f) => f.chave);
        expect(await chavesDe(id)).toEqual(esperado);
        await verificarInvariantes();
      }
    },
    TIMEOUT,
  );

  it(
    "US5-AC3: remover x remover cada uma das 2 fotos ⇒ nunca fica com 0 fotos",
    async () => {
      for (let rodada = 0; rodada < RODADAS; rodada++) {
        await limparEnvios(db); // isola os envios de cada rodada
        const id = await criar(2);
        const c = await ler(id);
        const atuais = c.fotos.map((f) => f.chave);
        const [r1, r2] = await Promise.all([
          substituirConjunto(db, ana, {
            produtoId: id,
            fotosVersao: c.fotosVersao,
            atuais,
            novas: reposicionar([c.fotos[1]]),
          }),
          substituirConjunto(db, bia, {
            produtoId: id,
            fotosVersao: c.fotosVersao,
            atuais,
            novas: reposicionar([c.fotos[0]]),
          }),
        ]);
        expect([r1.tipo, r2.tipo].sort(), `rodada ${rodada}`).toEqual(["alterado", "ok"]);
        const restantes = await chavesDe(id);
        expect(restantes).toHaveLength(1);
        expect(restantes[0]).toBe(r1.tipo === "ok" ? c.fotos[1].chave : c.fotos[0].chave);
        await verificarInvariantes();
      }
    },
    TIMEOUT,
  );

  it(
    "US5-AC3: mover x trocar a partir da mesma leitura ⇒ só 1 ok",
    async () => {
      for (let rodada = 0; rodada < RODADAS; rodada++) {
        await limparEnvios(db); // isola os envios de cada rodada
        const id = await criar(3);
        const c = await ler(id);
        const e = await valido(bia.email);
        const atuais = c.fotos.map((f) => f.chave);
        const mover = reposicionar([c.fotos[2], c.fotos[0], c.fotos[1]]);
        const trocar = c.fotos.map((f) => (f.posicao === 2 ? linhaDoEnvio(e, 2, bia.email) : f));
        const [rm, rt] = await Promise.all([
          substituirConjunto(db, ana, {
            produtoId: id,
            fotosVersao: c.fotosVersao,
            atuais,
            novas: mover,
          }),
          substituirConjunto(db, bia, {
            produtoId: id,
            fotosVersao: c.fotosVersao,
            atuais,
            novas: trocar,
            envioId: e.id,
          }),
        ]);
        expect([rm.tipo, rt.tipo].sort(), `rodada ${rodada}`).toEqual(["alterado", "ok"]);
        if (rm.tipo === "ok") {
          expect(await chavesDe(id)).toEqual(mover.map((f) => f.chave));
          expect(await enviosRestantes()).toEqual([e.id]);
        } else {
          expect(await chavesDe(id)).toEqual(trocar.map((f) => f.chave));
          expect(await enviosRestantes()).toEqual([]);
        }
        await verificarInvariantes();
      }
    },
    TIMEOUT,
  );

  it(
    "US5-AC4: fotos x editar campos (versao 1) ⇒ AS DUAS ok; versao = 2 e fotos_versao = 2",
    async () => {
      for (let rodada = 0; rodada < RODADAS; rodada++) {
        await limparEnvios(db); // isola os envios de cada rodada
        const id = await criar(2);
        const c = await ler(id);
        const nome = nomeUnicoProduto("Editado");
        const [rf, re] = await Promise.all([
          substituirConjunto(db, ana, {
            produtoId: id,
            fotosVersao: c.fotosVersao,
            atuais: c.fotos.map((f) => f.chave),
            novas: reposicionar([c.fotos[1], c.fotos[0]]),
          }),
          editar(db, bia, id, 1, {
            nome,
            categoriaId: cat1,
            descricao: null,
            precoCentavos: 2000,
            aPartirDe: false,
          }),
        ]);
        expect(rf, `rodada ${rodada}`).toEqual({ tipo: "ok", fotosVersao: 2 });
        expect(re, `rodada ${rodada}`).toEqual({ tipo: "ok" });
        expect(await versoes(id)).toEqual({ versao: 2, fotos_versao: 2 });
        expect(await chavesDe(id)).toEqual([c.fotos[1].chave, c.fotos[0].chave]);
        await verificarInvariantes();
      }
    },
    TIMEOUT,
  );

  it(
    "US5-AC5: fotos x remover produto ⇒ consistente em qualquer ordem (ausente + produto sumiu, ou os dois ok)",
    async () => {
      for (let rodada = 0; rodada < RODADAS; rodada++) {
        await limparEnvios(db); // isola os envios de cada rodada
        const id = await criar(2);
        const c = await ler(id);
        const [rf, rr] = await Promise.all([
          substituirConjunto(db, ana, {
            produtoId: id,
            fotosVersao: c.fotosVersao,
            atuais: c.fotos.map((f) => f.chave),
            novas: reposicionar([c.fotos[1]]),
          }),
          remover(db, bia, id, 1),
        ]);
        // remover não usa fotos_versao: sempre vence ou chega depois das fotos, mas nunca falha
        expect(rr.tipo, `rodada ${rodada}`).toBe("removido");
        expect(["ok", "ausente"], `rodada ${rodada}`).toContain(rf.tipo);
        expect(await versoes(id)).toBeUndefined();
        expect(await chavesDe(id)).toEqual([]);
        if (rr.tipo === "removido") {
          // se as fotos venceram, a remoção devolve as chaves já reordenadas (1 foto); senão, as 2 originais
          const originais = c.fotos.map((f) => f.chave);
          expect(rf.tipo === "ok" ? [c.fotos[1].chave] : originais).toEqual(rr.chaves);
        }
        await verificarInvariantes();
      }
    },
    TIMEOUT,
  );
});
