import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { assinarEnvio } from "./assinatura";

// T031: assinarEnvio gera URL pré-assinada SigV4 (PUT) com content-length,
// content-type e if-none-match assinados, validade de 300 s (contracts/fotos.md §7, ADR-009).

const ENDPOINT = "http://localhost:8787/cdn-cgi/local/r2/s3/roseshop-local";
const ACCESS_KEY_ID = "roseshop-local";
const SECRET = "roseshop-local-nao-secreto";
const CHAVE = "fotos/3f1c2a4e-9b7d-4c1e-8a2b-1d2e3f4a5b6c.webp";

beforeEach(() => {
  vi.stubEnv("R2_S3_ENDPOINT", ENDPOINT);
  vi.stubEnv("R2_ACCESS_KEY_ID", ACCESS_KEY_ID);
  vi.stubEnv("R2_SECRET_ACCESS_KEY", SECRET);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

async function assinar(
  extra: Partial<{ chave: string; formato: "jpeg" | "webp"; tamanho: number }> = {},
) {
  return assinarEnvio({ chave: CHAVE, formato: "webp", tamanho: 1234, ...extra });
}

describe("assinarEnvio", () => {
  it("url = endpoint + / + chave", async () => {
    const { url } = await assinar();
    const u = new URL(url);
    const e = new URL(ENDPOINT);
    expect(u.origin).toBe(e.origin);
    expect(u.pathname).toBe(`${e.pathname}/${CHAVE}`);
  });

  it("X-Amz-SignedHeaders é exatamente content-length;content-type;host;if-none-match", async () => {
    const { url } = await assinar();
    expect(new URL(url).searchParams.get("X-Amz-SignedHeaders")).toBe(
      "content-length;content-type;host;if-none-match",
    );
  });

  it("X-Amz-Expires é 300", async () => {
    const { url } = await assinar();
    expect(new URL(url).searchParams.get("X-Amz-Expires")).toBe("300");
  });

  it("algoritmo AWS4-HMAC-SHA256 e assinatura de 64 hex", async () => {
    const p = new URL((await assinar()).url).searchParams;
    expect(p.get("X-Amz-Algorithm")).toBe("AWS4-HMAC-SHA256");
    expect(p.get("X-Amz-Signature")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("X-Amz-Credential começa com o Access Key ID e usa /auto/s3/aws4_request", async () => {
    const credencial = new URL((await assinar()).url).searchParams.get("X-Amz-Credential");
    expect(credencial).not.toBeNull();
    expect(credencial!.startsWith(`${ACCESS_KEY_ID}/`)).toBe(true);
    expect(credencial).toContain("/auto/s3/aws4_request");
  });

  it("não vaza o secret na URL nem usa security token", async () => {
    const { url } = await assinar();
    expect(url).not.toContain(SECRET);
    expect(decodeURIComponent(url)).not.toContain(SECRET);
    expect(new URL(url).searchParams.has("X-Amz-Security-Token")).toBe(false);
  });

  it.each([
    ["webp", "image/webp"],
    ["jpeg", "image/jpeg"],
  ] as const)("headers para %s: só content-type e if-none-match", async (formato, tipo) => {
    const { headers } = await assinar({ formato });
    expect(Object.keys(headers).sort()).toEqual(["content-type", "if-none-match"]);
    expect(headers["content-type"]).toBe(tipo);
    expect(headers["if-none-match"]).toBe("*");
  });

  describe("com relógio congelado", () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-01-15T12:00:00Z"));
    });

    it("tamanhos diferentes => assinaturas diferentes (content-length assinado)", async () => {
      const a = new URL((await assinar({ tamanho: 1000 })).url).searchParams.get("X-Amz-Signature");
      const b = new URL((await assinar({ tamanho: 2000 })).url).searchParams.get("X-Amz-Signature");
      expect(a).not.toBe(b);
    });

    it("mesma entrada e mesmo relógio => mesma assinatura", async () => {
      const a = (await assinar({ tamanho: 1000 })).url;
      const b = (await assinar({ tamanho: 1000 })).url;
      expect(a).toBe(b);
    });
  });

  it.each([0, -1, 1.5, NaN])("tamanho inválido (%s) lança", async (tamanho) => {
    await expect(assinar({ tamanho })).rejects.toThrow();
  });

  // S4: teto de 1 MB (ADR-009 D1): tamanho > 1_048_576 é grande demais.
  it("tamanho 1_048_576 (teto) assina com X-Amz-Expires=300", async () => {
    const { url } = await assinar({ tamanho: 1_048_576 });
    expect(new URL(url).searchParams.get("X-Amz-Expires")).toBe("300");
  });

  it("tamanho 1_048_577 (acima do teto) rejeita", async () => {
    await expect(assinar({ tamanho: 1_048_577 })).rejects.toThrow(/Tamanho/);
  });

  it.each([
    ["vazio", ""],
    ["indefinido", undefined],
  ])("R2_ACCESS_KEY_ID %s => rejeita", async (_nome, valor) => {
    vi.stubEnv("R2_ACCESS_KEY_ID", valor);
    await expect(assinar()).rejects.toThrow(/R2_ACCESS_KEY_ID/);
  });
});
