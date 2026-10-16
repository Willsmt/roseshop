// Textos das telas públicas do catálogo (contracts/telas.md). Sem dependências.
// Os do bloco "contrato" estão na spec da 005 e nos testes; os do bloco "identidade" são da
// direção Janela (design/DIRECOES.md) e não substituem nenhum texto de contrato.
export const textos = {
	// Contrato (005).
	nomeSite: "Roseshop",
	voltarAoCatalogo: "Voltar ao catálogo",
	verOCatalogo: "Ver o catálogo",
	fotos: "Fotos",
	descricao: "Descrição",
	esgotado: "Esgotado",
	perguntarNoWhatsapp: "Perguntar no WhatsApp",
	naoEncontrado: "Produto não encontrado",
	erroTitulo: "Não foi possível carregar agora",
	erroTexto: "Tente de novo em instantes.",
	tentarDeNovo: "Tentar de novo",
	destaques: "Destaques",
	produtos: "Produtos",
	semFoto: "Sem foto",
	filtrarPorCategoria: "Filtrar por categoria",
	todas: "Todas",
	mostrandoTodos: "Mostrando todos os produtos",
	mostrandoDe: "Mostrando produtos de",
	carregarMais: "Carregar mais",
	carregandoMais: "Carregando…",
	erroCarregarMais: "Não foi possível carregar mais produtos.",
	semProdutos: "Ainda não há produtos.",

	// Identidade (Janela).
	inicio: "Roseshop, página inicial",
	chamada: "Coisas para a casa e para o dia a dia, escolhidas pela Rose.",
	destaquesChamada: "Os que a Rose separou para você.",
	produtosChamada: "Escolha uma categoria ou veja tudo.",
	rodape: "Escolha com calma. O pedido vai pelo WhatsApp, direto para a Rose.",
	naoEncontradoTexto: "Este produto saiu do catálogo ou o endereço mudou.",
	fotoDe: (n: number, total: number) => `Ver foto ${n} de ${total}`,
} as const;
