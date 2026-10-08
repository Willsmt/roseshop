import fs from "node:fs";
import path from "node:path";

import ts from "typescript";
import { describe, expect, it } from "vitest";

// T056 (SF8b): toda page.tsx de produtos chama requireAdminPage (importado do barrel de
// auth) antes de qualquer leitura. Nega por padrão: sem nenhuma page.tsx, falha.

const BASE = "src/app/painel/(protegido)/produtos/";
const BARREL = "@/lib/auth";

function parse(arquivo: string, conteudo: string): ts.SourceFile {
  return ts.createSourceFile(arquivo, conteudo, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}

function importadoDoBarrel(sf: ts.SourceFile, nome: string): boolean {
  return sf.statements.some(
    (s) =>
      ts.isImportDeclaration(s) &&
      !s.importClause?.isTypeOnly &&
      ts.isStringLiteral(s.moduleSpecifier) &&
      s.moduleSpecifier.text === BARREL &&
      s.importClause?.namedBindings !== undefined &&
      ts.isNamedImports(s.importClause.namedBindings) &&
      s.importClause.namedBindings.elements.some(
        (e) => !e.isTypeOnly && e.name.text === nome && (e.propertyName ?? e.name).text === nome,
      ),
  );
}

const isFn = (n: ts.Node): n is ts.FunctionLikeDeclaration =>
  ts.isFunctionDeclaration(n) || ts.isFunctionExpression(n) || ts.isArrowFunction(n);

function exportDefault(sf: ts.SourceFile): ts.FunctionLikeDeclaration | undefined {
  for (const s of sf.statements) {
    if (
      ts.isFunctionDeclaration(s) &&
      s.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) &&
      s.modifiers.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword)
    ) {
      return s;
    }
    if (ts.isExportAssignment(s) && isFn(s.expression)) return s.expression;
  }
  return undefined;
}

// Chamadas no corpo da função (sem descer em funções aninhadas), em ordem de leitura.
function chamadas(corpo: ts.Node): ts.CallExpression[] {
  const out: ts.CallExpression[] = [];
  const visita = (n: ts.Node) => {
    if (isFn(n)) return;
    if (ts.isCallExpression(n)) out.push(n);
    ts.forEachChild(n, visita);
  };
  ts.forEachChild(corpo, visita);
  return out;
}

const ehGuard = (c: ts.CallExpression) =>
  ts.isIdentifier(c.expression) && c.expression.text === "requireAdminPage";

export function verificarPaginasProdutos(arquivos: Record<string, string>): string[] {
  const paginas = Object.keys(arquivos).filter((a) => a.startsWith(BASE) && /\/page\.tsx?$/.test(a));
  if (paginas.length === 0) return [`nenhuma page.tsx encontrada em ${BASE}`];
  const v: string[] = [];
  for (const arquivo of paginas) {
    const sf = parse(arquivo, arquivos[arquivo]);
    const fn = exportDefault(sf);
    if (!fn?.body) {
      v.push(`${arquivo}: sem export default de função`);
      continue;
    }
    if (!importadoDoBarrel(sf, "requireAdminPage")) {
      v.push(`${arquivo}: requireAdminPage não é importado de ${BARREL}`);
    }
    const guarda = chamadas(fn.body).find(ehGuard);
    if (!guarda) {
      v.push(`${arquivo}: sem requireAdminPage`);
      continue;
    }
    const antes = chamadas(fn.body).filter(
      (c) =>
        !ehGuard(c) &&
        c.getStart() < guarda.getStart() &&
        // leituras de dados: qualquer chamada `obter*`/`listar*`
        ts.isIdentifier(c.expression) &&
        /^(obter|listar)/.test(c.expression.text),
    );
    if (antes.length > 0) v.push(`${arquivo}: leitura antes do requireAdminPage`);
  }
  return v;
}

function lerPaginas(dir: string, out: Record<string, string> = {}) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) lerPaginas(abs, out);
    else if (/^page\.tsx?$/.test(e.name)) {
      out[path.relative(process.cwd(), abs).split(path.sep).join("/")] = fs.readFileSync(abs, "utf8");
    }
  }
  return out;
}

const IMPORT = 'import { requireAdminPage } from "@/lib/auth";\n';
const OK = `${IMPORT}export default async function P() {
  await requireAdminPage("/painel/produtos");
  return obterProdutoDoPainel("1");
}`;

describe("conformidade: páginas de produtos chamam requireAdminPage (T056)", () => {
  it("o src/real tem páginas e todas chamam o guard antes de ler", () => {
    const arquivos = lerPaginas(path.join(process.cwd(), BASE));
    expect(Object.keys(arquivos).length).toBeGreaterThan(0);
    expect(verificarPaginasProdutos(arquivos)).toEqual([]);
  });

  it("página correta passa", () => {
    expect(verificarPaginasProdutos({ [`${BASE}page.tsx`]: OK })).toEqual([]);
  });

  it("nega por padrão: nenhuma page.tsx encontrada", () => {
    expect(verificarPaginasProdutos({})).toEqual([`nenhuma page.tsx encontrada em ${BASE}`]);
    expect(verificarPaginasProdutos({ "src/outro/page.tsx": OK })).toHaveLength(1);
  });

  it("página nova sem guard falha", () => {
    const v = verificarPaginasProdutos({
      [`${BASE}page.tsx`]: OK,
      [`${BASE}[id]/extra/page.tsx`]: `${IMPORT}export default function P() { return null; }`,
    });
    expect(v).toEqual([`${BASE}[id]/extra/page.tsx: sem requireAdminPage`]);
  });

  it("guard só em função aninhada não vale", () => {
    const v = verificarPaginasProdutos({
      [`${BASE}page.tsx`]: `${IMPORT}export default async function P() {
  const f = async () => { await requireAdminPage("/x"); };
  return null;
}`,
    });
    expect(v).toEqual([`${BASE}page.tsx: sem requireAdminPage`]);
  });

  it("guard depois da leitura falha", () => {
    const v = verificarPaginasProdutos({
      [`${BASE}page.tsx`]: `${IMPORT}export default async function P() {
  await listarProdutosDoPainel({});
  await requireAdminPage("/painel/produtos");
}`,
    });
    expect(v).toEqual([`${BASE}page.tsx: leitura antes do requireAdminPage`]);
  });

  it("requireAdminPage que não vem do barrel de auth falha", () => {
    const v = verificarPaginasProdutos({
      [`${BASE}page.tsx`]: OK.replace(IMPORT, 'import { requireAdminPage } from "./falso";\n'),
    });
    expect(v).toEqual([`${BASE}page.tsx: requireAdminPage não é importado de ${BARREL}`]);
  });

  it("página sem export default de função falha", () => {
    const v = verificarPaginasProdutos({ [`${BASE}page.tsx`]: `${IMPORT}export const x = 1;` });
    expect(v).toEqual([`${BASE}page.tsx: sem export default de função`]);
  });
});
