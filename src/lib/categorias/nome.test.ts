import { describe, expect, it } from "vitest";

import { idCategoria, normalizarNome, validarNome, versaoCategoria } from "./nome";

describe("normalizarNome (FR-007)", () => {
  it("trim e colapso de espaços (US2-4)", () => {
    expect(normalizarNome("  Bolsas   de   Praia  ")).toBe("Bolsas de Praia");
  });

  it("converte NFD para NFC", () => {
    const nfd = "Café";
    expect(nfd).not.toBe("Café");
    expect(normalizarNome(nfd)).toBe("Café");
    expect(normalizarNome(nfd).normalize("NFC")).toBe(normalizarNome(nfd));
  });

  it("tab e quebra de linha internos colapsam em um espaço", () => {
    expect(normalizarNome("Bolsas\t\nde \r\n Praia")).toBe("Bolsas de Praia");
  });
});

describe("validarNome: aceitos", () => {
  it("devolve o nome normalizado (US2-4)", () => {
    expect(validarNome("  Bolsas   de   Praia  ")).toEqual({ ok: true, nome: "Bolsas de Praia" });
  });

  it("NFD vira NFC no resultado", () => {
    expect(validarNome("Café")).toEqual({ ok: true, nome: "Café" });
  });

  it("preserva maiúsculas e acentos", () => {
    expect(validarNome("GUÁRDA-Chuvas")).toEqual({ ok: true, nome: "GUÁRDA-Chuvas" });
  });

  it("2 e 40 caracteres são aceitos (limites)", () => {
    expect(validarNome("Ab")).toEqual({ ok: true, nome: "Ab" });
    expect(validarNome("a".repeat(40))).toEqual({ ok: true, nome: "a".repeat(40) });
  });

  it("40 letras astrais (code points) aceitas; 41 recusadas", () => {
    expect(validarNome("𝐀".repeat(40))).toEqual({ ok: true, nome: "𝐀".repeat(40) });
    expect(validarNome("𝐀".repeat(41))).toEqual({ ok: false, motivo: "nome_tamanho" });
  });

  it.each(["Сумки", "包包", "Água"])("letras de outros alfabetos (%s)", (nome) => {
    expect(validarNome(nome)).toEqual({ ok: true, nome });
  });

  it('"A-" é aceito', () => {
    expect(validarNome("A-")).toEqual({ ok: true, nome: "A-" });
  });

  it("números contam como conteúdo (FR-008)", () => {
    expect(validarNome("2024")).toEqual({ ok: true, nome: "2024" });
  });
});

describe("validarNome: recusados", () => {
  it.each(["", "   ", "\t\n"])("vazio após normalizar (%j) ⇒ nome_vazio (US2-5)", (e) => {
    expect(validarNome(e)).toEqual({ ok: false, motivo: "nome_vazio" });
  });

  it.each([null, undefined, 5, {}, []])("não-string (%o) ⇒ nome_vazio", (e) => {
    expect(validarNome(e)).toEqual({ ok: false, motivo: "nome_vazio" });
  });

  it("1 caractere ⇒ nome_tamanho", () => {
    expect(validarNome("A")).toEqual({ ok: false, motivo: "nome_tamanho" });
  });

  it("41 caracteres ⇒ nome_tamanho", () => {
    expect(validarNome("a".repeat(41))).toEqual({ ok: false, motivo: "nome_tamanho" });
  });

  it("o tamanho é medido depois de normalizar", () => {
    expect(validarNome("  A  ")).toEqual({ ok: false, motivo: "nome_tamanho" });
  });

  it.each(["Bolsas!", "Meias 😀"])("caractere fora do conjunto (%s) ⇒ nome_caracteres", (e) => {
    expect(validarNome(e)).toEqual({ ok: false, motivo: "nome_caracteres" });
  });

  it.each(["--", "- -", "---"])("só hífen/espaço (%s) ⇒ nome_sem_letra", (e) => {
    expect(validarNome(e)).toEqual({ ok: false, motivo: "nome_sem_letra" });
  });

  it("caractere inválido tem precedência sobre ausência de letra", () => {
    expect(validarNome("--!")).toEqual({ ok: false, motivo: "nome_caracteres" });
  });
});

describe("idCategoria (decisão 2)", () => {
  it.each([
    ["3", 3],
    [3, 3],
    [2147483647, 2147483647],
    ["2147483647", 2147483647],
  ])("aceita %j ⇒ %d", (entrada, saida) => {
    expect(idCategoria.parse(entrada)).toBe(saida);
  });

  it.each([
    " 3",
    "1e2",
    "03",
    "99999999999",
    "0",
    0,
    -1,
    "-1",
    1.5,
    "abc",
    "",
    null,
    undefined,
    2147483648,
    "2147483648",
  ])("recusa %j", (entrada) => {
    expect(idCategoria.safeParse(entrada).success).toBe(false);
  });
});

describe("versaoCategoria", () => {
  it("aceita 1 e '1'", () => {
    expect(versaoCategoria.parse(1)).toBe(1);
    expect(versaoCategoria.parse("1")).toBe(1);
  });

  it.each([0, -1, 1.5, "abc", "03", null, undefined])("recusa %j", (entrada) => {
    expect(versaoCategoria.safeParse(entrada).success).toBe(false);
  });
});
