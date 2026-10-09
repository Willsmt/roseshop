import fs from "node:fs";
import path from "node:path";

import ts from "typescript";
import { describe, expect, it } from "vitest";

// Conformidade das fronteiras de fotos (feature 004, T065; contracts/fotos.md §1).
// Mesmo padrão e escopo de produtos-acesso: parse pela AST (nunca grep de texto), nega por
// padrão, varre src/** inteiro, inclusive testes. Regras:
//   1. `@/lib/r2` só em src/lib/r2/, src/lib/fotos/, src/lib/produtos/, src/app/painel/fotos/,
//      src/app/api/interno/.
//   2. Submódulos `@/lib/r2/...` só dentro de src/lib/r2/ (fora dele, só o barrel).
//   3. `@/lib/db/fotos` só em src/lib/fotos/, src/lib/produtos/ e src/lib/db/.
//   4. src/lib/fotos/aparelho/ sem server-only, db, r2 ou auth.
//   5. src/lib/fotos/mensagens.ts e tipos.ts sem imports de runtime (só `import type`).
//   6. `insert(produtos)` / `INSERT INTO produtos` só dentro de inserirComFotos (db/produtos.ts).
//   7. `aws4fetch` só em src/lib/r2/.

const EXT = "(?:tsx?|jsx?|mjs)";
const reCodigo = new RegExp(`\\.${EXT}$`);
const reTeste = new RegExp(`\\.test\\.${EXT}$`);

const R2 = "@/lib/r2";
const DB_FOTOS = "@/lib/db/fotos";
const DB = "@/lib/db";
const AUTH = "@/lib/auth";

const DIRS_R2 = [
  "src/lib/r2/",
  "src/lib/fotos/",
  "src/lib/produtos/",
  "src/app/painel/fotos/",
  "src/app/api/interno/",
];
const DIRS_DB_FOTOS = ["src/lib/fotos/", "src/lib/produtos/", "src/lib/db/"];
const DIR_APARELHO = "src/lib/fotos/aparelho/";
const ARQUIVOS_SEM_RUNTIME = [
  "src/lib/fotos/mensagens.ts",
  "src/lib/fotos/tipos.ts",
];
const ARQUIVO_PRODUTOS_SQL = "src/lib/db/produtos.ts";
const FUNCAO_INSERT = "inserirComFotos";

type Importacao = {
  modulo: string;
  nomes: string[];
  tipo: string;
  soTipo: boolean;
};

function normalizar(arquivo: string, spec: string): string {
  let abs = spec;
  if (spec.startsWith(".")) {
    const juntado = path.posix.normalize(
      path.posix.join(path.posix.dirname(arquivo), spec),
    );
    abs = juntado.startsWith("src/") ? `@/${juntado.slice(4)}` : juntado;
  } else if (spec.startsWith("src/")) {
    abs = `@/${spec.slice(4)}`;
  }
  abs = abs.replace(new RegExp(`\\.${EXT}$`), "");
  return abs.replace(/\/index$/, "");
}

function textoLiteral(n: ts.Node | undefined): string | undefined {
  if (n && (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)))
    return n.text;
  return undefined;
}

const VI_MOCKS = new Set([
  "mock",
  "doMock",
  "importActual",
  "importMock",
  "unmock",
  "doUnmock",
]);

function coletarImports(arquivo: string, fonte: string): Importacao[] {
  const sf = ts.createSourceFile(arquivo, fonte, ts.ScriptTarget.Latest, true);
  const out: Importacao[] = [];
  const add = (
    spec: string | undefined,
    nomes: string[],
    tipo: string,
    soTipo = false,
  ) => {
    if (spec !== undefined)
      out.push({ modulo: normalizar(arquivo, spec), nomes, tipo, soTipo });
  };

  const visita = (n: ts.Node) => {
    if (ts.isImportDeclaration(n)) {
      const c = n.importClause;
      const nomes: string[] = [];
      if (c?.name) nomes.push("default");
      const nb = c?.namedBindings;
      if (nb && ts.isNamespaceImport(nb)) nomes.push("*");
      if (nb && ts.isNamedImports(nb)) {
        for (const e of nb.elements)
          nomes.push((e.propertyName ?? e.name).text);
      }
      const soTipo =
        !!c &&
        (c.isTypeOnly ||
          (!c.name &&
            !!nb &&
            ts.isNamedImports(nb) &&
            nb.elements.every((e) => e.isTypeOnly)));
      add(textoLiteral(n.moduleSpecifier), nomes, "import", soTipo);
    } else if (ts.isExportDeclaration(n) && n.moduleSpecifier) {
      const nomes: string[] = [];
      if (!n.exportClause || ts.isNamespaceExport(n.exportClause))
        nomes.push("*");
      else
        for (const e of n.exportClause.elements)
          nomes.push((e.propertyName ?? e.name).text);
      add(textoLiteral(n.moduleSpecifier), nomes, "export-from", n.isTypeOnly);
    } else if (
      ts.isImportEqualsDeclaration(n) &&
      ts.isExternalModuleReference(n.moduleReference)
    ) {
      add(
        textoLiteral(n.moduleReference.expression),
        ["*"],
        "import-equals",
        n.isTypeOnly,
      );
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

const dentro = (arquivo: string, ...dirs: string[]) =>
  dirs.some((d) => arquivo.startsWith(d));
const eModulo = (modulo: string, alvo: string) =>
  modulo === alvo || modulo.startsWith(`${alvo}/`);
// `@/lib/db/fotos` e `@/lib/db/fotos/...`, mas não `@/lib/db/fotos-outra`.
const eDbFotos = (modulo: string) => eModulo(modulo, DB_FOTOS);

export function encontrarViolacoesDeImport(
  arquivos: Record<string, string>,
): string[] {
  const v: string[] = [];
  for (const [arquivo, fonte] of Object.entries(arquivos)) {
    for (const imp of coletarImports(arquivo, fonte)) {
      const rotulo = `${arquivo}: ${imp.tipo} de "${imp.modulo}"`;

      // 1. R2 (barrel) só nas áreas autorizadas.
      if (eModulo(imp.modulo, R2) && !dentro(arquivo, ...DIRS_R2)) {
        v.push(`${rotulo} (regra 1: R2 só em ${DIRS_R2.join(", ")})`);
      }
      // 2. Fora de src/lib/r2/ só o barrel.
      if (imp.modulo.startsWith(`${R2}/`) && !dentro(arquivo, "src/lib/r2/")) {
        v.push(`${rotulo} (regra 2: fora de src/lib/r2/ só o barrel "${R2}")`);
      }
      // 3. Camada SQL de fotos.
      if (eDbFotos(imp.modulo) && !dentro(arquivo, ...DIRS_DB_FOTOS)) {
        v.push(
          `${rotulo} (regra 3: db/fotos só em ${DIRS_DB_FOTOS.join(", ")})`,
        );
      }
      // 4. Código do aparelho (navegador).
      if (
        dentro(arquivo, DIR_APARELHO) &&
        (imp.modulo === "server-only" ||
          eModulo(imp.modulo, DB) ||
          eModulo(imp.modulo, R2) ||
          eModulo(imp.modulo, AUTH))
      ) {
        v.push(`${rotulo} (regra 4: aparelho sem server-only, db, r2 ou auth)`);
      }
      // 5. mensagens.ts e tipos.ts: só `import type`.
      if (ARQUIVOS_SEM_RUNTIME.includes(arquivo) && !imp.soTipo) {
        v.push(`${rotulo} (regra 5: ${arquivo} sem imports de runtime)`);
      }
      // 7. aws4fetch só no módulo R2.
      if (eModulo(imp.modulo, "aws4fetch") && !dentro(arquivo, "src/lib/r2/")) {
        v.push(`${rotulo} (regra 7: aws4fetch só em src/lib/r2/)`);
      }
    }
  }
  return v;
}

const reInsertProdutos = /INSERT\s+INTO\s+(?:public\.)?"?produtos"?(?![\w])/i;

function nomeDaFuncaoEnvolvente(n: ts.Node): string {
  for (let p: ts.Node | undefined = n.parent; p; p = p.parent) {
    if (ts.isFunctionDeclaration(p) && p.name) return p.name.text;
    if (
      (ts.isArrowFunction(p) || ts.isFunctionExpression(p)) &&
      ts.isVariableDeclaration(p.parent) &&
      ts.isIdentifier(p.parent.name)
    ) {
      return p.parent.name.text;
    }
    if (ts.isMethodDeclaration(p) && ts.isIdentifier(p.name))
      return p.name.text;
  }
  return "<topo do módulo>";
}

const ehProdutos = (e: ts.Expression) =>
  (ts.isIdentifier(e) && e.text === "produtos") ||
  (ts.isPropertyAccessExpression(e) && e.name.text === "produtos");

// Inserções em `produtos`: `.insert(produtos)` (Drizzle) e `INSERT INTO produtos` em texto SQL.
// Testes e fixtures de integração (src/test/) ficam fora: semeiam por SQL direto.
export function encontrarInsercoesDeProdutos(
  arquivos: Record<string, string>,
): { arquivo: string; funcao: string }[] {
  const out: { arquivo: string; funcao: string }[] = [];
  for (const [arquivo, fonte] of Object.entries(arquivos)) {
    if (reTeste.test(arquivo) || arquivo.startsWith("src/test/")) continue;
    const sf = ts.createSourceFile(
      arquivo,
      fonte,
      ts.ScriptTarget.Latest,
      true,
    );
    const visita = (n: ts.Node) => {
      const texto =
        ts.isStringLiteral(n) ||
        ts.isNoSubstitutionTemplateLiteral(n) ||
        ts.isTemplateHead(n) ||
        ts.isTemplateMiddle(n) ||
        ts.isTemplateTail(n)
          ? n.text
          : undefined;
      if (
        (texto !== undefined && reInsertProdutos.test(texto)) ||
        (ts.isCallExpression(n) &&
          ts.isPropertyAccessExpression(n.expression) &&
          n.expression.name.text === "insert" &&
          n.arguments.length > 0 &&
          ehProdutos(n.arguments[0]))
      ) {
        out.push({ arquivo, funcao: nomeDaFuncaoEnvolvente(n) });
      }
      ts.forEachChild(n, visita);
    };
    visita(sf);
  }
  return out;
}

export function violacoesDeInsertProdutos(
  arquivos: Record<string, string>,
): string[] {
  return encontrarInsercoesDeProdutos(arquivos)
    .filter(
      (i) =>
        !(i.arquivo === ARQUIVO_PRODUTOS_SQL && i.funcao === FUNCAO_INSERT),
    )
    .map(
      (i) =>
        `${i.arquivo}: insert em produtos dentro de ${i.funcao} (regra 6: só ${FUNCAO_INSERT} em ${ARQUIVO_PRODUTOS_SQL})`,
    );
}

function lerSrc(dir: string, raiz: string, out: Record<string, string> = {}) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) lerSrc(abs, raiz, out);
    else if (reCodigo.test(entry.name)) {
      out[path.relative(raiz, abs).split(path.sep).join("/")] = fs.readFileSync(
        abs,
        "utf8",
      );
    }
  }
  return out;
}

const lerSrcReal = () => {
  const raiz = process.cwd();
  return lerSrc(path.join(raiz, "src"), raiz);
};

describe("conformidade das fronteiras de fotos (contrato §1)", () => {
  it("o src/ real respeita as regras de import 1 a 5 e 7", () => {
    expect(encontrarViolacoesDeImport(lerSrcReal())).toEqual([]);
  });

  it("regra 6: insert em produtos só dentro de inserirComFotos (src/lib/db/produtos.ts)", () => {
    expect(violacoesDeInsertProdutos(lerSrcReal())).toEqual([]);
  });

  it("regra 6 (nega por padrão): o src/ real tem exatamente o insert de inserirComFotos", () => {
    const insercoes = encontrarInsercoesDeProdutos(lerSrcReal());
    expect(insercoes.length).toBeGreaterThan(0);
    expect(
      insercoes.every(
        (i) => i.arquivo === ARQUIVO_PRODUTOS_SQL && i.funcao === FUNCAO_INSERT,
      ),
    ).toBe(true);
  });
});

describe("autoteste do detector de imports (a violação seria pega)", () => {
  const viola = (arquivo: string, fonte: string) =>
    encontrarViolacoesDeImport({ [arquivo]: fonte });

  it("regra 1: R2 fora das áreas autorizadas, por qualquer forma", () => {
    const f = "src/app/x.ts";
    expect(viola(f, `import { x } from "@/lib/r2";`)).toHaveLength(1);
    expect(viola(f, `export { x } from "@/lib/r2";`)).toHaveLength(1);
    expect(viola(f, `const m = await import("@/lib/r2");`)).toHaveLength(1);
    expect(viola(f, `const m = require("@/lib/r2");`)).toHaveLength(1);
    expect(viola("src/app/x.test.ts", `vi.mock("@/lib/r2");`)).toHaveLength(1);
    expect(
      viola("src/lib/categorias/x.ts", `import x from "../r2";`),
    ).toHaveLength(1);
    expect(
      viola(
        "src/app/painel/(protegido)/p.ts",
        `import x from "../../../lib/r2";`,
      ),
    ).toHaveLength(1);
  });

  it("regra 1: áreas autorizadas passam", () => {
    for (const f of [
      "src/lib/fotos/actions.ts",
      "src/lib/produtos/actions.ts",
      "src/app/painel/fotos/[arquivo]/route.ts",
      "src/app/painel/fotos/[arquivo]/route.test.ts",
      "src/app/api/interno/limpeza/route.ts",
      "src/lib/r2/bucket.ts",
    ]) {
      expect(viola(f, `import { x } from "@/lib/r2";`)).toEqual([]);
    }
  });

  it("regra 2: submódulo de r2 fora de src/lib/r2/ (mesmo em área autorizada)", () => {
    expect(
      viola("src/lib/fotos/actions.ts", `import { x } from "@/lib/r2/bucket";`),
    ).toHaveLength(1);
    expect(
      viola(
        "src/lib/fotos/actions.ts",
        `import { x } from "../r2/verificacao";`,
      ),
    ).toHaveLength(1);
    expect(
      viola("src/app/api/interno/x.ts", `const m = import("@/lib/r2/chaves");`),
    ).toHaveLength(1);
    expect(
      viola("src/app/painel/fotos/a.test.ts", `vi.mock("@/lib/r2/bucket");`),
    ).toHaveLength(1);
    expect(viola("src/lib/r2/index.ts", `export * from "./bucket";`)).toEqual(
      [],
    );
    expect(
      viola(
        "src/lib/r2/bucket.test.ts",
        `import { x } from "@/lib/r2/bucket";`,
      ),
    ).toEqual([]);
  });

  it("regra 3: db/fotos só em src/lib/fotos/, src/lib/produtos/ e src/lib/db/", () => {
    expect(
      viola("src/app/painel/x.ts", `import { x } from "@/lib/db/fotos";`),
    ).toHaveLength(1);
    expect(
      viola("src/lib/ai/x.ts", `import { x } from "../db/fotos";`),
    ).toHaveLength(1);
    expect(
      viola("src/app/api/interno/x.ts", `import { x } from "@/lib/db/fotos";`),
    ).toHaveLength(1);
    expect(
      viola("src/app/x.test.ts", `vi.mock("@/lib/db/fotos");`),
    ).toHaveLength(1);
    expect(
      viola("src/lib/fotos/actions.ts", `import { x } from "@/lib/db/fotos";`),
    ).toEqual([]);
    expect(
      viola(
        "src/lib/produtos/actions.ts",
        `import { x } from "@/lib/db/fotos";`,
      ),
    ).toEqual([]);
    expect(
      viola("src/lib/db/produtos.ts", `import { x } from "./fotos";`),
    ).toEqual([]);
    expect(
      viola("src/app/x.ts", `import { x } from "@/lib/db/fotos-outra";`),
    ).toEqual([]);
  });

  it("regra 4: aparelho sem server-only, db, r2 ou auth", () => {
    const f = "src/lib/fotos/aparelho/comprimir.ts";
    expect(viola(f, `import "server-only";`)).toHaveLength(1);
    expect(viola(f, `import { x } from "@/lib/db/client";`)).toHaveLength(1);
    expect(viola(f, `import { x } from "@/lib/r2";`).length).toBeGreaterThan(0);
    expect(viola(f, `import { x } from "@/lib/auth";`)).toHaveLength(1);
    expect(
      viola(f, `import { x } from "../../db/fotos";`).length,
    ).toBeGreaterThan(0);
    expect(viola(f, `import { m } from "@/lib/fotos/mensagens";`)).toEqual([]);
    expect(viola("src/lib/fotos/actions.ts", `import "server-only";`)).toEqual(
      [],
    );
  });

  it("regra 5: mensagens.ts e tipos.ts só com import type", () => {
    for (const f of ["src/lib/fotos/mensagens.ts", "src/lib/fotos/tipos.ts"]) {
      expect(viola(f, `import type { MotivoFoto } from "./tipos";`)).toEqual(
        [],
      );
      expect(viola(f, `import { type MotivoFoto } from "./tipos";`)).toEqual(
        [],
      );
      expect(viola(f, `import { x } from "./outro";`)).toHaveLength(1);
      expect(viola(f, `import x from "zod";`)).toHaveLength(1);
      expect(viola(f, `export { x } from "./outro";`)).toHaveLength(1);
      expect(viola(f, `const m = await import("./outro");`)).toHaveLength(1);
    }
    expect(
      viola("src/lib/fotos/erros.ts", `import { x } from "./outro";`),
    ).toEqual([]);
  });

  it("regra 7: aws4fetch fora de src/lib/r2/", () => {
    expect(
      viola("src/lib/fotos/x.ts", `import { AwsClient } from "aws4fetch";`),
    ).toHaveLength(1);
    expect(
      viola("src/app/x.ts", `const m = await import("aws4fetch");`),
    ).toHaveLength(1);
    expect(
      viola(
        "src/lib/r2/assinatura.ts",
        `import { AwsClient } from "aws4fetch";`,
      ),
    ).toEqual([]);
  });

  it("não se acusa por strings que parecem import (só a AST conta)", () => {
    const fonte =
      'const s = \'import { x } from "@/lib/r2"\';\n// import a from "aws4fetch"\n';
    expect(viola("src/app/x.ts", fonte)).toEqual([]);
  });
});

describe("autoteste do detector de insert em produtos (regra 6)", () => {
  const viola = (arquivos: Record<string, string>) =>
    violacoesDeInsertProdutos(arquivos);

  it("pega .insert(produtos) e INSERT INTO produtos fora de inserirComFotos", () => {
    expect(
      viola({
        "src/lib/db/produtos.ts": `export async function inserir(db){ return db.insert(produtos).values({}); }`,
      }),
    ).toHaveLength(1);
    expect(
      viola({
        "src/lib/produtos/x.ts":
          "export const q = (db) => db.execute(sql`INSERT INTO produtos (nome) VALUES (1)`);",
      }),
    ).toHaveLength(1);
    expect(
      viola({ "src/app/x.ts": `db.insert(schema.produtos).values({});` }),
    ).toHaveLength(1);
    expect(
      viola({
        "src/lib/db/outro.ts": `export async function inserirComFotos(db){ db.insert(produtos); }`,
      }),
    ).toHaveLength(1);
  });

  it("permite dentro de inserirComFotos em src/lib/db/produtos.ts, e ignora testes e fixtures", () => {
    expect(
      viola({
        "src/lib/db/produtos.ts":
          "export async function inserirComFotos(db){ return db.execute(sql`INSERT INTO produtos (nome) SELECT 1`); }",
      }),
    ).toEqual([]);
    expect(
      viola({
        "src/test/db/produtos-fixtures.ts":
          "const q = sql`INSERT INTO produtos (nome) VALUES (1)`;",
      }),
    ).toEqual([]);
    expect(
      viola({
        "src/lib/db/x.int.test.ts":
          "const q = sql`INSERT INTO produtos (nome) VALUES (1)`;",
      }),
    ).toEqual([]);
  });

  it("não confunde produto_fotos nem comentários com produtos", () => {
    expect(
      viola({
        "src/lib/db/fotos.ts":
          "// INSERT INTO produtos\nconst q = sql`INSERT INTO produto_fotos (a) VALUES (1)`;",
      }),
    ).toEqual([]);
  });
});
