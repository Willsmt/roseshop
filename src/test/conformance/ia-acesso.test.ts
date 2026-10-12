import fs from "node:fs";
import path from "node:path";

import ts from "typescript";
import { describe, expect, it } from "vitest";

// Conformidade das fronteiras da IA (feature 004, T126; contracts/ia.md).
// Parse pela AST para imports (nunca grep), nega por padrão, varre src/** inclusive testes.
//   R1. "api.openai.com" e "OPENAI_API_KEY" só em src/lib/ai/ (busca de texto: cobre comentários);
//       varre também cloudflare/ (exceto *.d.ts). Este arquivo fica fora da varredura real.
//   R2. `@/lib/ai` só em src/lib/ai/, src/lib/produtos/sugestao.ts e sugestao.test.ts;
//       fora de src/lib/ai/ só o barrel (submódulo é violação).
//   R3. Arquivo "use client" não importa nada de src/lib/ai/.
//   R4. `@/lib/db/ia-uso` só em src/lib/db/, src/lib/produtos/sugestao.ts e sugestao.test.ts.
//   R5. `@/lib/produtos/sugestao` (FR-034: sugestão só no cadastro) só em
//       src/app/painel/(protegido)/produtos/novo/ e src/lib/produtos/sugestao.test.ts.

const EXT = "(?:tsx?|jsx?|mjs)";
const reCodigo = new RegExp(`\\.${EXT}$`);


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

const AI = "@/lib/ai";
const DB_IA_USO = "@/lib/db/ia-uso";
const SUGESTAO = "@/lib/produtos/sugestao";

const DIR_AI = "src/lib/ai/";
const SUGESTAO_TS = "src/lib/produtos/sugestao.ts";
const SUGESTAO_TEST = "src/lib/produtos/sugestao.test.ts";
const DIR_NOVO = "src/app/painel/(protegido)/produtos/novo/";
const ESTE_ARQUIVO = "src/test/conformance/ia-acesso.test.ts";
const SEGREDOS = ["api.openai.com", "OPENAI_API_KEY"];

const dentro = (arquivo: string, ...dirs: string[]) =>
  dirs.some((d) => arquivo.startsWith(d));
const eModulo = (modulo: string, alvo: string) =>
  modulo === alvo || modulo.startsWith(`${alvo}/`);

function temUseClient(arquivo: string, fonte: string): boolean {
  const sf = ts.createSourceFile(arquivo, fonte, ts.ScriptTarget.Latest, true);
  for (const st of sf.statements) {
    if (ts.isExpressionStatement(st) && ts.isStringLiteral(st.expression)) {
      if (st.expression.text === "use client") return true;
    } else break;
  }
  return false;
}

export function encontrarViolacoesDeImport(
  arquivos: Record<string, string>,
): string[] {
  const v: string[] = [];
  for (const [arquivo, fonte] of Object.entries(arquivos)) {
    const cliente = temUseClient(arquivo, fonte);
    for (const imp of coletarImports(arquivo, fonte)) {
      const rotulo = `${arquivo}: ${imp.tipo} de "${imp.modulo}"`;
      const ehAi = eModulo(imp.modulo, AI);

      // R2. Só src/lib/ai/, sugestao.ts e seu teste; fora de src/lib/ai/ só o barrel.
      if (
        ehAi &&
        !dentro(arquivo, DIR_AI) &&
        arquivo !== SUGESTAO_TS &&
        arquivo !== SUGESTAO_TEST
      ) {
        v.push(`${rotulo} (regra 2: "${AI}" só em ${DIR_AI}, ${SUGESTAO_TS}, ${SUGESTAO_TEST})`);
      }
      if (imp.modulo.startsWith(`${AI}/`) && !dentro(arquivo, DIR_AI)) {
        v.push(`${rotulo} (regra 2: fora de ${DIR_AI} só o barrel "${AI}")`);
      }
      // R3. "use client" não importa nada de src/lib/ai/.
      if (cliente && ehAi) {
        v.push(`${rotulo} (regra 3: arquivo "use client" sem imports de ${DIR_AI})`);
      }
      // R4. Contador de uso.
      if (
        eModulo(imp.modulo, DB_IA_USO) &&
        !dentro(arquivo, "src/lib/db/") &&
        arquivo !== SUGESTAO_TS &&
        arquivo !== SUGESTAO_TEST
      ) {
        v.push(`${rotulo} (regra 4: db/ia-uso só em src/lib/db/, ${SUGESTAO_TS}, ${SUGESTAO_TEST})`);
      }
      // R5. A action de sugestão só no cadastro.
      if (
        eModulo(imp.modulo, SUGESTAO) &&
        !dentro(arquivo, DIR_NOVO) &&
        arquivo !== SUGESTAO_TEST
      ) {
        v.push(`${rotulo} (regra 5: sugestão só em ${DIR_NOVO}, ${SUGESTAO_TEST})`);
      }
    }
  }
  return v;
}

export function encontrarVazamentosDeSegredo(
  arquivos: Record<string, string>,
): string[] {
  const v: string[] = [];
  for (const [arquivo, fonte] of Object.entries(arquivos)) {
    if (arquivo === ESTE_ARQUIVO || arquivo.endsWith(".d.ts")) continue;
    if (dentro(arquivo, DIR_AI)) continue;
    for (const s of SEGREDOS) {
      if (fonte.includes(s)) {
        v.push(`${arquivo}: contém "${s}" (regra 1: só em ${DIR_AI})`);
      }
    }
  }
  return v;
}

function lerDir(dir: string, raiz: string, out: Record<string, string> = {}) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) lerDir(abs, raiz, out);
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
  return lerDir(path.join(raiz, "src"), raiz);
};
const lerSrcECloudflare = () => {
  const raiz = process.cwd();
  return lerDir(path.join(raiz, "cloudflare"), raiz, lerSrcReal());
};

describe("conformidade das fronteiras da IA (contracts/ia.md)", () => {
  it("o src/ real respeita as regras de import R2 a R5", () => {
    expect(encontrarViolacoesDeImport(lerSrcReal())).toEqual([]);
  });

  it("R1: api.openai.com e OPENAI_API_KEY só sob src/lib/ai/ (src/ e cloudflare/)", () => {
    expect(encontrarVazamentosDeSegredo(lerSrcECloudflare())).toEqual([]);
  });

  it("a varredura real enxerga arquivos de src/ e de cloudflare/ (nega por padrão)", () => {
    const todos = Object.keys(lerSrcECloudflare());
    expect(todos.length).toBeGreaterThan(50);
    expect(todos).toContain("cloudflare/worker.ts");
  });
});

describe("autoteste do detector de imports da IA", () => {
  const viola = (arquivo: string, fonte: string) =>
    encontrarViolacoesDeImport({ [arquivo]: fonte });

  it("R2: barrel de ai fora das áreas autorizadas, por qualquer forma", () => {
    const f = "src/app/x.ts";
    expect(viola(f, `import { x } from "@/lib/ai";`)).toHaveLength(1);
    expect(viola(f, `export { x } from "@/lib/ai";`)).toHaveLength(1);
    expect(viola(f, `const m = await import("@/lib/ai");`)).toHaveLength(1);
    expect(viola(f, `const m = require("@/lib/ai");`)).toHaveLength(1);
    expect(viola("src/app/x.test.ts", `vi.mock("@/lib/ai");`)).toHaveLength(1);
    expect(
      viola("src/lib/categorias/x.ts", `import x from "../ai";`),
    ).toHaveLength(1);
    expect(
      viola("src/lib/fotos/actions.ts", `import x from "../ai/index";`),
    ).toHaveLength(1);
    expect(
      viola(
        "src/app/painel/(protegido)/p.ts",
        `import x from "../../../lib/ai";`,
      ),
    ).toHaveLength(1);
  });

  it("R2: áreas autorizadas passam", () => {
    for (const f of [
      "src/lib/produtos/sugestao.ts",
      "src/lib/produtos/sugestao.test.ts",
    ]) {
      expect(viola(f, `import { x } from "@/lib/ai";`)).toEqual([]);
      expect(viola(f, `import { x } from "../ai";`)).toEqual([]);
    }
    expect(viola("src/lib/produtos/sugestao.test.ts", `vi.mock("@/lib/ai");`)).toEqual([]);
    expect(viola("src/lib/ai/sugestao.ts", `import { x } from "./config";`)).toEqual([]);
    expect(viola("src/lib/ai/sugestao.test.ts", `import { x } from "@/lib/ai/config";`)).toEqual([]);
  });

  it("R2: submódulo de ai fora de src/lib/ai/ é violação, mesmo em área autorizada", () => {
    expect(
      viola("src/lib/produtos/sugestao.ts", `import { x } from "@/lib/ai/config";`),
    ).toHaveLength(1);
    expect(
      viola("src/lib/produtos/sugestao.ts", `import { x } from "../ai/sugestao";`),
    ).toHaveLength(1);
    expect(
      viola("src/lib/produtos/sugestao.test.ts", `vi.mock("@/lib/ai/sugestao");`),
    ).toHaveLength(1);
    expect(
      viola("src/app/x.ts", `const m = import("@/lib/ai/config");`).length,
    ).toBeGreaterThan(0);
  });

  it("R2: não confunde com módulos de nome parecido", () => {
    expect(viola("src/app/x.ts", `import { x } from "@/lib/ai-outro";`)).toEqual([]);
    expect(viola("src/app/x.ts", `import { x } from "@/lib/aiquelas";`)).toEqual([]);
  });

  it("R3: arquivo use client importando de ai (mesmo em área autorizada)", () => {
    const fonte = `"use client";\nimport { x } from "@/lib/ai";`;
    expect(viola("src/app/painel/c.tsx", fonte).length).toBeGreaterThan(0);
    const r3 = viola("src/lib/produtos/sugestao.ts", fonte);
    expect(r3).toHaveLength(1);
    expect(r3[0]).toContain("regra 3");
    expect(
      viola("src/lib/produtos/sugestao.ts", `'use client';\nimport "@/lib/ai";`),
    ).toHaveLength(1);
    // sem a diretiva, em área autorizada, passa
    expect(
      viola("src/lib/produtos/sugestao.ts", `"use server";\nimport { x } from "@/lib/ai";`),
    ).toEqual([]);
    // "use client" fora do topo não é diretiva
    expect(
      viola("src/lib/produtos/sugestao.ts", `import { x } from "@/lib/ai";\nconst s = "use client";`),
    ).toEqual([]);
  });

  it("R4: db/ia-uso só em src/lib/db/, sugestao.ts e seu teste", () => {
    expect(viola("src/app/x.ts", `import { x } from "@/lib/db/ia-uso";`)).toHaveLength(1);
    expect(viola("src/lib/ai/x.ts", `import { x } from "../db/ia-uso";`)).toHaveLength(1);
    expect(viola("src/lib/fotos/x.ts", `import { x } from "@/lib/db/ia-uso";`)).toHaveLength(1);
    expect(viola("src/lib/produtos/actions.ts", `import { x } from "@/lib/db/ia-uso";`)).toHaveLength(1);
    expect(viola("src/app/x.test.ts", `vi.mock("@/lib/db/ia-uso");`)).toHaveLength(1);
    expect(viola("src/lib/produtos/sugestao.ts", `import { x } from "@/lib/db/ia-uso";`)).toEqual([]);
    expect(viola("src/lib/produtos/sugestao.test.ts", `vi.mock("@/lib/db/ia-uso");`)).toEqual([]);
    expect(viola("src/lib/db/ia-uso.int.test.ts", `import { x } from "./ia-uso";`)).toEqual([]);
    expect(viola("src/lib/db/outro.ts", `import { x } from "@/lib/db/ia-uso";`)).toEqual([]);
    expect(viola("src/app/x.ts", `import { x } from "@/lib/db/ia-uso-outro";`)).toEqual([]);
  });

  it("R5: produtos/sugestao só em produtos/novo/ e no seu teste", () => {
    const alvo = `import { sugerirProduto } from "@/lib/produtos/sugestao";`;
    expect(viola("src/app/painel/(protegido)/produtos/novo/x.tsx", alvo)).toEqual([]);
    expect(viola("src/app/painel/(protegido)/produtos/novo/cadastro-produto.tsx", alvo)).toEqual([]);
    expect(viola("src/lib/produtos/sugestao.test.ts", `import { sugerirProduto } from "./sugestao";`)).toEqual([]);
    expect(viola("src/app/painel/(protegido)/produtos/[id]/editar/x.tsx", alvo)).toHaveLength(1);
    expect(viola("src/app/painel/(protegido)/produtos/x.tsx", alvo)).toHaveLength(1);
    expect(viola("src/lib/produtos/actions.ts", `import { x } from "./sugestao";`)).toHaveLength(1);
    expect(viola("src/app/x.ts", `const m = await import("@/lib/produtos/sugestao");`)).toHaveLength(1);
    expect(viola("src/app/x.test.ts", `vi.mock("@/lib/produtos/sugestao");`)).toHaveLength(1);
    expect(
      viola("src/app/painel/(protegido)/produtos/editar.tsx", `import x from "../../../../lib/produtos/sugestao";`),
    ).toHaveLength(1);
    expect(viola("src/app/x.ts", `export { sugerirProduto } from "@/lib/produtos/sugestao";`)).toHaveLength(1);
  });

  it("não se acusa por strings que parecem import (só a AST conta)", () => {
    const fonte =
      'const s = \'import { x } from "@/lib/ai"\';\n// import a from "@/lib/db/ia-uso"\n';
    expect(viola("src/app/x.ts", fonte)).toEqual([]);
  });
});

describe("autoteste do detector de segredos da IA (R1)", () => {
  const viola = (arquivos: Record<string, string>) =>
    encontrarVazamentosDeSegredo(arquivos);

  it("pega as duas strings fora de src/lib/ai/, inclusive em comentário e em cloudflare/", () => {
    expect(viola({ "src/app/x.ts": `fetch("https://api.openai.com/v1/responses");` })).toHaveLength(1);
    expect(viola({ "src/lib/produtos/sugestao.ts": `const k = process.env.OPENAI_API_KEY;` })).toHaveLength(1);
    expect(viola({ "src/lib/db/x.ts": `// usa OPENAI_API_KEY depois` })).toHaveLength(1);
    expect(viola({ "cloudflare/worker.ts": `const k = env.OPENAI_API_KEY;` })).toHaveLength(1);
    expect(viola({ "src/app/x.test.ts": `expect(u).toBe("https://api.openai.com/x")` })).toHaveLength(1);
    expect(
      viola({ "src/app/x.ts": `OPENAI_API_KEY api.openai.com` }),
    ).toHaveLength(2);
  });

  it("deixa passar src/lib/ai/, *.d.ts e este arquivo", () => {
    expect(viola({ "src/lib/ai/sugestao.ts": `fetch("https://api.openai.com/v1/responses");` })).toEqual([]);
    expect(viola({ "src/lib/ai/sugestao.test.ts": `process.env.OPENAI_API_KEY = "x"` })).toEqual([]);
    expect(viola({ "cloudflare/open-next-worker.d.ts": `// OPENAI_API_KEY` })).toEqual([]);
    expect(viola({ [ESTE_ARQUIVO]: `"OPENAI_API_KEY"` })).toEqual([]);
    expect(viola({ "src/app/x.ts": `const a = 1;` })).toEqual([]);
  });
});
