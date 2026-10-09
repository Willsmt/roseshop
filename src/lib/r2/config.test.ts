import { afterEach, describe, expect, it, vi } from "vitest";

import { configR2 } from "./config";

// T032: configR2 lê R2_S3_ENDPOINT, R2_ACCESS_KEY_ID e R2_SECRET_ACCESS_KEY de process.env
// no momento da chamada, valida com Zod e nunca vaza o secret na mensagem de erro.

const ENDPOINT_LOCAL = "http://localhost:8787/cdn-cgi/local/r2/s3/roseshop-local";
const ENDPOINT_DEV = "https://abc123.r2.cloudflarestorage.com/roseshop-dev";
const KEY = "roseshop-local";
const SECRET = "roseshop-local-nao-secreto";

function env(over: Partial<Record<string, string>> = {}) {
  const base: Record<string, string> = {
    R2_S3_ENDPOINT: ENDPOINT_LOCAL,
    R2_ACCESS_KEY_ID: KEY,
    R2_SECRET_ACCESS_KEY: SECRET,
    ...(over as Record<string, string>),
  };
  for (const [k, v] of Object.entries(base)) vi.stubEnv(k, v);
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("configR2", () => {
  it("devolve os três valores com o endpoint local", () => {
    env();
    expect(configR2()).toEqual({
      endpoint: ENDPOINT_LOCAL,
      accessKeyId: KEY,
      secretAccessKey: SECRET,
    });
  });

  it("aceita o endpoint https do R2 de dev", () => {
    env({ R2_S3_ENDPOINT: ENDPOINT_DEV });
    expect(configR2().endpoint).toBe(ENDPOINT_DEV);
  });

  it("lê o ambiente no momento da chamada", () => {
    env();
    expect(configR2().endpoint).toBe(ENDPOINT_LOCAL);
    vi.stubEnv("R2_S3_ENDPOINT", ENDPOINT_DEV);
    expect(configR2().endpoint).toBe(ENDPOINT_DEV);
  });

  it.each(["R2_S3_ENDPOINT", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY"])(
    "lança quando %s está vazia",
    (nome) => {
      env({ [nome]: "" });
      expect(() => configR2()).toThrow();
    },
  );

  it.each(["R2_S3_ENDPOINT", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY"])(
    "lança quando %s está ausente",
    (nome) => {
      env();
      vi.stubEnv(nome, undefined);
      expect(() => configR2()).toThrow();
    },
  );

  it.each([
    ["não é URL", "roseshop"],
    ["barra final", `${ENDPOINT_LOCAL}/`],
    ["protocolo ftp", "ftp://x/y"],
  ])("lança quando o endpoint %s", (_nome, endpoint) => {
    env({ R2_S3_ENDPOINT: endpoint });
    expect(() => configR2()).toThrow();
  });

  // S1: http: só para host local; fora disso exige https:.
  it("aceita http em 127.0.0.1", () => {
    const e = "http://127.0.0.1:8787/cdn-cgi/local/r2/s3/roseshop-local";
    env({ R2_S3_ENDPOINT: e });
    expect(configR2().endpoint).toBe(e);
  });

  it.each([
    ["http em host remoto do R2", "http://abc123.r2.cloudflarestorage.com/roseshop-dev"],
    ["host que só começa com localhost", "http://localhost.exemplo.com/x"],
    ["localhost apenas no caminho", "http://exemplo.com/localhost"],
  ])("lança com %s", (_nome, endpoint) => {
    env({ R2_S3_ENDPOINT: endpoint });
    expect(() => configR2()).toThrow(/R2_S3_ENDPOINT/);
  });

  it("a mensagem do erro de http em host não local não contém o secret", () => {
    env({ R2_S3_ENDPOINT: "http://abc123.r2.cloudflarestorage.com/roseshop-dev" });
    let mensagem = "";
    try {
      configR2();
    } catch (e) {
      mensagem = e instanceof Error ? e.message : String(e);
    }
    expect(mensagem).not.toBe("");
    expect(mensagem).not.toContain(SECRET);
  });

  it("a mensagem do erro não contém o valor do secret", () => {
    env({ R2_S3_ENDPOINT: "roseshop" });
    let mensagem = "";
    try {
      configR2();
    } catch (e) {
      mensagem = e instanceof Error ? e.message : String(e);
    }
    expect(mensagem).not.toBe("");
    expect(mensagem).not.toContain(SECRET);
  });
});
