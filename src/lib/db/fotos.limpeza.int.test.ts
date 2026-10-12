import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { AdminSession } from "@/lib/auth";
import { createDb, type Db } from "@/lib/db/client";
import { resetCategorias } from "@/test/db/categorias-fixtures";
import { inserirEnvio, limparEnvios } from "@/test/db/fotos-fixtures";
import {
  inserirProduto,
  limparProdutos,
  nomeUnicoProduto,
} from "@/test/db/produtos-fixtures";

import {
  chavesConhecidas,
  expirarEnvios,
  lerConjunto,
  substituirConjunto,
} from "./fotos";
import { inserirComFotos } from "./produtos";

// Feature 004, T109 (SF12): expirarEnvios (lock 4001), chavesConhecidas (1 statement, TL-12) e
// concorrência com adoção (SC-008, FR-038). Integração com o banco local; roda em série.
const db = createDb({
  DATABASE_URL: process.env.DATABASE_URL ?? "",
  NEON_FETCH_ENDPOINT: process.env.NEON_FETCH_ENDPOINT,
});
const ana: AdminSession = { email: "ana@teste.local", name: "Ana" };
const RODADAS = 10;
const TIMEOUT = 120_000;

let cat1 = 0;

beforeAll(async () => {
  await resetCategorias(db);
  const r = await db.execute(
    sql`SELECT id FROM categorias ORDER BY id LIMIT 1`,
  );
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

async function chavesDeProdutos(): Promise<string[]> {
  const r = await db.execute(sql`SELECT chave_objeto FROM produto_fotos`);
  return (r.rows as { chave_objeto: string }[]).map((x) => x.chave_objeto);
}

async function chavesDeEnvios(): Promise<string[]> {
  const r = await db.execute(sql`SELECT chave FROM fotos_envio`);
  return (r.rows as { chave: string }[]).map((x) => x.chave);
}

describe("expirarEnvios (T109, US6-AC1/AC3)", () => {
  it("apaga só criado_em <= now() - 24 h, em ambos os estados, e devolve as chaves", async () => {
    const velhoEmitido = await inserirEnvio(db, {
      enviadoPor: ana.email,
      estado: "emitido",
      idadeHoras: 25,
    });
    const velhoConfirmado = await inserirEnvio(db, {
      enviadoPor: ana.email,
      estado: "confirmado",
      idadeHoras: 30,
    });
    const limite = await inserirEnvio(db, {
      enviadoPor: ana.email,
      estado: "confirmado",
      idadeHoras: 24,
    });
    const novoEmitido = await inserirEnvio(db, {
      enviadoPor: ana.email,
      estado: "emitido",
      idadeHoras: 23,
    });
    const novoConfirmado = await inserirEnvio(db, {
      enviadoPor: ana.email,
      estado: "confirmado",
      idadeHoras: 0,
    });

    const chaves = await expirarEnvios(db);

    // 24 h exatas: criado_em foi gravado antes do now() da limpeza, logo <= now() - 24 h.
    expect([...chaves].sort()).toEqual(
      [velhoEmitido.chave, velhoConfirmado.chave, limite.chave].sort(),
    );
    expect((await chavesDeEnvios()).sort()).toEqual(
      [novoEmitido.chave, novoConfirmado.chave].sort(),
    );
  });

  it("sem envios expirados devolve lista vazia", async () => {
    await inserirEnvio(db, { enviadoPor: ana.email, idadeHoras: 1 });
    expect(await expirarEnvios(db)).toEqual([]);
  });

  it("não toca produto_fotos", async () => {
    const id = await inserirProduto(db, cat1);
    const antes = await chavesDeProdutos();
    await inserirEnvio(db, { enviadoPor: ana.email, idadeHoras: 48 });
    const chaves = await expirarEnvios(db);
    expect(chaves).toHaveLength(1);
    for (const c of chaves) expect(antes).not.toContain(c);
    expect(await chavesDeProdutos()).toEqual(antes);
    expect((await lerConjunto(db, id))?.fotos).toHaveLength(1);
  });

  it("roda sob o lock 4001: espera um batch concorrente que o segura (pg_sleep)", async () => {
    // O driver HTTP não permite segurar pg_advisory_lock numa sessão à parte; um batch é uma
    // transação, então o xact lock vale durante o pg_sleep. Se expirarEnvios não pegasse o
    // lock 4001, terminaria em milissegundos, sem esperar o sleep.
    await inserirEnvio(db, { enviadoPor: ana.email, idadeHoras: 30 });
    const SONO_S = 2;
    const segurando = db.batch([
      db.execute(sql`SELECT pg_advisory_xact_lock(4001)`),
      db.execute(sql`SELECT pg_sleep(${SONO_S})`),
    ]);
    // Espera o lock 4001 estar de fato concedido (sem depender de um tempo fixo).
    let segurado = false;
    for (let i = 0; i < 30 && !segurado; i++) {
      const r = await db.execute(
        sql`SELECT 1 FROM pg_locks WHERE locktype = 'advisory' AND objid = 4001 AND granted`,
      );
      segurado = r.rows.length > 0;
      if (!segurado) await new Promise((res) => setTimeout(res, 100));
    }
    if (!segurado) {
      await segurando.catch(() => undefined);
      throw new Error("o batch concorrente não obteve o lock 4001 em 3 s");
    }
    const t0 = Date.now();
    const chaves = await expirarEnvios(db);
    const espera = Date.now() - t0;
    await segurando;
    expect(chaves).toHaveLength(1);
    expect(espera, "expirarEnvios deveria esperar o lock 4001").toBeGreaterThan(
      700,
    );
  });
});

describe("chavesConhecidas (T109, TL-12)", () => {
  it("devolve a união de produto_fotos e fotos_envio (todos os estados e idades)", async () => {
    await inserirProduto(db, cat1);
    await inserirProduto(db, cat1);
    await inserirEnvio(db, { enviadoPor: ana.email, estado: "emitido" });
    await inserirEnvio(db, {
      enviadoPor: ana.email,
      estado: "confirmado",
      idadeHoras: 30,
    });
    const conhecidas = await chavesConhecidas(db);
    expect(conhecidas).toBeInstanceOf(Set);
    expect([...conhecidas].sort()).toEqual(
      [...(await chavesDeProdutos()), ...(await chavesDeEnvios())].sort(),
    );
    expect(conhecidas.size).toBe(4);
  });

  it("vazio quando não há nada", async () => {
    expect((await chavesConhecidas(db)).size).toBe(0);
  });

  it("UM único statement: o db recebe exatamente 1 chamada de consulta", async () => {
    await inserirProduto(db, cat1);
    await inserirEnvio(db, { enviadoPor: ana.email });
    let chamadas = 0;
    const contado = new Proxy(db, {
      get(alvo, prop, receptor) {
        const valor = Reflect.get(alvo, prop, receptor);
        if (typeof valor !== "function") return valor;
        return (...args: unknown[]) => {
          chamadas += 1;
          return (valor as (...a: unknown[]) => unknown).apply(alvo, args);
        };
      },
    }) as Db;
    const conhecidas = await chavesConhecidas(contado);
    expect(conhecidas.size).toBe(2);
    expect(chamadas, "chavesConhecidas deve emitir um único statement").toBe(1);
  });
});

describe("limpeza concorrente com adoção (SC-008, FR-038, TL-12)", () => {
  it(
    "substituirConjunto (adoção) x chavesConhecidas x expirarEnvios: a chave adotada nunca some e fotos ficam intactas",
    async () => {
      for (let rodada = 0; rodada < RODADAS; rodada++) {
        await limparProdutos(db);
        await limparEnvios(db);
        const id = await inserirProduto(db, cat1);
        const c = await lerConjunto(db, id);
        if (!c) throw new Error("produto de teste não encontrado");
        const adotado = await inserirEnvio(db, {
          enviadoPor: ana.email,
          estado: "confirmado",
          idadeHoras: 23,
        });
        const jovem = await inserirEnvio(db, {
          enviadoPor: ana.email,
          estado: "emitido",
          idadeHoras: 1,
        });
        const expirado = await inserirEnvio(db, {
          enviadoPor: ana.email,
          estado: "confirmado",
          idadeHoras: 25,
        });

        const [adocao, conhecidas, expiradas] = await Promise.all([
          substituirConjunto(db, ana, {
            produtoId: id,
            fotosVersao: c.fotosVersao,
            atuais: c.fotos.map((f) => f.chave),
            novas: [
              ...c.fotos,
              {
                posicao: 2,
                chave: adotado.chave,
                enviadoPor: ana.email,
                enviadoEm: adotado.criadoEm,
              },
            ],
            envioId: adotado.id,
          }),
          chavesConhecidas(db),
          expirarEnvios(db),
        ]);

        expect(adocao.tipo, `rodada ${rodada}`).toBe("ok");
        expect(
          conhecidas.has(adotado.chave),
          `rodada ${rodada}: chave adotada ausente`,
        ).toBe(true);
        expect(conhecidas.has(jovem.chave)).toBe(true);
        expect(expiradas).toEqual([expirado.chave]);
        expect(expiradas).not.toContain(adotado.chave);
        expect(expiradas).not.toContain(jovem.chave);
        for (const f of c.fotos) expect(expiradas).not.toContain(f.chave);

        const fim = await lerConjunto(db, id);
        expect(fim?.fotos.map((f) => f.chave)).toEqual([
          ...c.fotos.map((f) => f.chave),
          adotado.chave,
        ]);
      }
    },
    TIMEOUT,
  );

  it(
    "inserirComFotos (adoção) x chavesConhecidas x expirarEnvios: idem",
    async () => {
      for (let rodada = 0; rodada < RODADAS; rodada++) {
        await limparProdutos(db);
        await limparEnvios(db);
        const adotado = await inserirEnvio(db, {
          enviadoPor: ana.email,
          estado: "confirmado",
          idadeHoras: 23,
        });
        const expirado = await inserirEnvio(db, {
          enviadoPor: ana.email,
          estado: "emitido",
          idadeHoras: 26,
        });

        const [cadastro, conhecidas, expiradas] = await Promise.all([
          inserirComFotos(
            db,
            ana,
            {
              nome: nomeUnicoProduto("Limpeza"),
              categoriaId: cat1,
              descricao: null,
              precoCentavos: 1000,
              aPartirDe: false,
            },
            [adotado.id],
          ),
          chavesConhecidas(db),
          expirarEnvios(db),
        ]);

        expect(cadastro.tipo, `rodada ${rodada}`).toBe("ok");
        expect(
          conhecidas.has(adotado.chave),
          `rodada ${rodada}: chave adotada ausente`,
        ).toBe(true);
        expect(expiradas).toEqual([expirado.chave]);
        expect(await chavesDeProdutos()).toEqual([adotado.chave]);
      }
    },
    TIMEOUT,
  );
});
