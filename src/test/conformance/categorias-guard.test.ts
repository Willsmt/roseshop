import fs from "node:fs";
import path from "node:path";

import ts from "typescript";
import { describe, expect, it } from "vitest";

// T050 (FR-016, SC-004): guard obrigatório nas páginas e actions de categorias.
// Arquivo irmão de painel-guard.test.ts; nega por padrão e não usa banco.

const BASE = "src/app/painel/(protegido)/categorias/";
const ROTA = "/painel/categorias";
const ACTIONS = "src/lib/categorias/actions.ts";
const PAGINAS_OBRIGATORIAS = [
  `${BASE}page.tsx`,
  `${BASE}nova/page.tsx`,
  `${BASE}[id]/renomear/page.tsx`,
  `${BASE}[id]/remover/page.tsx`,
];
const ACTIONS_ESPERADAS = [
  "criarCategoria",
  "removerCategoria",
  "renomearCategoria",
];
const LEITURAS = ["listarCategoriasDoPainel", "obterCategoriaDoPainel"];

const MSG_ARG = "argumento de requireAdminPage não corresponde à rota da pasta";
const reDinamico = /^\[.+\]$/;

function parse(arquivo: string, conteudo: string): ts.SourceFile {
  const kind = arquivo.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  return ts.createSourceFile(
    arquivo,
    conteudo,
    ts.ScriptTarget.Latest,
    true,
    kind,
  );
}

function isFn(n: ts.Node): n is ts.FunctionLikeDeclaration {
  return (
    ts.isFunctionDeclaration(n) ||
    ts.isFunctionExpression(n) ||
    ts.isArrowFunction(n) ||
    ts.isMethodDeclaration(n)
  );
}

const modificadores = (n: ts.Node) =>
  ts.canHaveModifiers(n) ? (ts.getModifiers(n) ?? []) : [];
const tem = (n: ts.Node, k: ts.SyntaxKind) =>
  modificadores(n).some((m) => m.kind === k);

function funcaoDe(
  node: ts.Node | undefined,
): ts.FunctionLikeDeclaration | undefined {
  return node && isFn(node) ? node : undefined;
}

function funcaoLocal(
  sf: ts.SourceFile,
  nome: string,
): ts.FunctionLikeDeclaration | undefined {
  for (const s of sf.statements) {
    if (ts.isFunctionDeclaration(s) && s.name?.text === nome) return s;
    if (ts.isVariableStatement(s)) {
      for (const d of s.declarationList.declarations) {
        if (ts.isIdentifier(d.name) && d.name.text === nome)
          return funcaoDe(d.initializer);
      }
    }
  }
  return undefined;
}

function exportDefault(
  sf: ts.SourceFile,
): ts.FunctionLikeDeclaration | undefined {
  for (const s of sf.statements) {
    const exp = tem(s, ts.SyntaxKind.ExportKeyword);
    if (
      ts.isFunctionDeclaration(s) &&
      exp &&
      tem(s, ts.SyntaxKind.DefaultKeyword)
    )
      return s;
    if (ts.isExportAssignment(s) && !s.isExportEquals) {
      return ts.isIdentifier(s.expression)
        ? funcaoLocal(sf, s.expression.text)
        : funcaoDe(s.expression);
    }
  }
  return undefined;
}

// Chamadas `nome(...)` no corpo, sem descer em funções aninhadas, com a posição no fonte.
function chamadas(
  corpo: ts.Node,
  nomes: readonly string[],
): ts.CallExpression[] {
  const out: ts.CallExpression[] = [];
  const visita = (n: ts.Node) => {
    if (isFn(n)) return;
    if (
      ts.isCallExpression(n) &&
      ts.isIdentifier(n.expression) &&
      nomes.includes(n.expression.text)
    ) {
      out.push(n);
    }
    ts.forEachChild(n, visita);
  };
  ts.forEachChild(corpo, visita);
  return out;
}

// Rota esperada a partir da pasta da página (relativa a BASE, sem o "page.tsx").
type Esperada =
  { tipo: "estatica"; rota: string } | { tipo: "dinamica"; cauda: string };

function esperada(arquivo: string): Esperada {
  const segs = arquivo.slice(BASE.length).split("/").slice(0, -1);
  if (segs.some((s) => reDinamico.test(s))) {
    return { tipo: "dinamica", cauda: `/${segs[segs.length - 1]}` };
  }
  return { tipo: "estatica", rota: [ROTA, ...segs].join("/") };
}

function argumentoValido(
  arg: ts.Expression | undefined,
  esp: Esperada,
): boolean {
  if (!arg) return false;
  if (esp.tipo === "estatica") {
    return ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg)
      ? arg.text === esp.rota
      : false;
  }
  if (!ts.isTemplateExpression(arg)) return false;
  const ultimo = arg.templateSpans[arg.templateSpans.length - 1];
  return arg.head.text === `${ROTA}/` && ultimo.literal.text === esp.cauda;
}

function verificarPagina(arquivo: string, conteudo: string): string[] {
  const id = `${arquivo}#default`;
  const fn = exportDefault(parse(arquivo, conteudo));
  if (!fn?.body) return [`${id}: sem export default de função`];
  const guardas = chamadas(fn.body, ["requireAdminPage"]);
  if (guardas.length === 0) return [`${id}: sem requireAdminPage`];
  const guarda = guardas[0];
  const v: string[] = [];
  if (
    chamadas(fn.body, LEITURAS).some((c) => c.getStart() < guarda.getStart())
  ) {
    v.push(`${id}: leitura antes do requireAdminPage`);
  }
  if (!argumentoValido(guarda.arguments[0], esperada(arquivo))) {
    v.push(
      `${id}: argumento de requireAdminPage não corresponde à rota da pasta`,
    );
  }
  return v;
}

const ehGuardAction = (e: ts.Expression) =>
  ts.isAwaitExpression(e) &&
  ts.isCallExpression(e.expression) &&
  ts.isIdentifier(e.expression.expression) &&
  e.expression.expression.text === "requireAdminAction";

function primeiroEhGuard(fn: ts.FunctionLikeDeclaration | undefined): boolean {
  if (!fn?.body || !ts.isBlock(fn.body)) return false;
  const s = fn.body.statements[0];
  if (!s) return false;
  if (ts.isExpressionStatement(s)) return ehGuardAction(s.expression);
  if (ts.isVariableStatement(s)) {
    const ds = s.declarationList.declarations;
    return (
      ds.length === 1 && !!ds[0].initializer && ehGuardAction(ds[0].initializer)
    );
  }
  return false;
}

function verificarActions(arquivo: string, conteudo: string): string[] {
  const sf = parse(arquivo, conteudo);
  const v: string[] = [];
  const achadas: string[] = [];
  for (const s of sf.statements) {
    if (
      ts.isFunctionDeclaration(s) &&
      s.name &&
      tem(s, ts.SyntaxKind.ExportKeyword)
    ) {
      achadas.push(s.name.text);
      if (!primeiroEhGuard(s))
        v.push(
          `${arquivo}#${s.name.text}: requireAdminAction não é o 1º statement`,
        );
    } else if (
      ts.isVariableStatement(s) &&
      tem(s, ts.SyntaxKind.ExportKeyword)
    ) {
      for (const d of s.declarationList.declarations) {
        const nome = d.name.getText(sf);
        achadas.push(nome);
        if (!primeiroEhGuard(funcaoDe(d.initializer))) {
          v.push(`${arquivo}#${nome}: requireAdminAction não é o 1º statement`);
        }
      }
    } else if (ts.isExportDeclaration(s) && !s.isTypeOnly) {
      v.push(`${arquivo}: export indireto não verificável`);
    } else if (ts.isExportAssignment(s)) {
      v.push(`${arquivo}#default: export default não permitido`);
    }
  }
  const esperado = [...ACTIONS_ESPERADAS].sort().join(",");
  if ([...achadas].sort().join(",") !== esperado) {
    v.push(
      `${arquivo}: exports [${[...achadas].sort()}] diferem do esperado [${esperado}]`,
    );
  }
  return v;
}

export function verificarCategorias(
  arquivos: Record<string, string>,
): string[] {
  const v: string[] = [];
  for (const p of PAGINAS_OBRIGATORIAS) {
    if (!(p in arquivos)) v.push(`página ausente: ${p}`);
  }
  for (const [arquivo, conteudo] of Object.entries(arquivos)) {
    if (arquivo.startsWith(BASE) && /\/page\.(tsx?|jsx?)$/.test(arquivo)) {
      v.push(...verificarPagina(arquivo, conteudo));
    }
  }
  if (!(ACTIONS in arquivos)) v.push(`arquivo ausente: ${ACTIONS}`);
  else v.push(...verificarActions(ACTIONS, arquivos[ACTIONS]));
  return v;
}

function lerPaginas(dir: string, out: Record<string, string> = {}) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) lerPaginas(abs, out);
    else if (/^page\.(tsx?|jsx?)$/.test(e.name)) {
      out[path.relative(process.cwd(), abs).split(path.sep).join("/")] =
        fs.readFileSync(abs, "utf8");
    }
  }
  return out;
}

// Fixtures: conjunto correto completo, alterado caso a caso.
const PAGINA_OK = (rota: string) =>
  `export default async function P() {
  await requireAdminPage("${rota}");
  await listarCategoriasDoPainel();
}`;
const PAGINA_DIN = (
  cauda: string,
) => `export default async function P({ params }) {
  const { id } = await params;
  await requireAdminPage(\`${ROTA}/\${id}${cauda}\`);
  return obterCategoriaDoPainel(id);
}`;
const ACTIONS_OK = `"use server";
export async function criarCategoria(e: unknown) { const s = await requireAdminAction(); return s; }
export async function renomearCategoria(e: unknown) { await requireAdminAction(); }
export async function removerCategoria(e: unknown) { const s = await requireAdminAction(); }
`;
const OK: Record<string, string> = {
  [PAGINAS_OBRIGATORIAS[0]]: PAGINA_OK(ROTA),
  [PAGINAS_OBRIGATORIAS[1]]: PAGINA_OK(`${ROTA}/nova`),
  [PAGINAS_OBRIGATORIAS[2]]: PAGINA_DIN("/renomear"),
  [PAGINAS_OBRIGATORIAS[3]]: PAGINA_DIN("/remover"),
  [ACTIONS]: ACTIONS_OK,
};
const com = (extra: Record<string, string>) => ({ ...OK, ...extra });

describe("conformidade do guard de categorias (FR-016, SC-004)", () => {
  it("o src/ real tem as quatro páginas e todas com guard na ordem e rota certas", () => {
    const arquivos = {
      ...lerPaginas(path.join(process.cwd(), BASE)),
      [ACTIONS]: fs.readFileSync(path.join(process.cwd(), ACTIONS), "utf8"),
    };
    expect(verificarCategorias(arquivos)).toEqual([]);
  });

  describe("fixtures positivas", () => {
    it("conjunto correto não tem violações", () => {
      expect(verificarCategorias(OK)).toEqual([]);
    });

    it("await params antes do guard em rota dinâmica é permitido", () => {
      expect(verificarCategorias(com({}))).toEqual([]);
    });

    it("página extra correta sob categorias/ também passa", () => {
      const v = verificarCategorias(
        com({ [`${BASE}extra/page.tsx`]: PAGINA_OK(`${ROTA}/extra`) }),
      );
      expect(v).toEqual([]);
    });

    it("string literal em template sem substituição vale para rota estática", () => {
      const v = verificarCategorias(
        com({
          [PAGINAS_OBRIGATORIAS[1]]: `export default async function P() {
  await requireAdminPage(\`${ROTA}/nova\`);
}`,
        }),
      );
      expect(v).toEqual([]);
    });
  });

  describe("fixtures negativas: páginas", () => {
    it("página obrigatória ausente", () => {
      const resto = { ...OK };
      delete resto[PAGINAS_OBRIGATORIAS[3]];
      expect(verificarCategorias(resto)).toEqual([
        `página ausente: ${PAGINAS_OBRIGATORIAS[3]}`,
      ]);
    });

    it("página sem guard", () => {
      const v = verificarCategorias(
        com({
          [PAGINAS_OBRIGATORIAS[0]]:
            "export default async function P() { return null; }",
        }),
      );
      expect(v).toEqual([
        `${PAGINAS_OBRIGATORIAS[0]}#default: sem requireAdminPage`,
      ]);
    });

    it("página extra sem guard também é verificada", () => {
      const v = verificarCategorias(
        com({
          [`${BASE}extra/page.tsx`]:
            "export default function P() { return null; }",
        }),
      );
      expect(v).toEqual([
        `${BASE}extra/page.tsx#default: sem requireAdminPage`,
      ]);
    });

    it("guard depois da leitura (estática)", () => {
      const v = verificarCategorias(
        com({
          [PAGINAS_OBRIGATORIAS[0]]: `export default async function P() {
  const l = await listarCategoriasDoPainel();
  await requireAdminPage("${ROTA}");
}`,
        }),
      );
      expect(v).toEqual([
        `${PAGINAS_OBRIGATORIAS[0]}#default: leitura antes do requireAdminPage`,
      ]);
    });

    it("guard depois da leitura (dinâmica)", () => {
      const v = verificarCategorias(
        com({
          [PAGINAS_OBRIGATORIAS[3]]: `export default async function P({ params }) {
  const { id } = await params;
  const c = await obterCategoriaDoPainel(id);
  await requireAdminPage(\`${ROTA}/\${id}/remover\`);
}`,
        }),
      );
      expect(v).toEqual([
        `${PAGINAS_OBRIGATORIAS[3]}#default: leitura antes do requireAdminPage`,
      ]);
    });

    it("guard só em função aninhada não vale", () => {
      const v = verificarCategorias(
        com({
          [PAGINAS_OBRIGATORIAS[0]]: `export default async function P() {
  const f = async () => { await requireAdminPage("${ROTA}"); };
  return null;
}`,
        }),
      );
      expect(v).toEqual([
        `${PAGINAS_OBRIGATORIAS[0]}#default: sem requireAdminPage`,
      ]);
    });

    it.each([
      [
        "rota de outra pasta (lista com a rota de nova)",
        0,
        PAGINA_OK(`${ROTA}/nova`),
      ],
      ["rota de outra pasta (nova com a rota da lista)", 1, PAGINA_OK(ROTA)],
      ["rota fora de /painel/categorias", 0, PAGINA_OK("/painel")],
      [
        "variável em vez de literal",
        1,
        `export default async function P() {
  const r = "${ROTA}/nova";
  await requireAdminPage(r);
}`,
      ],
      [
        "string concatenada em estática",
        1,
        `export default async function P() { await requireAdminPage("${ROTA}/" + "nova"); }`,
      ],
      ["dinâmica de renomear usando /remover", 2, PAGINA_DIN("/remover")],
      ["dinâmica de remover usando /renomear", 3, PAGINA_DIN("/renomear")],
      [
        "dinâmica com string literal fixa",
        2,
        `export default async function P() { await requireAdminPage("${ROTA}/1/renomear"); }`,
      ],
      [
        "dinâmica com head errado",
        3,
        `export default async function P({ params }) {
  const { id } = await params;
  await requireAdminPage(\`/painel/\${id}/remover\`);
}`,
      ],
      [
        "dinâmica concatenada",
        2,
        `export default async function P({ params }) {
  const { id } = await params;
  await requireAdminPage("${ROTA}/" + id + "/renomear");
}`,
      ],
      [
        "dinâmica sem argumento",
        3,
        "export default async function P() { await requireAdminPage(); }",
      ],
    ])("argumento errado: %s", (_nome, i, codigo) => {
      const v = verificarCategorias(com({ [PAGINAS_OBRIGATORIAS[i]]: codigo }));
      expect(v).toEqual([
        `${PAGINAS_OBRIGATORIAS[i]}#default: ${MSG_ARG}`,
      ]);
    });
  });

  describe("fixtures negativas: actions", () => {
    it("action com guard em segundo statement", () => {
      const v = verificarCategorias(
        com({
          [ACTIONS]: ACTIONS_OK.replace(
            "{ await requireAdminAction(); }",
            "{ const x = 1; await requireAdminAction(); }",
          ),
        }),
      );
      expect(v).toEqual([
        `${ACTIONS}#renomearCategoria: requireAdminAction não é o 1º statement`,
      ]);
    });

    it("action sem guard", () => {
      const v = verificarCategorias(
        com({
          [ACTIONS]: ACTIONS_OK.replace(
            "const s = await requireAdminAction(); }",
            "}",
          ),
        }),
      );
      expect(v.length).toBeGreaterThan(0);
      expect(v[0]).toContain("requireAdminAction não é o 1º statement");
    });

    it("guard sem await não vale", () => {
      const v = verificarCategorias(
        com({
          [ACTIONS]: ACTIONS_OK.replace(
            "{ await requireAdminAction(); }",
            "{ requireAdminAction(); }",
          ),
        }),
      );
      expect(v).toEqual([
        `${ACTIONS}#renomearCategoria: requireAdminAction não é o 1º statement`,
      ]);
    });

    it("export novo sem guard é violação e muda a lista esperada", () => {
      const v = verificarCategorias(
        com({
          [ACTIONS]: `${ACTIONS_OK}export async function apagarTudo() { return 1; }\n`,
        }),
      );
      expect(v).toContain(
        `${ACTIONS}#apagarTudo: requireAdminAction não é o 1º statement`,
      );
      expect(v.some((x) => x.includes("diferem do esperado"))).toBe(true);
    });

    it("export novo COM guard ainda quebra a lista exata", () => {
      const v = verificarCategorias(
        com({
          [ACTIONS]: `${ACTIONS_OK}export async function nova() { await requireAdminAction(); }\n`,
        }),
      );
      expect(v).toHaveLength(1);
      expect(v[0]).toContain("diferem do esperado");
    });

    it("action esperada removida quebra a lista exata", () => {
      const v = verificarCategorias(
        com({
          [ACTIONS]: ACTIONS_OK.replace(
            /export async function removerCategoria.*\n/,
            "",
          ),
        }),
      );
      expect(v).toHaveLength(1);
      expect(v[0]).toContain("diferem do esperado");
    });

    it("export indireto não é verificável", () => {
      const v = verificarCategorias(
        com({ [ACTIONS]: `${ACTIONS_OK}export { x } from "./outro";\n` }),
      );
      expect(v).toContain(`${ACTIONS}: export indireto não verificável`);
    });

    it("actions.ts ausente", () => {
      const resto = { ...OK };
      delete resto[ACTIONS];
      expect(verificarCategorias(resto)).toEqual([
        `arquivo ausente: ${ACTIONS}`,
      ]);
    });
  });
});
