import { describe, expect, it } from "vitest";

import { codificarCursor, lerCursor } from "./cursor";

// T027 / data-model §3 (cursor); research D8.

const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64url");

describe("cursor", () => {
  it("faz a ida e volta mantendo o µs como string", () => {
    const cursor = codificarCursor("1760000000123456", 42);
    expect(lerCursor(cursor)).toEqual({ micros: "1760000000123456", id: 42 });
  });

  it("não perde dígitos além de 2^53", () => {
    const micros = "99999999999999999";
    expect(lerCursor(codificarCursor(micros, 1))?.micros).toBe(micros);
  });

  it("aceita o maior id do integer", () => {
    expect(lerCursor(b64("1.2147483647"))).toEqual({ micros: "1", id: 2147483647 });
  });

  it.each([
    ["base64url inválido", "***"],
    ["vazio", ""],
    ["sem ponto", b64("123")],
    ["µs com letra", b64("12a.5")],
    ["µs com 18 dígitos", b64("123456789012345678.5")],
    ["id com 11 dígitos", b64("1.12345678901")],
    ["id 0", b64("1.0")],
    ["id acima do integer", b64("1.2147483648")],
    ["sinal negativo", b64("-1.5")],
    ["conteúdo extra", b64("1.5.6")],
    ["espaço", b64("1. 5")],
  ])("devolve null para %s", (_nome, entrada) => {
    expect(lerCursor(entrada)).toBeNull();
  });
});
