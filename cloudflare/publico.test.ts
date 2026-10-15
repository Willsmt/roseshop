import { afterEach, describe, expect, it, vi } from "vitest";

import {
  NAVEGADOR_FOTOS_S,
  NAVEGADOR_LISTA_S,
  NAVEGADOR_PAGINA_S,
} from "../src/lib/catalogo/prazos";
import { ajustarResposta, criarFetch, prepararPedido } from "./publico";

// T051/T052 (ramo FALLBACK, T008): canonização do detalhe, cabeçalhos, 500 → 503 e o que o worker
// NÃO toca. Funções puras e handler falso: sem workerd.

const BASE = "https://roseshop.test";
const env = {} as unknown as CloudflareEnv;

function ctxFalso() {
  const base = {
    waitUntil: vi.fn(),
    passThroughOnException: vi.fn(),
  };
  return base as unknown as ExecutionContext;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("prepararPedido (T051)", () => {
  it.each(["/p/abc", "/p/-1", "/p/0", "/p/00", "/p/2147483648", "/p/1234567890", "/p/%34%32"])(
    "%s ⇒ reescrever para /p/0",
    (caminho) => {
      expect(prepararPedido(new URL(BASE + caminho), "GET")).toEqual({
        tipo: "reescrever",
        caminho: "/p/0",
      });
    },
  );

  it("/p/999999999 (9 dígitos) segue; /p/2147483647 (10 dígitos) é reescrito", () => {
    expect(prepararPedido(new URL(BASE + "/p/999999999"), "GET")).toEqual({ tipo: "seguir" });
    expect(prepararPedido(new URL(BASE + "/p/2147483647"), "GET")).toEqual({
      tipo: "reescrever",
      caminho: "/p/0",
    });
  });

  it("/p/42 ⇒ 308 para /p/0042", () => {
    expect(prepararPedido(new URL(BASE + "/p/42"), "GET")).toEqual({
      tipo: "redirecionar",
      destino: "/p/0042",
    });
  });

  it("/p/00042?x=1 ⇒ 308 para /p/0042?x=1 (preserva a query)", () => {
    expect(prepararPedido(new URL(BASE + "/p/00042?x=1"), "GET")).toEqual({
      tipo: "redirecionar",
      destino: "/p/0042?x=1",
    });
  });

  it.each(["/p/0042", "/p/10000", "/p/0001"])("%s ⇒ seguir", (caminho) => {
    expect(prepararPedido(new URL(BASE + caminho), "GET")).toEqual({ tipo: "seguir" });
  });

  it.each(["/p/1/2", "/painel/x", "/", "/p", "/p/", "/fotos/x.webp", "/api/health"])(
    "%s ⇒ seguir",
    (caminho) => {
      expect(prepararPedido(new URL(BASE + caminho), "GET")).toEqual({ tipo: "seguir" });
    },
  );

  it("POST em /p/42 (e em /p/abc) ⇒ seguir", () => {
    expect(prepararPedido(new URL(BASE + "/p/42"), "POST")).toEqual({ tipo: "seguir" });
    expect(prepararPedido(new URL(BASE + "/p/abc"), "POST")).toEqual({ tipo: "seguir" });
  });

  it("HEAD segue as regras do GET", () => {
    expect(prepararPedido(new URL(BASE + "/p/42"), "HEAD")).toEqual({
      tipo: "redirecionar",
      destino: "/p/0042",
    });
  });
});

describe("ajustarResposta (T052)", () => {
  const cc = (r: Response) => r.headers.get("cache-control");

  it.each([
    ["/", 200],
    ["/", 404],
    ["/p/0042", 200],
    ["/p/0042", 404],
    ["/p/0042", 308],
  ])("%s com %i ⇒ public, max-age do prazos.ts + noindex", (caminho, status) => {
    const r = ajustarResposta(caminho, new Response(null, { status }), null);
    expect(cc(r)).toBe(`public, max-age=${NAVEGADOR_PAGINA_S}`);
    expect(r.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    expect(r.status).toBe(status);
  });

  it("preserva corpo, status e demais cabeçalhos da resposta do handler", async () => {
    const original = new Response("<html>ok</html>", {
      status: 200,
      headers: { "content-type": "text/html", "cache-control": "s-maxage=1", etag: '"a"' },
    });
    const r = ajustarResposta("/", original, null);
    expect(await r.text()).toBe("<html>ok</html>");
    expect(r.headers.get("content-type")).toBe("text/html");
    expect(r.headers.get("etag")).toBe('"a"');
    expect(cc(r)).toBe(`public, max-age=${NAVEGADOR_PAGINA_S}`);
  });

  it.each(["/fotos/a.webp", "/api/catalogo/produtos"])(
    "%s: só acrescenta X-Robots-Tag; Cache-Control do handler fica",
    (caminho) => {
      const original = new Response("x", {
        status: 200,
        headers: { "cache-control": "public, max-age=7" },
      });
      const r = ajustarResposta(caminho, original, null);
      expect(r.headers.get("x-robots-tag")).toBe("noindex, nofollow");
      expect(cc(r)).toBe("public, max-age=7");
    },
  );

  it("o max-age do navegador de fotos e da lista não é reescrito pelo worker", () => {
    const f = ajustarResposta(
      "/fotos/a.webp",
      new Response(null, {
        status: 200,
        headers: { "cache-control": `public, max-age=${NAVEGADOR_FOTOS_S}` },
      }),
      null,
    );
    const l = ajustarResposta(
      "/api/catalogo/produtos",
      new Response("{}", {
        status: 200,
        headers: { "cache-control": `public, max-age=${NAVEGADOR_LISTA_S}` },
      }),
      null,
    );
    expect(cc(f)).toBe(`public, max-age=${NAVEGADOR_FOTOS_S}`);
    expect(cc(l)).toBe(`public, max-age=${NAVEGADOR_LISTA_S}`);
  });

  it("304 sem corpo de /fotos/* passa (sem lançar) com noindex", () => {
    const r = ajustarResposta("/fotos/a.webp", new Response(null, { status: 304 }), null);
    expect(r.status).toBe(304);
    expect(r.headers.get("x-robots-tag")).toBe("noindex, nofollow");
  });

  it("o 503 não herda o statusText do 500", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const r = ajustarResposta(
      "/",
      new Response(null, { status: 500, statusText: "Internal Server Error" }),
      null,
    );
    expect(r.status).toBe(503);
    expect(r.statusText).not.toBe("Internal Server Error");
    // Igual ao das rotas de fotos e da lista (sem reason phrase vazia na linha de status).
    expect(r.statusText).toBe("Service Unavailable");
  });

  it("500 em /fotos/* e /api/catalogo/* passa sem virar 503", () => {
    for (const c of ["/fotos/a.webp", "/api/catalogo/produtos"]) {
      expect(ajustarResposta(c, new Response(null, { status: 500 }), null).status).toBe(500);
    }
  });

  it.each(["/painel", "/painel/produtos", "/api/auth/session", "/api/interno/limpeza", "/api/health", "/_next/static/a.js", "/robots.txt"])(
    "%s: devolve a MESMA resposta, sem nenhuma mudança (inclusive 500)",
    (caminho) => {
      for (const status of [200, 308, 404, 500]) {
        const original = new Response("corpo", {
          status,
          headers: { "cache-control": "private, no-store", "set-cookie": "a=b" },
        });
        const r = ajustarResposta(caminho, original, "banco");
        expect(r).toBe(original);
      }
    },
  );

  describe("500 público (FALLBACK: 503 direto)", () => {
    it("causa banco ⇒ 503 no-store, Retry-After 30, corpo do handler e log banco_indisponivel", async () => {
      const erro = vi.spyOn(console, "error").mockImplementation(() => {});
      const r = ajustarResposta(
        "/p/0042",
        new Response("pagina de erro", { status: 500, headers: { "content-type": "text/html" } }),
        "banco",
      );
      expect(r.status).toBe(503);
      expect(cc(r)).toBe("no-store");
      expect(r.headers.get("retry-after")).toBe("30");
      expect(r.headers.get("x-robots-tag")).toBe("noindex, nofollow");
      expect(r.headers.get("content-type")).toBe("text/html");
      expect(await r.text()).toBe("pagina de erro");
      expect(erro).toHaveBeenCalledTimes(1);
      expect(JSON.parse(erro.mock.calls[0][0] as string)).toEqual({
        evento: "catalogo.banco_indisponivel",
        rota: "/p/[codigo]",
        causa: "banco",
        resultado: "503",
      });
    });

    it.each([null, "inesperado", "r2", "config"] as const)(
      "causa %s ⇒ erro_inesperado com causa inesperado",
      (causa) => {
        const erro = vi.spyOn(console, "error").mockImplementation(() => {});
        const r = ajustarResposta("/", new Response(null, { status: 500 }), causa);
        expect(r.status).toBe(503);
        expect(JSON.parse(erro.mock.calls[0][0] as string)).toEqual({
          evento: "catalogo.erro_inesperado",
          rota: "/",
          causa: "inesperado",
          resultado: "503",
        });
      },
    );

    it("o log traz rota normalizada, sem query nem código", () => {
      const erro = vi.spyOn(console, "error").mockImplementation(() => {});
      ajustarResposta("/p/0042", new Response(null, { status: 500 }), "banco");
      ajustarResposta("/p/xyz", new Response(null, { status: 500 }), "banco");
      for (const [linha] of erro.mock.calls) {
        const texto = linha as string;
        expect(texto).not.toMatch(/0042|xyz|\?/);
        expect(JSON.parse(texto).rota).toBe("/p/[codigo]");
      }
    });

    it("outros status (302, 400, 503 do handler) passam sem virar 503 e sem cache novo", () => {
      const r = ajustarResposta("/", new Response(null, { status: 400 }), null);
      expect(r.status).toBe(400);
      expect(cc(r)).toBeNull();
    });
  });
});

describe("criarFetch (T052: fluxo completo com handler falso)", () => {
  function montar(resposta: () => Response | Promise<Response>) {
    const handler = vi.fn<
      (req: Request, env: CloudflareEnv, ctx: ExecutionContext) => Promise<Response>
    >(async () => resposta());
    return { handler, fetch: criarFetch(handler) };
  }

  it("308 canônico sem chamar o handler; Location absoluta; max-age e noindex", async () => {
    const { handler, fetch } = montar(() => new Response("x"));
    const r = await fetch(new Request(`${BASE}/p/42?x=1`), env, ctxFalso());
    expect(handler).not.toHaveBeenCalled();
    expect(r.status).toBe(308);
    expect(r.headers.get("location")).toBe(`${BASE}/p/0042?x=1`);
    expect(r.headers.get("cache-control")).toBe(`public, max-age=${NAVEGADOR_PAGINA_S}`);
    expect(r.headers.get("x-robots-tag")).toBe("noindex, nofollow");
  });

  it("formato inválido: o handler recebe /p/0 sem query, mesmo método, e a resposta ganha max-age", async () => {
    const { handler, fetch } = montar(() => new Response("nao encontrado", { status: 404 }));
    const r = await fetch(new Request(`${BASE}/p/abc?lixo=1`, { method: "HEAD" }), env, ctxFalso());
    expect(handler).toHaveBeenCalledTimes(1);
    const enviado = handler.mock.calls[0][0];
    expect(new URL(enviado.url).pathname).toBe("/p/0");
    expect(new URL(enviado.url).search).toBe("");
    expect(enviado.method).toBe("HEAD");
    expect(r.status).toBe(404);
    expect(r.headers.get("cache-control")).toBe(`public, max-age=${NAVEGADOR_PAGINA_S}`);
  });

  it("caminho canônico segue com o pedido original, uma vez, com o mesmo env", async () => {
    const { handler, fetch } = montar(() => new Response("ok"));
    const pedido = new Request(`${BASE}/p/0042`);
    await fetch(pedido, env, ctxFalso());
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0]).toBe(pedido);
    expect(handler.mock.calls[0][1]).toBe(env);
  });

  it("cada pedido público recebe um ctx novo com roseshop.causa = null e métodos presos ao original", async () => {
    const original = ctxFalso();
    const { handler, fetch } = montar(() => new Response("ok"));
    await fetch(new Request(`${BASE}/`), env, original);
    await fetch(new Request(`${BASE}/`), env, original);
    const [c1, c2] = handler.mock.calls.map((c) => c[2]) as unknown as {
      roseshop: { causa: string | null };
      waitUntil: (p: Promise<unknown>) => void;
    }[];
    expect(c1).not.toBe(original);
    expect(c1).not.toBe(c2);
    expect(c1.roseshop).toEqual({ causa: null });
    expect(c1.roseshop).not.toBe(c2.roseshop);
    const p = Promise.resolve();
    c1.waitUntil(p);
    expect(original.waitUntil).toHaveBeenCalledWith(p);
  });

  it("a causa marcada pelo handler no ctx vira o evento do 500", async () => {
    const erro = vi.spyOn(console, "error").mockImplementation(() => {});
    const handler = vi.fn(async (_r: Request, _e: CloudflareEnv, ctx: ExecutionContext) => {
      (ctx as unknown as { roseshop: { causa: string } }).roseshop.causa = "banco";
      return new Response("falha", { status: 500 });
    });
    const r = await criarFetch(handler)(new Request(`${BASE}/p/0042`), env, ctxFalso());
    expect(r.status).toBe(503);
    expect(JSON.parse(erro.mock.calls[0][0] as string).evento).toBe("catalogo.banco_indisponivel");
  });

  it("exceção do handler numa página pública vira 503 (log inesperado); fora das públicas, relança", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { fetch } = montar(() => {
      throw new Error("segredo na mensagem");
    });
    const r = await fetch(new Request(`${BASE}/`), env, ctxFalso());
    expect(r.status).toBe(503);
    await expect(fetch(new Request(`${BASE}/painel`), env, ctxFalso())).rejects.toThrow();
  });

  it("painel, auth, interno e health: o handler recebe o MESMO pedido e o MESMO ctx; a resposta volta intacta", async () => {
    for (const caminho of ["/painel/produtos", "/api/auth/session", "/api/interno/limpeza", "/api/health"]) {
      const resposta = new Response("x", { status: 500, headers: { "cache-control": "private, no-store" } });
      const { handler, fetch } = montar(() => resposta);
      const pedido = new Request(`${BASE}${caminho}`, { method: caminho.includes("interno") ? "POST" : "GET" });
      const ctx = ctxFalso();
      const r = await fetch(pedido, env, ctx);
      expect(r).toBe(resposta);
      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler.mock.calls[0][0]).toBe(pedido);
      expect(handler.mock.calls[0][2]).toBe(ctx);
    }
  });

  it("/p/abc no painel não existe: /painel/p/abc não é reescrito", async () => {
    const { handler, fetch } = montar(() => new Response("x"));
    const pedido = new Request(`${BASE}/painel/p/abc`);
    await fetch(pedido, env, ctxFalso());
    expect(handler.mock.calls[0][0]).toBe(pedido);
  });

  it("POST em página pública: sem reescrita, sem max-age, sem 503", async () => {
    const { handler, fetch } = montar(() => new Response("x", { status: 500 }));
    const pedido = new Request(`${BASE}/p/abc`, { method: "POST" });
    const r = await fetch(pedido, env, ctxFalso());
    expect(handler.mock.calls[0][0]).toBe(pedido);
    expect(r.status).toBe(500);
    expect(r.headers.get("cache-control")).toBeNull();
  });

  it("não repete o pedido no 500 (FALLBACK) nem lê x-isr", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { handler, fetch } = montar(() => new Response("x", { status: 500 }));
    const r = await fetch(
      new Request(`${BASE}/p/0042`, { headers: { "x-isr": "1", "x-prerender-revalidate": "t" } }),
      env,
      ctxFalso(),
    );
    expect(handler).toHaveBeenCalledTimes(1);
    expect(r.status).toBe(503);
  });
});
