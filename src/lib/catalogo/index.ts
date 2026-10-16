import "server-only";

// Única porta de entrada do catálogo para páginas e rotas (contracts/publico.md §6). Componentes
// cliente não importam daqui: recebem dados prontos e usam `exibicao.ts`, que é puro.
export { configCatalogo, type ConfigCatalogo } from "./config";
export { codificarCursor, lerCursor } from "./cursor";
export {
  BancoIndisponivel,
  type BlocoLista,
  type CategoriaFiltro,
  type FotoPublica,
  type ItemConferencia,
  lerBloco,
  lerConferencia,
  lerFoto,
  lerProduto,
  lerVitrine,
  type ProdutoCartao,
  type ProdutoConferido,
  type ProdutoPublico,
  type Vitrine,
} from "./leitura";
export {
  type CausaFalha,
  type EventoFalha,
  type Falha,
  marcarCausaBanco,
  registrarFalha,
  type RotaFalha,
} from "./registro";
export { validarSlug } from "./slug";
