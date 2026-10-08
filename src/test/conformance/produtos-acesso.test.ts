import fs from "node:fs";
import path from "node:path";

import ts from "typescript";
import { describe, expect, it } from "vitest";

// Conformidade fronteiras de produtos (FR-032, constitution).
// Feature 003, contracts/produtos.md §1 (regras 1 a 5).
// Estilo do categorias-acesso: parse pela AST (nunca grep de texto), nega por padrão,
// exceções explícitas por (arquivo, módulo). Varre src/** inteiro, inclusive testes.

const EXT = "(?:tsx?|jsx?|mjs)";
const reCodigo = new RegExp(`\\.${EXT}$`);

const DB_PRODUTOS = "@/lib/db/produtos";
const DB_CATEGORIAS = "@/lib/db/categorias";
const DB_SCHEMA = "@/lib/db/schema";
const CAT_BARREL = "@/lib/categorias";
const PROD_ACTIONS = "@/lib/produtos/actions";
const PROD_PAINEL = "@/lib/produtos/painel";

const DIR_PRODUTOS = "src/lib/produtos/";
const DIR_DB = "src/lib/db/";
const DIR_PAINEL = "src/app/painel/";

// O teste unitário das Server Actions mora ao lado de actions.ts e precisa importar
// `./actions`. Arquivo de teste não entra no bundle, então não abre brecha de produção.
const EXCECOES: readonly { arquivo: string; modulo: string }[] = [
  { arquivo: "src/lib/produtos/actions.test.ts", modulo: PROD_ACTIONS },
  // Infra de teste de integração (já existente): semeia e mede direto na camada SQL.
  { arquivo: "src/test/db/produtos-fixtures.ts", modulo: DB_SCHEMA },
  { arquivo: "src/test/db/produtos-medicao.int.test.ts", modulo: DB_PRODUTOS },
];

const BINDINGS_DE_PRODUTOS = ["produtos", "produtoFotos"];

type Importacao = { modulo: string; nomes: string[]; tipo: string };

function normalizar(arquivo: string, spec: string): string {
  let abs = spec;
  if (spec.startsWith(".")) {
    const juntado = path.posix.normalize(path.posix.join(path.posix.dirname(arquivo), spec));
    abs = juntado.startsWith("src/") ? `@/${juntado.slice(4)}` : juntado;
  } else if (spec.startsWith("src/")) {
    abs = `@/${spec.slice(4)}`;
  }
  abs = abs.replace(new RegExp(`\\.${EXT}$`), "");
  return abs.replace(/\/index$/, "");
}

function textoLiteral(n: ts.Node | undefined): string | undefined {
  if (n && (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n))) return n.text;
  return undefined;
}

const VI_MOCKS = new Set(["mock", "doMock", "importActual", "importMock", "unmock", "doUnmock"]);

function coletarImports(arquivo: string, fonte: string): Importacao[] {
  const sf = ts.createSourceFile(arquivo, fonte, ts.ScriptTarget.Latest, true);
  const out: Importacao[] = [];
  const add = (spec: string | undefined, nomes: string[], tipo: string) => {
    if (spec !== undefined) out.push({ modulo: normalizar(arquivo, spec), nomes, tipo });
  };

  const visita = (n: ts.Node) => {
    if (ts.isImportDeclaration(n)) {
      const c = n.importClause;
      const nomes: string[] = [];
      if (c?.name) nomes.push("default");
      const nb = c?.namedBindings;
      if (nb && ts.isNamespaceImport(nb)) nomes.push("*");
      if (nb && ts.isNamedImports(nb)) {
        for (const e of nb.elements) nomes.push((e.propertyName ?? e.name).text);
      }
      add(textoLiteral(n.moduleSpecifier), nomes, "import");
    } else if (ts.isExportDeclaration(n) && n.moduleSpecifier) {
      const nomes: string[] = [];
      if (!n.exportClause || ts.isNamespaceExport(n.exportClause)) nomes.push("*");
      else for (const e of n.exportClause.elements) nomes.push((e.propertyName ?? e.name).text);
      add(textoLiteral(n.moduleSpecifier), nomes, "export-from");
    } else if (
      ts.isImportEqualsDeclaration(n) &&
      ts.isExternalModuleReference(n.moduleReference)
    ) {
      add(textoLiteral(n.moduleReference.expression), ["*"], "import-equals");
    } else if (ts.isCallExpression(n)) {
      const e = n.expression;
      if (e.kind === ts.SyntaxKind.ImportKeyword) {
        add(textoLiteral(n.arguments[0]), ["*"], "import()");
      } else if (ts.isIdentifier(e) && e.text === "require") {
        add(textoLiteral(n.arguments[0]), ["*"], "require");
      } else if (
        ts.isPropertyAccessExpression(e) &&
        ts.isIdentifier(e.expression) &&
        e.expression.text === "vi" &&
        VI_MOCKS.has(e.name.text)
      ) {
        add(textoLiteral(n.arguments[0]), ["*"], `vi.${e.name.text}`);
      }
    }
    ts.forEachChild(n, visita);
  };
  visita(sf);
  return out;
}

const dentro = (arquivo: string, ...dirs: string[]) => dirs.some((d) => arquivo.startsWith(d));
const eModulo = (modulo: string, alvo: string) => modulo === alvo || modulo.startsWith(`${alvo}/`);
const tocaSchemaDe = (imp: Importacao, bindings: readonly string[]) =>
  eModulo(imp.modulo, DB_SCHEMA) &&
  (imp.nomes.includes("*") || bindings.some((b) => imp.nomes.includes(b)));

export function encontrarViolacoesDeImport(arquivos: Record<string, string>): string[] {
  const v: string[] = [];
  for (const [arquivo, fonte] of Object.entries(arquivos)) {
    for (const imp of coletarImports(arquivo, fonte)) {
      if (EXCECOES.some((x) => x.arquivo === arquivo && x.modulo === imp.modulo)) continue;
      const rotulo = `${arquivo}: ${imp.tipo} de "${imp.modulo}"`;

      // 1. Camada SQL de produtos.
      if (eModulo(imp.modulo, DB_PRODUTOS) && !dentro(arquivo, DIR_PRODUTOS, DIR_DB)) {
        v.push(`${rotulo} (regra 1: só src/lib/produtos/ e src/lib/db/)`);
      }
      // 2. Bindings `produtos` e `produtoFotos` do schema.
      if (tocaSchemaDe(imp, BINDINGS_DE_PRODUTOS) && !dentro(arquivo, DIR_PRODUTOS, DIR_DB)) {
        v.push(
          `${rotulo} (regra 2: schema de produtos só em src/lib/produtos/ e src/lib/db/)`,
        );
      }
      // 3. Server Actions só pelo painel.
      if (eModulo(imp.modulo, PROD_ACTIONS) && !dentro(arquivo, DIR_PAINEL)) {
        v.push(`${rotulo} (regra 3: actions só em src/app/painel/)`);
      }
      // 4. Leitura do painel.
      if (eModulo(imp.modulo, PROD_PAINEL) && !dentro(arquivo, DIR_PAINEL, DIR_PRODUTOS)) {
        v.push(`${rotulo} (regra 4: painel só em src/app/painel/ e src/lib/produtos/)`);
      }
      // 5. Produtos só enxerga categorias pelo barrel.
      if (
        dentro(arquivo, DIR_PRODUTOS) &&
        (imp.modulo.startsWith(`${CAT_BARREL}/`) ||
          eModulo(imp.modulo, DB_CATEGORIAS) ||
          tocaSchemaDe(imp, ["categorias"]))
      ) {
        v.push(`${rotulo} (regra 5: src/lib/produtos/ só importa o barrel "${CAT_BARREL}")`);
      }
    }
  }
  return v;
}

function lerSrc(dir: string, raiz: string, out: Record<string, string> = {}) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) lerSrc(abs, raiz, out);
    else if (reCodigo.test(entry.name)) {
      out[path.relative(raiz, abs).split(path.sep).join("/")] = fs.readFileSync(abs, "utf8");
    }
  }
  return out;
}

const lerSrcReal = () => {
  const raiz = process.cwd();
  return lerSrc(path.join(raiz, "src"), raiz);
};

describe("conformidade das fronteiras de produtos (contrato §1)", () => {
  it("o src/ real respeita as regras de import 1 a 5", () => {
    expect(encontrarViolacoesDeImport(lerSrcReal())).toEqual([]);
  });
});

describe("autoteste do detector de imports (a violação seria pega)", () => {
  const viola = (arquivo: string, fonte: string) => encontrarViolacoesDeImport({ [arquivo]: fonte });

  it("regra 1: pega @/lib/db/produtos fora da área, por qualquer forma", () => {
    const f = "src/app/x.ts";
    expect(viola(f, `import { inserir } from "@/lib/db/produtos";`)).toHaveLength(1);
    expect(viola(f, `export { inserir } from "@/lib/db/produtos";`)).toHaveLength(1);
    expect(viola(f, `const m = await import("@/lib/db/produtos");`)).toHaveLength(1);
    expect(viola(f, `const m = require("@/lib/db/produtos");`)).toHaveLength(1);
    expect(viola("src/app/x.test.ts", `vi.mock("@/lib/db/produtos");`)).toHaveLength(1);
    expect(viola("src/lib/categorias/x.ts", `import x from "../db/produtos.ts";`)).toHaveLength(1);
    expect(
      viola("src/app/painel/p.ts", `import x from "../../lib/db/produtos";`),
    ).toHaveLength(1);
  });

  it("regra 1: permite src/lib/produtos/ e src/lib/db/ (inclusive relativo e mock)", () => {
    expect(
      viola("src/lib/produtos/painel.ts", `import { listar } from "@/lib/db/produtos";`),
    ).toEqual([]);
    expect(viola("src/lib/db/outro.ts", `import { x } from "./produtos";`)).toEqual([]);
    expect(viola("src/lib/produtos/a.test.ts", `vi.mock("@/lib/db/produtos");`)).toEqual([]);
  });

  it("regra 2: pega `produtos` e `produtoFotos` do schema (named, alias, namespace, export *, import())", () => {
    const f = "src/app/x.ts";
    expect(viola(f, `import { produtos } from "@/lib/db/schema";`)).toHaveLength(1);
    expect(viola(f, `import { produtoFotos } from "@/lib/db/schema";`)).toHaveLength(1);
    expect(viola(f, `import { produtos as p } from "@/lib/db/schema";`)).toHaveLength(1);
    expect(viola(f, `import * as schema from "@/lib/db/schema";`)).toHaveLength(1);
    expect(viola(f, `export * from "@/lib/db/schema";`)).toHaveLength(1);
    expect(viola(f, `export { produtos } from "../lib/db/schema";`)).toHaveLength(1);
    expect(viola(f, `const s = await import("@/lib/db/schema");`)).toHaveLength(1);
  });

  it("regra 2: outros bindings do schema e arquivos permitidos passam", () => {
    expect(viola("src/app/x.ts", `import { categorias } from "@/lib/db/schema";`)).toEqual([]);
    expect(viola("src/lib/db/client.ts", `import * as schema from "./schema";`)).toEqual([]);
    expect(
      viola("src/lib/produtos/a.ts", `import { produtos } from "@/lib/db/schema";`),
    ).toEqual([]);
  });

  it("regra 3: actions só em src/app/painel/", () => {
    expect(
      viola(
        "src/app/painel/(protegido)/p.tsx",
        `import { criarProduto } from "@/lib/produtos/actions";`,
      ),
    ).toEqual([]);
    expect(
      viola("src/lib/ai/x.ts", `import { criarProduto } from "@/lib/produtos/actions";`),
    ).toHaveLength(1);
    expect(
      viola("src/lib/produtos/index.ts", `export { criarProduto } from "./actions";`),
    ).toHaveLength(1);
    expect(viola("src/lib/produtos/x.ts", `import a from "./actions";`)).toHaveLength(1);
    expect(
      viola("src/app/(public)/p.tsx", `import a from "@/lib/produtos/actions";`),
    ).toHaveLength(1);
  });

  it("regra 3: a exceção vale só para o teste unitário ao lado de actions.ts", () => {
    expect(viola("src/lib/produtos/actions.test.ts", `import * as a from "./actions";`)).toEqual(
      [],
    );
    expect(viola("src/lib/produtos/outro.test.ts", `import * as a from "./actions";`)).toHaveLength(
      1,
    );
    // A exceção cobre só o módulo `actions`: outras regras continuam valendo no mesmo arquivo.
    expect(
      viola("src/lib/produtos/actions.test.ts", `import { x } from "@/lib/db/categorias";`),
    ).toHaveLength(1);
  });

  it("regra 4: painel só em src/app/painel/ e src/lib/produtos/", () => {
    expect(
      viola("src/app/painel/(protegido)/p.tsx", `import { x } from "@/lib/produtos/painel";`),
    ).toEqual([]);
    expect(viola("src/lib/produtos/actions.ts", `import { x } from "./painel";`)).toEqual([]);
    expect(viola("src/lib/ai/x.ts", `import { x } from "@/lib/produtos/painel";`)).toHaveLength(1);
    expect(
      viola("src/app/(public)/p.tsx", `import { x } from "@/lib/produtos/painel";`),
    ).toHaveLength(1);
    expect(viola("src/lib/auth/x.ts", `const m = import("../produtos/painel");`)).toHaveLength(1);
  });

  it("regra 5: src/lib/produtos/ só importa o barrel de categorias", () => {
    const f = "src/lib/produtos/x.ts";
    expect(viola(f, `import { listarCategorias } from "@/lib/categorias";`)).toEqual([]);
    expect(viola(f, `import { listarCategorias } from "../categorias";`)).toEqual([]);
    expect(viola(f, `import { listarCategorias } from "../categorias/index";`)).toEqual([]);
    expect(viola(f, `import { x } from "@/lib/categorias/erros";`)).toHaveLength(1);
    expect(viola(f, `import { x } from "@/lib/categorias/painel";`)).toHaveLength(1);
    expect(viola(f, `import { x } from "@/lib/db/categorias";`)).toHaveLength(1);
    expect(viola(f, `import { categorias } from "@/lib/db/schema";`)).toHaveLength(1);
    expect(viola(f, `import * as s from "@/lib/db/schema";`).length).toBeGreaterThan(0);
  });

  it("não se acusa por strings que parecem import (só a AST conta)", () => {
    const fonte =
      'const s = \'import { x } from "@/lib/db/produtos"\';\n// import a from "@/lib/produtos/actions"\n';
    expect(viola("src/app/x.ts", fonte)).toEqual([]);
  });
});
