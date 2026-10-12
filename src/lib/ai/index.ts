import "server-only";

// Única porta da IA (contracts/ia.md §1): importada só por src/lib/produtos/sugestao.ts
// (src/test/conformance/ia-acesso.test.ts).
export {
  type CategoriaSugestao,
  type FalhaIa,
  type ImagemSugestao,
  pedirSugestao,
  type ResultadoPedido,
  type SugestaoBruta,
} from "./sugestao";
export { LIMITE_POR_PESSOA, LIMITE_TOTAL } from "./config";
