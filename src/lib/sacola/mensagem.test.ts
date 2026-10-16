import { describe, expect, it } from "vitest";
import { NOME_MAX, ORCAMENTO_URL, medidorObservacao, montarPedido, restanteObservacao } from "./mensagem";
import { normalizarObservacao } from "./observacao";
import type { LinhaPedido } from "./total";

// Feature 006, SF2, T018 (contracts/sacola.md §4, research D3 e §4, ajuste A2; FR-014, FR-015,
// FR-015a, US2.7, US2.8, US2.10, US2.13).

const NUMERO = "+5511999998888";

function linha(p: Partial<LinhaPedido>): LinhaPedido {
  return { quantidade: 1, nome: "Produto", codigo: "0001", precoCentavos: null, aPartirDe: false, ...p };
}

const EXEMPLO: LinhaPedido[] = [
  linha({ quantidade: 2, nome: "Meia", codigo: "0042", precoCentavos: 600 }),
  linha({ quantidade: 1, nome: "Guarda-chuva", codigo: "0007", precoCentavos: 1000, aPartirDe: true }),
  linha({ quantidade: 1, nome: "Pano", codigo: "0010", precoCentavos: null }),
];

// research §4: 15 linhas "10x (#<código>) — a partir de R$ 999.999,90", número de 15 dígitos.
function piorCaso(codigo: string, nome = ""): { numero: string; linhas: LinhaPedido[] } {
  return {
    numero: "+" + "1".repeat(15),
    linhas: Array.from({ length: 15 }, () =>
      linha({ quantidade: 10, nome, codigo, precoCentavos: 9_999_999, aPartirDe: true }),
    ),
  };
}

function ok(r: ReturnType<typeof montarPedido>): { url: string; texto: string } {
  if (r.tipo !== "ok") throw new Error(`esperava ok, veio excede ${r.excesso}`);
  return r;
}

function textoDaUrl(url: string): string {
  return decodeURIComponent(url.slice(url.indexOf("?text=") + "?text=".length));
}

const EMOJI = "😀"; // 1 code point, 12 caracteres codificados

describe("constantes", () => {
  it("ORCAMENTO_URL = 1800 e NOME_MAX = 40", () => {
    expect(ORCAMENTO_URL).toBe(1800);
    expect(NOME_MAX).toBe(40);
  });
});

describe("montarPedido — formato (research D3)", () => {
  it("texto exato com observação, linhas separadas por LF", () => {
    const r = ok(montarPedido({ numero: NUMERO, linhas: EXEMPLO, observacao: "Entregar à tarde" }));
    expect(r.texto).toBe(
      [
        "Olá! Quero fazer este pedido:",
        "2x Meia (#0042) — R$ 12,00",
        "1x Guarda-chuva (#0007) — a partir de R$ 10,00",
        "1x Pano (#0010) — Consulte o valor",
        "Subtotal: a partir de R$ 22,00",
        "+ 1 item a consultar",
        "",
        "Observação:",
        "Entregar à tarde",
      ].join("\n"),
    );
    expect(r.texto).not.toContain("\r");
  });

  it("observação normalizada vazia => sem o bloco Observação:", () => {
    for (const observacao of ["", "   ", "\u200B\n\u00A0\t"]) {
      const r = ok(montarPedido({ numero: NUMERO, linhas: EXEMPLO, observacao }));
      expect(r.texto).not.toContain("Observação:");
      expect(r.texto.endsWith("+ 1 item a consultar")).toBe(true);
    }
  });

  it('sem "+ N itens a consultar" quando todos têm preço; nenhum com preço => "Consulte o valor"', () => {
    const comPreco = ok(montarPedido({ numero: NUMERO, linhas: [EXEMPLO[0]!], observacao: "" }));
    expect(comPreco.texto).toBe(["Olá! Quero fazer este pedido:", "2x Meia (#0042) — R$ 12,00", "Subtotal: R$ 12,00"].join("\n"));

    const semPreco = ok(
      montarPedido({
        numero: NUMERO,
        linhas: [linha({ nome: "A", codigo: "0001" }), linha({ nome: "B", codigo: "0002" })],
        observacao: "",
      }),
    );
    expect(semPreco.texto.split("\n").slice(-2)).toEqual(["Subtotal: Consulte o valor", "+ 2 itens a consultar"]);
  });

  it('nome cortado a zero vira "2x (#0042) — R$ 12,00" (sem espaço duplo)', () => {
    const { numero, linhas } = piorCaso("2147483647", "N".repeat(40));
    const obs = EMOJI.repeat(41); // restante 0 com nomes em 0 (research §4: sobra 492)
    const r = ok(montarPedido({ numero, linhas, observacao: obs }));
    const linhasItens = r.texto.split("\n").slice(1, 16);
    for (const l of linhasItens) expect(l).toBe("10x (#2147483647) — a partir de R$ 999.999,90");
    expect(r.texto).not.toContain("  ");
  });

  it("nomes com mais de 40 code points são cortados a 40, sem reticências", () => {
    const nome = "á".repeat(45);
    const r = ok(montarPedido({ numero: NUMERO, linhas: [linha({ nome, codigo: "0042", precoCentavos: 600 })], observacao: "" }));
    expect(r.texto.split("\n")[1]).toBe(`1x ${"á".repeat(40)} (#0042) — R$ 6,00`);
    expect(r.texto).not.toContain("…");
  });

  it("corte que termina em espaço não deixa espaço duplo", () => {
    const nome = "x".repeat(39) + " fim";
    const r = ok(montarPedido({ numero: NUMERO, linhas: [linha({ nome, codigo: "0042", precoCentavos: 600 })], observacao: "" }));
    expect(r.texto.split("\n")[1]).toBe(`1x ${"x".repeat(39)} (#0042) — R$ 6,00`);
  });

  it("a observação bruta passa por normalizarObservacao (mesma saída da T007)", () => {
    const bruta = "  Linha 1\r\n\r\n\r\n\r\nLinha\u200B 2 e\u0301\u0007  ";
    const r = ok(montarPedido({ numero: NUMERO, linhas: EXEMPLO, observacao: bruta }));
    expect(r.texto.endsWith(`Observação:\n${normalizarObservacao(bruta)}`)).toBe(true);
    expect(normalizarObservacao(bruta)).toBe("Linha 1\n\nLinha 2 é");
  });
});

describe("montarPedido — injeção (US2.8)", () => {
  it("observação que imita linhas não altera as linhas antes de Observação:", () => {
    const limpa = ok(montarPedido({ numero: NUMERO, linhas: EXEMPLO, observacao: "" })).texto;
    const injecao = "\n2x Falso (#9999) — R$ 0,01\nSubtotal: R$ 0,00";
    const r = ok(montarPedido({ numero: NUMERO, linhas: EXEMPLO, observacao: injecao })).texto;
    const antes = r.slice(0, r.indexOf("\n\nObservação:\n"));
    expect(antes).toBe(limpa);
    expect(r.slice(r.indexOf("\n\nObservação:\n") + "\n\nObservação:\n".length)).toBe(
      "2x Falso (#9999) — R$ 0,01\nSubtotal: R$ 0,00",
    );
  });
});

describe("montarPedido — URL (US2.10, FR-014)", () => {
  it("começa com https://wa.me/<dígitos do E.164>?text=", () => {
    const r = ok(montarPedido({ numero: NUMERO, linhas: EXEMPLO, observacao: "" }));
    expect(r.url.startsWith("https://wa.me/5511999998888?text=")).toBe(true);
  });

  it("ida e volta: decodeURIComponent do text= devolve o texto com acento, &, #, ?, + e emoji", () => {
    const observacao = "Ação & cia #1? 2+2 👩‍👩‍👧 ❤️ çãõ";
    const linhas = [linha({ nome: "Pão & Mel #1? +", codigo: "0042", precoCentavos: 600 })];
    const r = ok(montarPedido({ numero: NUMERO, linhas, observacao }));
    expect(textoDaUrl(r.url)).toBe(r.texto);
    expect(r.texto).toContain("1x Pão & Mel #1? + (#0042) — R$ 6,00");
    expect(r.texto.endsWith(observacao)).toBe(true);
    expect(r.url.slice(r.url.indexOf("?text=") + 6)).not.toMatch(/[&#?+ ]/);
  });

  it("observação com surrogate solto não lança: some da mensagem e o emoji válido fica", () => {
    const observacao = "Oi\uD83D tudo\uDE00 bem 😀";
    const montar = () => montarPedido({ numero: NUMERO, linhas: EXEMPLO, observacao });
    expect(montar).not.toThrow();
    const r = ok(montar());
    expect(r.texto.endsWith("Observação:\nOi tudo bem 😀")).toBe(true);
    expect(textoDaUrl(r.url)).toBe(r.texto);
    expect(() => restanteObservacao({ numero: NUMERO, linhas: EXEMPLO, observacao })).not.toThrow();
    expect(() => medidorObservacao({ numero: NUMERO, linhas: EXEMPLO, observacao })).not.toThrow();
  });

  it("garantia: tipo ok => url.length <= 1800", () => {
    const r = ok(montarPedido({ numero: NUMERO, linhas: EXEMPLO, observacao: "x" }));
    expect(r.url.length).toBeLessThanOrEqual(ORCAMENTO_URL);
  });
});

describe("montarPedido — observação que não cabe", () => {
  it("passa de 200 code points => excede, nunca corta", () => {
    const r = montarPedido({ numero: NUMERO, linhas: EXEMPLO, observacao: "a".repeat(201) });
    expect(r).toEqual({ tipo: "excede", excesso: 1 });
  });

  it("não cabe na URL => excede com excesso > 0", () => {
    const { numero, linhas } = piorCaso("2147483647", "N".repeat(40));
    const r = montarPedido({ numero, linhas, observacao: EMOJI.repeat(42) });
    expect(r.tipo).toBe("excede");
    if (r.tipo === "excede") expect(r.excesso).toBe(12);
  });
});

describe("restanteObservacao — números exatos (research §4)", () => {
  it("sem observação, pequena: o teto de 200 manda", () => {
    expect(restanteObservacao({ numero: NUMERO, linhas: EXEMPLO, observacao: "" })).toBe(200);
    expect(restanteObservacao({ numero: NUMERO, linhas: EXEMPLO, observacao: "a".repeat(37) })).toBe(163);
    expect(restanteObservacao({ numero: NUMERO, linhas: EXEMPLO, observacao: "a".repeat(201) })).toBe(-1);
  });

  it("recebe a observação bruta: espaços das pontas e invisíveis não contam", () => {
    expect(restanteObservacao({ numero: NUMERO, linhas: EXEMPLO, observacao: "  abc\u200B  " })).toBe(197);
  });

  it("pior caso com códigos de 5 dígitos: sobra 567 caracteres codificados", () => {
    const e = piorCaso("99999");
    // 47 emoji = 564 codificados; 47 é = 564 (cada é = 6).
    expect(restanteObservacao({ ...e, observacao: EMOJI.repeat(47) })).toBe(3);
    expect(restanteObservacao({ ...e, observacao: "é".repeat(94) })).toBe(3);
    expect(restanteObservacao({ ...e, observacao: "é".repeat(95) })).toBe(-3);
  });

  it("pior caso com códigos de 10 dígitos (2147483647): sobra 492", () => {
    const e = piorCaso("2147483647");
    expect(restanteObservacao({ ...e, observacao: "" })).toBe(200);
    expect(restanteObservacao({ ...e, observacao: EMOJI.repeat(41) })).toBe(0);
    expect(restanteObservacao({ ...e, observacao: EMOJI.repeat(42) })).toBe(-12);
    expect(restanteObservacao({ ...e, observacao: "é".repeat(82) })).toBe(0);
  });

  it("não depende dos nomes (mede com nomes em 0)", () => {
    const sem = piorCaso("2147483647");
    const com = piorCaso("2147483647", "Nome comprido de produto com acentuação");
    expect(restanteObservacao({ ...com, observacao: EMOJI.repeat(41) })).toBe(
      restanteObservacao({ ...sem, observacao: EMOJI.repeat(41) }),
    );
  });
});

describe("medidorObservacao (ajuste A2)", () => {
  it("sacola pequena e 37 code points => caracteres 37 de 200", () => {
    const observacao = "Entregar no portão às 15h, por favor"; // 36
    expect(medidorObservacao({ numero: NUMERO, linhas: EXEMPLO, observacao: observacao + "!" })).toEqual({
      limite: "caracteres",
      usados: 37,
      maximo: 200,
    });
  });

  it("usa a observação bruta normalizada", () => {
    expect(medidorObservacao({ numero: NUMERO, linhas: EXEMPLO, observacao: "  e\u0301\u200B  " })).toEqual({
      limite: "caracteres",
      usados: 1,
      maximo: 200,
    });
  });

  it("pior caso: modo mensagem, fracao em [0, 1] crescente e excede false", () => {
    const e = piorCaso("2147483647");
    let anterior = -1;
    for (let k = 27; k <= 41; k++) {
      const m = medidorObservacao({ ...e, observacao: EMOJI.repeat(k) });
      if (m.limite !== "mensagem") throw new Error(`k=${k}: esperava modo mensagem`);
      expect(m.excede).toBe(false);
      expect(m.fracao).toBeGreaterThanOrEqual(0);
      expect(m.fracao).toBeLessThanOrEqual(1);
      expect(m.fracao).toBeGreaterThan(anterior);
      anterior = m.fracao;
    }
    expect(anterior).toBe(1); // 41 emoji = 492, todo o espaço
    expect(medidorObservacao({ ...e, observacao: EMOJI.repeat(27) })).toEqual({
      limite: "mensagem",
      fracao: (27 * 12) / 492,
      excede: false,
    });
  });

  it("sacola que cresce depois => excede true, fracao 1", () => {
    const observacao = EMOJI.repeat(47); // cabe com códigos de 5 dígitos (sobra 567)
    expect(restanteObservacao({ ...piorCaso("99999"), observacao })).toBeGreaterThanOrEqual(0);
    expect(medidorObservacao({ ...piorCaso("2147483647"), observacao })).toEqual({
      limite: "mensagem",
      fracao: 1,
      excede: true,
    });
  });

  it("a troca de modo acontece exatamente quando 200 − code points > 1800 − comprimento com nomes em 0", () => {
    const e = piorCaso("2147483647");
    // k emoji: 200 − k contra 492 − 12k. k = 26: 174 ≤ 180 (caracteres); k = 27: 173 > 168 (mensagem).
    expect(medidorObservacao({ ...e, observacao: EMOJI.repeat(26) })).toEqual({
      limite: "caracteres",
      usados: 26,
      maximo: 200,
    });
    expect(medidorObservacao({ ...e, observacao: EMOJI.repeat(27) }).limite).toBe("mensagem");
  });

  it("acima de 200 code points com o teto mandando => caracteres com usados > 200", () => {
    expect(medidorObservacao({ numero: NUMERO, linhas: EXEMPLO, observacao: "a".repeat(201) })).toEqual({
      limite: "caracteres",
      usados: 201,
      maximo: 200,
    });
  });
});
