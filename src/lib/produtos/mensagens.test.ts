import { describe, expect, it } from "vitest";

import { type Motivo, mensagemDoMotivo } from "./mensagens";

// T015 / contrato §6.

const TEXTOS: Record<Motivo, string> = {
  nome_vazio: "Escreva o nome do produto.",
  nome_tamanho: "O nome precisa ter de 3 a 80 letras.",
  nome_invalido: "Use letras ou números no nome.",
  nome_repetido: "Já existe um produto com esse nome.",
  categoria_obrigatoria: "Escolha uma categoria.",
  categoria_invalida: "Essa categoria não existe mais. Escolha outra.",
  descricao_tamanho: "A descrição pode ter até 1000 letras.",
  preco_invalido: "Escreva o preço assim: 12,90.",
  preco_ambiguo: "Não deu para entender o preço. Escreva assim: 1.290,00 ou 12,90.",
  a_partir_de_sem_preco: 'Para usar "a partir de", escreva o preço ou desmarque a opção.',
  nao_existe: "Este produto não existe mais.",
  alterado:
    "Outra pessoa mudou este produto agora há pouco. Recarregue a página para ver como ele está e faça de novo.",
  limite_destaques: "Já existem 8 produtos em destaque. Tire um do destaque antes de destacar outro.",
  vaga_disputada: "Outra pessoa destacou um produto ao mesmo tempo. Tente de novo.",
  esgotado_nao_destaca: "Produto esgotado não pode ficar em destaque.",
  ja_em_destaque: "Este produto já está em destaque.",
  sem_foto: "Coloque pelo menos 1 foto do produto.",
  foto_expirada: "Uma das fotos expirou. Envie de novo.",
  falha_geral: "Não foi possível concluir agora. Tente de novo em instantes.",
};

describe("mensagemDoMotivo (contrato §6)", () => {
  it.each(Object.entries(TEXTOS) as [Motivo, string][])("%s ⇒ texto do contrato", (motivo, texto) => {
    expect(mensagemDoMotivo(motivo)).toBe(texto);
  });

  it("nome_repetido com código existente traz o código formatado", () => {
    expect(mensagemDoMotivo("nome_repetido", { codigoExistente: 42 })).toBe(
      "Já existe um produto com esse nome: #0042.",
    );
    expect(mensagemDoMotivo("nome_repetido", { codigoExistente: 12345 })).toBe(
      "Já existe um produto com esse nome: #12345.",
    );
  });

  it("nome_repetido sem código usa a variante sem código", () => {
    expect(mensagemDoMotivo("nome_repetido", {})).toBe("Já existe um produto com esse nome.");
  });

  it("nenhuma mensagem vaza jargão técnico", () => {
    for (const texto of Object.values(TEXTOS)) {
      expect(texto).not.toMatch(/sql|23505|23503|constraint|erro interno|undefined/i);
    }
  });
});
