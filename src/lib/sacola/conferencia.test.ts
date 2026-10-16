import { afterEach, describe, expect, it, vi } from "vitest";
import {
  conferir,
  houveMudanca,
  juntar,
  lerRespostaConferencia,
  linhasDoPedido,
  type ItemConferencia,
} from "./conferencia";
import type { Item, ProdutoConferido, Sacola } from "./sacola";

// Feature 006, SF4, T035 (contracts/sacola.md §5 com o ajuste A1, contracts/conferencia.md §6,
// US3.5, US3.7): a conferência do cliente nunca lança; qualquer coisa fora do caminho feliz vira
// "falha", e quem chama não grava nada.

function produto(extra: Partial<ProdutoConferido> = {}): ProdutoConferido {
  return { nome: "Meia", href: "/p/0042", precoCentavos: 600, aPartirDe: false, capa: null, ...extra };
}

const OK: ItemConferencia = { codigo: "0042", estado: "ok", produto: produto() };
const ESGOTADO: ItemConferencia = {
  codigo: "0007",
  estado: "esgotado",
  produto: produto({ nome: "Guarda-chuva", href: "/p/0007", precoCentavos: null }),
};
const INEXISTENTE: ItemConferencia = { codigo: "12345", estado: "inexistente" };

function resposta(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), { status, headers: { "Content-Type": "application/json" } });
}

function item(codigo: string, extra: Partial<Item> = {}): Item {
  return { codigo, quantidade: 1, precoVisto: 600, aPartirDe: false, ...extra };
}

function sacola(itens: Item[]): Sacola {
  return { versao: 1, alteradaEm: 1_760_000_000_000, itens };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("conferir", () => {
  it("faz POST /api/catalogo/conferencia com JSON e devolve a lista no 200 válido", async () => {
    const fetch = vi.fn(async () => resposta({ itens: [OK, ESGOTADO, INEXISTENTE] }));
    const r = await conferir(["0042", "0007", "12345"], { fetch });
    expect(r).toEqual([OK, ESGOTADO, INEXISTENTE]);
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/catalogo/conferencia");
    expect(init.method).toBe("POST");
    expect(new Headers(init.headers).get("Content-Type")).toBe("application/json");
    expect(JSON.parse(init.body as string)).toEqual({ codigos: ["0042", "0007", "12345"] });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("tempo-limite: fetch que nunca resolve vira falha em 4000 ms e aborta o sinal", async () => {
    vi.useFakeTimers();
    let sinal: AbortSignal | undefined;
    const fetch = vi.fn((_u: string, init: RequestInit) => {
      sinal = init.signal ?? undefined;
      return new Promise<Response>(() => {});
    });
    const promessa = conferir(["0042"], { fetch: fetch as unknown as typeof globalThis.fetch });
    await vi.advanceTimersByTimeAsync(3999);
    expect(sinal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await expect(promessa).resolves.toBe("falha");
    expect(sinal?.aborted).toBe(true);
  });

  it("tempo-limite vale também para a leitura do corpo", async () => {
    vi.useFakeTimers();
    const fetch = vi.fn(
      async () => ({ ok: true, status: 200, json: () => new Promise(() => {}) }) as unknown as Response,
    );
    const promessa = conferir(["0042"], { fetch });
    await vi.advanceTimersByTimeAsync(4000);
    await expect(promessa).resolves.toBe("falha");
  });

  it("erro de rede (fetch rejeita com TypeError) vira falha", async () => {
    const fetch = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    await expect(conferir(["0042"], { fetch })).resolves.toBe("falha");
  });

  it("resposta 400 vira falha", async () => {
    await expect(conferir(["0042"], { fetch: async () => resposta({}, 400) })).resolves.toBe("falha");
  });

  it.each([500, 503])("resposta %i vira falha", async (status) => {
    await expect(conferir(["0042"], { fetch: async () => resposta({}, status) })).resolves.toBe("falha");
  });

  it.each([413, 415])("resposta %i vira falha", async (status) => {
    await expect(conferir(["0042"], { fetch: async () => resposta({}, status) })).resolves.toBe("falha");
  });

  it("lista válida com status 201 vira falha (só 200 vale)", async () => {
    await expect(conferir(["0042"], { fetch: async () => resposta({ itens: [OK] }, 201) })).resolves.toBe("falha");
  });

  it("200 com corpo que não é JSON vira falha", async () => {
    const fetch = async () => new Response("<html>", { status: 200 });
    await expect(conferir(["0042"], { fetch })).resolves.toBe("falha");
  });

  it("200 fora do esquema: estado desconhecido", async () => {
    const fetch = async () => resposta({ itens: [{ codigo: "0042", estado: "sumiu" }] });
    await expect(conferir(["0042"], { fetch })).resolves.toBe("falha");
  });

  it("200 fora do esquema: item sem codigo", async () => {
    const fetch = async () => resposta({ itens: [{ estado: "ok", produto: produto() }] });
    await expect(conferir(["0042"], { fetch })).resolves.toBe("falha");
  });

  it("200 fora do esquema: produto faltando em ok", async () => {
    const fetch = async () => resposta({ itens: [{ codigo: "0042", estado: "ok" }] });
    await expect(conferir(["0042"], { fetch })).resolves.toBe("falha");
  });

  it("200 fora do esquema: código que não foi pedido", async () => {
    const fetch = async () => resposta({ itens: [OK, { ...ESGOTADO, codigo: "0099" }] });
    await expect(conferir(["0042", "0007"], { fetch })).resolves.toBe("falha");
  });

  it("200 fora do esquema: código pedido que não veio", async () => {
    const fetch = async () => resposta({ itens: [OK] });
    await expect(conferir(["0042", "0007"], { fetch })).resolves.toBe("falha");
  });

  it("nunca lança, nem quando o próprio fetch lança de forma síncrona", async () => {
    const fetch = (() => {
      throw new Error("x");
    }) as unknown as typeof globalThis.fetch;
    await expect(conferir(["0042"], { fetch })).resolves.toBe("falha");
  });
});

describe("lerRespostaConferencia", () => {
  it("aceita a resposta do contrato", () => {
    const capa = { url: "/fotos/abc.webp", alt: "Meia" };
    const ok = { ...OK, produto: produto({ capa, aPartirDe: true }) };
    expect(lerRespostaConferencia({ itens: [ok, ESGOTADO, INEXISTENTE] })).toEqual([ok, ESGOTADO, INEXISTENTE]);
  });

  it.each([
    ["nulo", null],
    ["lista solta", [OK]],
    ["sem itens", {}],
    ["chave extra no topo", { itens: [OK], extra: 1 }],
    ["chave extra no produto", { itens: [{ ...OK, produto: { ...produto(), id: 42 } }] }],
    ["produto em inexistente", { itens: [{ ...INEXISTENTE, produto: produto() }] }],
    ["produto faltando em esgotado", { itens: [{ codigo: "0007", estado: "esgotado" }] }],
    ["preço não inteiro", { itens: [{ ...OK, produto: produto({ precoCentavos: 6.5 }) }] }],
    ["código com #", { itens: [{ ...OK, codigo: "#0042" }] }],
    ["capa sem alt", { itens: [{ ...OK, produto: produto({ capa: { url: "/fotos/a" } as never }) }] }],
  ])("recusa %s", (_nome, json) => {
    expect(lerRespostaConferencia(json)).toBeNull();
  });
});

describe("juntar", () => {
  it("junta a sacola com a conferência, sem os inexistentes, mantendo a quantidade", () => {
    const s = sacola([item("0042", { quantidade: 3 }), item("0007", { precoVisto: null }), item("12345")]);
    const r = juntar(s, [OK, ESGOTADO, INEXISTENTE]);
    expect(r.map((i) => [i.codigo, i.estado, i.quantidade])).toEqual([
      ["0042", "ok", 3],
      ["0007", "esgotado", 1],
    ]);
    expect(r[0]!.produto).toEqual(OK.estado === "ok" ? OK.produto : null);
    expect(r[0]!.precoUnitario).toBe("R$ 6,00");
  });

  it("precoAlterado é falso quando valor, aPartirDe e ausência batem", () => {
    const r = juntar(sacola([item("0042")]), [OK]);
    expect(r[0]!.precoAlterado).toBe(false);
  });

  it.each([
    ["valor", item("0042", { precoVisto: 500 })],
    ["aPartirDe", item("0042", { aPartirDe: true })],
    ["preço que sumiu", item("0042", { precoVisto: 600 })],
  ])("precoAlterado quando %s difere do visto", (nome, i) => {
    const conferido: ItemConferencia =
      nome === "preço que sumiu" ? { ...OK, produto: produto({ precoCentavos: null }) } : OK;
    expect(juntar(sacola([i]), [conferido])[0]!.precoAlterado).toBe(true);
  });

  it("precoAlterado quando o item não tinha preço e passou a ter", () => {
    const r = juntar(sacola([item("0042", { precoVisto: null })]), [OK]);
    expect(r[0]!.precoAlterado).toBe(true);
  });

  it("ignora códigos da sacola que a conferência não cobriu", () => {
    expect(juntar(sacola([item("0042"), item("0099")]), [OK]).map((i) => i.codigo)).toEqual(["0042"]);
  });
});

describe("houveMudanca (US3.5)", () => {
  it("falso quando nada mudou", () => {
    expect(houveMudanca(sacola([item("0042")]), [OK])).toBe(false);
  });

  it("verdadeiro com produto inexistente", () => {
    expect(houveMudanca(sacola([item("0042"), item("12345")]), [OK, INEXISTENTE])).toBe(true);
  });

  it("verdadeiro com esgotado novo", () => {
    const s = sacola([item("0042"), item("0007", { precoVisto: null })]);
    expect(houveMudanca(s, [OK, ESGOTADO])).toBe(true);
    expect(houveMudanca(s, [OK, ESGOTADO], [OK, { ...ESGOTADO, estado: "ok" } as ItemConferencia])).toBe(true);
  });

  it("falso com esgotado que já estava esgotado na tela", () => {
    const s = sacola([item("0042"), item("0007", { precoVisto: null })]);
    expect(houveMudanca(s, [OK, ESGOTADO], [OK, ESGOTADO])).toBe(false);
  });

  it("verdadeiro com esgotado que voltou (entraria na mensagem sem a cliente ver)", () => {
    const s = sacola([item("0042"), item("0007", { precoVisto: null })]);
    const voltou: ItemConferencia = { ...ESGOTADO, estado: "ok" } as ItemConferencia;
    expect(houveMudanca(s, [OK, voltou], [OK, ESGOTADO])).toBe(true);
  });

  it("verdadeiro com preço alterado", () => {
    expect(houveMudanca(sacola([item("0042", { precoVisto: 500 })]), [OK])).toBe(true);
  });
});

// Feature 006, SF6 (US3.1, SC-003): só os disponíveis viram linha do pedido, com o preço atual.
describe("linhasDoPedido", () => {
  it("deixa o esgotado de fora e usa nome e preço da conferência", () => {
    const s = sacola([item("0042", { quantidade: 2, precoVisto: 500 }), item("0007")]);
    expect(linhasDoPedido(juntar(s, [OK, ESGOTADO]))).toEqual([
      { quantidade: 2, nome: "Meia", codigo: "0042", precoCentavos: 600, aPartirDe: false },
    ]);
  });

  it("sem disponíveis ⇒ nenhuma linha", () => {
    expect(linhasDoPedido(juntar(sacola([item("0007")]), [ESGOTADO]))).toEqual([]);
  });
});
