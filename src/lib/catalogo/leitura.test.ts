import { getCloudflareContext } from "@opennextjs/cloudflare";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as sql from "@/lib/db/catalogo";

import { codificarCursor } from "./cursor";
import { lerBloco, lerFoto, lerProduto, lerVitrine } from "./leitura";

// T034 (ramo FALLBACK, T008): leitura pública sobre o SQL de src/lib/db/catalogo.ts, com o
// contexto mockado. Os trechos [ISR] (NEXT_PHASE de build, D13) não se aplicam.

vi.mock("@opennextjs/cloudflare", () => ({ getCloudflareContext: vi.fn() }));
vi.mock("@/lib/db/contexto", () => ({ dbDoContexto: vi.fn(async () => ({ db: true })) }));
vi.mock("@/lib/db/catalogo", () => ({
  TAMANHO_BLOCO: 24,
  listarDestaques: vi.fn(),
  listarBloco: vi.fn(),
  categoriasComProdutos: vi.fn(),
  obterPublico: vi.fn(),
  fotoPublica: vi.fn(),
}));

const ARQ1 = "11111111-1111-4111-8111-111111111111.webp";
const ARQ2 = "22222222-2222-4222-8222-222222222222.jpg";
const ARQ3 = "33333333-3333-4333-8333-333333333333.webp";

const db = vi.mocked(sql);
const CATEGORIAS = [
  { id: 7, nome: "Meias", slug: "meias" },
  { id: 8, nome: "Água e Sol", slug: "agua-e-sol" },
];

function cartaoDb(id: number, over: Partial<sql.CartaoDb> = {}): sql.CartaoDb {
  return {
    id,
    nome: `Produto ${id}`,
    precoCentavos: 1290,
    aPartirDe: false,
    esgotado: false,
    capaChave: `fotos/${ARQ1}`,
    ...over,
  };
}

function publicoDb(over: Partial<sql.ProdutoPublicoDb> = {}): sql.ProdutoPublicoDb {
  return {
    id: 42,
    nome: "Meia de lã",
    precoCentavos: 1290,
    aPartirDe: false,
    esgotado: false,
    categoria: "Meias",
    descricao: "Quentinha",
    fotos: [`fotos/${ARQ1}`, `fotos/${ARQ2}`],
    ...over,
  };
}

const CHAVES_CARTAO = ["capa", "codigo", "esgotado", "href", "nome", "preco"];
const CHAVES_PUBLICO = [...CHAVES_CARTAO, "categoria", "descricao", "fotos", "whatsapp"].sort();

let ctx: { roseshop: { causa: string | null } };

beforeEach(() => {
  vi.stubEnv("WHATSAPP_NUMBER", "+5511999999999");
  vi.stubEnv("SITE_URL", "https://roseshop.willsmt.workers.dev");
  ctx = { roseshop: { causa: null } };
  vi.mocked(getCloudflareContext).mockReset().mockResolvedValue({ ctx } as never);
  db.listarDestaques.mockReset().mockResolvedValue([]);
  db.listarBloco.mockReset().mockResolvedValue({ itens: [], haMais: false, proximo: null });
  db.categoriasComProdutos.mockReset().mockResolvedValue(CATEGORIAS);
  db.obterPublico.mockReset().mockResolvedValue(publicoDb());
  db.fotoPublica.mockReset().mockResolvedValue(true);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("lerVitrine", () => {
  it("monta { destaques, categorias, bloco } com ProdutoCartao só com os campos públicos", async () => {
    db.listarDestaques.mockResolvedValue([cartaoDb(42)]);
    db.listarBloco.mockResolvedValue({ itens: [cartaoDb(42), cartaoDb(7, { capaChave: null, precoCentavos: null })], haMais: false, proximo: null });
    const v = await lerVitrine();
    expect(Object.keys(v).sort()).toEqual(["bloco", "categorias", "destaques"]);
    expect(v.categorias).toEqual([
      { slug: "meias", nome: "Meias" },
      { slug: "agua-e-sol", nome: "Água e Sol" },
    ]);
    expect(Object.keys(v.destaques[0]).sort()).toEqual(CHAVES_CARTAO);
    expect(v.destaques[0]).toMatchObject({
      codigo: "#0042",
      href: "/p/0042",
      nome: "Produto 42",
      preco: "R$ 12,90",
      esgotado: false,
      capa: { url: `/fotos/${ARQ1}` },
    });
    expect(v.bloco).toMatchObject({ proximo: null, categoria: null });
    expect(v.bloco.itens[1]).toMatchObject({ preco: "Consulte o valor", capa: null });
    expect(Object.keys(v.bloco.itens[0]).sort()).toEqual(CHAVES_CARTAO);
  });

  it("aplica o slug conhecido e passa o id interno só ao SQL", async () => {
    const v = await lerVitrine("meias");
    expect(db.listarBloco).toHaveBeenCalledWith(expect.anything(), { categoriaId: 7 });
    expect(v.bloco.categoria).toBe("meias");
    expect(JSON.stringify(v)).not.toContain('"id"');
  });

  it.each([["desconhecido"], [""], ["Maiusculo!"], [null]])(
    "slug %j cai em Todas com categoria null",
    async (slug) => {
      const v = await lerVitrine(slug);
      expect(db.listarBloco).toHaveBeenCalledWith(expect.anything(), {});
      expect(v.bloco.categoria).toBeNull();
    },
  );
});

describe("lerBloco", () => {
  it("slug desconhecido ⇒ Todas", async () => {
    const b = await lerBloco({ categoria: "nao-existe" });
    expect(b).not.toBe("invalido");
    expect(db.listarBloco).toHaveBeenCalledWith(expect.anything(), {});
    expect(b).toMatchObject({ categoria: null });
  });

  it("cursor inválido ⇒ 'invalido', sem chamar o banco", async () => {
    expect(await lerBloco({ depois: "@@@" })).toBe("invalido");
    expect(await lerBloco({ depois: Buffer.from("abc").toString("base64url") })).toBe("invalido");
    expect(db.listarBloco).not.toHaveBeenCalled();
  });

  it("cursor válido vai ao SQL como { us, id }", async () => {
    await lerBloco({ categoria: "meias", depois: codificarCursor("1700000000123456", 30) });
    expect(db.listarBloco).toHaveBeenCalledWith(expect.anything(), {
      categoriaId: 7,
      depois: { us: "1700000000123456", id: 30 },
    });
  });

  it("haMais ⇒ proximo codificado do último item (24º)", async () => {
    const itens = Array.from({ length: 24 }, (_, i) => cartaoDb(100 - i));
    db.listarBloco.mockResolvedValue({ itens, haMais: true, proximo: { us: "1700000000123456", id: 77 } });
    const b = await lerBloco({});
    if (b === "invalido") throw new Error("inesperado");
    expect(b.itens).toHaveLength(24);
    expect(b.proximo).toBe(codificarCursor("1700000000123456", 77));
  });

  it("sem haMais ⇒ proximo null", async () => {
    const b = await lerBloco({});
    expect(b).toMatchObject({ proximo: null });
  });
});

describe("lerProduto", () => {
  it("devolve ProdutoPublico só com as chaves do DM§1, fotos com alt e whatsapp com href", async () => {
    const p = await lerProduto("42");
    if (p === "nao_encontrado") throw new Error("inesperado");
    expect(db.obterPublico).toHaveBeenCalledWith(expect.anything(), 42);
    expect(Object.keys(p).sort()).toEqual(CHAVES_PUBLICO);
    expect(p.fotos).toEqual([
      { url: `/fotos/${ARQ1}`, alt: "Meia de lã — foto 1 de 2" },
      { url: `/fotos/${ARQ2}`, alt: "Meia de lã — foto 2 de 2" },
    ]);
    expect(p.capa).toEqual(p.fotos[0]);
    expect(p.whatsapp?.href).toMatch(/^https:\/\/wa\.me\/5511999999999\?text=/);
    expect(decodeURIComponent(p.whatsapp!.href)).toContain("/p/0042");
  });

  it("whatsapp null se esgotado", async () => {
    db.obterPublico.mockResolvedValue(publicoDb({ esgotado: true }));
    const p = await lerProduto("0042");
    expect(p).toMatchObject({ whatsapp: null, esgotado: true });
  });

  it("whatsapp null sem número válido", async () => {
    vi.stubEnv("WHATSAPP_NUMBER", "inválido");
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await lerProduto("42")).toMatchObject({ whatsapp: null });
  });

  it("descrição vazia vira null; sem fotos, capa null e fotos []", async () => {
    db.obterPublico.mockResolvedValue(publicoDb({ descricao: null, fotos: [] }));
    expect(await lerProduto("42")).toMatchObject({ descricao: null, fotos: [], capa: null });
  });

  it.each([["42", true], ["abc", false], ["0", false], ["-1", false], ["", false], ["99999999999", false]])(
    "código %j",
    async (codigo, existe) => {
      const r = await lerProduto(codigo);
      if (existe) expect(r).not.toBe("nao_encontrado");
      else {
        expect(r).toBe("nao_encontrado");
        expect(db.obterPublico).not.toHaveBeenCalled();
      }
    },
  );

  it("inexistente ⇒ nao_encontrado", async () => {
    db.obterPublico.mockResolvedValue(null);
    expect(await lerProduto("0999")).toBe("nao_encontrado");
  });
});

describe("lerFoto", () => {
  it("devolve a chave só quando fotoPublica é true", async () => {
    expect(await lerFoto(ARQ3)).toBe(`fotos/${ARQ3}`);
    db.fotoPublica.mockResolvedValue(false);
    expect(await lerFoto(ARQ3)).toBeNull();
  });

  it("arquivo malformado ⇒ null sem consultar o banco", async () => {
    expect(await lerFoto("../segredo.webp")).toBeNull();
    expect(db.fotoPublica).not.toHaveBeenCalled();
  });
});

describe("falha do banco (FR-024)", () => {
  const falha = new Error("connection refused host=secreto");

  const leituras: [string, () => Promise<unknown>][] = [
    ["lerVitrine", () => lerVitrine()],
    ["lerBloco", () => lerBloco({})],
    ["lerProduto", () => lerProduto("42")],
    ["lerFoto", () => lerFoto(ARQ1)],
  ];

  it.each(leituras)("%s marca causa = banco no ctx e relança", async (_nome, ler) => {
    db.listarDestaques.mockRejectedValue(falha);
    db.categoriasComProdutos.mockRejectedValue(falha);
    db.listarBloco.mockRejectedValue(falha);
    db.obterPublico.mockRejectedValue(falha);
    db.fotoPublica.mockRejectedValue(falha);
    await expect(ler()).rejects.toBe(falha);
    expect(ctx.roseshop.causa).toBe("banco");
  });

  it("lerProduto nunca devolve nao_encontrado por falha", async () => {
    db.obterPublico.mockRejectedValue(falha);
    await expect(lerProduto("42")).rejects.toBeDefined();
  });

  it("chave de foto fora do padrão é descartada, sem marcar a causa", async () => {
    db.obterPublico.mockResolvedValue(publicoDb({ fotos: ["fora-do-padrao"] }));
    expect(await lerProduto("42")).toMatchObject({ fotos: [], capa: null });
    expect(ctx.roseshop.causa).toBeNull();
  });

  it("sem ctx.roseshop (fora do worker) ainda relança o erro original", async () => {
    vi.mocked(getCloudflareContext).mockResolvedValue({ ctx: {} } as never);
    db.obterPublico.mockRejectedValue(falha);
    await expect(lerProduto("42")).rejects.toBe(falha);
  });
});
