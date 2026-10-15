import fs from "node:fs";
import path from "node:path";

import ts from "typescript";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ProdutoPublico } from "@/lib/catalogo";

// Feature 005, T041 (primeira parte), T047 e T047a: o catálogo público não tem sessão. Será
// ampliado nas SF7 e SF8 (páginas sem ações do painel). Nega por padrão: a rota pública de fotos
// DEVE existir e exportar GET, e a varredura de sessão cobre todo `src/app`, menos as áreas que
// têm sessão ou segredo próprio (painel/, api/auth/ e api/interno/).

const RAIZ_APP = "src/app";
const FORA_DA_VARREDURA = ["src/app/painel", "src/app/api/auth", "src/app/api/interno"];
const ROTA_FOTOS = "src/app/fotos/[arquivo]/route.ts";

const chaveDoArquivo = vi.hoisted(() => vi.fn());
const servirObjeto = vi.hoisted(() => vi.fn());
const lerFoto = vi.hoisted(() => vi.fn());
const registrarFalha = vi.hoisted(() => vi.fn());
// `lerBloco` do catálogo delega para a leitura REAL (T047), sobre o SQL mockado.
const lerBlocoReal = vi.hoisted(() => vi.fn());
const listarBloco = vi.hoisted(() => vi.fn());
const categoriasComProdutos = vi.hoisted(() => vi.fn());
// Cópia da regra de src/lib/r2/chaves.ts (função pura; submódulo de r2 não é importável).
const ARQUIVO_VALIDO_MOCK =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(webp|jpg)$/;
vi.mock("@/lib/r2", () => ({
  chaveDoArquivo,
  servirObjeto,
  arquivoDaChave: (c: string) => {
    const a = c.startsWith("fotos/") ? c.slice(6) : "";
    return ARQUIVO_VALIDO_MOCK.test(a) ? a : null;
  },
}));
vi.mock("@/lib/catalogo", () => ({
  lerFoto,
  registrarFalha,
  lerBloco: (q: unknown) => lerBlocoReal(q),
}));
vi.mock("@/lib/db/contexto", () => ({ dbDoContexto: vi.fn(async () => ({ db: true })) }));
vi.mock("@/lib/db/catalogo", () => ({ listarBloco, categoriasComProdutos }));
vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: vi.fn(async () => ({ ctx: {} })),
}));

function arquivosFonte(dir: string): string[] {
  const abs = path.join(process.cwd(), dir);
  if (!fs.existsSync(abs)) return [];
  const out: string[] = [];
  for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
    const rel = path.posix.join(dir, e.name);
    if (FORA_DA_VARREDURA.includes(rel)) continue;
    if (e.isDirectory()) out.push(...arquivosFonte(rel));
    else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) out.push(rel);
  }
  return out;
}

// Módulos de sessão: o alias `@/lib/auth`, o próprio diretório (por import relativo) e o
// Auth.js (`next-auth`, `@auth/*`).
const ALIAS_AUTH = /^@\/lib\/auth(\/|$)/;
const DIR_AUTH = /^src\/lib\/auth(\/|$)/;
const PACOTE_AUTH = /^(next-auth|@auth\/[^/]+)(\/|$)/;

function ehModuloDeSessao(arquivo: string, especificador: string): boolean {
  if (ALIAS_AUTH.test(especificador) || PACOTE_AUTH.test(especificador)) return true;
  if (!especificador.startsWith(".")) return false;
  const resolvido = path.posix.normalize(path.posix.join(path.posix.dirname(arquivo), especificador));
  return DIR_AUTH.test(resolvido);
}

export function violacoesDeSessao(arquivo: string, conteudo: string): string[] {
  const sf = ts.createSourceFile(arquivo, conteudo, ts.ScriptTarget.Latest, true);
  const v: string[] = [];
  const visita = (n: ts.Node) => {
    if (
      (ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) &&
      n.moduleSpecifier &&
      ts.isStringLiteral(n.moduleSpecifier) &&
      ehModuloDeSessao(arquivo, n.moduleSpecifier.text)
    ) {
      v.push(`${arquivo}: importa ${n.moduleSpecifier.text}`);
    }
    if (
      ts.isCallExpression(n) &&
      ((ts.isIdentifier(n.expression) && n.expression.text === "getAdminSession") ||
        (ts.isPropertyAccessExpression(n.expression) &&
          n.expression.name.text === "getAdminSession"))
    ) {
      v.push(`${arquivo}: chama getAdminSession`);
    }
    if (
      ts.isCallExpression(n) &&
      n.expression.kind === ts.SyntaxKind.ImportKeyword &&
      n.arguments[0] &&
      ts.isStringLiteralLike(n.arguments[0]) &&
      ehModuloDeSessao(arquivo, n.arguments[0].text)
    ) {
      v.push(`${arquivo}: import dinâmico de ${n.arguments[0].text}`);
    }
    if (
      ts.isCallExpression(n) &&
      ts.isIdentifier(n.expression) &&
      n.expression.text === "require" &&
      n.arguments[0] &&
      ts.isStringLiteralLike(n.arguments[0]) &&
      ehModuloDeSessao(arquivo, n.arguments[0].text)
    ) {
      v.push(`${arquivo}: require de ${n.arguments[0].text}`);
    }
    ts.forEachChild(n, visita);
  };
  visita(sf);
  return v;
}

describe("catálogo público sem sessão (T041)", () => {
  it("nenhum arquivo de src/app (fora de painel/, api/auth/ e api/interno/) toca na sessão", () => {
    const arquivos = arquivosFonte(RAIZ_APP);
    // Nega por padrão: uma varredura que não enxerga as rotas públicas não prova nada.
    expect(arquivos.filter((f) => f.startsWith("src/app/fotos/")).length).toBeGreaterThan(0);
    expect(arquivos.filter((f) => f.startsWith("src/app/api/catalogo/")).length).toBeGreaterThan(0);
    expect(arquivos.filter((f) => f.startsWith("src/app/painel/"))).toEqual([]);
    const violacoes = arquivos.flatMap((f) =>
      violacoesDeSessao(f, fs.readFileSync(path.join(process.cwd(), f), "utf8")),
    );
    expect(violacoes).toEqual([]);
  });

  describe("violacoesDeSessao com fonte sintética (T047a)", () => {
    const AQUI = "src/app/fotos/[arquivo]/route.ts";
    it.each([
      ['import { x } from "@/lib/auth";', "alias"],
      ['import { x } from "@/lib/auth/guard";', "alias com subcaminho"],
      ['import { x } from "../../../lib/auth";', "relativo"],
      ['import { x } from "../../../lib/auth/guard";', "relativo com subcaminho"],
      ['import NextAuth from "next-auth";', "next-auth"],
      ['import { x } from "next-auth/react";', "next-auth com subcaminho"],
      ['import { x } from "@auth/core";', "@auth/*"],
      ['export { x } from "@/lib/auth";', "reexport"],
      ['const m = await import("@/lib/auth");', "import dinâmico"],
      ['const m = require("../../../lib/auth");', "require relativo"],
      ["async function f() { return getAdminSession(); }", "chamada direta"],
      ["async function f() { return auth.getAdminSession(); }", "chamada por propriedade"],
    ])("detecta %s (%s)", (fonte) => {
      expect(violacoesDeSessao(AQUI, fonte)).toHaveLength(1);
    });

    it.each([
      'import { lerFoto } from "@/lib/catalogo";',
      'import { x } from "../../../lib/catalogo";',
      'import { x } from "./auth-nao";',
      'import { x } from "@/lib/authz";',
      'import { x } from "next-authx";',
    ])("não acusa %s", (fonte) => {
      expect(violacoesDeSessao(AQUI, fonte)).toEqual([]);
    });
  });

  it("a página inicial pública existe e não importa sessão nem chama getAdminSession (T068)", () => {
    const arquivo = "src/app/(public)/page.tsx";
    const abs = path.join(process.cwd(), arquivo);
    expect(fs.existsSync(abs), `${arquivo} não encontrada`).toBe(true);
    expect(violacoesDeSessao(arquivo, fs.readFileSync(abs, "utf8"))).toEqual([]);
    expect(arquivosFonte(RAIZ_APP)).toContain(arquivo);
  });

  it("a rota pública de fotos existe e exporta GET (nega por padrão)", () => {
    const abs = path.join(process.cwd(), ROTA_FOTOS);
    expect(fs.existsSync(abs), `${ROTA_FOTOS} não encontrada`).toBe(true);
    const sf = ts.createSourceFile(
      ROTA_FOTOS,
      fs.readFileSync(abs, "utf8"),
      ts.ScriptTarget.Latest,
      true,
    );
    const exportaGet = sf.statements.some(
      (s) =>
        (ts.isFunctionDeclaration(s) &&
          s.name?.text === "GET" &&
          s.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) ||
        (ts.isVariableStatement(s) &&
          s.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) &&
          s.declarationList.declarations.some(
            (d) => ts.isIdentifier(d.name) && d.name.text === "GET",
          )),
    );
    expect(exportaGet, "sem export de GET").toBe(true);
  });

  describe("US6.2 a 6.4: o 404 é byte a byte igual nos quatro casos", () => {
    const ID = "3f2b8c1e-9a4d-4e6f-8b7a-1c2d3e4f5a6b";
    const ARQUIVO_VALIDO =
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(webp|jpg)$/;

    beforeEach(() => {
      chaveDoArquivo
        .mockReset()
        .mockImplementation((a: string) => (ARQUIVO_VALIDO.test(a) ? `fotos/${a}` : null));
      lerFoto.mockReset().mockResolvedValue(`fotos/${ID}.webp`);
      servirObjeto.mockReset().mockResolvedValue(null);
      registrarFalha.mockReset();
    });

    async function bruto(arquivo: string): Promise<string> {
      const { GET } = await import("../../app/fotos/[arquivo]/route");
      const r = await GET(new Request(`http://localhost/fotos/${arquivo}`), {
        params: Promise.resolve({ arquivo }),
      });
      const bytes = Buffer.from(await r.arrayBuffer()).toString("hex");
      const cab = [...r.headers.entries()].sort(([a], [b]) => a.localeCompare(b));
      return JSON.stringify({ status: r.status, cab, bytes });
    }

    it("malformada, pendente, removida/inventada e objeto ausente no R2 produzem a mesma resposta", async () => {
      const malformada = await bruto("../x");
      const pendente = await (async () => {
        lerFoto.mockResolvedValue(null);
        return bruto(`${ID}.webp`);
      })();
      const inventado = await bruto("0f2b8c1e-9a4d-4e6f-8b7a-1c2d3e4f5a6b.jpg");
      const r2Ausente = await (async () => {
        lerFoto.mockResolvedValue(`fotos/${ID}.webp`);
        servirObjeto.mockResolvedValue(null);
        return bruto(`${ID}.webp`);
      })();
      expect(JSON.parse(malformada).status).toBe(404);
      expect(JSON.parse(malformada).bytes).toBe("");
      expect(pendente).toBe(malformada);
      expect(inventado).toBe(malformada);
      expect(r2Ausente).toBe(malformada);
    });
  });

  describe("GET /api/catalogo/produtos expõe só o que a lista fechada permite (T047)", () => {
    const CHAVES_CARTAO = ["capa", "codigo", "esgotado", "href", "nome", "preco"];
    const CHAVES_ENVELOPE = ["categoria", "itens", "proximo"];
    const ARQ = "11111111-1111-4111-8111-111111111111.webp";
    const US = "1789000000123456";

    function linhas(n: number) {
      return Array.from({ length: n }, (_, i) => ({
        id: 100 - i,
        nome: `Produto ${100 - i}`,
        precoCentavos: 1290,
        aPartirDe: false,
        esgotado: i % 2 === 0,
        capaChave: i % 3 === 0 ? null : `fotos/${ARQ}`,
        // Campo que a visão pública NÃO pode repassar (FR-002): o mapeamento precisa descartá-lo.
        criadoPor: "admin@example.com",
      }));
    }

    async function chamar() {
      const { GET } = await import("../../app/api/catalogo/produtos/route");
      const r = await GET(new Request("http://localhost/api/catalogo/produtos"));
      return (await r.json()) as {
        itens: Record<string, unknown>[];
        proximo: string | null;
        categoria: string | null;
      };
    }

    beforeEach(async () => {
      const real = await vi.importActual<typeof import("@/lib/catalogo/leitura")>(
        "@/lib/catalogo/leitura",
      );
      lerBlocoReal.mockReset().mockImplementation(real.lerBloco);
      categoriasComProdutos.mockReset().mockResolvedValue([{ id: 7, nome: "Meias", slug: "meias" }]);
    });

    it("as chaves do envelope e de cada item são exatamente as da lista fechada, sem e-mail", async () => {
      listarBloco.mockReset().mockResolvedValue({ itens: linhas(24), haMais: false, proximo: null });
      const corpo = await chamar();
      expect(Object.keys(corpo).sort()).toEqual(CHAVES_ENVELOPE);
      expect(corpo.itens).toHaveLength(24);
      for (const item of corpo.itens) {
        expect(Object.keys(item).sort()).toEqual(CHAVES_CARTAO);
      }
      expect(JSON.stringify(corpo)).not.toContain("@");
    });

    it("com mais de 24 produtos, o proximo decodificado é só <µs>.<código do 24º>", async () => {
      const itens = linhas(24);
      listarBloco.mockReset().mockResolvedValue({
        itens,
        haMais: true,
        proximo: { us: US, id: itens[23].id },
      });
      const corpo = await chamar();
      expect(corpo.proximo).not.toBeNull();
      expect(corpo.proximo).toMatch(/^[A-Za-z0-9_-]+$/);
      const decodificado = Buffer.from(corpo.proximo as string, "base64url").toString("utf8");
      expect(decodificado).toMatch(/^\d{1,17}\.\d{1,10}$/);
      expect(decodificado).toBe(`${US}.${itens[23].id}`);
      const ultimo = corpo.itens[23] as { codigo: string };
      expect(Number(ultimo.codigo.replace(/\D/g, ""))).toBe(itens[23].id);
    });
  });

  describe("SF7: layouts e props do detalhe (T061)", () => {
    const LAYOUT_PUBLICO = "src/app/(public)/layout.tsx";
    const LAYOUT_RAIZ = "src/app/layout.tsx";
    const PAGINA_DETALHE = "src/app/(public)/p/[codigo]/page.tsx";
    // `Record<keyof ProdutoPublico, true>` quebra o typecheck se o tipo ganhar ou perder uma chave.
    const CHAVES: Record<keyof ProdutoPublico, true> = {
      capa: true,
      categoria: true,
      codigo: true,
      descricao: true,
      esgotado: true,
      fotos: true,
      href: true,
      nome: true,
      preco: true,
      whatsapp: true,
    };
    const CHAVES_PRODUTO_PUBLICO = Object.keys(CHAVES);

    it("o layout (public) exporta metadata.robots { index: false, follow: false }", async () => {
      const mod = (await import("../../app/(public)/layout")) as {
        metadata: { robots?: unknown };
      };
      expect(mod.metadata.robots).toEqual({ index: false, follow: false });
    });

    it("o layout raiz tem lang=\"pt-BR\" e não tem Create Next App", () => {
      const fonte = fs.readFileSync(path.join(process.cwd(), LAYOUT_RAIZ), "utf8");
      expect(fonte).toMatch(/lang=["{]+\s*["']?pt-BR/);
      expect(fonte).not.toContain("Create Next App");
      expect(fonte).not.toMatch(/lang="en"/);
      expect(fs.existsSync(path.join(process.cwd(), LAYOUT_PUBLICO))).toBe(true);
    });

    it("os componentes (não-DOM) da página do detalhe só recebem props com chaves de ProdutoPublico (US2.7)", async () => {
      const produto: ProdutoPublico = {
        codigo: "#0042",
        href: "/p/0042",
        nome: "Meia",
        preco: "R$ 12,90",
        esgotado: false,
        capa: { url: "/fotos/a.webp", alt: "Meia" },
        categoria: "Meias",
        descricao: "d",
        fotos: [{ url: "/fotos/a.webp", alt: "Meia — foto 1 de 1" }],
        whatsapp: { href: "https://wa.me/5511999999999?text=x" },
      };
      expect(Object.keys(produto).sort()).toEqual([...CHAVES_PRODUTO_PUBLICO].sort());
      vi.doMock("@/lib/catalogo", () => ({
        lerProduto: vi.fn(async () => produto),
        configCatalogo: () => ({ whatsapp: "+5511999999999", siteUrl: null }),
      }));
      vi.doMock("next/link", () => ({ default: "a" }));
      const { default: Page } = await import("../../app/(public)/p/[codigo]/page");
      const arvore = await Page({ params: Promise.resolve({ codigo: "0042" }) });

      const componentes: Record<string, unknown>[] = [];
      const visita = (n: unknown): void => {
        if (Array.isArray(n)) return n.forEach(visita);
        if (n === null || typeof n !== "object" || !("props" in n)) return;
        const el = n as { type: unknown; props: Record<string, unknown> };
        if (typeof el.type !== "string") componentes.push(el.props);
        visita(el.props.children);
      };
      visita(arvore);

      expect(fs.existsSync(path.join(process.cwd(), PAGINA_DETALHE))).toBe(true);
      for (const props of componentes) {
        const extras = Object.keys(props).filter(
          // `voltar` é a opção do LinkCatalogo (SF9), não um dado do produto.
          (k) => k !== "children" && k !== "voltar" && !CHAVES_PRODUTO_PUBLICO.includes(k),
        );
        expect(extras).toEqual([]);
      }
    });
  });
});
