import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createDb } from "@/lib/db/client";
import { resetCategorias } from "@/test/db/categorias-fixtures";
import { inserirProduto, inserirProdutos, limparProdutos } from "@/test/db/produtos-fixtures";
import { interpretarCodigoBusca } from "@/lib/produtos/codigo";

import { listar, obterPorId } from "./produtos";

// Feature 003, T034 (SF6): leitura de produtos no SQL (US3-AC1-6, SC-007 nível de banco).
// Integração com o banco local. Roda em série com os demais arquivos de integração.
const db = createDb({
  DATABASE_URL: process.env.DATABASE_URL ?? "",
  NEON_FETCH_ENDPOINT: process.env.NEON_FETCH_ENDPOINT,
});

let cat1 = 0;
let cat2 = 0;
let nomeCat1 = "";

async function esgotarDireto(id: number): Promise<void> {
  await db.execute(sql`UPDATE produtos SET esgotado = true WHERE id = ${id}`);
}

async function removerDireto(id: number): Promise<void> {
  await db.execute(sql`DELETE FROM produtos WHERE id = ${id}`);
}

/** Produto com código (id) explícito; `id` é GENERATED ALWAYS, daí o OVERRIDING SYSTEM VALUE. */
async function inserirComCodigo(codigo: number, nome: string): Promise<void> {
  await db.execute(sql`
    INSERT INTO produtos (id, categoria_id, nome, criado_por, atualizado_por)
    OVERRIDING SYSTEM VALUE
    VALUES (${codigo}, ${cat1}, ${nome}, 'admin@teste.local', 'admin@teste.local')`);
}

/** Texto digitado + código interpretado, como o painel monta `busca`. */
function busca(texto: string) {
  return { texto, codigo: interpretarCodigoBusca(texto) };
}

const idsDe = (itens: { id: number }[]) => itens.map((i) => i.id);

beforeAll(async () => {
  await resetCategorias(db);
  const r = await db.execute(sql`SELECT id, nome FROM categorias ORDER BY id LIMIT 2`);
  const linhas = r.rows as { id: number; nome: string }[];
  cat1 = linhas[0].id;
  nomeCat1 = linhas[0].nome;
  cat2 = linhas[1].id;
});
beforeEach(() => limparProdutos(db));
afterAll(() => resetCategorias(db));

describe("obterPorId (US3, US4-AC6)", () => {
  it("devolve o produto com categoriaNome (JOIN), autoria, versão e vaga nula", async () => {
    const id = await inserirProduto(db, cat1, {
      nome: "Bolsa Tiracolo",
      criadoPor: "ana@teste.local",
      atualizadoPor: "bia@teste.local",
    });
    const p = await obterPorId(db, id);
    expect(p).not.toBeNull();
    expect(p).toMatchObject({
      id,
      categoriaId: cat1,
      categoriaNome: nomeCat1,
      nome: "Bolsa Tiracolo",
      descricao: null,
      precoCentavos: null,
      aPartirDe: false,
      esgotado: false,
      destaqueVaga: null,
      versao: 1,
      criadoPor: "ana@teste.local",
      atualizadoPor: "bia@teste.local",
    });
    expect(p!.criadoEm).toBeInstanceOf(Date);
    expect(p!.atualizadoEm).toBeInstanceOf(Date);
  });

  it("devolve null para id inexistente", async () => {
    expect(await obterPorId(db, 999_999_999)).toBeNull();
  });

  it("devolve null para produto removido", async () => {
    const id = await inserirProduto(db, cat1);
    await removerDireto(id);
    expect(await obterPorId(db, id)).toBeNull();
  });
});

describe("listar: ordem e paginação (US3-AC1, AC2)", () => {
  it("lista vazia: itens [] e haMais false", async () => {
    expect(await listar(db, {})).toEqual({ itens: [], haMais: false });
  });

  it("ordena por id DESC e traz categoriaNome em cada item", async () => {
    const ids = await inserirProdutos(db, cat1, 3);
    const { itens, haMais } = await listar(db, {});
    expect(idsDe(itens)).toEqual([...ids].reverse());
    expect(haMais).toBe(false);
    expect(itens.every((i) => i.categoriaNome === nomeCat1)).toBe(true);
  });

  it("20 produtos exatos: uma página, haMais false", async () => {
    await inserirProdutos(db, cat1, 20);
    const { itens, haMais } = await listar(db, {});
    expect(itens).toHaveLength(20);
    expect(haMais).toBe(false);
  });

  it("21 produtos: 20 na página e haMais true; `antes` traz o restante", async () => {
    const ids = await inserirProdutos(db, cat1, 21);
    const p1 = await listar(db, {});
    expect(p1.itens).toHaveLength(20);
    expect(p1.haMais).toBe(true);
    expect(idsDe(p1.itens)).toEqual([...ids].reverse().slice(0, 20));

    const ultimo = p1.itens[p1.itens.length - 1].id;
    const p2 = await listar(db, { antes: ultimo });
    expect(idsDe(p2.itens)).toEqual([ids[0]]);
    expect(p2.haMais).toBe(false);
  });

  it("keyset: cadastro e remoção no meio da paginação não repetem nem pulam item (SC-007)", async () => {
    const ids = await inserirProdutos(db, cat1, 25); // ordem esperada: 25..1 (por posição)
    const p1 = await listar(db, {});
    expect(idsDe(p1.itens)).toEqual([...ids].reverse().slice(0, 20));
    const ultimo = p1.itens[19].id;

    // Entre as páginas: um item novo (aparece no topo) e a remoção de um item ainda não visto.
    const novo = await inserirProduto(db, cat1);
    const removido = ids[2];
    await removerDireto(removido);

    const p2 = await listar(db, { antes: ultimo });
    const restantes = ids.slice(0, 5).filter((id) => id !== removido).reverse();
    expect(idsDe(p2.itens)).toEqual(restantes);
    expect(p2.haMais).toBe(false);

    const vistos = [...idsDe(p1.itens), ...idsDe(p2.itens)];
    expect(new Set(vistos).size).toBe(vistos.length); // sem repetição
    expect(vistos).not.toContain(novo); // novo está acima do cursor: fora desta navegação
    const esperados = ids.filter((id) => id !== removido);
    expect([...vistos].sort((a, b) => a - b)).toEqual(esperados); // sem item pulado
  });

  it("remover item já visto na página 1 não desloca a página 2", async () => {
    const ids = await inserirProdutos(db, cat1, 25);
    const p1 = await listar(db, {});
    await removerDireto(p1.itens[0].id);
    const p2 = await listar(db, { antes: p1.itens[19].id });
    expect(idsDe(p2.itens)).toEqual(ids.slice(0, 5).reverse());
  });
});

describe("listar: filtros por categoria e situação (US3-AC3)", () => {
  it("categoriaId devolve só os produtos da categoria", async () => {
    const a = await inserirProdutos(db, cat1, 2);
    const b = await inserirProdutos(db, cat2, 3);
    expect(idsDe((await listar(db, { categoriaId: cat1 })).itens)).toEqual([...a].reverse());
    expect(idsDe((await listar(db, { categoriaId: cat2 })).itens)).toEqual([...b].reverse());
  });

  it("categoria sem produtos: lista vazia", async () => {
    await inserirProdutos(db, cat1, 2);
    expect(await listar(db, { categoriaId: cat2 })).toEqual({ itens: [], haMais: false });
  });

  it("esgotado: true devolve só esgotados; esgotado: false só disponíveis", async () => {
    const [d1, e1, d2] = await inserirProdutos(db, cat1, 3);
    await esgotarDireto(e1);
    const esg = await listar(db, { esgotado: true });
    const disp = await listar(db, { esgotado: false });
    expect(idsDe(esg.itens)).toEqual([e1]);
    expect(esg.itens[0].esgotado).toBe(true);
    expect(idsDe(disp.itens)).toEqual([d2, d1]);
  });

  it("sem filtro de situação devolve ambos", async () => {
    const [a, b] = await inserirProdutos(db, cat1, 2);
    await esgotarDireto(a);
    expect(idsDe((await listar(db, {})).itens)).toEqual([b, a]);
  });
});

describe("listar: busca por nome (US3-AC4)", () => {
  it('"meia-soquete" encontra "Meia soquete" (equivalência da chave)', async () => {
    const id = await inserirProduto(db, cat1, { nome: "Meia soquete" });
    await inserirProduto(db, cat1, { nome: "Bolsa grande" });
    expect(idsDe((await listar(db, { busca: busca("meia-soquete") })).itens)).toEqual([id]);
  });

  it("parte do nome, em outra caixa e com acento digitado, encontra o produto", async () => {
    const id = await inserirProduto(db, cat1, { nome: "Pulseira Dourada" });
    await inserirProduto(db, cat1, { nome: "Colar Prata" });
    expect(idsDe((await listar(db, { busca: busca("DOURA") })).itens)).toEqual([id]);
    expect(idsDe((await listar(db, { busca: busca("pulsêira") })).itens)).toEqual([id]);
  });

  it("busca sem correspondência: lista vazia", async () => {
    await inserirProduto(db, cat1, { nome: "Colar Prata" });
    expect(await listar(db, { busca: busca("zzzz") })).toEqual({ itens: [], haMais: false });
  });

  it("caracteres de LIKE (% e _) são literais, não curingas", async () => {
    await inserirProduto(db, cat1, { nome: "Colar Prata" });
    expect((await listar(db, { busca: { texto: "%", codigo: null } })).itens).toEqual([]);
    expect((await listar(db, { busca: { texto: "_", codigo: null } })).itens).toEqual([]);
  });
});

describe("listar: busca por código (US3-AC5)", () => {
  it.each(["42", "0042", "#0042"])('"%s" encontra o produto de código 42', async (texto) => {
    await inserirComCodigo(42, "Alvo da busca");
    await inserirProduto(db, cat1, { nome: "Outro item" });
    const { itens } = await listar(db, { busca: busca(texto) });
    expect(idsDe(itens)).toEqual([42]);
  });

  it("código inexistente: lista vazia", async () => {
    await inserirProdutos(db, cat1, 2);
    expect(await listar(db, { busca: busca("#9999") })).toEqual({ itens: [], haMais: false });
  });

  it("dígitos também casam por nome (OR): produto cujo nome contém o número aparece", async () => {
    const porNome = await inserirProduto(db, cat1, { nome: "Kit 42 peças" });
    await inserirComCodigo(42, "Alvo da busca");
    const ids = idsDe((await listar(db, { busca: busca("42") })).itens);
    expect(ids.sort((a, b) => a - b)).toEqual([porNome, 42].sort((a, b) => a - b));
  });
});

describe("listar: busca vazia e combinações (US3-AC6)", () => {
  it("busca com texto normalizado vazio (só símbolos) equivale a sem filtro", async () => {
    const ids = await inserirProdutos(db, cat1, 3);
    const r = await listar(db, { busca: { texto: "---", codigo: null } });
    expect(idsDe(r.itens)).toEqual([...ids].reverse());
  });

  it("sem `busca` (como o painel faz quando vazia) lista tudo", async () => {
    const ids = await inserirProdutos(db, cat1, 2);
    expect(idsDe((await listar(db, {})).itens)).toEqual([...ids].reverse());
  });

  it("categoria + esgotado + busca combinam em E", async () => {
    const alvo = await inserirProduto(db, cat1, { nome: "Meia lisa azul" });
    const outraSituacao = await inserirProduto(db, cat1, { nome: "Meia lisa verde" });
    const outraCategoria = await inserirProduto(db, cat2, { nome: "Meia lisa rosa" });
    const outroNome = await inserirProduto(db, cat1, { nome: "Bolsa lisa" });
    await esgotarDireto(alvo);
    await esgotarDireto(outraCategoria);
    await esgotarDireto(outroNome);
    void outraSituacao;
    const r = await listar(db, { categoriaId: cat1, esgotado: true, busca: busca("meia") });
    expect(idsDe(r.itens)).toEqual([alvo]);
  });

  it("filtros + antes: paginação respeita o filtro", async () => {
    const todos = await inserirProdutos(db, cat1, 25);
    const outros = await inserirProdutos(db, cat2, 3);
    const p1 = await listar(db, { categoriaId: cat1 });
    expect(p1.itens).toHaveLength(20);
    expect(p1.haMais).toBe(true);
    const p2 = await listar(db, { categoriaId: cat1, antes: p1.itens[19].id });
    expect(idsDe(p2.itens)).toEqual(todos.slice(0, 5).reverse());
    expect(p2.haMais).toBe(false);
    expect(idsDe([...p1.itens, ...p2.itens])).not.toContain(outros[0]);
  });
});
