import { beforeEach, describe, expect, it, vi } from "vitest";

// Feature 006, T026 (SF3): contracts/conferencia.md §1 a §4. POST público da conferência da
// sacola. Mock do barrel do catálogo (lerConferencia, registrarFalha, BancoIndisponivel); sem
// banco, sem rede. Ordem exigida: 415 → 413 (Content-Length, corpo intocado) → 413 (leitura por
// stream com teto de 1024 bytes) → JSON + Zod (400) → lerConferencia → 200.
const lerConferencia = vi.hoisted(() => vi.fn());
const registrarFalha = vi.hoisted(() => vi.fn());
const BancoIndisponivel = vi.hoisted(
  () =>
    class BancoIndisponivel extends Error {
      constructor(cause?: unknown) {
        super("banco indisponivel", { cause });
      }
    },
);

vi.mock("@/lib/catalogo", () => ({ lerConferencia, registrarFalha, BancoIndisponivel }));

import * as rota from "./route";

const URL_ROTA = "http://localhost/api/catalogo/conferencia";
const JSON_CT = { "content-type": "application/json" };

function chamar(corpo: unknown, headers: Record<string, string> = JSON_CT) {
  const texto = typeof corpo === "string" ? corpo : JSON.stringify(corpo);
  return rota.POST(new Request(URL_ROTA, { method: "POST", headers, body: texto }));
}

const ITENS = [
  { codigo: "0042", estado: "ok", produto: { nome: "Meia", href: "/p/0042", precoCentavos: 600, aPartirDe: false, capa: null } },
  { codigo: "12345", estado: "inexistente" },
];

function cabecalhosDoContrato(r: Response) {
  expect(r.headers.get("cache-control")).toBe("no-store");
  expect(r.headers.get("x-content-type-options")).toBe("nosniff");
}

async function esperaErroVazio(r: Response, status: number) {
  expect(r.status).toBe(status);
  expect(await r.json()).toEqual({});
  cabecalhosDoContrato(r);
  expect(lerConferencia).not.toHaveBeenCalled();
  expect(registrarFalha).not.toHaveBeenCalled();
}

beforeEach(() => {
  lerConferencia.mockReset().mockResolvedValue(ITENS);
  registrarFalha.mockReset();
});

describe("POST /api/catalogo/conferencia: contrato geral (T026)", () => {
  it("só POST e dynamic são exportados (o Next responde 405 aos demais métodos)", () => {
    expect(Object.keys(rota).sort()).toEqual(["POST", "dynamic"]);
    expect(rota.dynamic).toBe("force-dynamic");
    for (const m of ["GET", "PUT", "PATCH", "DELETE", "HEAD"]) {
      expect((rota as Record<string, unknown>)[m]).toBeUndefined();
    }
  });

  it("200 com { itens } na ordem devolvida pela leitura e cabeçalhos do contrato", async () => {
    const r = await chamar({ codigos: ["0042", "12345"] });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ itens: ITENS });
    cabecalhosDoContrato(r);
    expect(r.headers.get("content-type")).toMatch(/^application\/json/);
    expect(lerConferencia).toHaveBeenCalledTimes(1);
    expect(lerConferencia).toHaveBeenCalledWith(["0042", "12345"]);
    expect(registrarFalha).not.toHaveBeenCalled();
  });

  it("os códigos vão à leitura na ordem pedida", async () => {
    await chamar({ codigos: ["12345", "0007", "0042"] });
    expect(lerConferencia).toHaveBeenCalledWith(["12345", "0007", "0042"]);
  });
});

describe("415: Content-Type (CC§1)", () => {
  it.each([
    ["text/plain"],
    ["application/x-www-form-urlencoded"],
    ["application/x-json"],
    ["application/jsonp"],
    ["multipart/form-data; boundary=x"],
    [""],
  ])("Content-Type %j ⇒ 415 {}", async (ct) => {
    const r = await chamar({ codigos: ["0042"] }, ct ? { "content-type": ct } : {});
    await esperaErroVazio(r, 415);
  });

  it("Content-Type ausente ⇒ 415 {} (corpo mínimo, sem o cabeçalho)", async () => {
    const req = { headers: new Headers(), body: null } as unknown as Request;
    await esperaErroVazio(await rota.POST(req), 415);
  });

  it("415 vem antes do 413: Content-Length enorme com text/plain ⇒ 415", async () => {
    const req = {
      headers: new Headers({ "content-type": "text/plain", "content-length": "5000" }),
      body: null,
    } as unknown as Request;
    await esperaErroVazio(await rota.POST(req), 415);
  });

  it.each(["application/json; charset=utf-8", "APPLICATION/JSON", "Application/Json;charset=UTF-8"])(
    "Content-Type %j é aceito (mídia antes do ';', sem diferenciar maiúsculas)",
    async (ct) => {
      const r = await chamar({ codigos: ["0042"] }, { "content-type": ct });
      expect(r.status).toBe(200);
      expect(lerConferencia).toHaveBeenCalledTimes(1);
    },
  );
});

describe("413: tamanho do corpo (CC§1)", () => {
  it("Content-Length 2000 ⇒ 413 {} SEM tocar no corpo", async () => {
    const tocouNoCorpo = vi.fn();
    const req = {
      headers: new Headers({ ...JSON_CT, "content-length": "2000" }),
      get body() {
        tocouNoCorpo();
        return null;
      },
    } as unknown as Request;
    await esperaErroVazio(await rota.POST(req), 413);
    expect(tocouNoCorpo).not.toHaveBeenCalled();
  });

  it("Content-Length 1025 ⇒ 413; Content-Length 1024 não é barrado pelo cabeçalho", async () => {
    const barrado = {
      headers: new Headers({ ...JSON_CT, "content-length": "1025" }),
      body: null,
    } as unknown as Request;
    await esperaErroVazio(await rota.POST(barrado), 413);

    const corpo = JSON.stringify({ codigos: ["0042"] });
    const passa = new Request(URL_ROTA, {
      method: "POST",
      headers: { ...JSON_CT },
      body: corpo,
    });
    Object.defineProperty(passa, "headers", {
      value: new Headers({ ...JSON_CT, "content-length": "1024" }),
    });
    const r = await rota.POST(passa);
    expect(r.status).toBe(200);
  });

  it("corpo de 2000 bytes SEM Content-Length ⇒ 413 {} e a leitura é cancelada logo depois de 1024 bytes", async () => {
    let puxados = 0;
    const cancel = vi.fn();
    const stream = new ReadableStream<Uint8Array>(
      {
        pull(controller) {
          if (puxados >= 4000) return controller.close();
          puxados += 400;
          controller.enqueue(new Uint8Array(400).fill(0x20));
        },
        cancel,
      },
      { highWaterMark: 0 },
    );
    const req = { headers: new Headers(JSON_CT), body: stream } as unknown as Request;
    await esperaErroVazio(await rota.POST(req), 413);
    expect(cancel).toHaveBeenCalledTimes(1);
    // 3 pedaços de 400 passam de 1024; não pode ter lido o resto (4000).
    expect(puxados).toBeGreaterThan(1024);
    expect(puxados).toBeLessThanOrEqual(1600);
  });

  it("corpo exatamente em 1024 bytes de JSON válido não dá 413", async () => {
    const base = '{"codigos":["0042"]}';
    const corpo = base.slice(0, -1) + " ".repeat(1024 - base.length) + "}";
    expect(new TextEncoder().encode(corpo).length).toBe(1024);
    const r = await chamar(corpo);
    expect(r.status).toBe(200);
  });

  it("corpo de 1025 bytes (stream sem Content-Length) ⇒ 413", async () => {
    const base = '{"codigos":["0042"]}';
    const corpo = base.slice(0, -1) + " ".repeat(1025 - base.length) + "}";
    const r = await chamar(corpo);
    await esperaErroVazio(r, 413);
  });
});

describe("400: corpo inválido (CC§1)", () => {
  const codigos = (n: number) => Array.from({ length: n }, (_, i) => String(1000 + i).padStart(4, "0"));

  it.each([
    ["JSON inválido", "{codigos:"],
    ["corpo vazio", ""],
    ["null", "null"],
    ["array na raiz", '["0042"]'],
    ["texto solto", '"0042"'],
    ["chave extra", { codigos: ["0042"], extra: 1 }],
    ["chave diferente", { codes: ["0042"] }],
    ["objeto vazio", {}],
    ["codigos não é array (string)", { codigos: "0042" }],
    ["codigos não é array (objeto)", { codigos: { 0: "0042" } }],
    ["codigos null", { codigos: null }],
    ["codigos vazio", { codigos: [] }],
    ["16 códigos", { codigos: codigos(16) }],
    ["item número", { codigos: [42] }],
    ["item com 2 dígitos", { codigos: ["42"] }],
    ["item com 3 dígitos", { codigos: ["042"] }],
    ['"0000"', { codigos: ["0000"] }],
    ['"012345" (zero à esquerda com 6 dígitos)', { codigos: ["012345"] }],
    ['"00042"', { codigos: ["00042"] }],
    ['"2147483648" (acima do integer)', { codigos: ["2147483648"] }],
    ['"12345678901" (11 dígitos)', { codigos: ["12345678901"] }],
    ["item com #", { codigos: ["#0042"] }],
    ["item com espaço", { codigos: [" 0042"] }],
    ["item não numérico", { codigos: ["abcd"] }],
    ["repetido", { codigos: ["0042", "0007", "0042"] }],
  ])("%s ⇒ 400 {}", async (_nome, corpo) => {
    await esperaErroVazio(await chamar(corpo), 400);
  });

  it('"2147483647" (10 dígitos, o maior id) é aceito', async () => {
    const r = await chamar({ codigos: ["2147483647"] });
    expect(r.status).toBe(200);
    expect(lerConferencia).toHaveBeenCalledWith(["2147483647"]);
  });

  it.each([
    ["1 código", ["0042"]],
    ["15 códigos", codigos(15)],
    ["4 e 5 dígitos", ["0001", "10000", "99999", "9999"]],
    ["10 dígitos", ["1234567890"]],
  ])("%s é aceito", async (_nome, lista) => {
    const r = await chamar({ codigos: lista });
    expect(r.status).toBe(200);
    expect(lerConferencia).toHaveBeenCalledWith(lista);
  });
});

describe("503: banco indisponível (CC§4)", () => {
  it("BancoIndisponivel ⇒ 503 {} e registrarFalha UMA vez, sem códigos nem mensagem", async () => {
    lerConferencia.mockRejectedValue(new BancoIndisponivel(new Error("senha=segredo")));
    const r = await chamar({ codigos: ["73519", "0042"] });
    expect(r.status).toBe(503);
    expect(await r.json()).toEqual({});
    cabecalhosDoContrato(r);
    expect(registrarFalha).toHaveBeenCalledTimes(1);
    expect(registrarFalha).toHaveBeenCalledWith({
      evento: "catalogo.banco_indisponivel",
      rota: "/api/catalogo/conferencia",
      causa: "banco",
    });
    const registrado = JSON.stringify(registrarFalha.mock.calls);
    expect(registrado).not.toMatch(/73519|0042|segredo/);
  });

});

describe("500: erro que não é do banco (SC-007)", () => {
  it("outra exceção ⇒ 500 {} com no-store e nosniff; registra só o nome da classe", async () => {
    lerConferencia.mockRejectedValue(new TypeError("bug com 73519 e 0042"));
    const r = await chamar({ codigos: ["73519", "0042"] });
    expect(r.status).toBe(500);
    expect(await r.json()).toEqual({});
    cabecalhosDoContrato(r);
    expect(registrarFalha).toHaveBeenCalledTimes(1);
    expect(registrarFalha).toHaveBeenCalledWith({
      evento: "catalogo.erro_inesperado",
      rota: "/api/catalogo/conferencia",
      causa: "inesperado",
      classe: "TypeError",
    });
  });

  it("classe própria do erro sai pelo nome do construtor, nunca pela mensagem", async () => {
    class FalhaDeMontagem extends Error {}
    lerConferencia.mockRejectedValue(new FalhaDeMontagem("73519"));
    await chamar({ codigos: ["73519"] });
    expect(registrarFalha.mock.calls[0][0].classe).toBe("FalhaDeMontagem");
  });

  it("nome de classe fora do formato de identificador ou valor que não é Error ⇒ 'Desconhecida'", async () => {
    const erro = new Error("x");
    Object.defineProperty(erro, "constructor", { value: { name: "falha 73519 0042" } });
    lerConferencia.mockRejectedValueOnce(erro);
    await chamar({ codigos: ["73519", "0042"] });
    lerConferencia.mockRejectedValueOnce("texto com 73519");
    await chamar({ codigos: ["73519"] });
    expect(registrarFalha.mock.calls.map(([f]) => f.classe)).toEqual(["Desconhecida", "Desconhecida"]);
  });

  it("falha na leitura do corpo (stream que erra) também vira 500 {}", async () => {
    const body = new ReadableStream({
      pull(c) {
        c.error(new Error("rede caiu no meio de 73519"));
      },
    });
    const r = await rota.POST(
      new Request(URL_ROTA, { method: "POST", headers: JSON_CT, body, duplex: "half" } as RequestInit),
    );
    expect(r.status).toBe(500);
    expect(await r.json()).toEqual({});
    cabecalhosDoContrato(r);
    expect(JSON.stringify(registrarFalha.mock.calls)).not.toContain("73519");
  });
});
