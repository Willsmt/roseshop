import { formatarCodigo } from "./codigo";

// Textos pt-BR mostrados às administradoras (contrato §6). O texto do banco nunca chega
// aqui: cada falha vira um motivo e o motivo vira uma destas frases.

export type Motivo =
  | "nome_vazio"
  | "nome_tamanho"
  | "nome_invalido"
  | "nome_repetido"
  | "categoria_obrigatoria"
  | "categoria_invalida"
  | "descricao_tamanho"
  | "preco_invalido"
  | "preco_ambiguo"
  | "a_partir_de_sem_preco"
  | "nao_existe"
  | "alterado"
  | "limite_destaques"
  | "vaga_disputada"
  | "esgotado_nao_destaca"
  | "ja_em_destaque"
  | "falha_geral";

export type DadosMensagem = { codigoExistente?: number };

const TEXTOS: Record<Motivo, (d: DadosMensagem) => string> = {
  nome_vazio: () => "Escreva o nome do produto.",
  nome_tamanho: () => "O nome precisa ter de 3 a 80 letras.",
  nome_invalido: () => "Use letras ou números no nome.",
  nome_repetido: ({ codigoExistente }) =>
    codigoExistente === undefined
      ? "Já existe um produto com esse nome."
      : `Já existe um produto com esse nome: ${formatarCodigo(codigoExistente)}.`,
  categoria_obrigatoria: () => "Escolha uma categoria.",
  categoria_invalida: () => "Essa categoria não existe mais. Escolha outra.",
  descricao_tamanho: () => "A descrição pode ter até 1000 letras.",
  preco_invalido: () => "Escreva o preço assim: 12,90.",
  preco_ambiguo: () => "Não deu para entender o preço. Escreva assim: 1.290,00 ou 12,90.",
  a_partir_de_sem_preco: () =>
    'Para usar "a partir de", escreva o preço ou desmarque a opção.',
  nao_existe: () => "Este produto não existe mais.",
  alterado: () =>
    "Outra pessoa mudou este produto agora há pouco. Recarregue a página para ver como ele está e faça de novo.",
  limite_destaques: () =>
    "Já existem 8 produtos em destaque. Tire um do destaque antes de destacar outro.",
  vaga_disputada: () => "Outra pessoa destacou um produto ao mesmo tempo. Tente de novo.",
  esgotado_nao_destaca: () => "Produto esgotado não pode ficar em destaque.",
  ja_em_destaque: () => "Este produto já está em destaque.",
  falha_geral: () => "Não foi possível concluir agora. Tente de novo em instantes.",
};

export function mensagemDoMotivo(motivo: Motivo, dados: DadosMensagem = {}): string {
  return TEXTOS[motivo](dados);
}
