import { describe, expect, it } from "vitest";
import { NOME_MAX, ORCAMENTO_URL, montarPedido, restanteObservacao } from "./mensagem";
import { contarCaracteres, normalizarObservacao } from "./observacao";
import type { LinhaPedido } from "./total";

// Feature 006, SF2, T019 (SC-002, FR-016, research D3 e §4): pior caso fixo, propriedade com
// semente fixa e corte por code point.

type Entrada = { numero: string; linhas: LinhaPedido[]; observacao: string };

function textoDaUrl(url: string): string {
  return decodeURIComponent(url.slice(url.indexOf("?text=") + "?text=".length));
}

function nomesDoTexto(texto: string): string[] {
  return texto
    .split("\n")
    .filter((l) => /^\d+x /.test(l))
    .map((l) => l.replace(/^\d+x /, "").replace(/ ?\(#\d+\) — .*$/, ""));
}

// 40 code points acentuados, com emoji de ZWJ (👩‍👩‍👧) e com U+FE0F (❤️).
const NOME_PIOR = Array.from("Calça ❤️ 👩‍👩‍👧 Ação Pão çãõ éíú ".repeat(3)).slice(0, NOME_MAX).join("");

function piorCaso(): Omit<Entrada, "observacao"> {
  return {
    numero: "+" + "9".repeat(15),
    linhas: Array.from({ length: 15 }, (_, i) => ({
      quantidade: 10,
      nome: NOME_PIOR,
      codigo: String(2147483647 - i),
      precoCentavos: 9_999_999,
      aPartirDe: true,
    })),
  };
}

// Maior observação com acento, emoji e quebras que ainda cabe (restanteObservacao >= 0).
function observacaoNoLimite(base: Omit<Entrada, "observacao">): string {
  const pedacos = ["Entregar à tarde 😀", "\n", "Ação", "❤️", "é", " ", "👩‍👩‍👧", "\nçã"];
  let obs = "";
  for (let i = 0; ; i++) {
    const proxima = obs + pedacos[i % pedacos.length];
    if (restanteObservacao({ ...base, observacao: proxima }) < 0) break;
    obs = proxima;
  }
  // Fecha com "é" até a fronteira exata.
  while (restanteObservacao({ ...base, observacao: obs + "é" }) >= 0) obs += "é";
  return obs;
}

describe("pior caso fixo (SC-002)", () => {
  const base = piorCaso();
  const observacao = observacaoNoLimite(base);

  it("o nome do pior caso tem 40 code points, acento, ZWJ e U+FE0F", () => {
    expect(contarCaracteres(NOME_PIOR)).toBe(40);
    expect(NOME_PIOR).toContain("\u200D");
    expect(NOME_PIOR).toContain("\uFE0F");
    expect(NOME_PIOR).toMatch(/[çãé]/);
  });

  it("a observação está na fronteira de restanteObservacao, com acento, emoji e quebra", () => {
    expect(restanteObservacao({ ...base, observacao })).toBeGreaterThanOrEqual(0);
    expect(restanteObservacao({ ...base, observacao: observacao + "é" })).toBeLessThan(0);
    expect(observacao).toContain("\n");
    expect(observacao).toMatch(/[àçãé]/);
    expect(observacao).toContain("😀");
  });

  it('=> tipo "ok" e url.length <= 1800', () => {
    const r = montarPedido({ ...base, observacao });
    expect(r.tipo).toBe("ok");
    if (r.tipo !== "ok") return;
    expect(r.url.length).toBeLessThanOrEqual(ORCAMENTO_URL);
    expect(textoDaUrl(r.url)).toBe(r.texto);
  });

  it("nomes encolhem antes da observação: a observação sai inteira e os nomes mais curtos que 40", () => {
    const r = montarPedido({ ...base, observacao });
    if (r.tipo !== "ok") throw new Error("esperava ok");
    expect(r.texto.endsWith(`Observação:\n${normalizarObservacao(observacao)}`)).toBe(true);
    const nomes = nomesDoTexto(r.texto);
    expect(nomes).toHaveLength(15);
    for (const n of nomes) expect(contarCaracteres(n)).toBeLessThan(NOME_MAX);
    // Por igual: todos os nomes iguais saem com o mesmo corte.
    expect(new Set(nomes).size).toBe(1);
  });

  it("um caractere a mais na observação => excede", () => {
    const r = montarPedido({ ...base, observacao: observacao + "é" });
    expect(r.tipo).toBe("excede");
    if (r.tipo === "excede") expect(r.excesso).toBeGreaterThan(0);
  });

  it("sem observação, o pior caso cabe com nomes maiores", () => {
    const r = montarPedido({ ...base, observacao: "" });
    if (r.tipo !== "ok") throw new Error("esperava ok");
    expect(r.url.length).toBeLessThanOrEqual(ORCAMENTO_URL);
    const [n] = nomesDoTexto(r.texto);
    expect(contarCaracteres(n!)).toBeGreaterThan(0);
  });
});

// mulberry32: gerador determinístico, sem dependência nova.
function gerador(semente: number): () => number {
  let a = semente >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PECAS = ["a", "Z", " ", "é", "ç", "ã", "&", "#", "?", "+", "%", "😀", "👩‍👩‍👧", "❤️", "🇧🇷", "\n", "\r\n", "\u200B", "e\u0301"];

describe("propriedade com semente fixa (FR-016)", () => {
  const rnd = gerador(20261016);
  const int = (min: number, max: number) => min + Math.floor(rnd() * (max - min + 1));
  const texto = (max: number) => Array.from({ length: int(0, max) }, () => PECAS[int(0, PECAS.length - 1)]).join("");
  const codigo = () => {
    const digitos = int(4, 10);
    const max = digitos === 10 ? 2147483647 : 10 ** digitos - 1;
    return String(int(10 ** (digitos - 1), max)).padStart(digitos, "0");
  };

  const casos: Entrada[] = Array.from({ length: 2000 }, () => ({
    numero: "+" + Array.from({ length: int(10, 15) }, () => int(0, 9)).join(""),
    linhas: Array.from({ length: int(1, 15) }, () => ({
      quantidade: int(1, 10),
      nome: texto(60).replace(/[\r\n]/g, " "),
      codigo: codigo(),
      precoCentavos: rnd() < 0.2 ? null : int(1, 9_999_999),
      aPartirDe: rnd() < 0.5,
    })),
    observacao: texto(rnd() < 0.5 ? 60 : 260),
  }));

  it("sempre ok com url.length <= 1800, ou excede exatamente quando a observação passa do restante", () => {
    let oks = 0;
    let excedes = 0;
    for (const e of casos) {
      const restante = restanteObservacao(e);
      const r = montarPedido(e);
      if (restante >= 0) {
        expect(r.tipo).toBe("ok");
        if (r.tipo !== "ok") continue;
        oks++;
        expect(r.url.length).toBeLessThanOrEqual(ORCAMENTO_URL);
        expect(r.url.isWellFormed()).toBe(true);
        expect(textoDaUrl(r.url)).toBe(r.texto);
        const obs = normalizarObservacao(e.observacao);
        if (obs !== "") expect(r.texto.endsWith(`\n\nObservação:\n${obs}`)).toBe(true);
        for (const n of nomesDoTexto(r.texto)) expect(contarCaracteres(n)).toBeLessThanOrEqual(NOME_MAX);
      } else {
        excedes++;
        expect(r).toEqual({ tipo: "excede", excesso: -restante });
      }
    }
    // O gerador cobre os dois lados.
    expect(oks).toBeGreaterThan(100);
    expect(excedes).toBeGreaterThan(100);
  });
});

describe("corte por code point", () => {
  it("emoji exatamente na fronteira dos 40 não vira surrogate solto", () => {
    const nome = "a".repeat(39) + "😀" + "fim"; // o 40º code point é o emoji
    const r = montarPedido({
      numero: "+5511999998888",
      linhas: [{ quantidade: 1, nome, codigo: "0042", precoCentavos: 600, aPartirDe: false }],
      observacao: "",
    });
    if (r.tipo !== "ok") throw new Error("esperava ok");
    expect(r.texto).toContain(`1x ${"a".repeat(39)}😀 (#0042)`);
    expect(r.texto.isWellFormed()).toBe(true);
    expect(() => textoDaUrl(r.url)).not.toThrow();
  });

  it("nomes só de emoji encolhidos pela busca nunca deixam surrogate solto", () => {
    const base = piorCaso();
    const linhas = base.linhas.map((l) => ({ ...l, nome: "😀👩‍👩‍👧❤️🇧🇷".repeat(10) }));
    for (let k = 0; k <= 41; k++) {
      const r = montarPedido({ numero: base.numero, linhas, observacao: "😀".repeat(k) });
      if (r.tipo !== "ok") continue;
      expect(r.texto.isWellFormed()).toBe(true);
      expect(() => textoDaUrl(r.url)).not.toThrow();
      expect(r.url.length).toBeLessThanOrEqual(ORCAMENTO_URL);
    }
  });
});
