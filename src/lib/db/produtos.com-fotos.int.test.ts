import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { AdminSession } from "@/lib/auth";
import { createDb } from "@/lib/db/client";
import { resetCategorias } from "@/test/db/categorias-fixtures";
import { contarEnvios, inserirEnvio, limparEnvios } from "@/test/db/fotos-fixtures";
import { inserirProduto, limparProdutos, nomeUnicoProduto } from "@/test/db/produtos-fixtures";

import { inserirComFotos, listar, obterPorId, remover } from "./produtos";

// Feature 004, T044 e T045 (SF4): contracts/fotos.md §2.2, §2.4, §2.5. Integração com o banco local.
const db = createDb({
  DATABASE_URL: process.env.DATABASE_URL ?? "",
  NEON_FETCH_ENDPOINT: process.env.NEON_FETCH_ENDPOINT,
});
const ana: AdminSession = { email: "ana@teste.local", name: "Ana" };
const bia: AdminSession = { email: "bia@teste.local", name: "Bia" };

let cat1 = 0;

function campos(extra: Partial<Parameters<typeof inserirComFotos>[2]> = {}) {
  return {
    nome: nomeUnicoProduto(),
    categoriaId: cat1,
    descricao: null,
    precoCentavos: 1500,
    aPartirDe: false,
    ...extra,
  };
}

async function n(tabela: "produtos" | "produto_fotos"): Promise<number> {
  const r = await db.execute(sql.raw(`SELECT count(*)::int AS n FROM ${tabela}`));
  return (r.rows as { n: number }[])[0].n;
}

async function estado() {
  return { produtos: await n("produtos"), fotos: await n("produto_fotos"), envios: await contarEnvios(db) };
}

type FotoRow = { posicao: number; chave_objeto: string; enviado_por: string; enviado_em: string };
async function fotosDe(produtoId: number): Promise<FotoRow[]> {
  const r = await db.execute(
    sql`SELECT posicao, chave_objeto, enviado_por, enviado_em::text AS enviado_em
        FROM produto_fotos WHERE produto_id = ${produtoId} ORDER BY posicao`,
  );
  return r.rows as FotoRow[];
}

async function enviosRestantes(): Promise<string[]> {
  const r = await db.execute(sql`SELECT id::text AS id FROM fotos_envio`);
  return (r.rows as { id: string }[]).map((x) => x.id);
}

async function linhaProduto(id: number) {
  const r = await db.execute(
    sql`SELECT criado_por, atualizado_por, versao, fotos_versao FROM produtos WHERE id = ${id}`,
  );
  return (r.rows as { criado_por: string; atualizado_por: string; versao: number; fotos_versao: number }[])[0];
}

const valido = (email = ana.email) => inserirEnvio(db, { enviadoPor: email, estado: "confirmado" });

/** Foto de fixture direta no SQL (independente de inserirComFotos). */
async function adicionarFoto(produtoId: number, posicao: number): Promise<string> {
  const chave = `fotos/${randomUUID()}.webp`;
  await db.execute(
    sql`INSERT INTO produto_fotos (produto_id, posicao, chave_objeto, enviado_por, enviado_em)
        VALUES (${produtoId}, ${posicao}, ${chave}, ${ana.email}, now())`,
  );
  return chave;
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
  await limparEnvios(db);
  await resetCategorias(db);
});

describe("inserirComFotos (T044, US1)", () => {
  it.each([1, 2, 3])("US1-AC7: %i foto(s) ⇒ posições 1..N na ordem dos envioIds; envios consumidos", async (qtd) => {
    // criados em uma ordem e adotados em ordem diferente (inversa)
    const criados = [];
    for (let i = 0; i < qtd; i++) criados.push(await valido());
    const ordem = [...criados].reverse();
    const c = campos();
    const r = await inserirComFotos(db, ana, c, ordem.map((e) => e.id));
    expect(r.tipo).toBe("ok");
    if (r.tipo !== "ok") return;

    const fotos = await fotosDe(r.id);
    expect(fotos.map((f) => f.posicao)).toEqual(Array.from({ length: qtd }, (_, i) => i + 1));
    expect(fotos.map((f) => f.chave_objeto)).toEqual(ordem.map((e) => e.chave));
    for (let i = 0; i < qtd; i++) {
      expect(fotos[i].enviado_por).toBe(ana.email);
      expect(new Date(fotos[i].enviado_em).getTime()).toBe(ordem[i].criadoEm.getTime());
    }
    expect(await enviosRestantes()).toEqual([]);

    const p = await linhaProduto(r.id);
    expect(p).toMatchObject({ criado_por: ana.email, atualizado_por: ana.email, versao: 1, fotos_versao: 1 });
  });

  it("US1-AC8: envio de outra pessoa ⇒ foto_expirada com esse id; nada criado; envio da outra intacto", async () => {
    const meu = await valido(ana.email);
    const alheio = await valido(bia.email);
    const antes = await estado();
    const r = await inserirComFotos(db, ana, campos(), [meu.id, alheio.id]);
    expect(r).toEqual({ tipo: "foto_expirada", envioIds: [alheio.id] });
    expect(await estado()).toEqual(antes);
    expect((await enviosRestantes()).sort()).toEqual([meu.id, alheio.id].sort());
  });

  it("US1-AC8: envio apenas 'emitido' (não confirmado) ⇒ foto_expirada", async () => {
    const e = await inserirEnvio(db, { enviadoPor: ana.email, estado: "emitido" });
    const antes = await estado();
    expect(await inserirComFotos(db, ana, campos(), [e.id])).toEqual({ tipo: "foto_expirada", envioIds: [e.id] });
    expect(await estado()).toEqual(antes);
  });

  it("US1-AC8: envio com mais de 24 h ⇒ foto_expirada", async () => {
    const e = await inserirEnvio(db, { enviadoPor: ana.email, estado: "confirmado", idadeHoras: 25 });
    const antes = await estado();
    expect(await inserirComFotos(db, ana, campos(), [e.id])).toEqual({ tipo: "foto_expirada", envioIds: [e.id] });
    expect(await estado()).toEqual(antes);
  });

  it("US1-AC8: id de envio inexistente ⇒ foto_expirada", async () => {
    const id = randomUUID();
    expect(await inserirComFotos(db, ana, campos(), [id])).toEqual({ tipo: "foto_expirada", envioIds: [id] });
    expect(await n("produtos")).toBe(0);
  });

  it("US1-AC8: adoção só uma vez; o mesmo envio num segundo cadastro (outro nome) ⇒ foto_expirada", async () => {
    const e = await valido();
    const a = await inserirComFotos(db, ana, campos(), [e.id]);
    expect(a.tipo).toBe("ok");
    const antes = await estado();
    const b = await inserirComFotos(db, ana, campos(), [e.id]);
    expect(b).toEqual({ tipo: "foto_expirada", envioIds: [e.id] });
    expect(await estado()).toEqual(antes);
  });

  it("US1-AC8: foto_expirada devolve EXATAMENTE os ids não válidos, na ordem dada; válidos não são consumidos", async () => {
    const ok = await valido();
    const alheio = await valido(bia.email);
    const expirado = await inserirEnvio(db, { enviadoPor: ana.email, estado: "confirmado", idadeHoras: 30 });
    const antes = await estado();
    const r = await inserirComFotos(db, ana, campos(), [expirado.id, ok.id, alheio.id]);
    expect(r).toEqual({ tipo: "foto_expirada", envioIds: [expirado.id, alheio.id] });
    expect(await estado()).toEqual(antes);
    expect(await enviosRestantes()).toContain(ok.id);
  });

  it("precedência: nome já existente E envio inválido ⇒ nome_repetido com codigoExistente", async () => {
    const existente = await inserirProduto(db, cat1, { nome: "Bolsa Repetida" });
    const expirado = await inserirEnvio(db, { enviadoPor: ana.email, estado: "confirmado", idadeHoras: 30 });
    const r = await inserirComFotos(db, ana, campos({ nome: "bolsá repetida" }), [expirado.id]);
    expect(r).toEqual({ tipo: "nome_repetido", codigoExistente: existente });
    expect(await n("produtos")).toBe(1);
  });

  it("duplo Salvar em sequência (mesmos campos e envioIds) ⇒ 2ª nome_repetido com codigoExistente = id da 1ª", async () => {
    const e1 = await valido();
    const e2 = await valido();
    const c = campos();
    const a = await inserirComFotos(db, ana, c, [e1.id, e2.id]);
    expect(a.tipo).toBe("ok");
    if (a.tipo !== "ok") return;
    const b = await inserirComFotos(db, ana, c, [e1.id, e2.id]);
    expect(b).toEqual({ tipo: "nome_repetido", codigoExistente: a.id });
    expect(await n("produtos")).toBe(1);
    expect(await n("produto_fotos")).toBe(2);
  });

  it("duplo Salvar concorrente (Promise.all) ⇒ uma ok e outra nome_repetido; um produto, fotos sem duplicar", async () => {
    const e1 = await valido();
    const e2 = await valido();
    const c = campos();
    const [x, y] = await Promise.all([
      inserirComFotos(db, ana, c, [e1.id, e2.id]),
      inserirComFotos(db, ana, c, [e1.id, e2.id]),
    ]);
    const tipos = [x.tipo, y.tipo].sort();
    expect(tipos).toEqual(["nome_repetido", "ok"]);
    const ok = [x, y].find((r) => r.tipo === "ok");
    const rep = [x, y].find((r) => r.tipo === "nome_repetido");
    expect(rep).toEqual({ tipo: "nome_repetido", codigoExistente: ok && ok.tipo === "ok" ? ok.id : -1 });
    expect(await n("produtos")).toBe(1);
    expect(await n("produto_fotos")).toBe(2);
  });

  it("TL-4: mesmo nome com envios válidos DIFERENTES ⇒ nome_repetido (23505 de produtos_chave_unique); envios do 2º não consumidos", async () => {
    const a1 = await valido();
    const nome = nomeUnicoProduto("Repetido");
    const a = await inserirComFotos(db, ana, campos({ nome }), [a1.id]);
    expect(a.tipo).toBe("ok");
    if (a.tipo !== "ok") return;
    const b1 = await valido();
    const b2 = await valido();
    const antes = await estado();
    const b = await inserirComFotos(db, ana, campos({ nome }), [b1.id, b2.id]);
    expect(b).toEqual({ tipo: "nome_repetido", codigoExistente: a.id });
    expect(await estado()).toEqual(antes);
    expect((await enviosRestantes()).sort()).toEqual([b1.id, b2.id].sort());
  });

  it("TL-4: 23505 de OUTRA constraint (produto_fotos_objeto_unique) propaga; nada criado e envio continua", async () => {
    const fixtureId = await inserirProduto(db, cat1);
    const e = await valido();
    await db.execute(
      sql`INSERT INTO produto_fotos (produto_id, posicao, chave_objeto, enviado_por, enviado_em)
          VALUES (${fixtureId}, 1, ${e.chave}, ${bia.email}, now())`,
    );
    const antes = await estado();
    await expect(inserirComFotos(db, ana, campos(), [e.id])).rejects.toThrow();
    expect(await estado()).toEqual(antes);
    expect(await enviosRestantes()).toEqual([e.id]);
  });

  it("US1-AC9/TL-4/R3: categoria inexistente (23503 de produtos_categoria_id_categorias_id_fk) ⇒ categoria_ausente; envios intactos e nada criado", async () => {
    const e = await valido();
    const antes = await estado();
    const r = await inserirComFotos(db, ana, campos({ categoriaId: 999999 }), [e.id]);
    expect(r).toEqual({ tipo: "categoria_ausente" });
    expect(await estado()).toEqual(antes);
    expect(await enviosRestantes()).toEqual([e.id]);
  });

  it("nenhum produto sem foto nem foto órfã em qualquer recusa (produtos e produto_fotos inalterados)", async () => {
    const alheio = await valido(bia.email);
    const antes = await estado();
    await inserirComFotos(db, ana, campos(), [alheio.id]);
    await inserirComFotos(db, ana, campos({ categoriaId: 999999 }), [(await valido()).id]);
    const depois = await estado();
    expect(depois.produtos).toBe(antes.produtos);
    expect(depois.fotos).toBe(antes.fotos);
  });

  it("envioIds vazio ⇒ rejeita (erro de programação)", async () => {
    await expect(inserirComFotos(db, ana, campos(), [])).rejects.toThrow();
    expect(await n("produtos")).toBe(0);
  });

  it("4 envioIds ⇒ rejeita", async () => {
    const ids = [];
    for (let i = 0; i < 4; i++) ids.push((await valido()).id);
    await expect(inserirComFotos(db, ana, campos(), ids)).rejects.toThrow();
    expect(await n("produtos")).toBe(0);
    expect(await contarEnvios(db)).toBe(4);
  });

  it("envioIds repetidos ⇒ rejeita", async () => {
    const e = await valido();
    await expect(inserirComFotos(db, ana, campos(), [e.id, e.id])).rejects.toThrow();
    expect(await n("produtos")).toBe(0);
    expect(await contarEnvios(db)).toBe(1);
  });
});

describe("inserirComFotos: normalização de envioIds para minúsculas (R1)", () => {
  it("R1a: id válido em MAIÚSCULAS ⇒ ok; foto adotada na posição 1 com a chave certa; envio some", async () => {
    const e = await valido();
    const r = await inserirComFotos(db, ana, campos(), [e.id.toUpperCase()]);
    expect(r.tipo).toBe("ok");
    if (r.tipo !== "ok") return;
    const fotos = await fotosDe(r.id);
    expect(fotos.map((f) => [f.posicao, f.chave_objeto])).toEqual([[1, e.chave]]);
    expect(await enviosRestantes()).toEqual([]);
  });

  it("R1b: o mesmo uuid em duas grafias no mesmo array ⇒ rejeita como repetido; nada criado nem consumido", async () => {
    const e = await valido();
    const antes = await estado();
    await expect(inserirComFotos(db, ana, campos(), [e.id, e.id.toUpperCase()])).rejects.toThrow();
    expect(await estado()).toEqual(antes);
    expect(await enviosRestantes()).toEqual([e.id]);
  });

  it("R1c: foto_expirada com id inválido passado em MAIÚSCULAS ⇒ envioIds devolvido em minúsculas", async () => {
    const expirado = await inserirEnvio(db, { enviadoPor: ana.email, estado: "confirmado", idadeHoras: 30 });
    const r = await inserirComFotos(db, ana, campos(), [expirado.id.toUpperCase()]);
    expect(r).toEqual({ tipo: "foto_expirada", envioIds: [expirado.id] });
  });
});

describe("arrays como UM parâmetro (TL-3)", () => {
  it("uuid[] via sql.param", async () => {
    const ids = [randomUUID(), randomUUID(), randomUUID()];
    const r = await db.execute(
      sql`SELECT u.id::text AS id, array_length(${sql.param(ids)}::uuid[], 1)::int AS len
          FROM unnest(${sql.param(ids)}::uuid[]) WITH ORDINALITY AS u(id, ord) ORDER BY u.ord`,
    );
    const linhas = r.rows as { id: string; len: number }[];
    expect(linhas.map((l) => l.id)).toEqual(ids);
    expect(linhas[0].len).toBe(3);
  });

  it("text[] via sql.param", async () => {
    const chaves = ["fotos/a.webp", "fotos/b,c.jpg", 'fotos/"d".webp'];
    const r = await db.execute(
      sql`SELECT u.v AS v, array_length(${sql.param(chaves)}::text[], 1)::int AS len
          FROM unnest(${sql.param(chaves)}::text[]) WITH ORDINALITY AS u(v, ord) ORDER BY u.ord`,
    );
    const linhas = r.rows as { v: string; len: number }[];
    expect(linhas.map((l) => l.v)).toEqual(chaves);
    expect(linhas[0].len).toBe(3);
  });

  it("timestamptz[] de Date[] via sql.param: ida e volta pelo valor em ms", async () => {
    const datas = [new Date("2026-01-02T03:04:05.123Z"), new Date("2026-05-06T07:08:09.456Z"), new Date("2026-09-10T11:12:13.789Z")];
    const r = await db.execute(
      sql`SELECT round(extract(epoch FROM u.t) * 1000)::float8 AS ms,
                 array_length(${sql.param(datas)}::timestamptz[], 1)::int AS len
          FROM unnest(${sql.param(datas)}::timestamptz[]) WITH ORDINALITY AS u(t, ord) ORDER BY u.ord`,
    );
    const linhas = r.rows as { ms: number; len: number }[];
    expect(linhas.map((l) => Number(l.ms))).toEqual(datas.map((d) => d.getTime()));
    expect(linhas[0].len).toBe(3);
  });
});

describe("remover com fotos (T045, US6-AC1)", () => {
  it("devolve removido com as chaves em ordem de posição; apaga produto e fotos (CASCADE)", async () => {
    const id = await inserirProduto(db, cat1);
    // inseridas fora de ordem de posição para provar a ordenação
    const c3 = await adicionarFoto(id, 3);
    const c1 = await adicionarFoto(id, 1);
    const c2 = await adicionarFoto(id, 2);
    expect(await remover(db, ana, id, 1)).toEqual({ tipo: "removido", chaves: [c1, c2, c3] });
    expect(await n("produtos")).toBe(0);
    expect(await n("produto_fotos")).toBe(0);
  });

  it("versão errada ⇒ versao_diferente, sem chaves; produto e fotos intactos", async () => {
    const id = await inserirProduto(db, cat1);
    await adicionarFoto(id, 1);
    const r = await remover(db, ana, id, 99);
    expect(r).toEqual({ tipo: "versao_diferente" });
    expect(r).not.toHaveProperty("chaves");
    expect(await n("produtos")).toBe(1);
    expect(await n("produto_fotos")).toBe(1);
  });

  it("inexistente ⇒ ausente", async () => {
    expect(await remover(db, ana, 987654, 1)).toEqual({ tipo: "ausente" });
  });

  it("produto sem fotos (fixture da 003) ⇒ removido com chaves []", async () => {
    const id = await inserirProduto(db, cat1);
    expect(await remover(db, ana, id, 1)).toEqual({ tipo: "removido", chaves: [] });
    expect(await n("produtos")).toBe(0);
  });
});

describe("leitura com fotos (T045, F§2.4)", () => {
  it("listar devolve capa = chave da posição 1; null para produto sem foto", async () => {
    const comFoto = await inserirProduto(db, cat1);
    await adicionarFoto(comFoto, 2);
    const capa = await adicionarFoto(comFoto, 1);
    const semFoto = await inserirProduto(db, cat1);
    const { itens } = await listar(db, {});
    expect(itens.find((p) => p.id === comFoto)?.capa).toBe(capa);
    expect(itens.find((p) => p.id === semFoto)?.capa).toBeNull();
    expect(itens).toHaveLength(2);
  });

  it("obterPorId devolve fotosVersao (1) e fotos [{posicao, chave}] em ordem", async () => {
    const id = await inserirProduto(db, cat1);
    const c2 = await adicionarFoto(id, 2);
    const c1 = await adicionarFoto(id, 1);
    const p = await obterPorId(db, id);
    expect(p?.fotosVersao).toBe(1);
    expect(p?.fotos).toEqual([
      { posicao: 1, chave: c1 },
      { posicao: 2, chave: c2 },
    ]);
  });

  it("obterPorId de produto sem fotos ⇒ fotos []; inexistente ⇒ null", async () => {
    const id = await inserirProduto(db, cat1);
    expect((await obterPorId(db, id))?.fotos).toEqual([]);
    expect(await obterPorId(db, 987654)).toBeNull();
  });
});
