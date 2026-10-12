import { describe, expect, it } from "vitest";

// Feature 004, T132 (SF13): módulo puro que monta ia-medicao/resultado.md da medição manual da IA.
// Unitário, sem rede nem arquivos. Consumidor: medicao.ia.test.ts.

import { type LinhaMedicao, celula, montarResultadoMd } from "./medicao-relatorio";

const CABECALHO =
  "# Medição da sugestão por IA (T132)\n" +
  "\n" +
  'Gerado em 2026-10-12. Preencha a coluna "inventa?" com "sim" ou "não": a descrição afirma algo que a foto não mostra (tamanho, material, medida…)?\n' +
  "\n" +
  "| Produto | Modelo | Esforço | Categoria esperada | Categoria sugerida | Nome | Descrição | inventa? |\n" +
  "|---|---|---|---|---|---|---|---|\n";

const ok = (extra: Partial<Extract<LinhaMedicao["resultado"], { ok: true }>> = {}, resto: Partial<LinhaMedicao> = {}): LinhaMedicao => ({
  produto: "bolsa-01",
  modelo: "gpt-5.4-mini",
  esforco: "none",
  rodada: 1,
  esperada: "Bolsas",
  resultado: { ok: true, sugerida: "Bolsas", nome: "Bolsa de palha", descricao: "Bolsa bege.", ...extra },
  ...resto,
});
const o = (rodadas = 1) => ({ data: "2026-10-12", rodadas });

describe("celula", () => {
  it("null ⇒ travessão", () => expect(celula(null)).toBe("—"));
  it("só espaços ou vazio ⇒ travessão", () => {
    expect(celula("   ")).toBe("—");
    expect(celula("")).toBe("—");
    expect(celula(" \n ")).toBe("—");
  });
  it("faz trim", () => expect(celula("  oi  ")).toBe("oi"));
  it('escapa "|" como "\\|"', () => expect(celula("a|b||c")).toBe("a\\|b\\|\\|c"));
  it("quebras de linha (\\n e \\r\\n) viram <br>", () => {
    expect(celula("a\nb")).toBe("a<br>b");
    expect(celula("a\r\nb\r\nc")).toBe("a<br>b<br>c");
  });
  it("CR sozinho (quebra do Mac antigo) vira <br>", () => {
    expect(celula("a\rb")).toBe("a<br>b");
  });
  it("quebras mistas: CRLF conta como UM <br>", () => {
    expect(celula("a\r\nb\rc\nd")).toBe("a<br>b<br>c<br>d");
  });
  it("texto longo nunca é cortado", () => {
    const longo = "x".repeat(2000);
    expect(celula(longo)).toBe(longo);
  });
});

describe("montarResultadoMd", () => {
  it("lista vazia: só cabeçalho e separador, terminando em \\n", () => {
    expect(montarResultadoMd([], o())).toBe(CABECALHO);
  });

  it("linha ok: células na ordem e última célula 'inventa?' vazia (termina em '|  |')", () => {
    const md = montarResultadoMd([ok()], o());
    expect(md).toBe(CABECALHO + "| bolsa-01 | gpt-5.4-mini | none | Bolsas | Bolsas | Bolsa de palha | Bolsa bege. |  |\n");
    expect(md.endsWith("|  |\n")).toBe(true);
  });

  it("categoria sugerida null ⇒ 'vazia'", () => {
    const md = montarResultadoMd([ok({ sugerida: null })], o());
    expect(md).toContain("| Bolsas | vazia | Bolsa de palha |");
  });

  it("nome ou descrição null (resultado ok) ⇒ travessão", () => {
    const md = montarResultadoMd([ok({ nome: null, descricao: null })], o());
    expect(md).toContain("| Bolsas | Bolsas | — | — |  |");
  });

  it("falha ⇒ 'FALHA <falha>' na sugerida e travessão em nome e descrição", () => {
    const linha: LinhaMedicao = { ...ok(), resultado: { ok: false, falha: "ia_indisponivel" } };
    expect(montarResultadoMd([linha], o())).toBe(
      CABECALHO + "| bolsa-01 | gpt-5.4-mini | none | Bolsas | FALHA ia_indisponivel | — | — |  |\n",
    );
  });

  it("pipe e quebra de linha no conteúdo são escapados (a tabela não quebra)", () => {
    const md = montarResultadoMd([ok({ nome: "A|B", descricao: "linha 1\nlinha 2\r\nlinha 3 | fim" })], o());
    const linha = md.slice(CABECALHO.length);
    expect(linha).toContain("A\\|B");
    expect(linha).toContain("linha 1<br>linha 2<br>linha 3 \\| fim");
    expect(linha.trimEnd().split("\n")).toHaveLength(1);
  });

  it("falha com pipe/quebra também é escapada", () => {
    const linha: LinhaMedicao = { ...ok(), resultado: { ok: false, falha: "a|b\nc" } };
    expect(montarResultadoMd([linha], o())).toContain("FALHA a\\|b<br>c");
  });

  it("descrição de 600+ caracteres sai inteira", () => {
    const desc = "d".repeat(650);
    const md = montarResultadoMd([ok({ descricao: desc })], o());
    expect(md).toContain(`| ${desc} |  |\n`);
  });

  it("rodadas = 1: produto sem sufixo; rodadas > 1: '<produto> (rodada N)'", () => {
    expect(montarResultadoMd([ok()], o(1))).toContain("| bolsa-01 | gpt-5.4-mini");
    expect(montarResultadoMd([ok()], o(1))).not.toContain("rodada");
    const md = montarResultadoMd([ok({}, { rodada: 1 }), ok({}, { rodada: 2 })], o(2));
    expect(md).toContain("| bolsa-01 (rodada 1) | gpt-5.4-mini");
    expect(md).toContain("| bolsa-01 (rodada 2) | gpt-5.4-mini");
  });

  describe("ordenação por produto", () => {
    const l = (produto: string, modelo: string, esforco: string, rodada = 1) =>
      ok({}, { produto, modelo, esforco, rodada });
    const ordem = (md: string) =>
      md
        .slice(CABECALHO.length)
        .trimEnd()
        .split("\n")
        .map((x) => x.split(" | ").slice(0, 3).join("/").replace("| ", ""));

    it("agrupa por produto; dentro do produto mantém a ordem recebida (estável)", () => {
      const md = montarResultadoMd(
        [l("A", "luna", "none"), l("B", "luna", "none"), l("A", "luna", "low"), l("B", "luna", "low"), l("A", "mini", "none")],
        o(),
      );
      expect(ordem(md)).toEqual(["A/luna/none", "A/luna/low", "A/mini/none", "B/luna/none", "B/luna/low"]);
    });

    it("produtos na ordem da primeira ocorrência, não alfabética", () => {
      const md = montarResultadoMd([l("z", "m", "none"), l("a", "m", "none"), l("z", "m", "low")], o());
      expect(ordem(md)).toEqual(["z/m/none", "z/m/low", "a/m/none"]);
    });

    it("produto que só aparece mais tarde entra depois dos que apareceram antes", () => {
      const md = montarResultadoMd(
        [l("A", "luna", "none"), l("B", "luna", "none"), l("A", "mini", "none"), l("B", "mini", "none"), l("C", "mini", "none")],
        o(),
      );
      expect(ordem(md)).toEqual(["A/luna/none", "A/mini/none", "B/luna/none", "B/mini/none", "C/mini/none"]);
    });

    it("com rodadas 2, a rodada 1 vem antes da 2 do mesmo candidato", () => {
      const md = montarResultadoMd(
        [l("A", "luna", "none", 1), l("B", "luna", "none", 1), l("A", "luna", "none", 2), l("B", "luna", "none", 2)],
        o(2),
      );
      const linhas = md.slice(CABECALHO.length).trimEnd().split("\n");
      expect(linhas.map((x) => x.split(" | ")[0])).toEqual([
        "| A (rodada 1)",
        "| A (rodada 2)",
        "| B (rodada 1)",
        "| B (rodada 2)",
      ]);
    });

    it("não muta a lista recebida", () => {
      const entrada = [l("A", "luna", "none"), l("B", "luna", "none"), l("A", "luna", "low")];
      const copia = [...entrada];
      montarResultadoMd(entrada, o());
      expect(entrada).toEqual(copia);
      expect(entrada.every((x, i) => x === copia[i])).toBe(true);
    });
  });

  it("termina com exatamente uma quebra de linha", () => {
    const md = montarResultadoMd([ok(), ok()], o());
    expect(md.endsWith("|  |\n")).toBe(true);
    expect(md.endsWith("\n\n")).toBe(false);
  });

  it("usa a data recebida no cabeçalho", () => {
    expect(montarResultadoMd([], { data: "2027-01-02", rodadas: 1 })).toContain("Gerado em 2027-01-02. ");
  });
});
