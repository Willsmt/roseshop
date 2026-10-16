import fs from "node:fs";
import path from "node:path";

import ts from "typescript";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Feature 006, T027 (SF3): a conferência da sacola é pública, sem sessão e sem rastro dos códigos
// pedidos. Nega por padrão: o arquivo da rota DEVE existir. Conformidade estática (imports, export
// `dynamic`) e dinâmica (chaves da resposta 200, erros `{}`, nada nos console.* — SC-007, CC§4).

const ROTA = "src/app/api/catalogo/conferencia/route.ts";

const lerConferencia = vi.hoisted(() => vi.fn());
const registrarFalha = vi.hoisted(() => vi.fn());
const BancoIndisponivel = vi.hoisted(() => class BancoIndisponivel extends Error {});
vi.mock("@/lib/catalogo", () => ({ lerConferencia, registrarFalha, BancoIndisponivel }));

const CHAVES_PERMITIDAS = new Set([
  "itens", "codigo", "estado", "produto", "nome", "href", "precoCentavos", "aPartirDe", "capa",
  "url", "alt",
]);

function fonte() {
  const abs = path.join(process.cwd(), ROTA);
  expect(fs.existsSync(abs), `${ROTA} deve existir`).toBe(true);
  return ts.createSourceFile(ROTA, fs.readFileSync(abs, "utf8"), ts.ScriptTarget.Latest, true);
}

function especificadores(sf: ts.SourceFile): string[] {
  const r: string[] = [];
  const visita = (n: ts.Node) => {
    if (
      (ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) &&
      n.moduleSpecifier &&
      ts.isStringLiteral(n.moduleSpecifier)
    ) {
      r.push(n.moduleSpecifier.text);
    }
    if (
      ts.isCallExpression(n) &&
      (n.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(n.expression) && n.expression.text === "require")) &&
      n.arguments[0] &&
      ts.isStringLiteralLike(n.arguments[0])
    ) {
      r.push(n.arguments[0].text);
    }
    ts.forEachChild(n, visita);
  };
  visita(sf);
  return r;
}

describe("conferência: conformidade estática (T027)", () => {
  it("não importa sessão (@/lib/auth, next-auth, @auth/*), next/headers nem submódulos do catálogo", () => {
    const specs = especificadores(fonte());
    expect(specs.length).toBeGreaterThan(0);
    for (const s of specs) {
      expect(s, `import proibido: ${s}`).not.toMatch(/^@\/lib\/auth(\/|$)/);
      expect(s, `import proibido: ${s}`).not.toMatch(/^(next-auth|@auth\/[^/]+)(\/|$)/);
      expect(s, `import proibido: ${s}`).not.toMatch(/^next\/headers$/);
      expect(s, `só o barrel do catálogo: ${s}`).not.toMatch(/^@\/lib\/catalogo\/./);
      expect(s, `sem banco na rota: ${s}`).not.toMatch(/^@\/lib\/db(\/|$)/);
      expect(s, `sem caminho relativo para lib: ${s}`).not.toMatch(/\.\.\/.*lib\//);
    }
    expect(specs).toContain("@/lib/catalogo");
  });

  it("não chama cookies(), headers() nem getAdminSession", () => {
    const sf = fonte();
    const chamadas: string[] = [];
    const visita = (n: ts.Node) => {
      if (ts.isCallExpression(n)) {
        const e = n.expression;
        const nome = ts.isIdentifier(e) ? e.text : ts.isPropertyAccessExpression(e) ? e.name.text : "";
        if (["cookies", "headers", "getAdminSession"].includes(nome)) chamadas.push(nome);
      }
      ts.forEachChild(n, visita);
    };
    visita(sf);
    expect(chamadas).toEqual([]);
  });

  it('exporta `dynamic = "force-dynamic"` e a função POST', () => {
    const sf = fonte();
    let dynamic: string | null = null;
    let post = false;
    for (const st of sf.statements) {
      if (ts.isVariableStatement(st) && st.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) {
        for (const d of st.declarationList.declarations) {
          if (ts.isIdentifier(d.name) && d.name.text === "dynamic" && d.initializer && ts.isStringLiteralLike(d.initializer)) {
            dynamic = d.initializer.text;
          }
        }
      }
      if (
        ts.isFunctionDeclaration(st) &&
        st.name?.text === "POST" &&
        st.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
      ) {
        post = true;
      }
    }
    expect(dynamic).toBe("force-dynamic");
    expect(post).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------------

const CODIGO_A = "73519";
const CODIGO_B = "0042";
const SEGREDO_CORPO = "trecho-secreto-do-corpo";
const CL_DISTINTIVO = "7777";

const ITENS = [
  {
    codigo: CODIGO_B,
    estado: "ok",
    produto: {
      nome: "Meia",
      href: "/p/0042",
      precoCentavos: 600,
      aPartirDe: false,
      capa: { url: "/fotos/a.webp", alt: "Meia" },
    },
  },
  {
    codigo: "0007",
    estado: "esgotado",
    produto: { nome: "Guarda-chuva", href: "/p/0007", precoCentavos: null, aPartirDe: true, capa: null },
  },
  { codigo: CODIGO_A, estado: "inexistente" },
];

const JSON_CT = { "content-type": "application/json" };

function coletarChaves(valor: unknown, acc: Set<string> = new Set()): Set<string> {
  if (Array.isArray(valor)) valor.forEach((v) => coletarChaves(v, acc));
  else if (valor && typeof valor === "object") {
    for (const [k, v] of Object.entries(valor)) {
      acc.add(k);
      coletarChaves(v, acc);
    }
  }
  return acc;
}

const metodos = ["log", "info", "warn", "error", "debug"] as const;
let espioes: Record<(typeof metodos)[number], ReturnType<typeof vi.spyOn>>;

beforeEach(() => {
  lerConferencia.mockReset().mockResolvedValue(ITENS);
  registrarFalha.mockReset();
  espioes = Object.fromEntries(
    metodos.map((m) => [m, vi.spyOn(console, m).mockImplementation(() => {})]),
  ) as typeof espioes;
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function post(req: Request) {
  const { POST } = await import("@/app/api/catalogo/conferencia/route");
  return POST(req);
}

function req(corpo: string, headers: Record<string, string> = JSON_CT) {
  return new Request("http://localhost/api/catalogo/conferencia", { method: "POST", headers, body: corpo });
}

function consoleCompleto(): string {
  return metodos.map((m) => JSON.stringify(espioes[m].mock.calls)).join("\n");
}

function semRastro() {
  const texto = consoleCompleto();
  for (const proibido of [CODIGO_A, CODIGO_B, SEGREDO_CORPO, CL_DISTINTIVO, "codigos"]) {
    expect(texto, `console contém "${proibido}"`).not.toContain(proibido);
  }
  const falhas = JSON.stringify(registrarFalha.mock.calls);
  for (const proibido of [CODIGO_A, CODIGO_B, SEGREDO_CORPO, CL_DISTINTIVO]) {
    expect(falhas, `registrarFalha contém "${proibido}"`).not.toContain(proibido);
  }
}

describe("conferência: resposta e registro (T027, SC-007)", () => {
  it("200: só as chaves permitidas (itens, codigo, estado, produto, nome, href, precoCentavos, aPartirDe, capa, url, alt)", async () => {
    // A leitura devolve também campos internos: a rota não pode ser a que os deixa passar só por
    // acaso, mas aqui o mock já respeita o contrato; o teste prova que a rota não ACRESCENTA nada.
    const r = await post(req(JSON.stringify({ codigos: [CODIGO_B, "0007", CODIGO_A] })));
    expect(r.status).toBe(200);
    const corpo = (await r.json()) as Record<string, unknown>;
    const chaves = coletarChaves(corpo);
    expect(chaves.size).toBeGreaterThan(0);
    for (const k of chaves) expect(CHAVES_PERMITIDAS.has(k), `chave fora do contrato: ${k}`).toBe(true);
    expect(Object.keys(corpo)).toEqual(["itens"]);
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect(r.headers.get("x-content-type-options")).toBe("nosniff");
    semRastro();
  });

  it("200 sem sessão: a rota atende sem cookie nem Authorization e não os lê", async () => {
    const r = await post(req(JSON.stringify({ codigos: [CODIGO_B] })));
    expect(r.status).toBe(200);
    const comCookie = await post(
      req(JSON.stringify({ codigos: [CODIGO_B] }), { ...JSON_CT, cookie: "authjs.session-token=x", authorization: "Bearer y" }),
    );
    expect(comCookie.status).toBe(200);
    expect(await comCookie.json()).toEqual(await (await post(req(JSON.stringify({ codigos: [CODIGO_B] })))).json());
  });

  it("415: corpo {} e nenhum console", async () => {
    const r = await post(req(JSON.stringify({ codigos: [CODIGO_A] }), { "content-type": "text/plain" }));
    expect(r.status).toBe(415);
    expect(await r.json()).toEqual({});
    semRastro();
  });

  it("413 pelo Content-Length: corpo {} e nenhum console (nem o valor do cabeçalho)", async () => {
    const pedido = {
      headers: new Headers({ ...JSON_CT, "content-length": CL_DISTINTIVO }),
      body: null,
    } as unknown as Request;
    const r = await post(pedido);
    expect(r.status).toBe(413);
    expect(await r.json()).toEqual({});
    semRastro();
  });

  it("413 pela leitura do stream: corpo {} e nenhum console", async () => {
    const grande = JSON.stringify({ codigos: [CODIGO_A], x: SEGREDO_CORPO + " ".repeat(1100) });
    const r = await post(req(grande));
    expect(r.status).toBe(413);
    expect(await r.json()).toEqual({});
    semRastro();
  });

  it.each([
    ["JSON inválido", `{"codigos":["${CODIGO_A}"` + SEGREDO_CORPO],
    ["chave extra", JSON.stringify({ codigos: [CODIGO_A], [SEGREDO_CORPO]: 1 })],
    ["código inválido", JSON.stringify({ codigos: [CODIGO_A, "0000", CODIGO_B] })],
    ["repetido", JSON.stringify({ codigos: [CODIGO_A, CODIGO_A] })],
    ["corpo vazio", ""],
  ])("400 (%s): corpo {} e nenhum console", async (_nome, corpo) => {
    const r = await post(req(corpo));
    expect(r.status).toBe(400);
    expect(await r.json()).toEqual({});
    expect(lerConferencia).not.toHaveBeenCalled();
    semRastro();
  });

  it("503: corpo {}, nenhum console.* da rota e registrarFalha sem códigos", async () => {
    lerConferencia.mockRejectedValue(new BancoIndisponivel(`falha ${CODIGO_A} ${CODIGO_B}`));
    const r = await post(req(JSON.stringify({ codigos: [CODIGO_A, CODIGO_B] })));
    expect(r.status).toBe(503);
    expect(await r.json()).toEqual({});
    expect(registrarFalha).toHaveBeenCalledTimes(1);
    expect(registrarFalha).toHaveBeenCalledWith({
      evento: "catalogo.banco_indisponivel",
      rota: "/api/catalogo/conferencia",
      causa: "banco",
    });
    semRastro();
  });

  it("JSON.parse que lança com os códigos na mensagem: 400 {}, e nem console nem registro os contêm", async () => {
    const parse = vi.spyOn(JSON, "parse").mockImplementationOnce(() => {
      throw new SyntaxError(`token inesperado em ${CODIGO_A} ${CODIGO_B} ${SEGREDO_CORPO}`);
    });
    const r = await post(req(JSON.stringify({ codigos: [CODIGO_A, CODIGO_B], x: SEGREDO_CORPO })));
    expect(parse).toHaveBeenCalled();
    expect(r.status).toBe(400);
    expect(await r.json()).toEqual({});
    semRastro();
  });

  it("500 (erro fora do banco com os códigos na mensagem): corpo {} e registro só com o nome da classe", async () => {
    lerConferencia.mockRejectedValue(new SyntaxError(`falha ${CODIGO_A} ${CODIGO_B} ${SEGREDO_CORPO}`));
    const r = await post(req(JSON.stringify({ codigos: [CODIGO_A, CODIGO_B] })));
    expect(r.status).toBe(500);
    expect(await r.json()).toEqual({});
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect(r.headers.get("x-content-type-options")).toBe("nosniff");
    expect(registrarFalha).toHaveBeenCalledTimes(1);
    expect(registrarFalha).toHaveBeenCalledWith({
      evento: "catalogo.erro_inesperado",
      rota: "/api/catalogo/conferencia",
      causa: "inesperado",
      classe: "SyntaxError",
    });
    semRastro();
    for (const m of metodos) expect(espioes[m]).not.toHaveBeenCalled();
  });

  it("todos os cenários juntos: console.log/info/warn/error/debug nunca recebem chamadas da rota", async () => {
    await post(req(JSON.stringify({ codigos: [CODIGO_A] })));
    await post(req("{", { "content-type": "text/plain" }));
    await post(req("{"));
    for (const m of metodos) expect(espioes[m]).not.toHaveBeenCalled();
  });
});
