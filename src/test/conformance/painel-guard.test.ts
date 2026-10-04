import fs from "node:fs";
import path from "node:path";

import ts from "typescript";
import { describe, expect, it } from "vitest";

// Exceções públicas, POR FUNÇÃO exportada (formato `arquivo#export`), nunca por arquivo.
// O teste nega por padrão: qualquer outra função exportada sem guard é violação.
const EXCECOES_PUBLICAS: readonly string[] = [
  // Handlers do Auth.js (callback do Google, sessão, csrf): precisam ser públicos.
  "src/app/api/auth/[...nextauth]/route.ts#GET",
  "src/app/api/auth/[...nextauth]/route.ts#POST",
  // Verificação de saúde usada pelo smoke pós-deploy.
  "src/app/api/health/route.ts#GET",
  // Entrar não pode exigir sessão.
  "src/lib/auth/actions.ts#entrarComGoogle",
  // Sair sem sessão não tem efeito.
  "src/lib/auth/actions.ts#sair",
];

// Amplia a lista da T034 (GET/POST/PUT/PATCH/DELETE) com HEAD e OPTIONS, no espírito
// de "nega por padrão": um `export function HEAD()` sem guard seria endpoint público.
const HANDLERS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]);
const PROTEGIDO = "src/app/painel/(protegido)/";
const EXT = "(?:tsx?|jsx?|mjs)";
const reCodigo = new RegExp(`\\.${EXT}$`);
const reTeste = new RegExp(`\\.test\\.${EXT}$`); // cobre também *.int.test.*
const reBase = (nome: string) => new RegExp(`^${nome}\\.${EXT}$`);

type Fn = { body: ts.Node | undefined; inlineUseServer: boolean };
const SEM_CORPO: Fn = { body: undefined, inlineUseServer: false };

function isFunctionLike(n: ts.Node): n is ts.FunctionLikeDeclaration {
  return (
    ts.isFunctionDeclaration(n) ||
    ts.isFunctionExpression(n) ||
    ts.isArrowFunction(n) ||
    ts.isMethodDeclaration(n)
  );
}

function isUseServerStatement(s: ts.Statement): boolean {
  return (
    ts.isExpressionStatement(s) &&
    ts.isStringLiteral(s.expression) &&
    s.expression.text === "use server"
  );
}

function fnInfo(node: ts.Node | undefined): Fn {
  if (node && isFunctionLike(node) && node.body) {
    const inline =
      ts.isBlock(node.body) && node.body.statements.length > 0
        ? isUseServerStatement(node.body.statements[0])
        : false;
    return { body: node.body, inlineUseServer: inline };
  }
  return SEM_CORPO;
}

// Existe CallExpression com callee identificador `name` no corpo (sem descer em funções aninhadas).
function chama(body: ts.Node | undefined, names: readonly string[]): boolean {
  if (!body) return false;
  let achou = false;
  const visita = (n: ts.Node) => {
    if (achou) return;
    if (isFunctionLike(n)) return;
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && names.includes(n.expression.text)) {
      achou = true;
      return;
    }
    ts.forEachChild(n, visita);
  };
  if (ts.isBlock(body) || !isFunctionLike(body)) ts.forEachChild(body, visita);
  return achou;
}

const temModificador = (n: ts.Node, kind: ts.SyntaxKind) =>
  ts.canHaveModifiers(n) && (ts.getModifiers(n) ?? []).some((m) => m.kind === kind);
const temExport = (n: ts.Node) => temModificador(n, ts.SyntaxKind.ExportKeyword);
const temDefault = (n: ts.Node) => temModificador(n, ts.SyntaxKind.DefaultKeyword);

// Funções declaradas no topo do arquivo (exportadas ou não), para resolver `export { x as Y }`.
function locais(sf: ts.SourceFile): Map<string, Fn> {
  const out = new Map<string, Fn>();
  for (const s of sf.statements) {
    if (ts.isFunctionDeclaration(s) && s.name) out.set(s.name.text, fnInfo(s));
    else if (ts.isVariableStatement(s)) {
      for (const d of s.declarationList.declarations) {
        if (ts.isIdentifier(d.name)) out.set(d.name.text, fnInfo(d.initializer));
      }
    }
  }
  return out;
}

// Exports nomeados do arquivo. `estrela` = existe `export * from` (não verificável).
function exportsNomeados(sf: ts.SourceFile): { nomeados: Map<string, Fn>; estrela: boolean } {
  const nomeados = new Map<string, Fn>();
  const loc = locais(sf);
  let estrela = false;
  for (const s of sf.statements) {
    if (ts.isFunctionDeclaration(s) && temExport(s) && !temDefault(s) && s.name) {
      nomeados.set(s.name.text, fnInfo(s));
    } else if (ts.isVariableStatement(s) && temExport(s)) {
      for (const d of s.declarationList.declarations) {
        if (ts.isIdentifier(d.name)) {
          nomeados.set(d.name.text, fnInfo(d.initializer));
        } else if (ts.isObjectBindingPattern(d.name)) {
          for (const el of d.name.elements) {
            if (ts.isIdentifier(el.name)) nomeados.set(el.name.text, SEM_CORPO);
          }
        }
      }
    } else if (ts.isExportDeclaration(s) && !s.isTypeOnly) {
      if (s.exportClause && ts.isNamedExports(s.exportClause)) {
        for (const el of s.exportClause.elements) {
          if (el.isTypeOnly) continue;
          const origem = (el.propertyName ?? el.name).text;
          nomeados.set(el.name.text, s.moduleSpecifier ? SEM_CORPO : (loc.get(origem) ?? SEM_CORPO));
        }
      } else {
        estrela = true; // `export * from` ou `export * as ns from`
      }
    }
  }
  return { nomeados, estrela };
}

function exportDefault(sf: ts.SourceFile): Fn | undefined {
  const loc = locais(sf);
  for (const s of sf.statements) {
    if (ts.isFunctionDeclaration(s) && temExport(s) && temDefault(s)) return fnInfo(s);
    if (ts.isExportAssignment(s) && !s.isExportEquals) {
      return ts.isIdentifier(s.expression) ? (loc.get(s.expression.text) ?? SEM_CORPO) : fnInfo(s.expression);
    }
  }
  return undefined;
}

function scriptKind(arquivo: string): ts.ScriptKind {
  if (arquivo.endsWith("tsx")) return ts.ScriptKind.TSX;
  if (arquivo.endsWith("jsx")) return ts.ScriptKind.JSX;
  if (arquivo.endsWith("ts")) return ts.ScriptKind.TS;
  return ts.ScriptKind.JS;
}

export function encontrarSemGuard(
  arquivos: Record<string, string>,
  excecoes: readonly string[],
): string[] {
  const violacoes: string[] = [];
  const candidatos = new Set<string>();
  const excecaoSet = new Set(excecoes);

  for (const [arquivo, conteudo] of Object.entries(arquivos)) {
    if (!reCodigo.test(arquivo) || reTeste.test(arquivo)) continue;

    if (new RegExp(`^src/(middleware|proxy)\\.${EXT}$`).test(arquivo)) {
      violacoes.push(arquivo);
      continue;
    }

    const sf = ts.createSourceFile(arquivo, conteudo, ts.ScriptTarget.Latest, true, scriptKind(arquivo));
    const nomeBase = arquivo.split("/").pop() ?? "";
    const ehRoute = reBase("route").test(nomeBase);
    const ehPage = reBase("page").test(nomeBase);
    const ehLayout = reBase("layout").test(nomeBase);

    // Funções exportadas que exigem requireAdminAction (actions e route handlers).
    const topoUseServer = sf.statements.length > 0 && isUseServerStatement(sf.statements[0]);
    const { nomeados, estrela } = exportsNomeados(sf);
    const padrao = exportDefault(sf);
    const exportados = new Map(nomeados);
    if (padrao && topoUseServer) exportados.set("default", padrao);

    for (const [nome, fn] of exportados) {
      const ehHandler = ehRoute && HANDLERS.has(nome);
      const ehAction = topoUseServer || fn.inlineUseServer;
      if (!ehHandler && !ehAction) continue;
      const id = `${arquivo}#${nome}`;
      candidatos.add(id);
      if (excecaoSet.has(id)) continue;
      if (!chama(fn.body, ["requireAdminAction"])) violacoes.push(id);
    }
    // `export * from` em route ou "use server" não é verificável: sempre violação.
    if (estrela && (ehRoute || topoUseServer)) violacoes.push(`${arquivo}#*`);

    if (arquivo.startsWith(PROTEGIDO) && (ehPage || ehLayout)) {
      const guardas = ehPage ? ["requireAdminPage"] : ["getAdminSession", "requireAdminPage"];
      if (!chama(padrao?.body, guardas)) violacoes.push(`${arquivo}#default`);
    } else if (
      arquivo.startsWith("src/app/painel/") &&
      ehPage &&
      !arquivo.startsWith("src/app/painel/entrar/page.")
    ) {
      violacoes.push(arquivo);
    }
  }

  for (const e of excecoes) {
    if (!candidatos.has(e)) violacoes.push(`exceção inexistente: ${e}`);
  }
  return violacoes;
}

function lerSrc(dir: string, raiz: string, out: Record<string, string> = {}) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) lerSrc(abs, raiz, out);
    else if (reCodigo.test(entry.name) && !reTeste.test(entry.name)) {
      out[path.relative(raiz, abs).split(path.sep).join("/")] = fs.readFileSync(abs, "utf8");
    }
  }
  return out;
}

const ACTIONS_OK = `"use server";
export async function entrarComGoogle(formData: FormData) {}
export async function sair() {}
`;

describe("conformidade do guard do painel (US3-1, US3-2, FR-005, FR-007, SC-003)", () => {
  it("o src/ real não tem violações", () => {
    const raiz = process.cwd();
    const arquivos = lerSrc(path.join(raiz, "src"), raiz);
    expect(encontrarSemGuard(arquivos, EXCECOES_PUBLICAS)).toEqual([]);
  });

  it("reporta função de actions.ts sem requireAdminAction (US3-2, FR-007)", () => {
    const arquivos = {
      "src/lib/auth/actions.ts": `${ACTIONS_OK}export async function apagarTudo() {}\n`,
    };
    const v = encontrarSemGuard(arquivos, [
      "src/lib/auth/actions.ts#entrarComGoogle",
      "src/lib/auth/actions.ts#sair",
    ]);
    expect(v).toContain("src/lib/auth/actions.ts#apagarTudo");
    expect(v).toHaveLength(1);
  });

  it("falha quando uma exceção listada não existe mais", () => {
    const v = encontrarSemGuard({ "src/lib/auth/actions.ts": ACTIONS_OK }, [
      "src/lib/auth/actions.ts#entrarComGoogle",
      "src/lib/auth/actions.ts#sair",
      "src/lib/auth/actions.ts#fantasma",
    ]);
    expect(v).toEqual(["exceção inexistente: src/lib/auth/actions.ts#fantasma"]);
  });

  describe("regras de falha (fixtures)", () => {
    it("route.ts novo sem guard", () => {
      const v = encontrarSemGuard(
        { "src/app/api/novo/route.ts": "export async function GET() { return new Response(); }" },
        [],
      );
      expect(v).toEqual(["src/app/api/novo/route.ts#GET"]);
    });

    it("route.ts com export const arrow sem guard", () => {
      const v = encontrarSemGuard(
        { "src/app/api/novo/route.ts": "export const POST = async () => new Response();" },
        [],
      );
      expect(v).toEqual(["src/app/api/novo/route.ts#POST"]);
    });

    it("route.ts com desestruturação só passa se estiver nas exceções", () => {
      const f = { "src/app/api/x/route.ts": "export const { GET, POST } = handlers;" };
      expect(encontrarSemGuard(f, []).sort()).toEqual([
        "src/app/api/x/route.ts#GET",
        "src/app/api/x/route.ts#POST",
      ]);
      expect(
        encontrarSemGuard(f, ["src/app/api/x/route.ts#GET", "src/app/api/x/route.ts#POST"]),
      ).toEqual([]);
    });

    it("guard dentro de outra função do arquivo não vale", () => {
      const v = encontrarSemGuard(
        {
          "src/app/api/novo/route.ts": `
async function outra() { await requireAdminAction(); }
export async function GET() { return new Response(); }`,
        },
        [],
      );
      expect(v).toEqual(["src/app/api/novo/route.ts#GET"]);
    });

    it('"use server" inline sem guard', () => {
      const v = encontrarSemGuard(
        {
          "src/app/x/acao.ts": `
export async function salvar() { "use server"; return 1; }
export async function comum() { return 2; }`,
        },
        [],
      );
      expect(v).toEqual(["src/app/x/acao.ts#salvar"]);
    });

    it("page.tsx em (protegido) sem requireAdminPage", () => {
      const v = encontrarSemGuard(
        { "src/app/painel/(protegido)/produtos/page.tsx": "export default async function P() { return null; }" },
        [],
      );
      expect(v).toEqual(["src/app/painel/(protegido)/produtos/page.tsx#default"]);
    });

    it("layout.tsx em (protegido) sem getAdminSession nem requireAdminPage", () => {
      const v = encontrarSemGuard(
        { "src/app/painel/(protegido)/layout.tsx": "export default async function L({children}) { return children; }" },
        [],
      );
      expect(v).toEqual(["src/app/painel/(protegido)/layout.tsx#default"]);
    });

    it("page.tsx em src/app/painel/outra/ (fora do grupo)", () => {
      const v = encontrarSemGuard(
        { "src/app/painel/outra/page.tsx": "export default function P() { return null; }" },
        [],
      );
      expect(v).toEqual(["src/app/painel/outra/page.tsx"]);
    });

    it.each(["src/middleware.ts", "src/proxy.ts"])("existência de %s (ADR-003)", (arquivo) => {
      expect(encontrarSemGuard({ [arquivo]: "export function x() {}" }, [])).toEqual([arquivo]);
    });
  });

  describe("casos positivos (fixtures)", () => {
    it("route.ts, action e páginas com guard não têm violação", () => {
      const v = encontrarSemGuard(
        {
          "src/app/api/ok/route.ts":
            "export async function GET() { await requireAdminAction(); return new Response(); }",
          "src/app/api/ok2/route.ts":
            "export const POST = async () => { await requireAdminAction(); return new Response(); };",
          "src/lib/x/actions.ts": `"use server";
export async function a() { await requireAdminAction(); }
export const b = async () => { await requireAdminAction(); };`,
          "src/app/x/acao.ts": `export async function s() { "use server"; await requireAdminAction(); }`,
          "src/app/painel/(protegido)/page.tsx":
            'export default async function P() { await requireAdminPage("/painel"); return null; }',
          "src/app/painel/(protegido)/layout.tsx":
            "export default async function L() { await getAdminSession(); return null; }",
          "src/app/painel/entrar/page.tsx": "export default async function E() { return null; }",
          "src/lib/puro.ts": "export function util() { return 1; }",
          "src/lib/puro.test.ts": "export function x() {}",
        },
        [],
      );
      expect(v).toEqual([]);
    });

    it("função em exceção listada e existente não é violação", () => {
      expect(
        encontrarSemGuard({ "src/lib/auth/actions.ts": ACTIONS_OK }, [
          "src/lib/auth/actions.ts#entrarComGoogle",
          "src/lib/auth/actions.ts#sair",
        ]),
      ).toEqual([]);
    });
  });
});

describe("formas de export que não podem passar caladas (nega por padrão)", () => {
  it("export { handler as GET, handler as POST } sem guard em handler", () => {
    const v = encontrarSemGuard(
      {
        "src/app/api/a/route.ts": `
async function handler() { return new Response(); }
export { handler as GET, handler as POST };`,
      },
      [],
    );
    expect(v.sort()).toEqual(["src/app/api/a/route.ts#GET", "src/app/api/a/route.ts#POST"]);
  });

  it("export { handler as GET } com guard em handler: sem violação", () => {
    const v = encontrarSemGuard(
      {
        "src/app/api/a/route.ts": `
async function handler() { await requireAdminAction(); return new Response(); }
export { handler as GET };`,
      },
      [],
    );
    expect(v).toEqual([]);
  });

  it("export { x as GET } que não resolve para função local é violação", () => {
    const v = encontrarSemGuard(
      { "src/app/api/a/route.ts": "const x = 1;\nexport { x as GET };" },
      [],
    );
    expect(v).toEqual(["src/app/api/a/route.ts#GET"]);
  });

  it('export { apagar } em arquivo "use server" sem guard', () => {
    const v = encontrarSemGuard(
      { "src/lib/a/acoes.ts": `"use server";\nasync function apagar() {}\nexport { apagar };` },
      [],
    );
    expect(v).toEqual(["src/lib/a/acoes.ts#apagar"]);
  });

  it('export { apagar } em "use server" com guard: sem violação', () => {
    const v = encontrarSemGuard(
      {
        "src/lib/a/acoes.ts": `"use server";
async function apagar() { await requireAdminAction(); }
export { apagar };`,
      },
      [],
    );
    expect(v).toEqual([]);
  });

  it('export { x } from "./outro" em "use server" e em route.ts é violação (sem corpo)', () => {
    const v = encontrarSemGuard(
      {
        "src/lib/a/acoes.ts": `"use server";\nexport { x } from "./outro";`,
        "src/app/api/b/route.ts": `export { GET } from "./outro";`,
      },
      [],
    );
    expect(v.sort()).toEqual(["src/app/api/b/route.ts#GET", "src/lib/a/acoes.ts#x"]);
  });

  it('export * from em "use server" e em route.ts é sempre violação (#*)', () => {
    const v = encontrarSemGuard(
      {
        "src/lib/a/acoes.ts": `"use server";\nexport * from "./outro";`,
        "src/app/api/b/route.ts": `export * from "./outro";`,
      },
      ["src/lib/a/acoes.ts#*"],
    );
    expect(v).toContain("src/lib/a/acoes.ts#*");
    expect(v).toContain("src/app/api/b/route.ts#*");
  });

  it('export default em "use server" sem guard', () => {
    const v = encontrarSemGuard(
      { "src/lib/a/acoes.ts": `"use server";\nexport default async function tudo() {}` },
      [],
    );
    expect(v).toEqual(["src/lib/a/acoes.ts#default"]);
  });

  it('export default em "use server" com guard: sem violação', () => {
    const v = encontrarSemGuard(
      {
        "src/lib/a/acoes.ts": `"use server";\nexport default async function tudo() { await requireAdminAction(); }`,
      },
      [],
    );
    expect(v).toEqual([]);
  });

  it("export function HEAD e OPTIONS sem guard em route.ts", () => {
    const v = encontrarSemGuard(
      {
        "src/app/api/c/route.ts": `
export function HEAD() { return new Response(); }
export async function OPTIONS() { return new Response(); }`,
      },
      [],
    );
    expect(v.sort()).toEqual(["src/app/api/c/route.ts#HEAD", "src/app/api/c/route.ts#OPTIONS"]);
  });

  it("route.js sem guard (allowJs)", () => {
    const v = encontrarSemGuard(
      { "src/app/api/d/route.js": "export async function GET() { return new Response(); }" },
      [],
    );
    expect(v).toEqual(["src/app/api/d/route.js#GET"]);
  });

  it("page.jsx fora de (protegido) e page.js em (protegido) sem guard", () => {
    const v = encontrarSemGuard(
      {
        "src/app/painel/outra/page.jsx": "export default function P() { return null; }",
        "src/app/painel/(protegido)/x/page.js": "export default function P() { return null; }",
      },
      [],
    );
    expect(v.sort()).toEqual([
      "src/app/painel/(protegido)/x/page.js#default",
      "src/app/painel/outra/page.jsx",
    ]);
  });

  it("middleware.js e *.test.js: middleware é violação, teste é ignorado", () => {
    const v = encontrarSemGuard(
      {
        "src/middleware.js": "export function middleware() {}",
        "src/app/api/e/route.test.js": "export function GET() {}",
        "src/app/api/e/route.int.test.ts": "export function GET() {}",
      },
      [],
    );
    expect(v).toEqual(["src/middleware.js"]);
  });
});

// Verdadeiro se o arquivo importa (estático, re-export ou import() dinâmico com literal)
// `@/lib/auth`, `@/lib/auth/*`, `next-auth` ou `next-auth/*`.
function importaAuth(conteudo: string): boolean {
  const sf = ts.createSourceFile("x.tsx", conteudo, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const proibido = (spec: string) =>
    spec === "@/lib/auth" ||
    spec.startsWith("@/lib/auth/") ||
    spec === "next-auth" ||
    spec.startsWith("next-auth/");
  let achou = false;
  const visita = (n: ts.Node) => {
    if (achou) return;
    if (
      (ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) &&
      n.moduleSpecifier &&
      ts.isStringLiteral(n.moduleSpecifier) &&
      proibido(n.moduleSpecifier.text)
    ) {
      achou = true;
    } else if (
      ts.isCallExpression(n) &&
      n.expression.kind === ts.SyntaxKind.ImportKeyword &&
      n.arguments.length > 0 &&
      ts.isStringLiteralLike(n.arguments[0]) &&
      proibido(n.arguments[0].text)
    ) {
      achou = true;
    }
    ts.forEachChild(n, visita);
  };
  visita(sf);
  return achou;
}

describe("catálogo público continua aberto (US5-1, US5-3, FR-011)", () => {
  it.each(["src/app/page.tsx", "src/app/layout.tsx"])(
    "%s não importa nada de auth (US5-1, FR-011)",
    (arquivo) => {
      const conteudo = fs.readFileSync(path.join(process.cwd(), arquivo), "utf8");
      expect(importaAuth(conteudo)).toBe(false);
    },
  );

  it("/api/health continua nas exceções públicas (US5-3)", () => {
    expect(EXCECOES_PUBLICAS).toContain("src/app/api/health/route.ts#GET");
  });

  describe("importaAuth (fixtures)", () => {
    it.each([
      ['import { auth } from "@/lib/auth";'],
      ['import x from "@/lib/auth/guard";'],
      ['import NextAuth from "next-auth";'],
      ['import Google from "next-auth/providers/google";'],
      ['export { auth } from "@/lib/auth";'],
      ['async function f() { await import("@/lib/auth"); }'],
    ])("true para %s", (codigo) => {
      expect(importaAuth(codigo)).toBe(true);
    });

    it.each([
      ['import { Button } from "@/components/ui/button";'],
      ['import x from "@/lib/authx";'],
      ['// import { auth } from "@/lib/auth";\nexport const a = 1;'],
      ['/* "@/lib/auth" */ export const a = 1;'],
    ])("false para %s", (codigo) => {
      expect(importaAuth(codigo)).toBe(false);
    });
  });
});
