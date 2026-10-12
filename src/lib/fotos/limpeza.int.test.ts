import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import type { AdminSession } from "@/lib/auth";
import { createDb } from "@/lib/db/client";
import { lerConjunto, substituirConjunto } from "@/lib/db/fotos";
import { resetCategorias } from "@/test/db/categorias-fixtures";
import { inserirEnvio, limparEnvios } from "@/test/db/fotos-fixtures";
import { inserirProduto, limparProdutos } from "@/test/db/produtos-fixtures";

// Feature 004, T110 (SF12): executarLimpeza com banco real e bucket falso (contracts/fotos.md §6).
// US6-AC1/AC3-AC6, SC-008, FR-038. Integração; roda em série com os demais.
const b = vi.hoisted(() => ({
  objetos: new Map<string, Date>(),
  eventos: [] as string[],
  lotes: [] as string[][],
  falharNoLote: (() => false) as (n: number) => boolean,
  duranteListagem: undefined as undefined | (() => Promise<void>),
}));

vi.mock("@/lib/db/contexto", async () => {
  const { createDb: criar } = await import("@/lib/db/client");
  const db = criar({
    DATABASE_URL: process.env.DATABASE_URL ?? "",
    NEON_FETCH_ENDPOINT: process.env.NEON_FETCH_ENDPOINT,
  });
  return { dbDoContexto: async () => db };
});

vi.mock("@/lib/db/fotos", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/db/fotos")>();
  return {
    ...original,
    chavesConhecidas: async (
      ...args: Parameters<typeof original.chavesConhecidas>
    ) => {
      b.eventos.push("conhecidas");
      return original.chavesConhecidas(...args);
    },
  };
});

vi.mock("@/lib/r2", () => ({
  async *listarObjetos(prefixo: string) {
    b.eventos.push("listar:inicio");
    const vistos = new Set<string>();
    let primeiro = true;
    for (;;) {
      const proximo = [...b.objetos.entries()]
        .filter(([k]) => k.startsWith(prefixo) && !vistos.has(k))
        .sort(([x], [y]) => x.localeCompare(y))[0];
      if (!proximo) break;
      vistos.add(proximo[0]);
      yield { chave: proximo[0], uploaded: proximo[1] };
      if (primeiro && b.duranteListagem) {
        primeiro = false;
        await b.duranteListagem();
      }
    }
    b.eventos.push("listar:fim");
  },
  async apagarObjetos(chaves: string[]) {
    b.eventos.push("apagar");
    b.lotes.push([...chaves]);
    if (b.falharNoLote(b.lotes.length)) {
      throw new Error(`falha simulada no R2 para ${chaves[0]}`);
    }
    for (const c of chaves) b.objetos.delete(c);
  },
}));

import { executarLimpeza } from "./limpeza";

const db = createDb({
  DATABASE_URL: process.env.DATABASE_URL ?? "",
  NEON_FETCH_ENDPOINT: process.env.NEON_FETCH_ENDPOINT,
});
const ana: AdminSession = { email: "ana@teste.local", name: "Ana" };
const HORA = 3_600_000;
const TIMEOUT = 120_000;

let cat1 = 0;
let agora = new Date();
let logs: ReturnType<typeof vi.spyOn>[] = [];

const haHoras = (h: number) => new Date(agora.getTime() - h * HORA);
const chaveSolta = () => `fotos/${randomUUID()}.webp`;

function logado(): string {
  return logs.map((s) => JSON.stringify(s.mock.calls)).join("\n");
}

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
  b.objetos.clear();
  b.eventos.length = 0;
  b.lotes.length = 0;
  b.falharNoLote = () => false;
  b.duranteListagem = undefined;
  agora = new Date();
  logs = (["log", "warn", "error", "info"] as const).map((n) =>
    vi.spyOn(console, n).mockImplementation(() => {}),
  );
});
afterEach(() => {
  vi.restoreAllMocks();
});
afterAll(async () => {
  await limparProdutos(db);
  await limparEnvios(db);
  await resetCategorias(db);
});

async function chaveDoProduto(id: number): Promise<string> {
  const r = await db.execute(
    sql`SELECT chave_objeto FROM produto_fotos WHERE produto_id = ${id}`,
  );
  return (r.rows as { chave_objeto: string }[])[0].chave_objeto;
}

describe("executarLimpeza (T110)", () => {
  it("(a) US6-AC1: apaga os objetos dos envios expirados (emitido e confirmado) e conta; mantém o envio jovem", async () => {
    const e1 = await inserirEnvio(db, {
      enviadoPor: ana.email,
      estado: "emitido",
      idadeHoras: 25,
    });
    const e2 = await inserirEnvio(db, {
      enviadoPor: ana.email,
      estado: "confirmado",
      idadeHoras: 30,
    });
    const jovem = await inserirEnvio(db, {
      enviadoPor: ana.email,
      estado: "confirmado",
      idadeHoras: 1,
    });
    // uploaded recente: só o caminho (a) pode apagar estes
    for (const e of [e1, e2, jovem]) b.objetos.set(e.chave, haHoras(1));

    const r = await executarLimpeza(agora);

    expect(r).toEqual({ enviosExpirados: 2, orfaosApagados: 0, falhas: 0 });
    expect(b.objetos.has(e1.chave)).toBe(false);
    expect(b.objetos.has(e2.chave)).toBe(false);
    expect(b.objetos.has(jovem.chave)).toBe(true);
  });

  it("(a) envio expirado sem objeto no bucket não é erro e é contado", async () => {
    await inserirEnvio(db, {
      enviadoPor: ana.email,
      estado: "emitido",
      idadeHoras: 40,
    });
    const r = await executarLimpeza(agora);
    expect(r).toEqual({ enviosExpirados: 1, orfaosApagados: 0, falhas: 0 });
  });

  it("(b) US6-AC3: órfão com uploaded < agora - 25 h e fora das tabelas é apagado e contado", async () => {
    const orfao = chaveSolta();
    b.objetos.set(orfao, haHoras(26));
    const r = await executarLimpeza(agora);
    expect(r).toEqual({ enviosExpirados: 0, orfaosApagados: 1, falhas: 0 });
    expect(b.objetos.has(orfao)).toBe(false);
  });

  it("(b) US6-AC4: órfão recente (24 h) e o limite exato de 25 h são mantidos (comparação estrita)", async () => {
    const recente = chaveSolta();
    const limite = chaveSolta();
    b.objetos.set(recente, haHoras(24));
    b.objetos.set(limite, haHoras(25));
    const r = await executarLimpeza(agora);
    expect(r).toEqual({ enviosExpirados: 0, orfaosApagados: 0, falhas: 0 });
    expect(b.objetos.has(recente)).toBe(true);
    expect(b.objetos.has(limite)).toBe(true);
  });

  it("(b) US6-AC6/FR-038: objeto de produto existente com 30 dias é mantido", async () => {
    const id = await inserirProduto(db, cat1);
    const chave = await chaveDoProduto(id);
    b.objetos.set(chave, haHoras(24 * 30));
    const r = await executarLimpeza(agora);
    expect(r.orfaosApagados).toBe(0);
    expect(b.objetos.has(chave)).toBe(true);
  });

  it("(b) objeto de envio < 24 h é mantido mesmo com uploaded antigo", async () => {
    const e = await inserirEnvio(db, {
      enviadoPor: ana.email,
      estado: "confirmado",
      idadeHoras: 23,
    });
    b.objetos.set(e.chave, haHoras(40));
    const r = await executarLimpeza(agora);
    expect(r).toEqual({ enviosExpirados: 0, orfaosApagados: 0, falhas: 0 });
    expect(b.objetos.has(e.chave)).toBe(true);
  });

  it("chavesConhecidas é lida DEPOIS de terminar a listagem; nunca apagarObjetos([])", async () => {
    b.objetos.set(chaveSolta(), haHoras(30));
    await executarLimpeza(agora);
    const fim = b.eventos.indexOf("listar:fim");
    const conhecidas = b.eventos.indexOf("conhecidas");
    expect(fim).toBeGreaterThanOrEqual(0);
    expect(conhecidas).toBeGreaterThan(fim);
    expect(b.lotes.every((l) => l.length > 0)).toBe(true);
  });

  it("sem nada a apagar não chama apagarObjetos", async () => {
    const r = await executarLimpeza(agora);
    expect(r).toEqual({ enviosExpirados: 0, orfaosApagados: 0, falhas: 0 });
    expect(b.lotes).toEqual([]);
  });

  it("envio registrado DURANTE a listagem é respeitado (leitura das tabelas só depois de listar)", async () => {
    b.objetos.set(
      "fotos/00000000-0000-4000-8000-000000000000.webp",
      haHoras(50),
    ); // 1º da fila
    let tardio = "";
    b.duranteListagem = async () => {
      const e = await inserirEnvio(db, {
        enviadoPor: ana.email,
        estado: "emitido",
        idadeHoras: 0,
      });
      tardio = e.chave;
      b.objetos.set(tardio, haHoras(30)); // aparece na listagem já com uploaded antigo
    };
    const r = await executarLimpeza(agora);
    expect(tardio).not.toBe("");
    expect(
      b.objetos.has(tardio),
      "objeto do envio registrado durante a listagem foi apagado",
    ).toBe(true);
    expect(r.orfaosApagados).toBe(1); // só o primeiro, que é órfão de verdade
  });

  it("mais de 1000 candidatos ⇒ lotes de no máximo 1000", async () => {
    for (let i = 0; i < 2500; i++) b.objetos.set(chaveSolta(), haHoras(30));
    const r = await executarLimpeza(agora);
    expect(r).toEqual({ enviosExpirados: 0, orfaosApagados: 2500, falhas: 0 });
    expect(b.lotes.length).toBeGreaterThanOrEqual(3);
    expect(Math.max(...b.lotes.map((l) => l.length))).toBeLessThanOrEqual(1000);
    expect(b.lotes.reduce((s, l) => s + l.length, 0)).toBe(2500);
    expect(b.objetos.size).toBe(0);
  });

  it("lote que falha não impede os outros e soma o nº de chaves dele em falhas", async () => {
    for (let i = 0; i < 2500; i++) b.objetos.set(chaveSolta(), haHoras(30));
    b.falharNoLote = (n) => n === 2;
    const r = await executarLimpeza(agora);
    expect(b.lotes.map((l) => l.length)).toEqual([1000, 1000, 500]);
    expect(r).toEqual({
      enviosExpirados: 0,
      orfaosApagados: 1500,
      falhas: 1000,
    });
    expect(b.objetos.size).toBe(1000);
    expect(
      logs[1].mock.calls.length,
      "console.warn da falha",
    ).toBeGreaterThanOrEqual(1);
  });

  it("falha no delete dos expirados (a) conta em falhas, segue para (b) e ainda conta enviosExpirados", async () => {
    await inserirEnvio(db, {
      enviadoPor: ana.email,
      estado: "emitido",
      idadeHoras: 30,
    });
    const orfao = chaveSolta();
    b.objetos.set(orfao, haHoras(30));
    b.falharNoLote = (n) => n === 1;
    const r = await executarLimpeza(agora);
    expect(r).toEqual({ enviosExpirados: 1, orfaosApagados: 1, falhas: 1 });
    expect(b.objetos.has(orfao)).toBe(false);
  });

  it("expirado com objeto antigo cujo delete falha em (a): não é tentado de novo em (b); conta só em falhas", async () => {
    const e = await inserirEnvio(db, {
      enviadoPor: ana.email,
      estado: "emitido",
      idadeHoras: 30,
    });
    b.objetos.set(e.chave, haHoras(40));
    b.falharNoLote = (n) => n === 1;
    const r = await executarLimpeza(agora);
    expect(r).toEqual({ enviosExpirados: 1, orfaosApagados: 0, falhas: 1 });
    expect(b.objetos.has(e.chave)).toBe(true);
    expect(b.lotes.filter((l) => l.includes(e.chave))).toHaveLength(1);
  });

  it("log: um console.log JSON com as contagens e NENHUM log contém chave de objeto", async () => {
    const e = await inserirEnvio(db, {
      enviadoPor: ana.email,
      estado: "emitido",
      idadeHoras: 30,
    });
    b.objetos.set(e.chave, haHoras(30));
    for (let i = 0; i < 1500; i++) b.objetos.set(chaveSolta(), haHoras(30));
    b.falharNoLote = (n) => n === 2;
    const r = await executarLimpeza(agora);
    const [log] = logs;
    expect(log.mock.calls).toEqual([
      [JSON.stringify({ evento: "limpeza", ...r })],
    ]);
    expect(logado()).not.toContain("fotos/");
    expect(r.falhas).toBeGreaterThan(0);
  });

  it(
    "SC-008: em paralelo com adoções de envios válidos nunca apaga objeto de produto_fotos nem de envio < 24 h",
    async () => {
      for (let rodada = 0; rodada < 5; rodada++) {
        await limparProdutos(db);
        await limparEnvios(db);
        b.objetos.clear();
        agora = new Date();

        const id = await inserirProduto(db, cat1);
        const c = await lerConjunto(db, id);
        if (!c) throw new Error("produto de teste não encontrado");
        b.objetos.set(c.fotos[0].chave, haHoras(24 * 30));
        const adotado = await inserirEnvio(db, {
          enviadoPor: ana.email,
          estado: "confirmado",
          idadeHoras: 23,
        });
        const jovem = await inserirEnvio(db, {
          enviadoPor: ana.email,
          estado: "emitido",
          idadeHoras: 2,
        });
        const expirado = await inserirEnvio(db, {
          enviadoPor: ana.email,
          estado: "confirmado",
          idadeHoras: 26,
        });
        const orfao = chaveSolta();
        b.objetos.set(adotado.chave, haHoras(40));
        b.objetos.set(jovem.chave, haHoras(40));
        b.objetos.set(expirado.chave, haHoras(40));
        b.objetos.set(orfao, haHoras(40));

        const [r, adocao] = await Promise.all([
          executarLimpeza(agora),
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
        ]);

        expect(adocao.tipo, `rodada ${rodada}`).toBe("ok");
        const emProduto = (
          await db.execute(sql`SELECT chave_objeto FROM produto_fotos`)
        ).rows.map((x) => (x as { chave_objeto: string }).chave_objeto);
        const emEnvioJovem = (
          await db.execute(
            sql`SELECT chave FROM fotos_envio WHERE criado_em > now() - interval '24 hours'`,
          )
        ).rows.map((x) => (x as { chave: string }).chave);
        for (const k of [...emProduto, ...emEnvioJovem]) {
          expect(
            b.objetos.has(k),
            `rodada ${rodada}: objeto vivo apagado`,
          ).toBe(true);
        }
        expect(emProduto).toContain(adotado.chave);
        expect(b.objetos.has(expirado.chave)).toBe(false);
        expect(b.objetos.has(orfao)).toBe(false);
        expect(r.enviosExpirados).toBe(1);
        expect(r.falhas).toBe(0);
      }
    },
    TIMEOUT,
  );
});
