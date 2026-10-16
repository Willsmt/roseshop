// Textos da sacola: mensagem do pedido e telas (contracts/sacola.md §7, contracts/telas.md §1-§3).
// Sem dependências, como _catalogo/textos.ts.

function plural(n: number, um: string, varios: string): string {
  return n === 1 ? um : varios;
}

export const textos = {
  // Mensagem do pedido (research D3).
  cabecalhoPedido: "Olá! Quero fazer este pedido:",
  subtotal: "Subtotal:",
  observacao: "Observação:",
  aPartirDe: "a partir de",
  consulteOValor: "Consulte o valor",
  aConsultar: (n: number) => `+ ${n} ${plural(n, "item", "itens")} a consultar`,

  // Cabeçalho e detalhe (CT§1, CT§2).
  sacola: "Sacola",
  produtosNaSacola: (n: number) => `${n} ${plural(n, "produto", "produtos")}`,
  adicionarASacola: "Adicionar à sacola",
  naSacola: "Na sacola",
  limiteProdutos: "A sacola chegou ao limite de 15 produtos. Remova algum para adicionar outro.",
  falhaAoAdicionar: "Não foi possível adicionar agora.",

  // /sacola (CT§3).
  ativeJavascript: "Ative o JavaScript para usar a sacola.",
  verOCatalogo: "Ver o catálogo",
  armazenamentoIndisponivel:
    "Não foi possível abrir a sacola neste navegador. Você ainda pode perguntar por cada produto no WhatsApp.",
  sacolaVazia: "Sua sacola está vazia",
  conferindo: "Conferindo a sacola…",
  falhaAoAbrir: "Não foi possível conferir a sacola agora.",
  tentarDeNovo: "Tentar de novo",
  falhaNoEnvio: "Não consegui conferir agora, tente de novo.",
  enviado: "Seu pedido foi aberto no WhatsApp.",
  voltar: "Voltar",
  naoEstaMaisNoCatalogo: (codigo: string) => `O produto #${codigo} não está mais no catálogo.`,
  semFoto: "Sem foto",
  esgotado: "Esgotado",
  remover: "Remover",
  diminuirQuantidade: (nome: string) => `Diminuir quantidade de ${nome}`,
  aumentarQuantidade: (nome: string) => `Aumentar quantidade de ${nome}`,
  precoMudou: "O preço mudou desde que você adicionou.",
  rotuloObservacao: "Observação (opcional)",
  caracteresUsados: (n: number) => `${n} de 200`,
  espacoQuaseCheio: "Espaço da mensagem quase cheio",
  espacoUsado: "Espaço da mensagem usado",
  observacaoNaoCabe: "A observação não cabe mais na mensagem. Encurte para enviar.",
  limparSacola: "Limpar sacola",
  confirmarLimpar: "Todos os produtos vão sair da sacola.",
  limpar: "Limpar",
  cancelar: "Cancelar",
  enviarPedido: "Enviar pedido pelo WhatsApp",
  envioIndisponivel: "O envio pelo WhatsApp está indisponível no momento. Tente mais tarde.",
  todosEsgotados: "Todos os produtos da sacola estão esgotados.",

  // Anúncios (research D12).
  produtoRemovido: (subtotal: string) => `Produto removido. Subtotal: ${subtotal}`,
  sacolaFicouVazia: "Sacola vazia.",
} as const;
