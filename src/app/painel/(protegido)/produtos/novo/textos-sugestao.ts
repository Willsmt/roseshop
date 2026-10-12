// Textos (contracts/ia.md §6) e tipo da sugestão. Arquivo sem dependências: o form também é usado
// na edição e importa daqui sem carregar a action da sugestão (FR-034).
export const ESPERANDO_SUGESTAO = "Preenchendo a partir das fotos…";
export const MARCADOR_SUGESTAO = "Sugestão — confira";

export type Sugestao = { nome: string | null; categoriaId: number | null; descricao: string | null };
