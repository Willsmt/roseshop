import type { MotivoNome } from "./nome";

// Textos pt-BR mostrados às administradoras (FR-017, contrato §3). O texto do banco
// nunca chega aqui: cada falha vira um motivo e o motivo vira uma destas frases.

export type { MotivoNome };

export type Motivo =
  | MotivoNome
  | "nome_repetido"
  | "nao_existe"
  | "alterada"
  | "tem_produtos"
  | "ultima"
  | "falha_geral";

export type DadosMensagem = { nome?: string; quantidade?: number };

const TEXTOS: Record<Motivo, (d: DadosMensagem) => string> = {
  nome_vazio: () => "Escreva um nome para a categoria.",
  nome_tamanho: () => "O nome precisa ter de 2 a 40 letras.",
  nome_caracteres: () => "Use só letras, números, espaço e hífen.",
  nome_sem_letra: () => "O nome precisa ter pelo menos uma letra ou número.",
  nome_repetido: (d) => `Já existe uma categoria chamada ${d.nome ?? ""}. Escolha outro nome.`,
  nao_existe: () => "Esta categoria não existe mais. Atualize a lista.",
  alterada: () =>
    "Esta categoria foi alterada por outra pessoa. Atualize a lista e tente de novo.",
  tem_produtos: ({ quantidade }) =>
    quantidade === 1
      ? "Esta categoria tem 1 produto. Mova esse produto para outra categoria e tente remover de novo."
      : `Esta categoria tem ${quantidade ?? 0} produtos. Mova esses produtos para outra categoria e tente remover de novo.`,
  ultima: () => "A loja precisa ter pelo menos uma categoria. Crie outra antes de remover esta.",
  falha_geral: () => "Não foi possível concluir agora. Tente de novo em instantes.",
};

export function mensagem(motivo: Motivo, dados: DadosMensagem = {}): string {
  return TEXTOS[motivo](dados);
}
