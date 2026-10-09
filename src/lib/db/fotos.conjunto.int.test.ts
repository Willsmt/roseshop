import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { AdminSession } from "@/lib/auth";
import { createDb } from "@/lib/db/client";
import { resetCategorias } from "@/test/db/categorias-fixtures";
import { contarEnvios, inserirEnvio, limparEnvios } from "@/test/db/fotos-fixtures";
import { inserirProduto, limparProdutos } from "@/test/db/produtos-fixtures";

import { type FotoLinha, lerConjunto, substituirConjunto } from "./fotos";

// Feature 004, T052 (SF5): contracts/fotos.md §2.3, US4-AC1-5 e US5-AC1/AC5. Integração com o banco local.
const db = createDb({
  DATABASE_URL: process.env.DATABASE_URL ?? "",
  NEON_FETCH_ENDPOINT: process.env.NEON_FETCH_ENDPOINT,
});
const ana: AdminSession = { email: "ana@teste.local", name: "Ana" };
const bia: AdminSession = { email: "bia@teste.local", name: "Bia" };
const AUTOR_ANTIGO = "antigo@teste.local";

let cat1 = 0;

type FotoRow = { posicao: number; chave_objeto: string };
async function fotosDe(produtoId: number): Promise<FotoRow[]> {
  const r = await db.execute(
    sql`SELECT posicao, chave_objeto FROM produto_fotos WHERE produto_id = ${produtoId} ORDER BY posicao`,
  );
  return r.rows as FotoRow[];
}

async function chavesDe(produtoId: number): Promise<string[]> {
  return (await fotosDe(produtoId)).map((f) => f.chave_objeto);
}

type LinhaProduto = {
  versao: number;
  fotos_versao: number;
  atualizado_por: string;
  atualizado_em: Date | string;
};
async function linhaProduto(id: number): Promise<LinhaProduto> {
  const r = await db.execute(
    sql`SELECT versao, fotos_versao, atualizado_por, atualizado_em FROM produtos WHERE id = ${id}`,
  );
  return (r.rows as LinhaProduto[])[0];
}

async function enviosRestantes(): Promise<string[]> {
  const r = await db.execute(sql`SELECT id::text AS id FROM fotos_envio`);
  return (r.rows as { id: string }[]).map((x) => x.id);
}

/** Foto de fixture direta no SQL (independente das funções testadas). */
async function adicionarFoto(produtoId: number, posicao: number): Promise<void> {
  await db.execute(
    sql`INSERT INTO produto_fotos (produto_id, posicao, chave_objeto, enviado_por, enviado_em)
        VALUES (${produtoId}, ${posicao}, ${`fotos/${randomUUID()}.webp`}, ${ana.email}, now())`,
  );
}

/** Produto com `qtd` fotos (1..3), autoria e data antigas para provar que a operação as atualiza. */
async function criar(qtd: 1 | 2 | 3): Promise<number> {
  const id = await inserirProduto(db, cat1, { criadoPor: ana.email }); // já nasce com a foto 1 (enviada por ana)
  for (let p = 2; p <= qtd; p++) await adicionarFoto(id, p);
  await db.execute(
    sql`UPDATE produtos SET atualizado_por = ${AUTOR_ANTIGO}, atualizado_em = '2020-01-01T00:00:00Z' WHERE id = ${id}`,
  );
  return id;
}

async function ler(id: number) {
  const c = await lerConjunto(db, id);
  if (!c) throw new Error("produto de teste não encontrado");
  return c;
}

const valido = (email = ana.email) => inserirEnvio(db, { enviadoPor: email, estado: "confirmado" });

/** Mesma montagem que a action faz para a linha vinda de um envio. */
function linhaDoEnvio(
  e: { chave: string; criadoEm: Date },
  posicao: number,
  email = ana.email,
): FotoLinha {
  return { posicao, chave: e.chave, enviadoPor: email, enviadoEm: e.criadoEm };
}

/** Reposiciona as linhas lidas (posicao = índice + 1). */
function reposicionar(fotos: FotoLinha[]): FotoLinha[] {
  return fotos.map((f, i) => ({ ...f, posicao: i + 1 }));
}

async function snapshot(id: number) {
  return {
    produto: await linhaProduto(id),
    fotos: await fotosDe(id),
    envios: await enviosRestantes(),
  };
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

describe("lerConjunto (T052)", () => {
  it("devolve fotosVersao e as fotos em ordem de posição, com enviadoPor e enviadoEm", async () => {
    const id = await criar(1);
    // inseridas fora de ordem para provar a ordenação
    await adicionarFoto(id, 3);
    await adicionarFoto(id, 2);
    const c = await ler(id);
    expect(c.fotosVersao).toBe(1);
    expect(c.fotos.map((f) => f.posicao)).toEqual([1, 2, 3]);
    expect(c.fotos.map((f) => f.chave)).toEqual(await chavesDe(id));
    for (const f of c.fotos) {
      expect(f.enviadoPor).toBe(ana.email);
      expect(f.enviadoEm).toBeInstanceOf(Date);
      expect(f.chave).toMatch(/^fotos\//);
    }
  });

  it("produto inexistente ⇒ undefined", async () => {
    expect(await lerConjunto(db, 987654)).toBeUndefined();
  });
});

describe("substituirConjunto: sucesso (T052, US4)", () => {
  it("US4-AC1: ok devolve fotosVersao+1, grava, não toca `versao` e atualiza autoria e data", async () => {
    const id = await criar(2);
    const c = await ler(id);
    const r = await substituirConjunto(db, ana, {
      produtoId: id,
      fotosVersao: c.fotosVersao,
      atuais: c.fotos.map((f) => f.chave),
      novas: reposicionar([c.fotos[1], c.fotos[0]]),
    });
    expect(r).toEqual({ tipo: "ok", fotosVersao: c.fotosVersao + 1 });
    const p = await linhaProduto(id);
    expect(p.fotos_versao).toBe(c.fotosVersao + 1);
    expect(p.versao).toBe(1);
    expect(p.atualizado_por).toBe(ana.email);
    expect(new Date(p.atualizado_em).getFullYear()).toBeGreaterThan(2020);
    expect((await ler(id)).fotosVersao).toBe(c.fotosVersao + 1);
  });

  it("US4-AC1: adicionar ⇒ a foto do envio entra na última posição; o envio é consumido", async () => {
    const id = await criar(2);
    const c = await ler(id);
    const e = await valido();
    const r = await substituirConjunto(db, ana, {
      produtoId: id,
      fotosVersao: c.fotosVersao,
      atuais: c.fotos.map((f) => f.chave),
      novas: [...c.fotos, linhaDoEnvio(e, 3)],
      envioId: e.id,
    });
    expect(r.tipo).toBe("ok");
    const depois = await ler(id);
    expect(depois.fotos.map((f) => f.posicao)).toEqual([1, 2, 3]);
    expect(depois.fotos.map((f) => f.chave)).toEqual([...c.fotos.map((f) => f.chave), e.chave]);
    expect(depois.fotos[2].enviadoPor).toBe(ana.email);
    expect(depois.fotos[2].enviadoEm.getTime()).toBe(e.criadoEm.getTime());
    expect(await enviosRestantes()).toEqual([]);
  });

  it("US4-AC2: trocar ⇒ a nova ocupa a mesma posição, a antiga sai e o envio é consumido", async () => {
    const id = await criar(3);
    const c = await ler(id);
    const e = await valido();
    const novas = c.fotos.map((f) => (f.posicao === 2 ? linhaDoEnvio(e, 2) : f));
    const r = await substituirConjunto(db, ana, {
      produtoId: id,
      fotosVersao: c.fotosVersao,
      atuais: c.fotos.map((f) => f.chave),
      novas,
      envioId: e.id,
    });
    expect(r.tipo).toBe("ok");
    expect(await chavesDe(id)).toEqual([c.fotos[0].chave, e.chave, c.fotos[2].chave]);
    expect(await chavesDe(id)).not.toContain(c.fotos[1].chave);
    expect(await enviosRestantes()).toEqual([]);
  });

  it("US4-AC3: remover ⇒ as seguintes sobem; posições 1..n sem buraco; nenhum envio consumido", async () => {
    const id = await criar(3);
    const c = await ler(id);
    const sobra = await valido();
    const r = await substituirConjunto(db, ana, {
      produtoId: id,
      fotosVersao: c.fotosVersao,
      atuais: c.fotos.map((f) => f.chave),
      novas: reposicionar([c.fotos[0], c.fotos[2]]),
    });
    expect(r.tipo).toBe("ok");
    const fotos = await fotosDe(id);
    expect(fotos.map((f) => f.posicao)).toEqual([1, 2]);
    expect(fotos.map((f) => f.chave_objeto)).toEqual([c.fotos[0].chave, c.fotos[2].chave]);
    expect(await enviosRestantes()).toEqual([sobra.id]);
  });

  it("US4-AC4: mover ⇒ reordena sem trocar o conjunto de chaves", async () => {
    const id = await criar(3);
    const c = await ler(id);
    const [a, b, d] = c.fotos;
    const r = await substituirConjunto(db, ana, {
      produtoId: id,
      fotosVersao: c.fotosVersao,
      atuais: c.fotos.map((f) => f.chave),
      novas: reposicionar([d, a, b]),
    });
    expect(r.tipo).toBe("ok");
    expect(await chavesDe(id)).toEqual([d.chave, a.chave, b.chave]);
  });

  it("US4-AC1/AC3: duas operações em sequência, cada uma com a versão devolvida pela anterior", async () => {
    const id = await criar(2);
    const c = await ler(id);
    const r1 = await substituirConjunto(db, ana, {
      produtoId: id,
      fotosVersao: c.fotosVersao,
      atuais: c.fotos.map((f) => f.chave),
      novas: reposicionar([c.fotos[1], c.fotos[0]]),
    });
    expect(r1).toEqual({ tipo: "ok", fotosVersao: 2 });
    const c2 = await ler(id);
    const r2 = await substituirConjunto(db, bia, {
      produtoId: id,
      fotosVersao: 2,
      atuais: c2.fotos.map((f) => f.chave),
      novas: reposicionar([c2.fotos[0]]),
    });
    expect(r2).toEqual({ tipo: "ok", fotosVersao: 3 });
    expect((await linhaProduto(id)).atualizado_por).toBe(bia.email);
  });
});

describe("substituirConjunto: recusas (T052, US4-AC5, US5-AC1/AC5)", () => {
  it("US5-AC1: fotosVersao diferente da do banco ⇒ alterado; nada muda", async () => {
    const id = await criar(2);
    const c = await ler(id);
    const antes = await snapshot(id);
    const r = await substituirConjunto(db, ana, {
      produtoId: id,
      fotosVersao: c.fotosVersao + 5,
      atuais: c.fotos.map((f) => f.chave),
      novas: reposicionar([c.fotos[0]]),
    });
    expect(r).toEqual({ tipo: "alterado" });
    expect(await snapshot(id)).toEqual(antes);
  });

  it("US5-AC1: `atuais` diferente das chaves do banco (mesma versão) ⇒ alterado; nada muda", async () => {
    const id = await criar(2);
    const c = await ler(id);
    const antes = await snapshot(id);
    const r = await substituirConjunto(db, ana, {
      produtoId: id,
      fotosVersao: c.fotosVersao,
      atuais: [c.fotos[0].chave, `fotos/${randomUUID()}.jpg`],
      novas: reposicionar([c.fotos[0]]),
    });
    expect(r).toEqual({ tipo: "alterado" });
    expect(await snapshot(id)).toEqual(antes);
  });

  it("US5-AC1: `atuais` na ordem trocada ⇒ alterado (a ordem faz parte do conjunto)", async () => {
    const id = await criar(2);
    const c = await ler(id);
    const antes = await snapshot(id);
    const r = await substituirConjunto(db, ana, {
      produtoId: id,
      fotosVersao: c.fotosVersao,
      atuais: [c.fotos[1].chave, c.fotos[0].chave],
      novas: reposicionar([c.fotos[0]]),
    });
    expect(r).toEqual({ tipo: "alterado" });
    expect(await snapshot(id)).toEqual(antes);
  });

  it("US5-AC5: produto inexistente ⇒ ausente", async () => {
    const e = await valido();
    const r = await substituirConjunto(db, ana, {
      produtoId: 987654,
      fotosVersao: 1,
      atuais: [`fotos/${randomUUID()}.jpg`],
      novas: [linhaDoEnvio(e, 1)],
      envioId: e.id,
    });
    expect(r).toEqual({ tipo: "ausente" });
    expect(await enviosRestantes()).toEqual([e.id]);
  });

  describe("US4-AC5: envio inválido ⇒ foto_expirada, sem consumir o envio e sem mudar o produto", () => {
    async function tentar(
      envio: { id: string; chave: string; criadoEm: Date },
      emailLinha = ana.email,
    ) {
      const id = await criar(1);
      const c = await ler(id);
      const antes = await snapshot(id);
      const r = await substituirConjunto(db, ana, {
        produtoId: id,
        fotosVersao: c.fotosVersao,
        atuais: c.fotos.map((f) => f.chave),
        novas: [...c.fotos, linhaDoEnvio(envio, 2, emailLinha)],
        envioId: envio.id,
      });
      expect(r).toEqual({ tipo: "foto_expirada" });
      expect(await snapshot(id)).toEqual(antes);
      return id;
    }

    it("envio de outra pessoa", async () => {
      const e = await valido(bia.email);
      await tentar(e, bia.email);
      expect(await enviosRestantes()).toEqual([e.id]);
    });

    it("envio apenas 'emitido' (não confirmado)", async () => {
      const e = await inserirEnvio(db, {
        enviadoPor: ana.email,
        estado: "emitido",
      });
      await tentar(e);
      expect(await enviosRestantes()).toEqual([e.id]);
    });

    it("envio com mais de 24 h", async () => {
      const e = await inserirEnvio(db, {
        enviadoPor: ana.email,
        estado: "confirmado",
        idadeHoras: 25,
      });
      await tentar(e);
      expect(await enviosRestantes()).toEqual([e.id]);
    });

    it("envio inexistente", async () => {
      const fantasma = {
        id: randomUUID(),
        chave: `fotos/${randomUUID()}.webp`,
        criadoEm: new Date(),
      };
      await tentar(fantasma);
      expect(await contarEnvios(db)).toBe(0);
    });

    it("envio já consumido por uma operação anterior", async () => {
      const id = await criar(1);
      const c = await ler(id);
      const e = await valido();
      const a = await substituirConjunto(db, ana, {
        produtoId: id,
        fotosVersao: c.fotosVersao,
        atuais: c.fotos.map((f) => f.chave),
        novas: [...c.fotos, linhaDoEnvio(e, 2)],
        envioId: e.id,
      });
      expect(a.tipo).toBe("ok");
      const c2 = await ler(id);
      const antes = await snapshot(id);
      const b = await substituirConjunto(db, ana, {
        produtoId: id,
        fotosVersao: c2.fotosVersao,
        atuais: c2.fotos.map((f) => f.chave),
        novas: [...c2.fotos.slice(0, 1), linhaDoEnvio(e, 2)],
        envioId: e.id,
      });
      expect(b).toEqual({ tipo: "foto_expirada" });
      expect(await snapshot(id)).toEqual(antes);
    });
  });

  it("precedência: versão errada E envio inválido ⇒ alterado (não foto_expirada)", async () => {
    const id = await criar(1);
    const c = await ler(id);
    const alheio = await valido(bia.email);
    const antes = await snapshot(id);
    const r = await substituirConjunto(db, ana, {
      produtoId: id,
      fotosVersao: c.fotosVersao + 1,
      atuais: c.fotos.map((f) => f.chave),
      novas: [...c.fotos, linhaDoEnvio(alheio, 2, bia.email)],
      envioId: alheio.id,
    });
    expect(r).toEqual({ tipo: "alterado" });
    expect(await snapshot(id)).toEqual(antes);
  });

  it("precedência: produto inexistente E envio inválido ⇒ ausente", async () => {
    const alheio = await valido(bia.email);
    const r = await substituirConjunto(db, ana, {
      produtoId: 987654,
      fotosVersao: 1,
      atuais: [`fotos/${randomUUID()}.jpg`],
      novas: [linhaDoEnvio(alheio, 1, bia.email)],
      envioId: alheio.id,
    });
    expect(r).toEqual({ tipo: "ausente" });
  });
});

describe("substituirConjunto: entrada inválida é bug de chamador (lança e não toca o banco)", () => {
  async function tentarInvalida(montar: (c: Awaited<ReturnType<typeof ler>>) => FotoLinha[]) {
    const id = await criar(3);
    const c = await ler(id);
    const antes = await snapshot(id);
    await expect(
      substituirConjunto(db, ana, {
        produtoId: id,
        fotosVersao: c.fotosVersao,
        atuais: c.fotos.map((f) => f.chave),
        novas: montar(c),
      }),
    ).rejects.toThrow();
    expect(await snapshot(id)).toEqual(antes);
  }

  it("0 fotos em `novas`", async () => {
    await tentarInvalida(() => []);
  });

  it("4 fotos em `novas`", async () => {
    await tentarInvalida((c) => {
      const extra: FotoLinha = {
        posicao: 4,
        chave: `fotos/${randomUUID()}.jpg`,
        enviadoPor: ana.email,
        enviadoEm: new Date(),
      };
      return [...c.fotos, extra];
    });
  });

  it("posições com buraco (1 e 3)", async () => {
    await tentarInvalida((c) => [c.fotos[0], { ...c.fotos[2], posicao: 3 }]);
  });

  it("posições repetidas (1 e 1)", async () => {
    await tentarInvalida((c) => [c.fotos[0], { ...c.fotos[1], posicao: 1 }]);
  });

  it("posições fora de ordem (2 e 1)", async () => {
    await tentarInvalida((c) => [
      { ...c.fotos[0], posicao: 2 },
      { ...c.fotos[1], posicao: 1 },
    ]);
  });

  it("posições começando em 0", async () => {
    await tentarInvalida((c) => [
      { ...c.fotos[0], posicao: 0 },
      { ...c.fotos[1], posicao: 1 },
    ]);
  });

  it("chaves repetidas", async () => {
    await tentarInvalida((c) => [c.fotos[0], { ...c.fotos[0], posicao: 2 }]);
  });
});

describe("chave nova amarrada ao envio (achado 1, opção ii)", () => {
  const inventada = (posicao: number): FotoLinha => ({
    posicao,
    chave: `fotos/${randomUUID()}.webp`,
    enviadoPor: ana.email,
    enviadoEm: new Date(),
  });

  /** Produto com 1 foto, já lido, para os casos de chave nova. */
  async function cenario() {
    const id = await criar(1);
    const c = await ler(id);
    return { id, c, atuais: c.fotos.map((f) => f.chave) };
  }

  it("com envioId = E, `novas` traz a chave de OUTRO envio válido F (não a de E) ⇒ lança; E e F continuam", async () => {
    const { id, c, atuais } = await cenario();
    const e = await valido();
    const f = await valido();
    const antes = await snapshot(id);
    await expect(
      substituirConjunto(db, ana, {
        produtoId: id,
        fotosVersao: c.fotosVersao,
        atuais,
        novas: [...c.fotos, linhaDoEnvio(f, 2)],
        envioId: e.id,
      }),
    ).rejects.toThrow(/chave nova/);
    expect(await snapshot(id)).toEqual(antes);
    expect((await enviosRestantes()).sort()).toEqual([e.id, f.id].sort());
  });

  it("com envioId = E, `novas` traz a chave de um envio apenas 'emitido' G ⇒ lança; E e G continuam", async () => {
    const { id, c, atuais } = await cenario();
    const e = await valido();
    const g = await inserirEnvio(db, { enviadoPor: ana.email, estado: "emitido" });
    const antes = await snapshot(id);
    await expect(
      substituirConjunto(db, ana, {
        produtoId: id,
        fotosVersao: c.fotosVersao,
        atuais,
        novas: [...c.fotos, linhaDoEnvio(g, 2)],
        envioId: e.id,
      }),
    ).rejects.toThrow(/chave nova/);
    expect(await snapshot(id)).toEqual(antes);
    expect((await enviosRestantes()).sort()).toEqual([e.id, g.id].sort());
  });

  it("com envioId = E, `novas` traz uma chave inventada no formato certo ⇒ lança; E não é consumido", async () => {
    const { id, c, atuais } = await cenario();
    const e = await valido();
    const antes = await snapshot(id);
    await expect(
      substituirConjunto(db, ana, {
        produtoId: id,
        fotosVersao: c.fotosVersao,
        atuais,
        novas: [...c.fotos, inventada(2)],
        envioId: e.id,
      }),
    ).rejects.toThrow(/chave nova/);
    expect(await snapshot(id)).toEqual(antes);
    expect(await enviosRestantes()).toEqual([e.id]);
  });

  it("com envioId = E válido, mas `novas` só com as atuais (chave de E ausente) ⇒ lança; E não é consumido", async () => {
    const id = await criar(2);
    const c = await ler(id);
    const atuais = c.fotos.map((f) => f.chave);
    const e = await valido();
    for (const novas of [reposicionar([c.fotos[1], c.fotos[0]]), reposicionar([c.fotos[0]])]) {
      const antes = await snapshot(id);
      await expect(
        substituirConjunto(db, ana, {
          produtoId: id,
          fotosVersao: c.fotosVersao,
          atuais,
          novas,
          envioId: e.id,
        }),
      ).rejects.toThrow(/chave nova/);
      expect(await snapshot(id)).toEqual(antes);
      expect(await enviosRestantes()).toEqual([e.id]);
    }
  });

  it("sem envioId, `novas` traz uma chave inventada no formato certo (troca sem envio) ⇒ lança", async () => {
    const id = await criar(2);
    const c = await ler(id);
    const antes = await snapshot(id);
    await expect(
      substituirConjunto(db, ana, {
        produtoId: id,
        fotosVersao: c.fotosVersao,
        atuais: c.fotos.map((f) => f.chave),
        novas: [c.fotos[0], inventada(2)],
      }),
    ).rejects.toThrow(/chave nova/);
    expect(await snapshot(id)).toEqual(antes);
  });

  it("sem envioId, `novas` traz a chave de um envio válido E (sem informar o envioId) ⇒ lança; E continua", async () => {
    const { id, c, atuais } = await cenario();
    const e = await valido();
    const antes = await snapshot(id);
    await expect(
      substituirConjunto(db, ana, {
        produtoId: id,
        fotosVersao: c.fotosVersao,
        atuais,
        novas: [...c.fotos, linhaDoEnvio(e, 2)],
      }),
    ).rejects.toThrow(/chave nova/);
    expect(await snapshot(id)).toEqual(antes);
    expect(await enviosRestantes()).toEqual([e.id]);
  });

  it("sem envioId, `novas` traz a chave de uma foto de OUTRO produto ⇒ lança; os dois produtos intactos", async () => {
    const { id, c, atuais } = await cenario();
    const outro = await criar(1);
    const co = await ler(outro);
    const antes = await snapshot(id);
    const antesOutro = await snapshot(outro);
    await expect(
      substituirConjunto(db, ana, {
        produtoId: id,
        fotosVersao: c.fotosVersao,
        atuais,
        novas: [...c.fotos, { ...co.fotos[0], posicao: 2 }],
      }),
    ).rejects.toThrow(/chave nova/);
    expect(await snapshot(id)).toEqual(antes);
    expect(await snapshot(outro)).toEqual(antesOutro);
  });

  it("precedência: envio 'emitido' + chave inventada ⇒ resolve foto_expirada (não lança)", async () => {
    const { id, c, atuais } = await cenario();
    const g = await inserirEnvio(db, { enviadoPor: ana.email, estado: "emitido" });
    const antes = await snapshot(id);
    const r = await substituirConjunto(db, ana, {
      produtoId: id,
      fotosVersao: c.fotosVersao,
      atuais,
      novas: [...c.fotos, inventada(2)],
      envioId: g.id,
    });
    expect(r).toEqual({ tipo: "foto_expirada" });
    expect(await snapshot(id)).toEqual(antes);
  });

  it("precedência: fotosVersao errada + chave inventada ⇒ resolve alterado (não lança)", async () => {
    const { id, c, atuais } = await cenario();
    const antes = await snapshot(id);
    const r = await substituirConjunto(db, ana, {
      produtoId: id,
      fotosVersao: c.fotosVersao + 3,
      atuais,
      novas: [...c.fotos, inventada(2)],
    });
    expect(r).toEqual({ tipo: "alterado" });
    expect(await snapshot(id)).toEqual(antes);
  });
});
