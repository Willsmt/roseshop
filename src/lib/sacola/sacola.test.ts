import { describe, expect, it } from "vitest";
import {
  MAX_PRODUTOS,
  QTD_MAX,
  QTD_MIN,
  VALIDADE_MS,
  adicionar,
  aplicarConferencia,
  cheia,
  estaNaSacola,
  limpar,
  mudarQuantidade,
  remover,
  type Item,
  type ItemConferencia,
  type Sacola,
} from "./sacola";

// Feature 006, SF1, T008 (research D4, data-model §1 transições, FR-003, FR-005, FR-008a, US1.3, US3.2).

const T0 = 1_760_000_000_000;
const AGORA = T0 + 5_000;

function congelar<T>(valor: T): T {
  if (valor !== null && typeof valor === "object" && !Object.isFrozen(valor)) {
    Object.freeze(valor);
    for (const v of Object.values(valor)) congelar(v);
  }
  return valor;
}

function item(codigo: string, extra: Partial<Item> = {}): Item {
  return { codigo, quantidade: 1, precoVisto: 600, aPartirDe: false, ...extra };
}

function sacola(itens: Item[] = [], alteradaEm = T0): Sacola {
  return { versao: 1, alteradaEm, itens };
}

function cheiaCom(n: number): Sacola {
  return sacola(Array.from({ length: n }, (_, i) => item(String(i + 1).padStart(4, "0"))));
}

function esperarOk(r: ReturnType<ReturnType<typeof adicionar>>) {
  if (!r.ok) throw new Error(`esperava ok, veio ${r.motivo}`);
  return r;
}

function conf(codigo: string, estado: "ok" | "esgotado", extra: Partial<{ precoCentavos: number | null; aPartirDe: boolean }> = {}): ItemConferencia {
  return {
    codigo,
    estado,
    produto: {
      nome: `Produto ${codigo}`,
      href: `/p/${codigo}`,
      precoCentavos: 600,
      aPartirDe: false,
      capa: null,
      ...extra,
    },
  };
}

describe("constantes", () => {
  it("limites do contrato (FR-003, FR-005, FR-007)", () => {
    expect(MAX_PRODUTOS).toBe(15);
    expect(QTD_MIN).toBe(1);
    expect(QTD_MAX).toBe(10);
    expect(VALIDADE_MS).toBe(7 * 24 * 3600 * 1000);
  });
});

describe("adicionar", () => {
  it("entra com quantidade 1, precoVisto e aPartirDe, mudou true e alteradaEm = agora", () => {
    const r = esperarOk(adicionar({ codigo: "0042", precoCentavos: 600, aPartirDe: true })(sacola(), AGORA));
    expect(r.mudou).toBe(true);
    expect(r.sacola.itens).toEqual([{ codigo: "0042", quantidade: 1, precoVisto: 600, aPartirDe: true }]);
    expect(r.sacola.alteradaEm).toBe(AGORA);
    expect(r.sacola.versao).toBe(1);
  });

  it("aceita produto sem preço (precoVisto null)", () => {
    const r = esperarOk(adicionar({ codigo: "0042", precoCentavos: null, aPartirDe: false })(sacola(), AGORA));
    expect(r.sacola.itens[0]).toEqual({ codigo: "0042", quantidade: 1, precoVisto: null, aPartirDe: false });
  });

  it("acrescenta ao fim e preserva os itens existentes", () => {
    const base = sacola([item("0001", { quantidade: 4 })]);
    const r = esperarOk(adicionar({ codigo: "0002", precoCentavos: 100, aPartirDe: false })(base, AGORA));
    expect(r.sacola.itens.map((i) => i.codigo)).toEqual(["0001", "0002"]);
    expect(r.sacola.itens[0]!.quantidade).toBe(4);
  });

  it("US1.3: código já presente => ok, mudou false, quantidade e alteradaEm intactos", () => {
    const base = sacola([item("0042", { quantidade: 3 })]);
    const r = esperarOk(adicionar({ codigo: "0042", precoCentavos: 999, aPartirDe: true })(base, AGORA));
    expect(r.mudou).toBe(false);
    expect(r.sacola).toBe(base);
    expect(r.sacola.itens[0]!.quantidade).toBe(3);
    expect(r.sacola.alteradaEm).toBe(T0);
  });

  it("FR-003: 16º código diferente => limite_produtos (conferido sobre a sacola recebida)", () => {
    const r = adicionar({ codigo: "9999", precoCentavos: 100, aPartirDe: false })(cheiaCom(15), AGORA);
    expect(r).toEqual({ ok: false, motivo: "limite_produtos" });
  });

  it("o 15º código ainda entra", () => {
    const r = esperarOk(adicionar({ codigo: "9999", precoCentavos: 100, aPartirDe: false })(cheiaCom(14), AGORA));
    expect(r.sacola.itens).toHaveLength(15);
  });

  it("com a sacola cheia, código já presente continua ok sem mudança", () => {
    const r = esperarOk(adicionar({ codigo: "0001", precoCentavos: 100, aPartirDe: false })(cheiaCom(15), AGORA));
    expect(r.mudou).toBe(false);
  });

  it('compara o código como texto exato ("42" não é "0042")', () => {
    const base = sacola([item("0042")]);
    const r = esperarOk(adicionar({ codigo: "42", precoCentavos: 100, aPartirDe: false })(base, AGORA));
    expect(r.mudou).toBe(true);
    expect(r.sacola.itens.map((i) => i.codigo)).toEqual(["0042", "42"]);
  });
});

describe("mudarQuantidade", () => {
  it("grava a quantidade válida, mudou true e alteradaEm = agora", () => {
    const base = sacola([item("0001"), item("0002")]);
    const r = esperarOk(mudarQuantidade("0002", 7)(base, AGORA));
    expect(r.mudou).toBe(true);
    expect(r.sacola.itens.find((i) => i.codigo === "0002")!.quantidade).toBe(7);
    expect(r.sacola.itens.find((i) => i.codigo === "0001")!.quantidade).toBe(1);
    expect(r.sacola.alteradaEm).toBe(AGORA);
  });

  it("aceita os extremos 1 e 10", () => {
    const base = sacola([item("0001", { quantidade: 5 })]);
    expect(esperarOk(mudarQuantidade("0001", 1)(base, AGORA)).sacola.itens[0]!.quantidade).toBe(1);
    expect(esperarOk(mudarQuantidade("0001", 10)(base, AGORA)).sacola.itens[0]!.quantidade).toBe(10);
  });

  it("FR-005: 0 => quantidade_fora", () => {
    expect(mudarQuantidade("0001", 0)(sacola([item("0001")]), AGORA)).toEqual({ ok: false, motivo: "quantidade_fora" });
  });

  it("FR-005: 11 => quantidade_fora", () => {
    expect(mudarQuantidade("0001", 11)(sacola([item("0001")]), AGORA)).toEqual({ ok: false, motivo: "quantidade_fora" });
  });

  it("quantidade não inteira => quantidade_fora", () => {
    expect(mudarQuantidade("0001", 2.5)(sacola([item("0001")]), AGORA)).toEqual({ ok: false, motivo: "quantidade_fora" });
  });

  it("código ausente => nao_esta", () => {
    expect(mudarQuantidade("0099", 2)(sacola([item("0001")]), AGORA)).toEqual({ ok: false, motivo: "nao_esta" });
  });
});

describe("remover", () => {
  it("tira o item, mudou true e alteradaEm = agora", () => {
    const r = esperarOk(remover("0001")(sacola([item("0001"), item("0002")]), AGORA));
    expect(r.mudou).toBe(true);
    expect(r.sacola.itens.map((i) => i.codigo)).toEqual(["0002"]);
    expect(r.sacola.alteradaEm).toBe(AGORA);
  });

  it("ausente => ok, mudou false, sacola e alteradaEm intactos", () => {
    const base = sacola([item("0001")]);
    const r = esperarOk(remover("0099")(base, AGORA));
    expect(r.mudou).toBe(false);
    expect(r.sacola).toBe(base);
    expect(r.sacola.alteradaEm).toBe(T0);
  });
});

describe("limpar", () => {
  it("deixa itens [] e grava alteradaEm = agora", () => {
    const r = esperarOk(limpar()(cheiaCom(3), AGORA));
    expect(r.mudou).toBe(true);
    expect(r.sacola.itens).toEqual([]);
    expect(r.sacola.alteradaEm).toBe(AGORA);
    expect(r.sacola.versao).toBe(1);
  });
});

describe("aplicarConferencia (FR-008a, US3.2)", () => {
  it("inexistente remove o item", () => {
    const base = sacola([item("0001"), item("0002")]);
    const r = esperarOk(aplicarConferencia([{ codigo: "0001", estado: "inexistente" }])(base, AGORA));
    expect(r.mudou).toBe(true);
    expect(r.sacola.itens.map((i) => i.codigo)).toEqual(["0002"]);
    expect(r.sacola.alteradaEm).toBe(AGORA);
  });

  it("ok com preço diferente atualiza precoVisto", () => {
    const base = sacola([item("0001", { precoVisto: 600 })]);
    const r = esperarOk(aplicarConferencia([conf("0001", "ok", { precoCentavos: 800 })])(base, AGORA));
    expect(r.mudou).toBe(true);
    expect(r.sacola.itens[0]!.precoVisto).toBe(800);
    expect(r.sacola.alteradaEm).toBe(AGORA);
  });

  it("esgotado com preço diferente também atualiza", () => {
    const base = sacola([item("0001", { precoVisto: 600 })]);
    const r = esperarOk(aplicarConferencia([conf("0001", "esgotado", { precoCentavos: 700 })])(base, AGORA));
    expect(r.sacola.itens[0]!.precoVisto).toBe(700);
  });

  it("aPartirDe diferente atualiza aPartirDe", () => {
    const base = sacola([item("0001", { aPartirDe: false })]);
    const r = esperarOk(aplicarConferencia([conf("0001", "ok", { aPartirDe: true })])(base, AGORA));
    expect(r.mudou).toBe(true);
    expect(r.sacola.itens[0]!.aPartirDe).toBe(true);
  });

  it("produto que ficou sem preço atualiza precoVisto para null", () => {
    const base = sacola([item("0001", { precoVisto: 600 })]);
    const r = esperarOk(aplicarConferencia([conf("0001", "ok", { precoCentavos: null })])(base, AGORA));
    expect(r.sacola.itens[0]!.precoVisto).toBeNull();
  });

  it("produto que ganhou preço atualiza precoVisto de null para o valor", () => {
    const base = sacola([item("0001", { precoVisto: null })]);
    const r = esperarOk(aplicarConferencia([conf("0001", "ok", { precoCentavos: 500 })])(base, AGORA));
    expect(r.sacola.itens[0]!.precoVisto).toBe(500);
  });

  it("preserva a quantidade ao atualizar o preço", () => {
    const base = sacola([item("0001", { quantidade: 4, precoVisto: 600 })]);
    const r = esperarOk(aplicarConferencia([conf("0001", "ok", { precoCentavos: 900 })])(base, AGORA));
    expect(r.sacola.itens[0]!.quantidade).toBe(4);
  });

  it("códigos não cobertos pela resposta ficam como estão", () => {
    const base = sacola([item("0001", { quantidade: 2 }), item("0002", { quantidade: 3, precoVisto: 111 })]);
    const r = esperarOk(aplicarConferencia([conf("0001", "ok", { precoCentavos: 900 })])(base, AGORA));
    expect(r.sacola.itens.find((i) => i.codigo === "0002")).toEqual(base.itens[1]);
  });

  it("nada diferente => mudou false, sacola e alteradaEm intactos", () => {
    const base = sacola([item("0001", { precoVisto: 600, aPartirDe: false })]);
    const r = esperarOk(aplicarConferencia([conf("0001", "ok", { precoCentavos: 600, aPartirDe: false })])(base, AGORA));
    expect(r.mudou).toBe(false);
    expect(r.sacola).toBe(base);
    expect(r.sacola.alteradaEm).toBe(T0);
  });

  it("lista vazia => mudou false", () => {
    const base = sacola([item("0001")]);
    expect(esperarOk(aplicarConferencia([])(base, AGORA)).mudou).toBe(false);
  });

  it("US3.2: esgotado que volta mantém a quantidade 3 em duas conferências seguidas", () => {
    const base = sacola([item("0001", { quantidade: 3 })]);
    const primeira = esperarOk(aplicarConferencia([conf("0001", "esgotado")])(base, AGORA));
    expect(primeira.sacola.itens).toHaveLength(1);
    expect(primeira.sacola.itens[0]!.quantidade).toBe(3);

    const segunda = esperarOk(aplicarConferencia([conf("0001", "ok")])(primeira.sacola, AGORA + 1000));
    expect(segunda.sacola.itens).toHaveLength(1);
    expect(segunda.sacola.itens[0]!.quantidade).toBe(3);
  });
});

describe("estaNaSacola e cheia", () => {
  it("estaNaSacola compara o código como texto exato", () => {
    const s = sacola([item("0042")]);
    expect(estaNaSacola(s, "0042")).toBe(true);
    expect(estaNaSacola(s, "42")).toBe(false);
    expect(estaNaSacola(s, "0043")).toBe(false);
    expect(estaNaSacola(sacola(), "0042")).toBe(false);
  });

  it("cheia: 15 itens => true, 14 => false, vazia => false", () => {
    expect(cheia(cheiaCom(15))).toBe(true);
    expect(cheia(cheiaCom(14))).toBe(false);
    expect(cheia(sacola())).toBe(false);
  });
});

describe("imutabilidade da entrada", () => {
  it("nenhuma operação muta a sacola, a lista nem os itens (Object.freeze profundo)", () => {
    const entrada = () =>
      congelar(sacola([item("0001", { quantidade: 2 }), item("0002", { precoVisto: null })]));
    const ops = [
      adicionar({ codigo: "0003", precoCentavos: 100, aPartirDe: false }),
      adicionar({ codigo: "0001", precoCentavos: 100, aPartirDe: false }),
      mudarQuantidade("0001", 5),
      mudarQuantidade("0001", 11),
      remover("0001"),
      remover("0099"),
      limpar(),
      aplicarConferencia([
        { codigo: "0001", estado: "inexistente" },
        conf("0002", "ok", { precoCentavos: 300, aPartirDe: true }),
      ]),
    ];
    for (const op of ops) {
      const s = entrada();
      const antes = JSON.stringify(s);
      expect(() => op(s, AGORA)).not.toThrow();
      expect(JSON.stringify(s)).toBe(antes);
    }
  });
});
