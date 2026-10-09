import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Feature 004, T064 (SF6): contracts/fotos.md §5 e TL-19. Rota de exibição das fotos.
// Mocks: sessão, R2 (chaveDoArquivo real, servirObjeto falso) e exibição (SQL). Sem banco, sem rede.
const getAdminSession = vi.hoisted(() => vi.fn());
const servirObjeto = vi.hoisted(() => vi.fn());
const fotoExibivel = vi.hoisted(() => vi.fn());
const chaveDoArquivo = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth", () => ({ getAdminSession }));
vi.mock("@/lib/r2", () => ({ chaveDoArquivo, servirObjeto }));
vi.mock("@/lib/fotos/exibicao", () => ({ fotoExibivel }));

import * as rota from "./route";

const ID = "3f2b8c1e-9a4d-4e6f-8b7a-1c2d3e4f5a6b";
const WEBP = `${ID}.webp`;
const JPG = `${ID}.jpg`;

// Cópia da regra de src/lib/r2/chaves.ts (ARQUIVO_VALIDO): função pura, sem importar submódulo de r2.
const ARQUIVO_VALIDO =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(webp|jpg)$/;
const chaveReal = (arquivo: string): string | null =>
  ARQUIVO_VALIDO.test(arquivo) ? `fotos/${arquivo}` : null;

function chamar(arquivo: string, headers: Record<string, string> = {}) {
  return rota.GET(
    new Request(`http://localhost/painel/fotos/${arquivo}`, { headers }),
    {
      params: Promise.resolve({ arquivo }),
    },
  );
}

function corpo(texto: string): ReadableStream {
  return new Response(texto).body as ReadableStream;
}

function nadaTocado() {
  expect(chaveDoArquivo).not.toHaveBeenCalled();
  expect(fotoExibivel).not.toHaveBeenCalled();
  expect(servirObjeto).not.toHaveBeenCalled();
}

beforeEach(() => {
  getAdminSession
    .mockReset()
    .mockResolvedValue({ email: "ana@teste.local", name: "Ana" });
  chaveDoArquivo.mockReset().mockImplementation(chaveReal);
  fotoExibivel.mockReset().mockResolvedValue(true);
  servirObjeto
    .mockReset()
    .mockResolvedValue({ etag: '"abc"', tamanho: 3, corpo: corpo("xyz") });
});

describe("GET /painel/fotos/[arquivo] (T064)", () => {
  it("sem sessão => 404 e nada de r2/db é tocado", async () => {
    getAdminSession.mockResolvedValue(null);
    const r = await chamar(WEBP);
    expect(r.status).toBe(404);
    expect(r.headers.get("cache-control")).toBe("private, no-store");
    expect(r.headers.get("x-content-type-options")).toBe("nosniff");
    nadaTocado();
  });

  it.each([
    ["maiúsculas", `${ID.toUpperCase()}.webp`],
    [".jpeg", `${ID}.jpeg`],
    [".png", `${ID}.png`],
    ["../", `../${ID}.webp`],
    ["uuid não-v4", "3f2b8c1e-9a4d-1e6f-8b7a-1c2d3e4f5a6b.webp"],
    ["variante inválida", "3f2b8c1e-9a4d-4e6f-0b7a-1c2d3e4f5a6b.webp"],
    ["vazio", ""],
    ["sem extensão", ID],
  ])(
    "arquivo fora da regex (%s) => 404 sem fotoExibivel e sem servirObjeto",
    async (_n, arquivo) => {
      const r = await chamar(arquivo);
      expect(r.status).toBe(404);
      expect(fotoExibivel).not.toHaveBeenCalled();
      expect(servirObjeto).not.toHaveBeenCalled();
    },
  );

  it("chave não exibível => 404 sem servirObjeto, consultando a chave exata", async () => {
    fotoExibivel.mockResolvedValue(false);
    const r = await chamar(WEBP);
    expect(r.status).toBe(404);
    expect(fotoExibivel).toHaveBeenCalledWith(`fotos/${WEBP}`);
    expect(servirObjeto).not.toHaveBeenCalled();
  });

  it("servirObjeto null => 404", async () => {
    servirObjeto.mockResolvedValue(null);
    const r = await chamar(WEBP);
    expect(r.status).toBe(404);
    expect(r.headers.get("cache-control")).toBe("private, no-store");
  });

  it("TL-19: corpo null (If-None-Match bateu) => 304 sem corpo, com ETag e headers", async () => {
    servirObjeto.mockResolvedValue({ etag: '"abc"', tamanho: 3, corpo: null });
    const r = await chamar(WEBP, { "if-none-match": '"abc"' });
    expect(r.status).toBe(304);
    expect(await r.text()).toBe("");
    expect(r.headers.get("etag")).toBe('"abc"');
    expect(r.headers.get("cache-control")).toBe(
      "private, max-age=31536000, immutable",
    );
    expect(r.headers.get("content-type")).toBe("image/webp");
    expect(r.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("repassa o if-none-match do request ao servirObjeto (null quando ausente)", async () => {
    await chamar(WEBP, { "if-none-match": 'W/"abc"' });
    expect(servirObjeto).toHaveBeenLastCalledWith(`fotos/${WEBP}`, 'W/"abc"');
    await chamar(WEBP);
    expect(servirObjeto).toHaveBeenLastCalledWith(`fotos/${WEBP}`, null);
  });

  it("com corpo => 200, corpo correto e headers de segurança/cache (webp)", async () => {
    const r = await chamar(WEBP);
    expect(r.status).toBe(200);
    expect(await r.text()).toBe("xyz");
    expect(r.headers.get("content-type")).toBe("image/webp");
    expect(r.headers.get("cache-control")).toBe(
      "private, max-age=31536000, immutable",
    );
    expect(r.headers.get("etag")).toBe('"abc"');
    expect(r.headers.get("x-content-type-options")).toBe("nosniff");
    expect(r.headers.get("content-security-policy")).toBe("default-src 'none'");
    expect(servirObjeto).toHaveBeenCalledWith(`fotos/${WEBP}`, null);
  });

  it("Content-Type image/jpeg para .jpg", async () => {
    const r = await chamar(JPG);
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("image/jpeg");
  });

  describe("falha inesperada => 500 sem vazar a chave", () => {
    let erro: ReturnType<typeof vi.spyOn>;
    beforeEach(() => {
      erro = vi.spyOn(console, "error").mockImplementation(() => {});
    });
    afterEach(() => erro.mockRestore());

    const vaza = (v: unknown, proibidos: string[], vistos = new Set<unknown>()): string[] => {
      if (typeof v === "string") return proibidos.filter((p) => v.includes(p));
      if (v instanceof Uint8Array || v instanceof ArrayBuffer || v instanceof ReadableStream)
        return ["binario"];
      if (v instanceof Error)
        return [
          ...vaza(v.message, proibidos, vistos),
          ...vaza(v.stack ?? "", proibidos, vistos),
          ...vaza(v.cause, proibidos, vistos),
        ];
      if (v && typeof v === "object") {
        if (vistos.has(v)) return [];
        vistos.add(v);
        return [
          ...Object.keys(v).flatMap((k) => vaza(k, proibidos, vistos)),
          ...Object.values(v).flatMap((x) => vaza(x, proibidos, vistos)),
        ];
      }
      return [];
    };

    async function esperar500(r: Response) {
      expect(r.status).toBe(500);
      expect(await r.text()).toBe("");
      expect(r.headers.get("cache-control")).toBe("private, no-store");
      expect(r.headers.get("x-content-type-options")).toBe("nosniff");
    }

    function logSemVazar() {
      expect(erro).toHaveBeenCalledTimes(1);
      const args = erro.mock.calls[0] as unknown[];
      expect(args[0]).toBe("fotos.exibicao.falha");
      expect(args.flatMap((a) => vaza(a, [WEBP, `fotos/${WEBP}`, ID]))).toEqual([]);
    }

    it("fotoExibivel rejeita => 500, headers, um console.error sem a chave", async () => {
      fotoExibivel.mockRejectedValue(new Error(`falhou fotos/${WEBP}`));
      await esperar500(await chamar(WEBP));
      expect(servirObjeto).not.toHaveBeenCalled();
      logSemVazar();
    });

    it("servirObjeto rejeita => 500, headers, um console.error sem a chave", async () => {
      servirObjeto.mockRejectedValue(new Error(`falhou fotos/${WEBP}`));
      await esperar500(await chamar(WEBP));
      logSemVazar();
    });

    it("getAdminSession rejeita => 500 com os mesmos headers e log sem a chave", async () => {
      getAdminSession.mockRejectedValue(new Error(`falhou fotos/${WEBP}`));
      await esperar500(await chamar(WEBP));
      nadaTocado();
      logSemVazar();
    });

    it("sem sessão continua 404 (não 500) e sem console.error", async () => {
      getAdminSession.mockResolvedValue(null);
      const r = await chamar(WEBP);
      expect(r.status).toBe(404);
      expect(erro).not.toHaveBeenCalled();
    });
  });

  it("só exporta GET (nenhum outro método HTTP)", () => {
    const metodos = ["POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];
    for (const m of metodos) expect(Object.keys(rota)).not.toContain(m);
    expect(typeof rota.GET).toBe("function");
  });
});
