import "server-only";

// Única porta de entrada do R2 para actions e rotas (contracts/fotos.md §7).
export { assinarEnvio, type EnvioAssinado } from "./assinatura";
export {
  apagarObjetos,
  lerObjeto,
  listarObjetos,
  type ObjetoLido,
  type ObjetoServido,
  servirObjeto,
} from "./bucket";
export { ARQUIVO_VALIDO, arquivoDaChave, chaveDoArquivo, chaveDoEnvio } from "./chaves";
export { configR2, type ConfigR2 } from "./config";
export * from "./verificacao";
