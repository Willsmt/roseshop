import { describe, expect, it } from "vitest";

import { type Motivo, mensagem } from "./mensagens";

describe("mensagem (FR-017, contrato §3)", () => {
  it.each([
    ["nome_vazio", "Escreva um nome para a categoria."],
    ["nome_tamanho", "O nome precisa ter de 2 a 40 letras."],
    ["nome_caracteres", "Use só letras, números, espaço e hífen."],
    ["nome_sem_letra", "O nome precisa ter pelo menos uma letra ou número."],
    ["nao_existe", "Esta categoria não existe mais. Atualize a lista."],
    [
      "alterada",
      "Esta categoria foi alterada por outra pessoa. Atualize a lista e tente de novo.",
    ],
    ["ultima", "A loja precisa ter pelo menos uma categoria. Crie outra antes de remover esta."],
    ["falha_geral", "Não foi possível concluir agora. Tente de novo em instantes."],
  ] as [Motivo, string][])("%s tem o texto exato", (motivo, texto) => {
    expect(mensagem(motivo)).toBe(texto);
  });

  it("nome_repetido cita o nome existente", () => {
    expect(mensagem("nome_repetido", { nome: "Bolsas" })).toBe("Já existe uma categoria chamada Bolsas. Escolha outro nome.");
  });

  it("tem_produtos no plural", () => {
    expect(mensagem("tem_produtos", { quantidade: 3 })).toBe(
      "Esta categoria tem 3 produtos. Mova esses produtos para outra categoria e tente remover de novo.",
    );
  });

  it("tem_produtos no singular (N = 1)", () => {
    const texto = mensagem("tem_produtos", { quantidade: 1 });
    expect(texto).toContain("tem 1 produto.");
    expect(texto).not.toContain("produtos");
  });

  it("nenhuma mensagem tem jargão técnico", () => {
    const motivos: Motivo[] = [
      "nome_vazio",
      "nome_tamanho",
      "nome_caracteres",
      "nome_sem_letra",
      "nome_repetido",
      "nao_existe",
      "alterada",
      "tem_produtos",
      "ultima",
      "falha_geral",
    ];
    for (const motivo of motivos) {
      const texto = mensagem(motivo, { nome: "Bolsas", quantidade: 3 });
      expect(texto).not.toMatch(/\b\d{5}\b/);
      expect(texto).not.toMatch(/SQL|erro|null|undefined|constraint|Postgres/i);
    }
  });
});
