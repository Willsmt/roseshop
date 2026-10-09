import { afterEach, describe, expect, it, vi } from "vitest";

import { modoVerificacao } from "./modo";

// T026 (parte 1): modoVerificacao lê FOTOS_VERIFICACAO e só aceita "registro" exato.
// Qualquer outro valor (ou ausência) cai em "recusar", o lado seguro.

const original = process.env.FOTOS_VERIFICACAO;

afterEach(() => {
  vi.unstubAllEnvs();
  if (original === undefined) delete process.env.FOTOS_VERIFICACAO;
  else process.env.FOTOS_VERIFICACAO = original;
});

describe("modoVerificacao", () => {
  it('"registro" exato => registro', () => {
    vi.stubEnv("FOTOS_VERIFICACAO", "registro");
    expect(modoVerificacao()).toBe("registro");
  });

  it("variável ausente (undefined) => recusar", () => {
    delete process.env.FOTOS_VERIFICACAO;
    expect(process.env.FOTOS_VERIFICACAO).toBeUndefined();
    expect(modoVerificacao()).toBe("recusar");
  });

  it.each([
    ["string vazia", ""],
    ["Registro", "Registro"],
    ["REGISTRO", "REGISTRO"],
    ["registro com espaço no fim", "registro "],
    ["registro com espaço no início", " registro"],
    ["true", "true"],
    ["1", "1"],
    ["recusar", "recusar"],
    ["registro com quebra de linha", "registro\n"],
  ])("%s => recusar", (_nome, valor) => {
    vi.stubEnv("FOTOS_VERIFICACAO", valor);
    expect(modoVerificacao()).toBe("recusar");
  });

  it("lê a variável a cada chamada (não guarda o valor)", () => {
    vi.stubEnv("FOTOS_VERIFICACAO", "registro");
    expect(modoVerificacao()).toBe("registro");
    vi.stubEnv("FOTOS_VERIFICACAO", "outro");
    expect(modoVerificacao()).toBe("recusar");
  });
});
