import { afterEach, describe, expect, it, vi } from "vitest";

import { registrarFalha } from "./registro";

// T033: registrarFalha grava exatamente { evento, rota, causa, resultado? } em JSON.

afterEach(() => {
  vi.restoreAllMocks();
});

describe("registrarFalha", () => {
  it("grava os quatro campos em JSON, na ordem do contrato", () => {
    const erro = vi.spyOn(console, "error").mockImplementation(() => {});
    registrarFalha({
      evento: "catalogo.banco_indisponivel",
      rota: "/",
      causa: "banco",
      resultado: "503",
    });
    expect(erro).toHaveBeenCalledTimes(1);
    expect(JSON.parse(erro.mock.calls[0][0] as string)).toEqual({
      evento: "catalogo.banco_indisponivel",
      rota: "/",
      causa: "banco",
      resultado: "503",
    });
  });

  it("omite resultado quando não informado e não grava nenhum campo extra", () => {
    const erro = vi.spyOn(console, "error").mockImplementation(() => {});
    registrarFalha({ evento: "catalogo.fotos_falha", rota: "/fotos/[arquivo]", causa: "r2" });
    expect(Object.keys(JSON.parse(erro.mock.calls[0][0] as string))).toEqual([
      "evento",
      "rota",
      "causa",
    ]);
  });

  it("grava a classe do erro quando informada, depois dos campos do contrato", () => {
    const erro = vi.spyOn(console, "error").mockImplementation(() => {});
    registrarFalha({
      evento: "catalogo.erro_inesperado",
      rota: "/api/catalogo/conferencia",
      causa: "inesperado",
      classe: "TypeError",
    });
    expect(JSON.parse(erro.mock.calls[0][0] as string)).toEqual({
      evento: "catalogo.erro_inesperado",
      rota: "/api/catalogo/conferencia",
      causa: "inesperado",
      classe: "TypeError",
    });
  });

  it("rejeita causa fora de banco|r2|config|inesperado em tempo de tipo", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    // @ts-expect-error causa fora da lista fechada
    registrarFalha({ evento: "catalogo.erro_inesperado", rota: "/", causa: "mensagem da excecao" });
  });

  it("rejeita evento e rota fora dos nomes do contrato §7 em tempo de tipo", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    // @ts-expect-error evento fora da lista fechada
    registrarFalha({ evento: "catalogo.outro", rota: "/", causa: "banco" });
    // @ts-expect-error rota fora da lista fechada (URL com query, por exemplo)
    registrarFalha({ evento: "catalogo.erro_inesperado", rota: "/p/42?x=1", causa: "banco" });
    // @ts-expect-error resultado fora da lista fechada (texto livre)
    registrarFalha({ evento: "catalogo.erro_inesperado", rota: "/", causa: "banco", resultado: "http://x" });
  });
});
