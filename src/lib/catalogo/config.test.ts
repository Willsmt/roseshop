import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from "vitest";

// T033: configCatalogo valida WHATSAPP_NUMBER (E.164) e SITE_URL, registra a falha sem o
// valor e, no ramo FALLBACK, só uma vez por isolate (research D10).

const NUMERO = "+5511999999999";
const SITE = "https://roseshop-dev.willsmt.workers.dev";

async function carregar() {
  vi.resetModules();
  return (await import("./config")).configCatalogo;
}

function env(whatsapp: string | undefined, siteUrl: string | undefined) {
  if (whatsapp === undefined) vi.stubEnv("WHATSAPP_NUMBER", undefined as unknown as string);
  else vi.stubEnv("WHATSAPP_NUMBER", whatsapp);
  if (siteUrl === undefined) vi.stubEnv("SITE_URL", undefined as unknown as string);
  else vi.stubEnv("SITE_URL", siteUrl);
}

let erro: MockInstance<typeof console.error>;

beforeEach(() => {
  erro = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

function eventos(): Record<string, unknown>[] {
  return erro.mock.calls.map((c) => JSON.parse(c[0] as string));
}

describe("WHATSAPP_NUMBER", () => {
  it("válido devolve a string e não registra nada", async () => {
    env(NUMERO, SITE);
    const configCatalogo = await carregar();
    expect(configCatalogo()).toEqual({ whatsapp: NUMERO, siteUrl: SITE });
    expect(erro).not.toHaveBeenCalled();
  });

  it.each([
    ["ausente", undefined],
    ["vazio", ""],
    ["sem +", "5511999999999"],
    ["com espaço", "+55 11999999999"],
    ["curto", "+551199"],
    ["longo demais", "+1234567890123456"],
    ["começa com 0", "+0511999999999"],
  ])("%s ⇒ whatsapp null e um console.error sem o valor", async (_nome, valor) => {
    env(valor, SITE);
    const configCatalogo = await carregar();
    expect(configCatalogo().whatsapp).toBeNull();
    expect(erro).toHaveBeenCalledTimes(1);
    expect(eventos()[0]).toMatchObject({ evento: "catalogo.whatsapp_invalido", causa: "config" });
    if (valor) expect(erro.mock.calls[0][0]).not.toContain(valor);
  });
});

describe("SITE_URL", () => {
  it.each([
    "https://roseshop.willsmt.workers.dev",
    "http://localhost:8787",
    "http://127.0.0.1:8787",
  ])("%s é válida", async (url) => {
    env(NUMERO, url);
    const configCatalogo = await carregar();
    expect(configCatalogo().siteUrl).toBe(url);
    expect(erro).not.toHaveBeenCalled();
  });

  it.each([
    ["ausente", undefined],
    ["vazia", ""],
    ["barra final", "https://roseshop.willsmt.workers.dev/"],
    ["http fora do local", "http://roseshop.willsmt.workers.dev"],
    ["sem protocolo", "roseshop.willsmt.workers.dev"],
    ["outro protocolo", "ftp://localhost"],
  ])("%s ⇒ siteUrl null + catalogo.site_url_invalida", async (_nome, valor) => {
    env(NUMERO, valor);
    const configCatalogo = await carregar();
    expect(configCatalogo()).toEqual({ whatsapp: NUMERO, siteUrl: null });
    expect(erro).toHaveBeenCalledTimes(1);
    expect(eventos()[0]).toMatchObject({ evento: "catalogo.site_url_invalida", causa: "config" });
    if (valor) expect(erro.mock.calls[0][0]).not.toContain(valor);
  });
});

describe("[FALLBACK] registro uma vez por isolate", () => {
  it("chamadas repetidas registram cada falha uma única vez", async () => {
    env("invalido", "invalida");
    const configCatalogo = await carregar();
    for (let i = 0; i < 5; i++) {
      expect(configCatalogo()).toEqual({ whatsapp: null, siteUrl: null });
    }
    expect(eventos().map((e) => e.evento).sort()).toEqual([
      "catalogo.site_url_invalida",
      "catalogo.whatsapp_invalido",
    ]);
  });
});
