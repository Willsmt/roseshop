import fs from "node:fs";
import path from "node:path";

import ts from "typescript";
import { describe, expect, it } from "vitest";

// Feature 004, T065: na rota de exibição das fotos, getAdminSession (barrel de auth) é chamado
// antes de qualquer uso de identificador importado de "@/lib/r2" ou "@/lib/fotos/exibicao".
// Nega por padrão: sem a rota, sem GET ou sem getAdminSession, falha.

const ROTA = "src/app/painel/fotos/[arquivo]/route.ts";
const AUTH = "@/lib/auth";
const GUARDADOS = ["@/lib/r2", "@/lib/fotos/exibicao"];

function parse(arquivo: string, conteudo: string): ts.SourceFile {
  return ts.createSourceFile(arquivo, conteudo, ts.ScriptTarget.Latest, true);
}

// Nomes locais importados (runtime) de um módulo. Namespace conta como o nome do namespace.
function nomesImportados(sf: ts.SourceFile, modulo: string): string[] {
  const out: string[] = [];
  for (const s of sf.statements) {
    if (
      !ts.isImportDeclaration(s) ||
      !ts.isStringLiteral(s.moduleSpecifier) ||
      s.moduleSpecifier.text !== modulo ||
      s.importClause?.isTypeOnly
    ) {
      continue;
    }
    const c = s.importClause;
    if (c?.name) out.push(c.name.text);
    const nb = c?.namedBindings;
    if (nb && ts.isNamespaceImport(nb)) out.push(nb.name.text);
    if (nb && ts.isNamedImports(nb)) {
      for (const e of nb.elements) if (!e.isTypeOnly) out.push(e.name.text);
    }
  }
  return out;
}

const isFn = (n: ts.Node): n is ts.FunctionLikeDeclaration =>
  ts.isFunctionDeclaration(n) ||
  ts.isFunctionExpression(n) ||
  ts.isArrowFunction(n);

function exportGet(sf: ts.SourceFile): ts.FunctionLikeDeclaration | undefined {
  for (const s of sf.statements) {
    if (
      ts.isFunctionDeclaration(s) &&
      s.name?.text === "GET" &&
      s.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
    ) {
      return s;
    }
    if (
      ts.isVariableStatement(s) &&
      s.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
    ) {
      for (const d of s.declarationList.declarations) {
        if (
          ts.isIdentifier(d.name) &&
          d.name.text === "GET" &&
          d.initializer &&
          isFn(d.initializer)
        ) {
          return d.initializer;
        }
      }
    }
  }
  return undefined;
}

// Posição (início) da primeira ocorrência, em ordem de leitura, de `nomes` como identificador
// usado (chamada, referência ou acesso) dentro do corpo, sem contar a declaração do import.
function primeiroUso(corpo: ts.Node, nomes: string[]): number | undefined {
  let menor: number | undefined;
  const visita = (n: ts.Node) => {
    if (ts.isIdentifier(n) && nomes.includes(n.text)) {
      const pos = n.getStart();
      if (menor === undefined || pos < menor) menor = pos;
    }
    ts.forEachChild(n, visita);
  };
  visita(corpo);
  return menor;
}

export function verificarRota(arquivos: Record<string, string>): string[] {
  const fonte = arquivos[ROTA];
  if (fonte === undefined) return [`${ROTA} não encontrada`];
  const sf = parse(ROTA, fonte);
  const v: string[] = [];
  const fn = exportGet(sf);
  if (!fn?.body) return [`${ROTA}: sem export de GET`];

  if (!nomesImportados(sf, AUTH).includes("getAdminSession")) {
    v.push(`${ROTA}: getAdminSession não é importado de ${AUTH}`);
  }
  const guarda = primeiroUso(fn.body, ["getAdminSession"]);
  if (guarda === undefined) {
    v.push(`${ROTA}: GET sem getAdminSession`);
    return v;
  }
  // Nenhum uso dos módulos protegidos antes do guard, nem fora do GET (ex.: topo do módulo).
  const protegidos = GUARDADOS.flatMap((m) => nomesImportados(sf, m));
  for (const s of sf.statements) {
    if (ts.isImportDeclaration(s)) continue;
    if (s.getStart() <= fn.getStart() && fn.getEnd() <= s.getEnd()) continue; // contém o GET
    if (primeiroUso(s, protegidos) !== undefined) {
      v.push(
        `${ROTA}: identificador de r2/exibicao usado fora do GET (antes do guard)`,
      );
    }
  }
  const uso = primeiroUso(fn.body, protegidos);
  if (uso !== undefined && uso < guarda) {
    v.push(`${ROTA}: ${GUARDADOS.join(" / ")} usado antes de getAdminSession`);
  }
  if (protegidos.length === 0) {
    v.push(
      `${ROTA}: não importa nada de ${GUARDADOS.join(" nem de ")} (rota incompleta)`,
    );
  }
  return v;
}

function lerRota(): Record<string, string> {
  const abs = path.join(process.cwd(), ROTA);
  return fs.existsSync(abs) ? { [ROTA]: fs.readFileSync(abs, "utf8") } : {};
}

describe("guard da rota de fotos (T065)", () => {
  it("a rota real chama getAdminSession antes de qualquer uso de r2/exibicao", () => {
    expect(verificarRota(lerRota())).toEqual([]);
  });
});

describe("autoteste do detector da rota (a violação seria pega)", () => {
  const cabeca =
    `import { getAdminSession } from "@/lib/auth";\n` +
    `import { chaveDoArquivo, servirObjeto } from "@/lib/r2";\n` +
    `import { fotoExibivel } from "@/lib/fotos/exibicao";\n`;
  const rota = (corpo: string) =>
    verificarRota({
      [ROTA]: `${cabeca}export async function GET(req: Request, ctx: any) {\n${corpo}\n}`,
    });

  it("aceita guard primeiro", () => {
    expect(
      rota(
        `const s = await getAdminSession();\nif (!s) return new Response(null,{status:404});\nconst c = chaveDoArquivo("x");\nawait fotoExibivel(c!);\nawait servirObjeto(c!, null);`,
      ),
    ).toEqual([]);
  });

  it("pega r2 antes do guard", () => {
    expect(
      rota(`const c = chaveDoArquivo("x");\nawait getAdminSession();`).length,
    ).toBeGreaterThan(0);
  });

  it("pega exibicao antes do guard", () => {
    expect(
      rota(`await fotoExibivel("x");\nawait getAdminSession();`).length,
    ).toBeGreaterThan(0);
  });

  it("pega rota sem guard e rota ausente", () => {
    expect(rota(`await servirObjeto("x", null);`).length).toBeGreaterThan(0);
    expect(verificarRota({})).toHaveLength(1);
  });

  it("pega uso no topo do módulo e guard importado de outro lugar", () => {
    const topo = `${cabeca}const k = chaveDoArquivo("x");\nexport async function GET() { await getAdminSession(); }`;
    expect(verificarRota({ [ROTA]: topo }).length).toBeGreaterThan(0);
    const outro = `import { getAdminSession } from "./outro";\nimport { servirObjeto } from "@/lib/r2";\nexport async function GET() { await getAdminSession(); await servirObjeto("x", null); }`;
    expect(verificarRota({ [ROTA]: outro }).length).toBeGreaterThan(0);
  });
});
