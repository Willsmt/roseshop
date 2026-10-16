import { getCloudflareContext } from "@opennextjs/cloudflare";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as sql from "@/lib/db/catalogo";

import { codificarCursor } from "./cursor";
import { BancoIndisponivel, lerBloco, lerConferencia, lerFoto, lerProduto, lerVitrine } from "./leitura";

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
  conferirProdutos: vi.fn(),
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
  db.conferirProdutos.mockReset().mockResolvedValue([]);
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

  it("campos internos que a linha do banco traga a mais nunca chegam às visões (DM§1, FR-002)", async () => {
    const internos = {
      categoriaId: 7,
      versao: 3,
      fotosVersao: 2,
      fotosOperacao: "op-1",
      destaqueVaga: 1,
      criadoPor: "a@x.com",
      atualizadoPor: "a@x.com",
      atualizadoEm: "2026-10-01",
    };
    db.obterPublico.mockResolvedValue({ ...publicoDb(), ...internos } as sql.ProdutoPublicoDb);
    db.listarDestaques.mockResolvedValue([{ ...cartaoDb(42), ...internos } as sql.CartaoDb]);
    db.listarBloco.mockResolvedValue({
      itens: [{ ...cartaoDb(43), ...internos } as sql.CartaoDb],
      haMais: false,
      proximo: null,
    });
    const p = await lerProduto("42");
    const v = await lerVitrine("meias");
    if (p === "nao_encontrado") throw new Error("inesperado");
    expect(Object.keys(p).sort()).toEqual(CHAVES_PUBLICO);
    expect(Object.keys(v.destaques[0]).sort()).toEqual(CHAVES_CARTAO);
    expect(Object.keys(v.bloco.itens[0]).sort()).toEqual(CHAVES_CARTAO);
    const texto = JSON.stringify({ p, v });
    for (const campo of [...Object.keys(internos), '"id"', "a@x.com", '"fotos/']) {
      expect(texto).not.toContain(campo);
    }
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

// Feature 006, SF3 (T025): conferência da sacola (CC§2, data-model §2). Códigos já validados pela
// rota; a leitura converte para id, consulta UMA vez e responde um item por código, na ordem pedida.
describe("lerConferencia (T025)", () => {
  it("converte o código canônico em id e chama conferirProdutos uma vez, na ordem pedida", async () => {
    await lerConferencia(["0042", "12345", "0007"]);
    expect(db.conferirProdutos).toHaveBeenCalledTimes(1);
    expect(db.conferirProdutos).toHaveBeenCalledWith(expect.anything(), [42, 12345, 7]);
  });

  it("um item por código, NA ORDEM PEDIDA (mesmo que o banco devolva outra ordem)", async () => {
    db.conferirProdutos.mockResolvedValue([cartaoDb(12345), cartaoDb(7), cartaoDb(42)]);
    const r = await lerConferencia(["0042", "0007", "12345"]);
    expect(r.map((i) => i.codigo)).toEqual(["0042", "0007", "12345"]);
  });

  it("disponível ⇒ estado ok com produto { nome, href, precoCentavos, aPartirDe, capa }", async () => {
    db.conferirProdutos.mockResolvedValue([cartaoDb(42, { nome: "Meia", precoCentavos: 600 })]);
    const [item] = await lerConferencia(["0042"]);
    expect(item).toEqual({
      codigo: "0042",
      estado: "ok",
      produto: {
        nome: "Meia",
        href: "/p/0042",
        precoCentavos: 600,
        aPartirDe: false,
        capa: { url: `/fotos/${ARQ1}`, alt: "Meia" },
      },
    });
  });

  it("esgotado ⇒ estado esgotado com produto; sem preço e sem capa vira null", async () => {
    db.conferirProdutos.mockResolvedValue([
      cartaoDb(7, { nome: "Guarda-chuva", esgotado: true, precoCentavos: null, capaChave: null }),
    ]);
    const [item] = await lerConferencia(["0007"]);
    expect(item).toEqual({
      codigo: "0007",
      estado: "esgotado",
      produto: {
        nome: "Guarda-chuva",
        href: "/p/0007",
        precoCentavos: null,
        aPartirDe: false,
        capa: null,
      },
    });
  });

  it("ausente ⇒ { codigo, estado: 'inexistente' } sem a chave produto", async () => {
    db.conferirProdutos.mockResolvedValue([]);
    const [item] = await lerConferencia(["12345"]);
    expect(item).toEqual({ codigo: "12345", estado: "inexistente" });
    expect("produto" in item).toBe(false);
  });

  it("misto: ok, esgotado e inexistente nas posições pedidas; codigo é a string pedida", async () => {
    db.conferirProdutos.mockResolvedValue([
      cartaoDb(7, { esgotado: true, precoCentavos: null }),
      cartaoDb(42, { aPartirDe: true }),
    ]);
    const r = await lerConferencia(["12345", "0042", "0007"]);
    expect(r.map((i) => [i.codigo, i.estado])).toEqual([
      ["12345", "inexistente"],
      ["0042", "ok"],
      ["0007", "esgotado"],
    ]);
    expect(r[1]).toMatchObject({ produto: { aPartirDe: true } });
  });

  it("só as chaves do contrato: nenhum id, categoria, versão ou chave de objeto vaza", async () => {
    db.conferirProdutos.mockResolvedValue([
      { ...cartaoDb(42), categoriaId: 7, versao: 3, destaqueVaga: 1, criadoPor: "a@x.com" } as sql.CartaoDb,
    ]);
    const [item] = await lerConferencia(["0042"]);
    if (item.estado === "inexistente") throw new Error("inesperado");
    expect(Object.keys(item).sort()).toEqual(["codigo", "estado", "produto"]);
    expect(Object.keys(item.produto).sort()).toEqual(["aPartirDe", "capa", "href", "nome", "precoCentavos"]);
    const texto = JSON.stringify(item);
    for (const proibido of ['"id"', "categoriaId", "versao", "destaqueVaga", "a@x.com", '"fotos/']) {
      expect(texto).not.toContain(proibido);
    }
  });

  it("chave de foto fora do padrão ⇒ capa null (como o cartão da 005)", async () => {
    db.conferirProdutos.mockResolvedValue([cartaoDb(42, { capaChave: "fora-do-padrao" })]);
    const [item] = await lerConferencia(["0042"]);
    expect(item).toMatchObject({ estado: "ok", produto: { capa: null } });
  });

  describe("falha do banco", () => {
    const falha = new Error("connection refused host=secreto");

    it("conferirProdutos rejeita ⇒ marca causa banco e lança BancoIndisponivel com cause", async () => {
      db.conferirProdutos.mockRejectedValue(falha);
      const erro = await lerConferencia(["0042"]).catch((e: unknown) => e);
      expect(erro).toBeInstanceOf(BancoIndisponivel);
      expect(erro).toBeInstanceOf(Error);
      expect((erro as Error).cause).toBe(falha);
      expect(ctx.roseshop.causa).toBe("banco");
    });

    it("dbDoContexto rejeita ⇒ também BancoIndisponivel", async () => {
      const { dbDoContexto } = await import("@/lib/db/contexto");
      vi.mocked(dbDoContexto).mockRejectedValueOnce(falha);
      const erro = await lerConferencia(["0042"]).catch((e: unknown) => e);
      expect(erro).toBeInstanceOf(BancoIndisponivel);
      expect((erro as Error).cause).toBe(falha);
      expect(ctx.roseshop.causa).toBe("banco");
    });

    it("nunca devolve 'inexistente' por causa de falha", async () => {
      db.conferirProdutos.mockRejectedValue(falha);
      await expect(lerConferencia(["0042"])).rejects.toBeInstanceOf(BancoIndisponivel);
    });
  });
});
