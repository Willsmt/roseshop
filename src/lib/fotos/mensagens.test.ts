import { describe, expect, it } from "vitest";
import { mensagemDoMotivo } from "@/lib/produtos/mensagens";
import {
  AVISO_REMOCAO_PRODUTO,
  CONFIRMAR_REMOCAO_FOTO,
  SUCESSO_FOTO,
  mensagemFoto,
} from "./mensagens";

// Feature 004, T062: textos exatos de contracts/fotos.md §8.

describe("mensagemFoto", () => {
  it.each([
    ["formato", "Esse tipo de arquivo não é aceito. Use uma foto tirada pelo celular ou salva na galeria."],
    ["nao_abre", "Não conseguimos abrir essa foto neste aparelho. Tente usar 'Tirar foto' ou escolha outra."],
    ["grande", "Essa foto ficou grande demais. Tente de novo ou escolha outra."],
    ["pequena", "Essa foto está muito pequena. Escolha outra com mais qualidade."],
    ["nao_passou", "Não deu para usar essa foto. Tente de novo ou use 'Tirar foto'."],
    ["nao_enviada", "Não enviada"],
    ["sem_foto", "Coloque pelo menos 1 foto do produto."],
    ["foto_expirada", "Uma das fotos expirou. Envie de novo."],
    ["alterado", "As fotos deste produto foram mudadas por outra pessoa. Veja como ficaram e faça de novo."],
    ["limite", "Este produto já tem 3 fotos. Remova ou troque uma para colocar outra."],
    ["ultima", "O produto precisa de pelo menos 1 foto."],
    [
      "muitos_pendentes",
      "Você enviou muitas fotos sem salvar. Salve o produto que está cadastrando ou tente de novo amanhã.",
    ],
  ] as const)("%s", (motivo, texto) => {
    expect(mensagemFoto(motivo)).toBe(texto);
  });

  it("nao_passou repetida (2ª seguida, US2-AC10)", () => {
    expect(mensagemFoto("nao_passou", { repetida: true })).toBe(
      "Essa foto não está passando. Escolha outra ou peça ajuda.",
    );
  });

  it("repetida:false mantém a 1ª mensagem", () => {
    expect(mensagemFoto("nao_passou", { repetida: false })).toBe(mensagemFoto("nao_passou"));
  });

  it("nao_existe e falha_geral são os da 003", () => {
    expect(mensagemFoto("nao_existe")).toBe(mensagemDoMotivo("nao_existe"));
    expect(mensagemFoto("falha_geral")).toBe(mensagemDoMotivo("falha_geral"));
  });
});

describe("constantes", () => {
  it("SUCESSO_FOTO (FR-020)", () => {
    expect(SUCESSO_FOTO).toEqual({
      adicionada: "Foto adicionada",
      trocada: "Foto trocada",
      removida: "Foto removida",
      ordem: "Ordem salva",
    });
  });
  it("CONFIRMAR_REMOCAO_FOTO (US4-AC3)", () => {
    expect(CONFIRMAR_REMOCAO_FOTO).toBe("Remover esta foto do produto? Ela será apagada.");
  });
  it("AVISO_REMOCAO_PRODUTO (FR-035)", () => {
    expect(AVISO_REMOCAO_PRODUTO).toBe("As fotos do produto também serão apagadas.");
  });
});
