import type { MotivoFoto } from "./tipos";

// Textos pt-BR das fotos (contracts/fotos.md §8). Sem imports de runtime (§1): seguro para o
// client e para o pipeline do aparelho. `nao_existe` e `falha_geral` repetem os textos da 003
// (src/lib/produtos/mensagens.ts); o teste confere que continuam iguais.

const TEXTOS: Record<MotivoFoto, string> = {
  formato: "Esse tipo de arquivo não é aceito. Use uma foto tirada pelo celular ou salva na galeria.",
  nao_abre: "Não conseguimos abrir essa foto neste aparelho. Tente usar 'Tirar foto' ou escolha outra.",
  grande: "Essa foto ficou grande demais. Tente de novo ou escolha outra.",
  pequena: "Essa foto está muito pequena. Escolha outra com mais qualidade.",
  nao_passou: "Não deu para usar essa foto. Tente de novo ou use 'Tirar foto'.",
  nao_enviada: "Não enviada",
  sem_foto: "Coloque pelo menos 1 foto do produto.",
  foto_expirada: "Uma das fotos expirou. Envie de novo.",
  alterado:
    "As fotos deste produto foram mudadas por outra pessoa. Veja como ficaram e faça de novo.",
  limite: "Este produto já tem 3 fotos. Remova ou troque uma para colocar outra.",
  ultima: "O produto precisa de pelo menos 1 foto.",
  nao_existe: "Este produto não existe mais.",
  falha_geral: "Não foi possível concluir agora. Tente de novo em instantes.",
  muitos_pendentes:
    "Você enviou muitas fotos sem salvar. Salve o produto que está cadastrando ou tente de novo amanhã.",
};

// 2ª recusa `nao_passou` seguida na mesma tela (US2-AC10): o estado é da tela.
const NAO_PASSOU_REPETIDA = "Essa foto não está passando. Escolha outra ou peça ajuda.";

export function mensagemFoto(motivo: MotivoFoto, opcoes: { repetida?: boolean } = {}): string {
  if (motivo === "nao_passou" && opcoes.repetida) return NAO_PASSOU_REPETIDA;
  return TEXTOS[motivo];
}

export const SUCESSO_FOTO = {
  adicionada: "Foto adicionada",
  trocada: "Foto trocada",
  removida: "Foto removida",
  ordem: "Ordem salva",
} as const;

export const CONFIRMAR_REMOCAO_FOTO = "Remover esta foto do produto? Ela será apagada.";
export const AVISO_REMOCAO_PRODUTO = "As fotos do produto também serão apagadas.";
