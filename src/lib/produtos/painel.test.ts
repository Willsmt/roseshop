import { beforeEach, describe, expect, it, vi } from "vitest";

// Feature 003, T035 (SF6): leitura do painel de produtos (US3-AC1-6, US4-AC6, `voltar` sem
// redirecionamento aberto). Unitário: db/dbDoContexto/listarCategorias mockados.
//
// Convenção assumida para `voltar` (decisão do test-writer, a confirmar com o tech-lead):
//  - `voltar` é a QUERY STRING da lista, normalizada pelo mesmo `filtroLista`, SEM o "?"
//    inicial na forma canônica (ex.: "categoria=3&antes=42"); um "?" inicial também é aceito.
//  - `ItemLista.href` = `/painel/produtos/${id}?voltar=${encodeURIComponent(queryAtual)}`, onde
//    queryAtual = filtros válidos + `antes` da página corrente, sem `aviso`, sem "?" inicial.
//    Com lista sem filtro/cursor, `voltar` é omitido ou vazio (o teste aceita as duas formas).
//  - `voltarHref` = "/painel/produtos" + ("?" + query revalidada, se houver). URL absoluta,
//    "//host", caminho diferente ou chaves desconhecidas ⇒ "/painel/produtos" sem query.
//  - A ordem dos parâmetros nos hrefs não é especificada: os testes comparam por
//    URLSearchParams, nunca por string.

const m = vi.hoisted(() => ({
  dbDoContexto: vi.fn(),
  listar: vi.fn(),
  obterPorId: vi.fn(),
  listarCategorias: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/contexto", () => ({ dbDoContexto: m.dbDoContexto }));
vi.mock("@/lib/db/produtos", () => ({ listar: m.listar, obterPorId: m.obterPorId }));
vi.mock("@/lib/categorias", () => ({ listarCategorias: m.listarCategorias }));

import type { ProdutoDb } from "@/lib/db/produtos";

import { listarProdutosDoPainel, obterProdutoDoPainel } from "./painel";

const fakeDb = { fake: "db" };
const LISTA = "/painel/produtos";

function produto(over: Partial<ProdutoDb> = {}): ProdutoDb {
  return {
    id: 7,
    categoriaId: 3,
    categoriaNome: "Bolsas",
    nome: "Bolsa Tiracolo",
    descricao: null,
    precoCentavos: null,
    aPartirDe: false,
    esgotado: false,
    destaqueVaga: null,
    versao: 1,
    criadoPor: "ana@teste.local",
    atualizadoPor: "bia@teste.local",
    criadoEm: new Date("2026-01-01T00:00:00Z"),
    atualizadoEm: new Date("2026-01-02T00:00:00Z"),
    ...over,
  };
}

function itensComIds(ids: number[]): ProdutoDb[] {
  return ids.map((id) => produto({ id, nome: `Produto ${id}` }));
}

function resposta(ids: number[], haMais = false) {
  m.listar.mockResolvedValue({ itens: itensComIds(ids), haMais });
}

/** Caminho e parâmetros de um href, sem depender da ordem dos parâmetros. */
function partes(href: string) {
  const i = href.indexOf("?");
  const caminho = i === -1 ? href : href.slice(0, i);
  const params = new URLSearchParams(i === -1 ? "" : href.slice(i + 1));
  return { caminho, params, obj: Object.fromEntries(params.entries()) };
}

function filtroPassadoAoDb() {
  expect(m.listar).toHaveBeenCalledTimes(1);
  const [db, filtro] = m.listar.mock.calls[0];
  expect(db).toBe(fakeDb);
  return filtro;
}

beforeEach(() => {
  vi.resetAllMocks();
  m.dbDoContexto.mockResolvedValue(fakeDb);
  m.listarCategorias.mockResolvedValue([
    { id: 3, nome: "Bolsas" },
    { id: 5, nome: "Meias" },
  ]);
  resposta([]);
});

describe("listarProdutosDoPainel: schema filtroLista (valor inválido é ignorado)", () => {
  it("sem filtros: chama listar com filtro vazio", async () => {
    await listarProdutosDoPainel({});
    expect(filtroPassadoAoDb()).toEqual({});
  });

  it.each([null, undefined, "texto", 42, []])("searchParams não-objeto (%j) vira lista sem filtro", async (entrada) => {
    await expect(listarProdutosDoPainel(entrada)).resolves.toBeDefined();
    expect(filtroPassadoAoDb()).toEqual({});
  });

  it.each(["abc", "0", "-1", "1.5", "3x", "", " "])(
    "categoria inválida (%j) é ignorada, sem erro",
    async (categoria) => {
      await listarProdutosDoPainel({ categoria });
      expect(filtroPassadoAoDb()).toEqual({});
    },
  );

  it("categoria como array (?categoria=1&categoria=2) é ignorada", async () => {
    await listarProdutosDoPainel({ categoria: ["1", "2"] });
    expect(filtroPassadoAoDb()).toEqual({});
  });

  it.each(["xyz", "ESGOTADO", "todos", ""])("situacao inválida (%j) é ignorada", async (situacao) => {
    await listarProdutosDoPainel({ situacao });
    expect(filtroPassadoAoDb()).toEqual({});
  });

  it.each(["abc", "0", "-2", "4.2", ""])("antes inválido (%j) é ignorado", async (antes) => {
    await listarProdutosDoPainel({ antes });
    expect(filtroPassadoAoDb()).toEqual({});
  });

  it("valor inválido não derruba os filtros válidos ao lado", async () => {
    await listarProdutosDoPainel({ categoria: "abc", situacao: "esgotado", antes: "x" });
    expect(filtroPassadoAoDb()).toEqual({ esgotado: true });
  });

  it("chaves desconhecidas são ignoradas", async () => {
    await listarProdutosDoPainel({ categoria: "3", ordem: "asc", id: "9" });
    expect(filtroPassadoAoDb()).toEqual({ categoriaId: 3 });
  });
});

describe("listarProdutosDoPainel: montagem do FiltroDb (US3-AC3-6)", () => {
  it('situacao "esgotado" vira esgotado: true', async () => {
    await listarProdutosDoPainel({ situacao: "esgotado" });
    expect(filtroPassadoAoDb()).toEqual({ esgotado: true });
  });

  it('situacao "disponivel" vira esgotado: false', async () => {
    await listarProdutosDoPainel({ situacao: "disponivel" });
    expect(filtroPassadoAoDb()).toEqual({ esgotado: false });
  });

  it("categoria e antes viram categoriaId e antes numéricos", async () => {
    await listarProdutosDoPainel({ categoria: "3", antes: "42" });
    expect(filtroPassadoAoDb()).toEqual({ categoriaId: 3, antes: 42 });
  });

  it("busca por nome: texto presente e codigo null", async () => {
    await listarProdutosDoPainel({ busca: "meia" });
    expect(filtroPassadoAoDb()).toEqual({ busca: { texto: "meia", codigo: null } });
  });

  it.each([
    ["42", 42],
    ["0042", 42],
    ["#0042", 42],
  ])("busca por código %j: codigo %i", async (busca, codigo) => {
    await listarProdutosDoPainel({ busca });
    const filtro = filtroPassadoAoDb();
    expect(filtro.busca.codigo).toBe(codigo);
    expect(filtro.busca.texto).toBe(busca);
  });

  it.each(["0", "#0", "1234567890", "42a", "4 2"])(
    "busca %j não casa o código (^#?\\d{1,9}$ ou id >= 1): codigo null",
    async (busca) => {
      await listarProdutosDoPainel({ busca });
      expect(filtroPassadoAoDb().busca.codigo).toBeNull();
    },
  );

  it.each(["", "   ", "---", " - - "])(
    "busca vazia após normalizar (%j) não passa `busca` ao db",
    async (busca) => {
      await listarProdutosDoPainel({ busca });
      expect(filtroPassadoAoDb()).not.toHaveProperty("busca");
    },
  );

  it("combinação de todos os filtros", async () => {
    await listarProdutosDoPainel({
      categoria: "5",
      situacao: "esgotado",
      busca: "meia",
      antes: "42",
    });
    expect(filtroPassadoAoDb()).toEqual({
      categoriaId: 5,
      esgotado: true,
      busca: { texto: "meia", codigo: null },
      antes: 42,
    });
  });

  it("usa o db do contexto e não propaga `aviso` ao FiltroDb", async () => {
    await listarProdutosDoPainel({ aviso: "removido" });
    expect(m.dbDoContexto).toHaveBeenCalled();
    expect(filtroPassadoAoDb()).toEqual({});
  });
});

describe("listarProdutosDoPainel: ItemLista (US3-AC1)", () => {
  it("mapeia id, código formatado, nome, categoria, esgotado, emDestaque e preço formatado", async () => {
    m.listar.mockResolvedValue({
      itens: [
        produto({ id: 7, precoCentavos: 1290, destaqueVaga: 2 }),
        produto({ id: 6, nome: "Sem preço", precoCentavos: null, esgotado: true }),
      ],
      haMais: false,
    });
    const { itens } = await listarProdutosDoPainel({});
    expect(itens).toHaveLength(2);
    expect(itens[0]).toMatchObject({
      id: 7,
      codigo: "#0007",
      nome: "Bolsa Tiracolo",
      categoriaNome: "Bolsas",
      esgotado: false,
      emDestaque: true,
      preco: "R$ 12,90",
    });
    expect(itens[1]).toMatchObject({
      id: 6,
      codigo: "#0006",
      esgotado: true,
      emDestaque: false,
      preco: null,
    });
  });

  it('preço "a partir de" mostra o valor formatado', async () => {
    m.listar.mockResolvedValue({
      itens: [produto({ precoCentavos: 129000, aPartirDe: true })],
      haMais: false,
    });
    const { itens } = await listarProdutosDoPainel({});
    expect(itens[0].preco).toContain("R$ 1.290,00");
  });

  it("lista vazia: itens [], sem verMais e sem voltarAoComeco", async () => {
    resposta([]);
    expect(await listarProdutosDoPainel({})).toMatchObject({
      itens: [],
      verMais: null,
      voltarAoComeco: null,
    });
  });
});

describe("listarProdutosDoPainel: href do item com ?voltar= (US3-AC2)", () => {
  it("href aponta ao detalhe e carrega a query atual (filtros + antes) em ?voltar=", async () => {
    resposta([41, 40]);
    const { itens } = await listarProdutosDoPainel({
      categoria: "3",
      situacao: "esgotado",
      antes: "42",
    });
    const { caminho, params } = partes(itens[0].href);
    expect(caminho).toBe(`${LISTA}/41`);
    const voltar = params.get("voltar");
    expect(voltar).not.toBeNull();
    expect(partes(`?${voltar!.replace(/^\?/, "")}`).obj).toEqual({
      categoria: "3",
      situacao: "esgotado",
      antes: "42",
    });
    expect(partes(itens[1].href).caminho).toBe(`${LISTA}/40`);
  });

  it("a query dentro de ?voltar= vai codificada com encodeURIComponent", async () => {
    resposta([9]);
    const { itens } = await listarProdutosDoPainel({ busca: "meia soquete&x=1" });
    const bruto = itens[0].href.slice(itens[0].href.indexOf("?voltar=") + "?voltar=".length);
    expect(bruto).not.toMatch(/[&=?# ]/);
    const { obj } = partes(`?${decodeURIComponent(bruto).replace(/^\?/, "")}`);
    expect(obj).toEqual({ busca: "meia soquete&x=1" });
  });

  it("sem filtro e sem cursor: href aponta ao detalhe sem voltar útil", async () => {
    resposta([9]);
    const { itens } = await listarProdutosDoPainel({});
    const { caminho, params } = partes(itens[0].href);
    expect(caminho).toBe(`${LISTA}/9`);
    expect(params.get("voltar") ?? "").toBe("");
  });

  it("valor inválido não entra no ?voltar=", async () => {
    resposta([9]);
    const { itens } = await listarProdutosDoPainel({ categoria: "abc", situacao: "esgotado" });
    const voltar = partes(itens[0].href).params.get("voltar")!;
    expect(partes(`?${voltar.replace(/^\?/, "")}`).obj).toEqual({ situacao: "esgotado" });
  });
});

describe("listarProdutosDoPainel: verMais e voltarAoComeco (US3-AC2)", () => {
  it("haMais: verMais mantém os filtros e usa antes = id do último item", async () => {
    resposta([50, 49, 48], true);
    const r = await listarProdutosDoPainel({ categoria: "3", situacao: "disponivel", busca: "meia" });
    const { caminho, obj } = partes(r.verMais!);
    expect(caminho).toBe(LISTA);
    expect(obj).toEqual({ categoria: "3", situacao: "disponivel", busca: "meia", antes: "48" });
  });

  it("verMais substitui o cursor anterior (antes = último id da página atual)", async () => {
    resposta([30, 29], true);
    const r = await listarProdutosDoPainel({ antes: "42" });
    expect(partes(r.verMais!).obj).toEqual({ antes: "29" });
  });

  it("sem haMais: verMais é null", async () => {
    resposta([3, 2, 1], false);
    expect((await listarProdutosDoPainel({})).verMais).toBeNull();
  });

  it("voltarAoComeco é null quando não há cursor", async () => {
    resposta([3, 2, 1], true);
    expect((await listarProdutosDoPainel({ categoria: "3" })).voltarAoComeco).toBeNull();
  });

  it("com cursor: voltarAoComeco mantém os filtros e remove antes", async () => {
    resposta([30, 29], false);
    const r = await listarProdutosDoPainel({ categoria: "3", situacao: "esgotado", antes: "42" });
    const { caminho, obj } = partes(r.voltarAoComeco!);
    expect(caminho).toBe(LISTA);
    expect(obj).toEqual({ categoria: "3", situacao: "esgotado" });
  });

  it("com cursor e sem filtros: voltarAoComeco é a lista pura", async () => {
    resposta([30, 29], false);
    const r = await listarProdutosDoPainel({ antes: "42" });
    expect(r.voltarAoComeco).toBe(LISTA);
  });
});

describe("listarProdutosDoPainel: aviso (só exibição, FR de aviso)", () => {
  it("aviso=removido vira sucesso 'Produto removido.'", async () => {
    const r = await listarProdutosDoPainel({ aviso: "removido" });
    expect(r.aviso).toEqual({ tipo: "sucesso", texto: "Produto removido." });
  });

  it("aviso=nao_existe vira erro 'Este produto não existe mais.'", async () => {
    const r = await listarProdutosDoPainel({ aviso: "nao_existe" });
    expect(r.aviso).toEqual({ tipo: "erro", texto: "Este produto não existe mais." });
  });

  it.each(["alterado", "xyz", "", "REMOVIDO"])("aviso inválido (%j) é ignorado", async (aviso) => {
    expect((await listarProdutosDoPainel({ aviso })).aviso).toBeNull();
  });

  it("sem aviso: null", async () => {
    expect((await listarProdutosDoPainel({})).aviso).toBeNull();
  });

  it.each(["removido", "nao_existe"])(
    "aviso=%s nunca é propagado em verMais, voltarAoComeco nem href",
    async (aviso) => {
      resposta([30, 29], true);
      const r = await listarProdutosDoPainel({ aviso, categoria: "3", antes: "42" });
      const todos = [r.verMais, r.voltarAoComeco, ...r.itens.map((i) => i.href)].map(String);
      for (const href of todos) {
        expect(href).not.toContain("aviso");
        expect(decodeURIComponent(href)).not.toContain("aviso");
        expect(href).not.toContain(aviso);
      }
      expect(r.verMais).not.toBeNull();
      expect(r.voltarAoComeco).not.toBeNull();
    },
  );
});

describe("obterProdutoDoPainel: id (US3, US4)", () => {
  it.each(["abc", "0", "-1", "1.5", "", " ", "7x", undefined, null, ["7"], {}, 7.5])(
    "id inválido (%j) ⇒ null sem consultar o banco",
    async (id) => {
      expect(await obterProdutoDoPainel(id, undefined)).toBeNull();
      expect(m.obterPorId).not.toHaveBeenCalled();
    },
  );

  it("id inexistente ⇒ null", async () => {
    m.obterPorId.mockResolvedValue(null);
    expect(await obterProdutoDoPainel("999", undefined)).toBeNull();
    expect(m.obterPorId).toHaveBeenCalledWith(fakeDb, 999);
  });

  it("id válido consulta obterPorId(db, id numérico)", async () => {
    m.obterPorId.mockResolvedValue(produto({ id: 7 }));
    await obterProdutoDoPainel("7", undefined);
    expect(m.obterPorId).toHaveBeenCalledWith(fakeDb, 7);
  });
});

describe("obterProdutoDoPainel: DetalheProduto", () => {
  it("devolve os campos de ProdutoDb mais código e preço formatados", async () => {
    const base = produto({
      id: 7,
      descricao: "Couro legítimo",
      precoCentavos: 1290,
      aPartirDe: false,
      versao: 4,
    });
    m.obterPorId.mockResolvedValue(base);
    const d = await obterProdutoDoPainel("7", undefined);
    expect(d).toMatchObject({
      id: 7,
      categoriaId: 3,
      categoriaNome: "Bolsas",
      nome: "Bolsa Tiracolo",
      descricao: "Couro legítimo",
      precoCentavos: 1290,
      aPartirDe: false,
      esgotado: false,
      destaqueVaga: null,
      versao: 4,
      codigo: "#0007",
      preco: "R$ 12,90",
    });
  });

  it("preço ausente ⇒ preco null", async () => {
    m.obterPorId.mockResolvedValue(produto({ precoCentavos: null }));
    expect((await obterProdutoDoPainel("7", undefined))!.preco).toBeNull();
  });

  it("fotos é [] (marcador de sem foto)", async () => {
    m.obterPorId.mockResolvedValue(produto());
    expect((await obterProdutoDoPainel("7", undefined))!.fotos).toEqual([]);
  });

  it("criadoPor e atualizadoPor presentes (US4-AC6)", async () => {
    m.obterPorId.mockResolvedValue(produto({ criadoPor: "ana@teste.local", atualizadoPor: "bia@teste.local" }));
    const d = await obterProdutoDoPainel("7", undefined);
    expect(d).toMatchObject({ criadoPor: "ana@teste.local", atualizadoPor: "bia@teste.local" });
  });

  it.each([
    ["disponível e fora do destaque", { esgotado: false, destaqueVaga: null }, true],
    ["esgotado", { esgotado: true, destaqueVaga: null }, false],
    ["já em destaque", { esgotado: false, destaqueVaga: 3 }, false],
  ] as const)("podeDestacar: %s ⇒ %s", async (_rotulo, estado, esperado) => {
    m.obterPorId.mockResolvedValue(produto({ ...estado }));
    expect((await obterProdutoDoPainel("7", undefined))!.podeDestacar).toBe(esperado);
  });
});

describe("obterProdutoDoPainel: voltarHref revalidado (sem redirecionamento aberto)", () => {
  beforeEach(() => {
    m.obterPorId.mockResolvedValue(produto());
  });

  async function voltarHref(voltar: unknown): Promise<string> {
    return (await obterProdutoDoPainel("7", voltar))!.voltarHref;
  }

  it.each([undefined, null, "", "   "])("voltar ausente/vazio (%j) ⇒ lista sem filtro", async (voltar) => {
    expect(await voltarHref(voltar)).toBe(LISTA);
  });

  it("query válida da lista é preservada (página e filtros)", async () => {
    const { caminho, obj } = partes(await voltarHref("categoria=3&situacao=esgotado&antes=42"));
    expect(caminho).toBe(LISTA);
    expect(obj).toEqual({ categoria: "3", situacao: "esgotado", antes: "42" });
  });

  it('"?" inicial é aceito', async () => {
    const { caminho, obj } = partes(await voltarHref("?categoria=3&busca=meia"));
    expect(caminho).toBe(LISTA);
    expect(obj).toEqual({ categoria: "3", busca: "meia" });
  });

  it.each([
    "https://evil.com",
    "http://evil.com/painel/produtos?categoria=3",
    "//evil.com",
    "//evil.com/painel/produtos",
    "/painel/categorias",
    "/outro/caminho?categoria=3",
    "javascript:alert(1)",
    "\\\\evil.com",
  ])("voltar malicioso/outro caminho (%j) ⇒ lista sem filtro", async (voltar) => {
    expect(await voltarHref(voltar)).toBe(LISTA);
  });

  it("nunca produz URL absoluta nem //host", async () => {
    for (const v of ["https://evil.com", "//evil.com", "categoria=3"]) {
      const href = await voltarHref(v);
      expect(href.startsWith("/painel/produtos")).toBe(true);
      expect(href.startsWith("//")).toBe(false);
      expect(href).not.toMatch(/^[a-z][a-z0-9+.-]*:/i);
    }
  });

  it("valor inválido e chaves desconhecidas são descartados; os válidos ficam", async () => {
    const { caminho, obj } = partes(await voltarHref("categoria=abc&situacao=esgotado&next=//evil.com"));
    expect(caminho).toBe(LISTA);
    expect(obj).toEqual({ situacao: "esgotado" });
  });

  it("aviso dentro de voltar não é propagado", async () => {
    const href = await voltarHref("aviso=removido&categoria=3");
    expect(href).not.toContain("aviso");
    expect(partes(href).obj).toEqual({ categoria: "3" });
  });

  it("voltar não string (array/objeto/número) ⇒ lista sem filtro", async () => {
    expect(await voltarHref(["categoria=3"])).toBe(LISTA);
    expect(await voltarHref({ categoria: "3" })).toBe(LISTA);
    expect(await voltarHref(3)).toBe(LISTA);
  });
});
