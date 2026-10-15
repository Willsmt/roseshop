import "server-only";

// Única porta de entrada do catálogo para páginas e rotas (contracts/publico.md §6). Componentes
// cliente não importam daqui: recebem dados prontos e usam `exibicao.ts`, que é puro.
export { configCatalogo, type ConfigCatalogo } from "./config";
export { codificarCursor, lerCursor } from "./cursor";
export {
  type BlocoLista,
  type CategoriaFiltro,
  type FotoPublica,
  lerBloco,
  lerFoto,
  lerProduto,
  lerVitrine,
  type ProdutoCartao,
  type ProdutoPublico,
  type Vitrine,
} from "./leitura";
export { type CausaFalha, type Falha, marcarCausaBanco, registrarFalha } from "./registro";
export { validarSlug } from "./slug";
