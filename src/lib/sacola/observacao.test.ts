import { describe, expect, it } from "vitest";
import { OBSERVACAO_MAX, contarCaracteres, normalizarObservacao } from "./observacao";

// Feature 006, SF1, T007 (FR-015a, research D2): única regra de normalização da observação.

const FAMILIA = "\u{1F469}\u200D\u{1F469}\u200D\u{1F467}"; // família de emoji = 5 code points

const TABELA: ReadonlyArray<readonly [string, string, string]> = [
  ["CRLF vira LF", "a\r\nb", "a\nb"],
  ["CR vira LF", "a\rb", "a\nb"],
  ["CRLF e CR misturados", "a\r\nb\rc", "a\nb\nc"],
  ["NFD vira NFC", "e\u0301", "é"],
  ["NFC permanece", "é", "é"],
  ["controle U+0000 removido", "a\u0000b", "ab"],
  ["controle U+0008 removido", "a\u0008b", "ab"],
  ["TAB (U+0009) removido pela faixa U+0000-U+0009", "a\u0009b", "ab"],
  ["controle U+000B removido", "a\u000Bb", "ab"],
  ["controle U+001F removido", "a\u001Fb", "ab"],
  ["DEL U+007F removido", "a\u007Fb", "ab"],
  ["controle C1 U+0085 removido", "a\u0085b", "ab"],
  ["controle C1 U+009F removido", "a\u009Fb", "ab"],
  ["LF preservado", "a\nb", "a\nb"],
  ["U+200B removido", "a\u200Bb", "ab"],
  ["U+200C removido", "a\u200Cb", "ab"],
  ["U+200E removido", "a\u200Eb", "ab"],
  ["U+200F removido", "a\u200Fb", "ab"],
  ["U+202A removido", "a\u202Ab", "ab"],
  ["U+202B removido", "a\u202Bb", "ab"],
  ["U+202C removido", "a\u202Cb", "ab"],
  ["U+202D removido", "a\u202Db", "ab"],
  ["U+202E removido", "a\u202Eb", "ab"],
  ["U+2060 removido", "a\u2060b", "ab"],
  ["U+2066 removido", "a\u2066b", "ab"],
  ["U+2067 removido", "a\u2067b", "ab"],
  ["U+2068 removido", "a\u2068b", "ab"],
  ["U+2069 removido", "a\u2069b", "ab"],
  ["U+FEFF removido", "a\uFEFFb", "ab"],
  ["U+200D (ZWJ) preservado", "a\u200Db", "a\u200Db"],
  ["U+FE0E preservado", "a\uFE0Eb", "a\uFE0Eb"],
  ["U+FE0F preservado", "a\uFE0Fb", "a\uFE0Fb"],
  ["emoji com ZWJ intacto", FAMILIA, FAMILIA],
  ["emoji com seletor de variação intacto", "❤\uFE0F", "❤\uFE0F"],
  ["espaços das pontas removidos", "   oi  ", "oi"],
  ["quebras nas pontas removidas", "\n\noi\n\n", "oi"],
  ["espaço do meio preservado", "a  b", "a  b"],
  ["quatro LF viram dois", "a\n\n\n\nb", "a\n\nb"],
  ["três LF viram dois", "a\n\n\nb", "a\n\nb"],
  ["dois LF permanecem", "a\n\nb", "a\n\nb"],
  ["CRLF em excesso colapsa depois da troca", "a\r\n\r\n\r\n\r\nb", "a\n\nb"],
  ["invisíveis entre quebras colapsam", "a\n\u200B\n\u200B\n\nb", "a\n\nb"],
  ["só espaços", "     ", ""],
  ["só invisíveis", "\u200B\u200C\uFEFF\u2060", ""],
  ["espaços e invisíveis", " \u200B \uFEFF \n ", ""],
  ["vazio", "", ""],
  ["surrogate alto sozinho removido", "a\uD83Db", "ab"],
  ["surrogate baixo sozinho removido", "a\uDE00b", "ab"],
  ["surrogate alto no fim removido", "oi\uD83D", "oi"],
  ["par invertido (baixo antes do alto) removido", "a\uDE00\uD83Db", "ab"],
  ["surrogate solto na ponta some antes do trim", "\uD83D  oi  \uDE00", "oi"],
  ["par válido preservado", "a\uD83D\uDE00b", "a\u{1F600}b"],
  ["surrogate solto ao lado de emoji com ZWJ preserva o emoji", `\uDC00${FAMILIA}\uD83D`, FAMILIA],
  ["surrogate solto ao lado de seletor de variação preserva o emoji", "\uD83D❤\uFE0F", "❤\uFE0F"],
];

describe("OBSERVACAO_MAX", () => {
  it("é 200", () => {
    expect(OBSERVACAO_MAX).toBe(200);
  });
});

describe("normalizarObservacao (FR-015a)", () => {
  it.each(TABELA)("%s", (_nome, entrada, esperado) => {
    expect(normalizarObservacao(entrada)).toBe(esperado);
  });

  it("é idempotente sobre toda a tabela (n(n(x)) === n(x))", () => {
    for (const [, entrada] of TABELA) {
      const uma = normalizarObservacao(entrada);
      expect(normalizarObservacao(uma)).toBe(uma);
    }
  });

  it("a saída é sempre bem formada (sem surrogate solto) e codificável na URL", () => {
    for (const [, entrada] of TABELA) {
      const saida = normalizarObservacao(entrada);
      expect(saida.isWellFormed()).toBe(true);
      expect(() => encodeURIComponent(saida)).not.toThrow();
    }
  });

  it("aplica a ordem da regra: NFC antes de remover, trim depois de remover invisíveis", () => {
    expect(normalizarObservacao("\u200B  e\u0301  \u200B")).toBe("é");
  });
});

describe("contarCaracteres", () => {
  it("conta code points, não unidades UTF-16 (família de emoji = 5)", () => {
    expect(contarCaracteres(FAMILIA)).toBe(5);
  });

  it('conta "á" NFC como 1', () => {
    expect(contarCaracteres("á")).toBe(1);
  });

  it("emoji simples fora do plano básico conta 1", () => {
    expect(contarCaracteres("\u{1F600}")).toBe(1);
  });

  it("texto vazio conta 0", () => {
    expect(contarCaracteres("")).toBe(0);
  });

  it("texto ASCII conta o comprimento", () => {
    expect(contarCaracteres("abc")).toBe(3);
  });
});
