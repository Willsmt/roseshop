import { describe, expect, it } from "vitest";

import { formatarAPartirDe, formatarPreco, parsePreco } from "./preco";

// T012 / research D8 / contrato §4 (formato do preço).

describe("parsePreco: aceitos (D8)", () => {
  it.each([
    ["12", 1200],
    ["12,90", 1290],
    ["12.90", 1290],
    ["12,9", 1290],
    ["12.9", 1290],
    ["R$ 12,90", 1290],
    ["R$12,90", 1290],
    [" 12,90 ", 1290],
    ["1.290,00", 129000],
    ["1.290,5", 129050],
    ["0,01", 1],
    ["99.999,99", 9999999], // limite exato
    ["99999,99", 9999999],
  ])("%j ⇒ %d centavos", (texto, centavos) => {
    expect(parsePreco(texto)).toEqual({ ok: true, centavos });
  });

  it("devolve inteiro exato, sem erro de float (19,99 e 1,15)", () => {
    expect(parsePreco("19,99")).toEqual({ ok: true, centavos: 1999 });
    expect(parsePreco("1,15")).toEqual({ ok: true, centavos: 115 });
    expect(parsePreco("0,29")).toEqual({ ok: true, centavos: 29 });
  });
});

describe("parsePreco: ambíguos (D8)", () => {
  it.each(["1.290", "1,290", "12,345", "12 90", "1 290", "1 290,00"])("%j ⇒ preco_ambiguo", (texto) => {
    expect(parsePreco(texto)).toEqual({ ok: false, motivo: "preco_ambiguo" });
  });
});

describe("parsePreco: inválidos (D8)", () => {
  it.each([
    "0",
    "0,00",
    "-5",
    "-12,90",
    "+12,90",
    "abc",
    "12 reais",
    "12,3456",
    "12R$90",
    "12,90R$",
    "R$R$12,90",
    "1.290.000", // acima do teto, não é ambíguo
    "1.2.3",
    "1,290.00",
    "12,90,1",
    "100.000,00", // acima de 99.999,99
    "100000",
    "99.999,995",
  ])("%j ⇒ preco_invalido", (texto) => {
    expect(parsePreco(texto)).toEqual({ ok: false, motivo: "preco_invalido" });
  });
});

describe("formatarPreco / formatarAPartirDe (contrato §4)", () => {
  it("formata centavos como R$ com vírgula", () => {
    expect(formatarPreco(1290)).toBe("R$ 12,90");
    expect(formatarPreco(1200)).toBe("R$ 12,00");
    expect(formatarPreco(5)).toBe("R$ 0,05");
  });

  it("usa ponto de milhar", () => {
    expect(formatarPreco(129000)).toBe("R$ 1.290,00");
    expect(formatarPreco(9999999)).toBe("R$ 99.999,99");
  });

  it("a partir de", () => {
    expect(formatarAPartirDe(1290)).toBe("a partir de R$ 12,90");
  });

  it("round-trip: formatar e interpretar devolve os mesmos centavos", () => {
    for (const c of [1, 99, 1290, 129050, 9999999]) {
      expect(parsePreco(formatarPreco(c))).toEqual({ ok: true, centavos: c });
    }
  });
});
