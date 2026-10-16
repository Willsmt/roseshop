import { describe, expect, it } from "vitest";
import { resumo, valorLinha, type LinhaPedido } from "./total";

// Feature 006, SF1, T009 (data-model §4, FR-012).

function linha(p: Partial<LinhaPedido> & { quantidade: number }): LinhaPedido {
  return { nome: "Produto", codigo: "0001", precoCentavos: null, aPartirDe: false, ...p };
}

describe("valorLinha", () => {
  it('2x de R$ 6,00 => "R$ 12,00"', () => {
    expect(valorLinha(linha({ quantidade: 2, precoCentavos: 600 }))).toBe("R$ 12,00");
  });

  it('com "a partir de" => "a partir de R$ …"', () => {
    expect(valorLinha(linha({ quantidade: 3, precoCentavos: 1000, aPartirDe: true }))).toBe("a partir de R$ 30,00");
  });

  it('sem preço => "Consulte o valor"', () => {
    expect(valorLinha(linha({ quantidade: 4, precoCentavos: null }))).toBe("Consulte o valor");
  });

  it("usa o formato brasileiro com milhar (R$ 1.234,56)", () => {
    expect(valorLinha(linha({ quantidade: 1, precoCentavos: 123456 }))).toBe("R$ 1.234,56");
  });
});

describe("resumo", () => {
  it('US2.5: 2 x R$ 6,00 + 1 x "a partir de R$ 10,00" => "a partir de R$ 22,00"', () => {
    const r = resumo([
      linha({ quantidade: 2, precoCentavos: 600 }),
      linha({ quantidade: 1, precoCentavos: 1000, aPartirDe: true, codigo: "0002" }),
    ]);
    expect(r.subtotal).toBe("a partir de R$ 22,00");
    expect(r.aConsultar).toBeNull();
  });

  it("sem nenhum a partir de, o subtotal é o valor simples", () => {
    const r = resumo([
      linha({ quantidade: 2, precoCentavos: 600 }),
      linha({ quantidade: 1, precoCentavos: 250, codigo: "0002" }),
    ]);
    expect(r.subtotal).toBe("R$ 14,50");
    expect(r.aConsultar).toBeNull();
  });

  it('US2.6: 2 com preço + 1 sem => soma só dos 2, linha "Consulte o valor" e "+ 1 item a consultar"', () => {
    const itens = [
      linha({ quantidade: 2, precoCentavos: 600 }),
      linha({ quantidade: 1, precoCentavos: 400, codigo: "0002" }),
      linha({ quantidade: 5, precoCentavos: null, codigo: "0003" }),
    ];
    expect(valorLinha(itens[2]!)).toBe("Consulte o valor");
    const r = resumo(itens);
    expect(r.subtotal).toBe("R$ 16,00");
    expect(r.aConsultar).toBe("+ 1 item a consultar");
  });

  it('US2.6: 2 sem preço (e um com) => "+ 2 itens a consultar"', () => {
    const r = resumo([
      linha({ quantidade: 1, precoCentavos: 500 }),
      linha({ quantidade: 1, precoCentavos: null, codigo: "0002" }),
      linha({ quantidade: 3, precoCentavos: null, codigo: "0003" }),
    ]);
    expect(r.subtotal).toBe("R$ 5,00");
    expect(r.aConsultar).toBe("+ 2 itens a consultar");
  });

  it('nenhum com preço => subtotal "Consulte o valor" e aConsultar pela contagem (1)', () => {
    const r = resumo([linha({ quantidade: 2, precoCentavos: null })]);
    expect(r.subtotal).toBe("Consulte o valor");
    expect(r.aConsultar).toBe("+ 1 item a consultar");
  });

  it('nenhum com preço => subtotal "Consulte o valor" e aConsultar pela contagem (N)', () => {
    const r = resumo([
      linha({ quantidade: 2, precoCentavos: null }),
      linha({ quantidade: 1, precoCentavos: null, codigo: "0002" }),
      linha({ quantidade: 1, precoCentavos: null, codigo: "0003" }),
    ]);
    expect(r.subtotal).toBe("Consulte o valor");
    expect(r.aConsultar).toBe("+ 3 itens a consultar");
  });

  it("formata o subtotal no padrão brasileiro (R$ 1.234,56)", () => {
    const r = resumo([linha({ quantidade: 1, precoCentavos: 123456 })]);
    expect(r.subtotal).toBe("R$ 1.234,56");
  });

  it("teto: 15 x 10 x 9.999.999 = 1.499.999.850 centavos sem perda", () => {
    const linhas = Array.from({ length: 15 }, (_, i) =>
      linha({ quantidade: 10, precoCentavos: 9_999_999, codigo: String(i + 1).padStart(4, "0") }),
    );
    const r = resumo(linhas);
    expect(r.subtotal).toBe("R$ 14.999.998,50");
    expect(r.aConsultar).toBeNull();
  });
});
