import fs from "node:fs";
import path from "node:path";

import ts from "typescript";
import { describe, expect, it } from "vitest";

// Conformidade do ponto de acesso único às categorias (FR-014, FR-015, SC-006).
// Feature 002, plan.md §6 e contracts/categorias.md §1 e §2.
// Estilo do painel-guard: parse pela AST (nunca grep de texto), nega por padrão,
// exceções explícitas. Varre src/** inteiro, inclusive arquivos de teste.

const EXT = "(?:tsx?|jsx?|mjs)";
const reCodigo = new RegExp(`\\.${EXT}$`);

const DB_CATEGORIAS = "@/lib/db/categorias";
const DB_SCHEMA = "@/lib/db/schema";
const CAT_BARREL = "@/lib/categorias";
const CAT_ACTIONS = "@/lib/categorias/actions";
const CAT_PAINEL = "@/lib/categorias/painel";

const DIR_CATEGORIAS = "src/lib/categorias/";
const DIR_DB = "src/lib/db/";
const DIR_PAINEL = "src/app/painel/";
const DIR_AI = "src/lib/ai/";
const BARREL = "src/lib/categorias/index.ts";

// Exceções explícitas, por (arquivo, módulo importado). Nunca por diretório.
// Os testes unitários das Server Actions (T030, T044) moram ao lado de actions.ts,
// em src/lib/categorias/, e precisam importar `./actions` (e fazer vi.mock dele).
// Isso não abre brecha de produção: arquivo de teste não entra no bundle.
// Exceções para arquivos que ainda não existem são inofensivas (não casam com nada).
const EXCECOES: readonly { arquivo: string; modulo: string }[] = [
  { arquivo: "src/lib/categorias/actions.test.ts", modulo: CAT_ACTIONS },
  {
    arquivo: "src/lib/categorias/actions.remocao.test.ts",
    modulo: CAT_ACTIONS,
  },
];

// Barrel: nega por padrão. Só estes valores (runtime) podem ser exportados.
// Tipos (interface/type) são permitidos, desde que não violem os prefixos proibidos.
const EXPORTS_PERMITIDOS: readonly string[] = [
  "listarCategorias",
  "obterCategoria",
  "exigirCategoriaValida",
  "CategoriaInvalidaError",
  "normalizarNome",
];
const PREFIXOS_PROIBIDOS = ["criar", "renomear", "remover", "inserir"];
const MODULOS_PROIBIDOS_NO_BARREL = [
  DB_SCHEMA,
  CAT_ACTIONS,
  CAT_PAINEL,
  DB_CATEGORIAS,
];

type Importacao = {
  /** Caminho normalizado: `@/...` para tudo que está em src/. */
  modulo: string;
  /** Nomes importados/reexportados; "*" = namespace, export * ou import() dinâmico. */
  nomes: string[];
  tipo: string;
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
  const add = (spec: string | undefined, nomes: string[], tipo: string) => {
    if (spec !== undefined)
      out.push({ modulo: normalizar(arquivo, spec), nomes, tipo });
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
      add(textoLiteral(n.moduleSpecifier), nomes, "import");
    } else if (ts.isExportDeclaration(n) && n.moduleSpecifier) {
      const nomes: string[] = [];
      if (!n.exportClause || ts.isNamespaceExport(n.exportClause))
        nomes.push("*");
      else
        for (const e of n.exportClause.elements)
          nomes.push((e.propertyName ?? e.name).text);
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

const dentro = (arquivo: string, ...dirs: string[]) =>
  dirs.some((d) => arquivo.startsWith(d));
const eModulo = (modulo: string, alvo: string) =>
  modulo === alvo || modulo.startsWith(`${alvo}/`);

export function encontrarViolacoesDeImport(
  arquivos: Record<string, string>,
): string[] {
  const v: string[] = [];
  for (const [arquivo, fonte] of Object.entries(arquivos)) {
    for (const imp of coletarImports(arquivo, fonte)) {
      if (
        EXCECOES.some((x) => x.arquivo === arquivo && x.modulo === imp.modulo)
      )
        continue;
      const rotulo = `${arquivo}: ${imp.tipo} de "${imp.modulo}"`;

      // 1. Camada db de categorias.
      if (
        eModulo(imp.modulo, DB_CATEGORIAS) &&
        !dentro(arquivo, DIR_CATEGORIAS, DIR_DB)
      ) {
        v.push(`${rotulo} (regra 1: só src/lib/categorias/ e src/lib/db/)`);
      }
      // 2. Binding `categorias` do schema (named, namespace, export * ou import()).
      if (
        eModulo(imp.modulo, DB_SCHEMA) &&
        (imp.nomes.includes("categorias") || imp.nomes.includes("*")) &&
        !dentro(arquivo, DIR_CATEGORIAS, DIR_DB)
      ) {
        v.push(
          `${rotulo} (regra 2: schema de categorias só em src/lib/categorias/ e src/lib/db/)`,
        );
      }
      // 3. Server Actions só pelo painel.
      if (eModulo(imp.modulo, CAT_ACTIONS) && !dentro(arquivo, DIR_PAINEL)) {
        v.push(`${rotulo} (regra 3: actions só em src/app/painel/)`);
      }
      // 4. Leitura do painel.
      if (
        eModulo(imp.modulo, CAT_PAINEL) &&
        !dentro(arquivo, DIR_PAINEL, DIR_CATEGORIAS)
      ) {
        v.push(
          `${rotulo} (regra 4: painel só em src/app/painel/ e src/lib/categorias/)`,
        );
      }
      // 5. IA só enxerga o barrel.
      if (
        dentro(arquivo, DIR_AI) &&
        (imp.modulo.startsWith(`${CAT_BARREL}/`) ||
          imp.modulo.startsWith(DB_CATEGORIAS) ||
          (eModulo(imp.modulo, DB_SCHEMA) &&
            (imp.nomes.includes("categorias") || imp.nomes.includes("*"))))
      ) {
        v.push(
          `${rotulo} (regra 5: src/lib/ai/ só importa o barrel "${CAT_BARREL}")`,
        );
      }
    }
  }
  return v;
}

function nomeDeExport(n: ts.Node): string[] {
  const nomes: string[] = [];
  if (ts.isVariableStatement(n)) {
    for (const d of n.declarationList.declarations) {
      if (ts.isIdentifier(d.name)) nomes.push(d.name.text);
      else nomes.push("<desestruturação>");
    }
  } else if (
    (ts.isFunctionDeclaration(n) || ts.isClassDeclaration(n)) &&
    n.name
  ) {
    nomes.push(n.name.text);
  } else if (ts.isFunctionDeclaration(n) || ts.isClassDeclaration(n)) {
    nomes.push("default");
  }
  return nomes;
}

const temExport = (n: ts.Node) =>
  ts.canHaveModifiers(n) &&
  (ts.getModifiers(n) ?? []).some(
    (m) => m.kind === ts.SyntaxKind.ExportKeyword,
  );
const temDefault = (n: ts.Node) =>
  ts.canHaveModifiers(n) &&
  (ts.getModifiers(n) ?? []).some(
    (m) => m.kind === ts.SyntaxKind.DefaultKeyword,
  );

export function analisarBarrel(arquivos: Record<string, string>): string[] {
  const fonte = arquivos[BARREL];
  if (fonte === undefined)
    return [`${BARREL} não existe (o barrel somente leitura é obrigatório)`];

  const v: string[] = [];
  const sf = ts.createSourceFile(BARREL, fonte, ts.ScriptTarget.Latest, true);
  const valores = new Set<string>();
  const tipos = new Set<string>();

  for (const st of sf.statements) {
    if (ts.isExportDeclaration(st)) {
      if (st.moduleSpecifier) {
        const mod = normalizar(
          BARREL,
          textoLiteral(st.moduleSpecifier) ?? "<dinâmico>",
        );
        if (MODULOS_PROIBIDOS_NO_BARREL.some((m) => eModulo(mod, m))) {
          v.push(`barrel reexporta de módulo proibido "${mod}"`);
        }
        if (!st.exportClause) {
          v.push(
            `barrel usa "export *" de "${mod}" (nega por padrão: liste os nomes)`,
          );
          continue;
        }
      }
      if (st.exportClause && ts.isNamedExports(st.exportClause)) {
        for (const e of st.exportClause.elements) {
          (st.isTypeOnly || e.isTypeOnly ? tipos : valores).add(e.name.text);
        }
      } else if (st.exportClause) {
        valores.add(st.exportClause.name.text); // export * as ns
      }
    } else if (ts.isExportAssignment(st)) {
      valores.add("default");
    } else if (ts.isInterfaceDeclaration(st) || ts.isTypeAliasDeclaration(st)) {
      if (temExport(st)) tipos.add(temDefault(st) ? "default" : st.name.text);
    } else if (temExport(st)) {
      for (const nome of nomeDeExport(st))
        valores.add(temDefault(st) ? "default" : nome);
    }
  }

  // Imports do barrel de módulos proibidos também são sinal (mesmo sem reexport direto
  // eles abririam caminho para `export { x }` indireto); as regras de import cobrem o resto.
  for (const nome of [...valores, ...tipos]) {
    if (PREFIXOS_PROIBIDOS.some((p) => nome.toLowerCase().startsWith(p))) {
      v.push(`barrel exporta "${nome}" (escrita não pode sair do barrel)`);
    }
  }
  for (const nome of valores) {
    if (!EXPORTS_PERMITIDOS.includes(nome)) {
      v.push(
        `barrel exporta "${nome}", fora da allowlist ${JSON.stringify(EXPORTS_PERMITIDOS)}`,
      );
    }
  }
  for (const nome of EXPORTS_PERMITIDOS) {
    if (!valores.has(nome))
      v.push(`barrel não exporta "${nome}" (esperado pelo contrato §1)`);
  }
  return v;
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

describe("conformidade do acesso a categorias (FR-014, FR-015, SC-006)", () => {
  it("o src/ real respeita as regras de import 1 a 5 (FR-015)", () => {
    expect(encontrarViolacoesDeImport(lerSrcReal())).toEqual([]);
  });

  it("o barrel src/lib/categorias/index.ts existe e é somente leitura (contrato §1, FR-014)", () => {
    expect(analisarBarrel(lerSrcReal())).toEqual([]);
  });
});

describe("autoteste do detector de imports (a violação seria pega)", () => {
  const viola = (arquivo: string, fonte: string) =>
    encontrarViolacoesDeImport({ [arquivo]: fonte });

  it("regra 1: pega import de @/lib/db/categorias fora da área permitida, por qualquer forma", () => {
    expect(
      viola("src/app/x.ts", `import { inserir } from "@/lib/db/categorias";`),
    ).toHaveLength(1);
    expect(
      viola("src/app/x.ts", `export { inserir } from "@/lib/db/categorias";`),
    ).toHaveLength(1);
    expect(
      viola("src/app/x.ts", `const m = await import("@/lib/db/categorias");`),
    ).toHaveLength(1);
    expect(
      viola("src/app/x.ts", `const m = require("@/lib/db/categorias");`),
    ).toHaveLength(1);
    expect(
      viola("src/app/x.test.ts", `vi.mock("@/lib/db/categorias");`),
    ).toHaveLength(1);
  });

  it("regra 1: pega caminho relativo equivalente", () => {
    expect(
      viola("src/lib/ai/x.ts", `import { remover } from "../db/categorias";`)
        .length,
    ).toBeGreaterThan(0);
    expect(
      viola("src/lib/auth/x.ts", `import x from "../db/categorias.ts";`),
    ).toHaveLength(1);
    expect(
      viola("src/app/painel/p.ts", `import x from "../../lib/db/categorias";`),
    ).toHaveLength(1);
  });

  it("regra 1: permite src/lib/categorias/ e src/lib/db/ (inclusive relativo)", () => {
    expect(
      viola(
        "src/lib/categorias/leitura.ts",
        `import { x } from "@/lib/db/categorias";`,
      ),
    ).toEqual([]);
    expect(
      viola("src/lib/db/outro.ts", `import { x } from "./categorias";`),
    ).toEqual([]);
    expect(
      viola("src/lib/categorias/a.test.ts", `vi.mock("@/lib/db/categorias");`),
    ).toEqual([]);
  });

  it("regra 2: pega `categorias` do schema (named, alias, namespace, export *, import())", () => {
    const f = "src/app/x.ts";
    expect(
      viola(f, `import { categorias } from "@/lib/db/schema";`),
    ).toHaveLength(1);
    expect(
      viola(f, `import { categorias as c } from "@/lib/db/schema";`),
    ).toHaveLength(1);
    expect(viola(f, `import * as schema from "@/lib/db/schema";`)).toHaveLength(
      1,
    );
    expect(viola(f, `export * from "@/lib/db/schema";`)).toHaveLength(1);
    expect(
      viola(f, `export { categorias } from "../lib/db/schema";`),
    ).toHaveLength(1);
    expect(viola(f, `const s = await import("@/lib/db/schema");`)).toHaveLength(
      1,
    );
  });

  it("regra 2: outros bindings do schema e arquivos permitidos passam", () => {
    expect(
      viola("src/app/x.ts", `import { produtos } from "@/lib/db/schema";`),
    ).toEqual([]);
    expect(
      viola("src/lib/db/client.ts", `import * as schema from "./schema";`),
    ).toEqual([]);
    expect(
      viola(
        "src/lib/categorias/a.ts",
        `import { categorias } from "@/lib/db/schema";`,
      ),
    ).toEqual([]);
  });

  it("regra 3: actions só em src/app/painel/", () => {
    expect(
      viola(
        "src/app/painel/(protegido)/p.tsx",
        `import { criarCategoria } from "@/lib/categorias/actions";`,
      ),
    ).toEqual([]);
    expect(
      viola(
        "src/lib/ai/x.ts",
        `import { criarCategoria } from "@/lib/categorias/actions";`,
      ).length,
    ).toBeGreaterThan(0);
    expect(
      viola(
        "src/lib/categorias/index.ts",
        `export { criarCategoria } from "./actions";`,
      ),
    ).toHaveLength(1);
    expect(
      viola("src/lib/categorias/x.ts", `import a from "./actions";`),
    ).toHaveLength(1);
    expect(
      viola(
        "src/app/(public)/p.tsx",
        `import a from "@/lib/categorias/actions";`,
      ),
    ).toHaveLength(1);
  });

  it("regra 3: a exceção explícita vale só para os testes de actions listados", () => {
    expect(
      viola(
        "src/lib/categorias/actions.test.ts",
        `import * as a from "./actions";`,
      ),
    ).toEqual([]);
    expect(
      viola(
        "src/lib/categorias/actions.test.ts",
        `vi.mock("@/lib/db/schema");`,
      ),
    ).toEqual([]);
    expect(
      viola(
        "src/lib/categorias/outro.test.ts",
        `import * as a from "./actions";`,
      ),
    ).toHaveLength(1);
  });

  it("regra 4: painel só em src/app/painel/ e src/lib/categorias/", () => {
    expect(
      viola(
        "src/app/painel/(protegido)/p.tsx",
        `import { x } from "@/lib/categorias/painel";`,
      ),
    ).toEqual([]);
    expect(
      viola("src/lib/categorias/actions.ts", `import { x } from "./painel";`),
    ).toEqual([]);
    expect(
      viola("src/lib/ai/x.ts", `import { x } from "@/lib/categorias/painel";`)
        .length,
    ).toBeGreaterThan(0);
    expect(
      viola(
        "src/app/(public)/p.tsx",
        `import { x } from "@/lib/categorias/painel";`,
      ),
    ).toHaveLength(1);
    expect(
      viola("src/lib/auth/x.ts", `const m = import("../categorias/painel");`),
    ).toHaveLength(1);
  });

  it("regra 5: src/lib/ai/ só importa o barrel", () => {
    expect(
      viola(
        "src/lib/ai/x.ts",
        `import { listarCategorias } from "@/lib/categorias";`,
      ),
    ).toEqual([]);
    expect(
      viola(
        "src/lib/ai/x.ts",
        `import { listarCategorias } from "../categorias";`,
      ),
    ).toEqual([]);
    expect(
      viola(
        "src/lib/ai/x.ts",
        `import { listarCategorias } from "../categorias/index";`,
      ),
    ).toEqual([]);
    expect(
      viola("src/lib/ai/x.ts", `import { x } from "@/lib/categorias/erros";`),
    ).toHaveLength(1);
    expect(
      viola("src/lib/ai/x.ts", `import { x } from "@/lib/categorias/leitura";`),
    ).toHaveLength(1);
    expect(
      viola("src/lib/ai/sub/x.ts", `import { x } from "@/lib/db/categorias";`)
        .length,
    ).toBeGreaterThan(0);
  });

  it("não se acusa por strings que parecem import (só a AST conta)", () => {
    const fonte =
      'const s = \'import { x } from "@/lib/db/categorias"\';\n// import a from "@/lib/categorias/actions"\n';
    expect(viola("src/app/x.ts", fonte)).toEqual([]);
  });
});

describe("autoteste do detector do barrel (nega por padrão)", () => {
  const OK = `export { listarCategorias, obterCategoria, exigirCategoriaValida } from "./leitura";
export { CategoriaInvalidaError } from "./erros";
export { normalizarNome } from "./nome";
export type { Categoria } from "./leitura";
`;
  const barrel = (fonte: string) => analisarBarrel({ [BARREL]: fonte });

  it("barrel ausente falha", () => {
    expect(analisarBarrel({})).toHaveLength(1);
  });

  it("barrel conforme passa", () => {
    expect(barrel(OK)).toEqual([]);
    expect(
      barrel(`export async function listarCategorias() {}
export const obterCategoria = async () => null;
export function exigirCategoriaValida() {}
export class CategoriaInvalidaError extends Error {}
export function normalizarNome() {}
`),
    ).toEqual([]);
  });

  it("pega exportação de escrita em qualquer forma", () => {
    expect(
      barrel(`${OK}export { criarCategoria } from "./actions";`).length,
    ).toBeGreaterThan(0);
    expect(
      barrel(`${OK}export async function renomearCategoria() {}`).length,
    ).toBeGreaterThan(0);
    expect(
      barrel(`${OK}export const removerCategoria = () => {};`).length,
    ).toBeGreaterThan(0);
    expect(
      barrel(`${OK}export { inserir } from "./db";`).length,
    ).toBeGreaterThan(0);
    expect(
      barrel(`${OK}export type { CriarInput } from "./x";`).length,
    ).toBeGreaterThan(0);
  });

  it("pega reexport do schema, de actions, do painel e da camada db (inclusive export *)", () => {
    expect(
      barrel(`${OK}export { categorias } from "@/lib/db/schema";`).length,
    ).toBeGreaterThan(0);
    expect(
      barrel(`${OK}export * from "@/lib/db/schema";`).length,
    ).toBeGreaterThan(0);
    expect(barrel(`${OK}export * from "./actions";`).length).toBeGreaterThan(0);
    expect(barrel(`${OK}export * from "./painel";`).length).toBeGreaterThan(0);
    expect(
      barrel(`${OK}export * from "../db/categorias";`).length,
    ).toBeGreaterThan(0);
    expect(barrel(`${OK}export * from "./leitura";`).length).toBeGreaterThan(0);
  });

  it("pega export fora da allowlist e default", () => {
    expect(barrel(`${OK}export const versao = 1;`).length).toBeGreaterThan(0);
    expect(barrel(`${OK}export default function () {}`).length).toBeGreaterThan(
      0,
    );
  });

  it("pega nome esperado ausente", () => {
    expect(
      barrel(`export { listarCategorias, obterCategoria } from "./leitura";`)
        .length,
    ).toBeGreaterThan(0);
  });
});
