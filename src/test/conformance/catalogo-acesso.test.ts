import fs from "node:fs";
import path from "node:path";

import ts from "typescript";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Feature 005, T041 (primeira parte): o catálogo público não tem sessão. Será ampliado nas SF5
// (GET da lista), SF7 e SF8 (páginas sem ações do painel). Nega por padrão: a rota pública de
// fotos DEVE existir e exportar GET; diretórios ainda inexistentes não falham.

const DIRETORIOS = ["src/app/fotos", "src/app/api/catalogo", "src/app/(public)"];
const ROTA_FOTOS = "src/app/fotos/[arquivo]/route.ts";

const chaveDoArquivo = vi.hoisted(() => vi.fn());
const servirObjeto = vi.hoisted(() => vi.fn());
const lerFoto = vi.hoisted(() => vi.fn());
const registrarFalha = vi.hoisted(() => vi.fn());
vi.mock("@/lib/r2", () => ({ chaveDoArquivo, servirObjeto }));
vi.mock("@/lib/catalogo", () => ({ lerFoto, registrarFalha }));

function arquivosFonte(dir: string): string[] {
  const abs = path.join(process.cwd(), dir);
  if (!fs.existsSync(abs)) return [];
  const out: string[] = [];
  for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
    const rel = path.posix.join(dir, e.name);
    if (e.isDirectory()) out.push(...arquivosFonte(rel));
    else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) out.push(rel);
  }
  return out;
}

export function violacoesDeSessao(arquivo: string, conteudo: string): string[] {
  const sf = ts.createSourceFile(arquivo, conteudo, ts.ScriptTarget.Latest, true);
  const v: string[] = [];
  const visita = (n: ts.Node) => {
    if (
      (ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) &&
      n.moduleSpecifier &&
      ts.isStringLiteral(n.moduleSpecifier) &&
      /^@\/lib\/auth(\/|$)/.test(n.moduleSpecifier.text)
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
      /^@\/lib\/auth(\/|$)/.test(n.arguments[0].text)
    ) {
      v.push(`${arquivo}: import dinâmico de ${n.arguments[0].text}`);
    }
    ts.forEachChild(n, visita);
  };
  visita(sf);
  return v;
}

describe("catálogo público sem sessão (T041)", () => {
  it("nenhum arquivo de fotos, api/catalogo e (public) importa @/lib/auth nem chama getAdminSession", () => {
    const violacoes = DIRETORIOS.flatMap(arquivosFonte).flatMap((f) =>
      violacoesDeSessao(f, fs.readFileSync(path.join(process.cwd(), f), "utf8")),
    );
    expect(violacoes).toEqual([]);
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
});
