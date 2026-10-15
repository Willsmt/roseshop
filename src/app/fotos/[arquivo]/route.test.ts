import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Feature 005, T040 (SF4): contracts/publico.md §4 e §7. Rota pública das fotos, ramo FALLBACK.
// Mocks: R2 (chaveDoArquivo com a regra real, servirObjeto falso) e catálogo (lerFoto, registrarFalha).
// Sem banco, sem rede. Ordem esperada: chaveDoArquivo (antes do banco) -> lerFoto -> servirObjeto.
const chaveDoArquivo = vi.hoisted(() => vi.fn());
const servirObjeto = vi.hoisted(() => vi.fn());
const lerFoto = vi.hoisted(() => vi.fn());
const registrarFalha = vi.hoisted(() => vi.fn());

vi.mock("@/lib/r2", () => ({ chaveDoArquivo, servirObjeto }));
vi.mock("@/lib/catalogo", () => ({ lerFoto, registrarFalha }));

import * as rota from "./route";

const ID = "3f2b8c1e-9a4d-4e6f-8b7a-1c2d3e4f5a6b";
const WEBP = `${ID}.webp`;
const JPG = `${ID}.jpg`;
const CHAVE = `fotos/${WEBP}`;
// Literal do contrato §4 (= NAVEGADOR_FOTOS_S de src/lib/catalogo/prazos.ts): se a constante mudar, este teste deve falhar.
const CACHE = "public, max-age=60";

// Cópia da regra de src/lib/r2/chaves.ts (ARQUIVO_VALIDO): função pura, sem importar submódulo de r2.
const ARQUIVO_VALIDO =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(webp|jpg)$/;
const chaveReal = (arquivo: string): string | null =>
  ARQUIVO_VALIDO.test(arquivo) ? `fotos/${arquivo}` : null;

function chamar(arquivo: string, headers: Record<string, string> = {}) {
  return rota.GET(
    new Request(`http://localhost/fotos/${arquivo}`, { headers }),
    { params: Promise.resolve({ arquivo }) },
  );
}

function corpo(texto: string): ReadableStream {
  return new Response(texto).body as ReadableStream;
}

function cabecalhos(r: Response): [string, string][] {
  return [...r.headers.entries()].sort(([a], [b]) => a.localeCompare(b));
}

const MALFORMADAS: [string, string][] = [
  ["../x", "../x"],
  ["x.png", "x.png"],
  ["uuid v7", "0192f2a0-7b3c-7d4e-8f5a-1b2c3d4e5f6a.webp"],
  ["maiúsculas", `${ID.toUpperCase()}.webp`],
];

beforeEach(() => {
  chaveDoArquivo.mockReset().mockImplementation(chaveReal);
  lerFoto.mockReset().mockResolvedValue(CHAVE);
  registrarFalha.mockReset();
  servirObjeto
    .mockReset()
    .mockResolvedValue({ etag: '"abc"', tamanho: 3, corpo: corpo("xyz") });
});

describe("GET /fotos/[arquivo] (T040)", () => {
  describe("US6.1: foto de produto => 200", () => {
    it("webp: corpo, Content-Type, ETag, nosniff, CSP e max-age=60 sem immutable", async () => {
      const r = await chamar(WEBP);
      expect(r.status).toBe(200);
      expect(await r.text()).toBe("xyz");
      expect(r.headers.get("content-type")).toBe("image/webp");
      expect(r.headers.get("cache-control")).toBe(CACHE);
      expect(r.headers.get("cache-control")).not.toContain("immutable");
      expect(r.headers.get("etag")).toBe('"abc"');
      expect(r.headers.get("x-content-type-options")).toBe("nosniff");
      expect(r.headers.get("content-security-policy")).toBe("default-src 'none'");
    });

    it("jpg: Content-Type image/jpeg", async () => {
      lerFoto.mockResolvedValue(`fotos/${JPG}`);
      const r = await chamar(JPG);
      expect(r.status).toBe(200);
      expect(r.headers.get("content-type")).toBe("image/jpeg");
    });

    it("consulta o banco com o arquivo e serve a chave devolvida, repassando If-None-Match", async () => {
      await chamar(WEBP, { "if-none-match": 'W/"abc"' });
      expect(lerFoto).toHaveBeenCalledWith(WEBP);
      expect(servirObjeto).toHaveBeenLastCalledWith(CHAVE, 'W/"abc"');
      await chamar(WEBP);
      expect(servirObjeto).toHaveBeenLastCalledWith(CHAVE, null);
    });

    it("ordem: chaveDoArquivo -> lerFoto -> servirObjeto", async () => {
      await chamar(WEBP);
      const ordem = (m: ReturnType<typeof vi.fn>) => m.mock.invocationCallOrder[0];
      expect(ordem(chaveDoArquivo)).toBeLessThan(ordem(lerFoto));
      expect(ordem(lerFoto)).toBeLessThan(ordem(servirObjeto));
    });
  });

  it("If-None-Match igual => 304 sem corpo, com ETag e cabeçalhos", async () => {
    servirObjeto.mockResolvedValue({ etag: '"abc"', tamanho: 3, corpo: null });
    const r = await chamar(WEBP, { "if-none-match": '"abc"' });
    expect(r.status).toBe(304);
    expect(await r.text()).toBe("");
    expect(r.headers.get("etag")).toBe('"abc"');
    expect(r.headers.get("cache-control")).toBe(CACHE);
    expect(r.headers.get("content-type")).toBe("image/webp");
    expect(r.headers.get("x-content-type-options")).toBe("nosniff");
  });

  describe("US6.2 a 6.4: 404 indistinguível", () => {
    it.each(MALFORMADAS)(
      "malformada (%s) => 404 vazio, sem lerFoto e sem servirObjeto",
      async (_n, arquivo) => {
        const r = await chamar(arquivo);
        expect(r.status).toBe(404);
        expect(await r.text()).toBe("");
        expect(lerFoto).not.toHaveBeenCalled();
        expect(servirObjeto).not.toHaveBeenCalled();
      },
    );

    it("lerFoto null (pendente, removida ou inventado) => 404 vazio, sem servirObjeto", async () => {
      lerFoto.mockResolvedValue(null);
      const r = await chamar(WEBP);
      expect(r.status).toBe(404);
      expect(await r.text()).toBe("");
      expect(lerFoto).toHaveBeenCalledWith(WEBP);
      expect(servirObjeto).not.toHaveBeenCalled();
    });

    it("servirObjeto null => 404 vazio", async () => {
      servirObjeto.mockResolvedValue(null);
      const r = await chamar(WEBP);
      expect(r.status).toBe(404);
      expect(await r.text()).toBe("");
    });

    it("status e todos os cabeçalhos idênticos entre malformada, lerFoto null e servirObjeto null", async () => {
      const respostas: Response[] = [];
      for (const [, arquivo] of MALFORMADAS) respostas.push(await chamar(arquivo));
      lerFoto.mockResolvedValue(null);
      respostas.push(await chamar(WEBP));
      lerFoto.mockResolvedValue(CHAVE);
      servirObjeto.mockResolvedValue(null);
      respostas.push(await chamar(WEBP));

      const [primeira, ...demais] = respostas;
      expect(primeira.status).toBe(404);
      expect(primeira.headers.get("cache-control")).toBe(CACHE);
      expect(primeira.headers.get("x-content-type-options")).toBe("nosniff");
      for (const r of demais) {
        expect(r.status).toBe(primeira.status);
        expect(cabecalhos(r)).toEqual(cabecalhos(primeira));
        expect(await r.text()).toBe("");
      }
    });
  });

  describe("falhas => 503 vazio, no-store, registro sem a chave (FR-024)", () => {
    let consoleErro: ReturnType<typeof vi.spyOn>;
    let consoleLog: ReturnType<typeof vi.spyOn>;
    let consoleWarn: ReturnType<typeof vi.spyOn>;
    beforeEach(() => {
      consoleErro = vi.spyOn(console, "error").mockImplementation(() => {});
      consoleLog = vi.spyOn(console, "log").mockImplementation(() => {});
      consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});
    });
    afterEach(() => {
      consoleErro.mockRestore();
      consoleLog.mockRestore();
      consoleWarn.mockRestore();
    });

    async function esperar503(r: Response) {
      expect(r.status).toBe(503);
      expect(await r.text()).toBe("");
      expect(r.headers.get("cache-control")).toBe("no-store");
    }

    function semVazar() {
      expect(registrarFalha).toHaveBeenCalledTimes(1);
      const texto = JSON.stringify(registrarFalha.mock.calls[0]);
      expect(texto).not.toContain(ID);
      expect(texto).not.toContain(CHAVE);
      expect(texto).not.toContain("segredo-do-erro");
      for (const c of [consoleErro, consoleLog, consoleWarn]) {
        expect(JSON.stringify(c.mock.calls)).not.toContain(ID);
        expect(JSON.stringify(c.mock.calls)).not.toContain("segredo-do-erro");
      }
    }

    it("lerFoto lança => 503, causa banco, sem servirObjeto", async () => {
      lerFoto.mockRejectedValue(new Error(`segredo-do-erro ${CHAVE}`));
      await esperar503(await chamar(WEBP));
      expect(registrarFalha).toHaveBeenCalledWith({
        evento: "catalogo.fotos_falha",
        rota: "/fotos/[arquivo]",
        causa: "banco",
      });
      expect(servirObjeto).not.toHaveBeenCalled();
      semVazar();
    });

    it("servirObjeto lança => 503, causa r2", async () => {
      servirObjeto.mockRejectedValue(new Error(`segredo-do-erro ${CHAVE}`));
      await esperar503(await chamar(WEBP));
      expect(registrarFalha).toHaveBeenCalledWith({
        evento: "catalogo.fotos_falha",
        rota: "/fotos/[arquivo]",
        causa: "r2",
      });
      semVazar();
    });

    it("404 não registra falha", async () => {
      lerFoto.mockResolvedValue(null);
      await chamar(WEBP);
      expect(registrarFalha).not.toHaveBeenCalled();
    });
  });

  it("só exporta GET (nenhum outro método HTTP)", () => {
    for (const m of ["POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]) {
      expect(Object.keys(rota)).not.toContain(m);
    }
    expect(typeof rota.GET).toBe("function");
  });
});
