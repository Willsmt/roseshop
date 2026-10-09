import type { FormatoImagem } from "./verificacao";

// Chave do objeto: `fotos/<uuid v4>.<webp|jpg>` (ADR-009 D2). O nome do arquivo segue a
// mesma regex da rota de exibição e do CHECK de produto_fotos (contracts/fotos.md §5).
export const ARQUIVO_VALIDO =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(webp|jpg)$/;

const PREFIXO = "fotos/";

export function chaveDoEnvio(id: string, formato: FormatoImagem): string {
  const arquivo = `${id}.${formato === "webp" ? "webp" : "jpg"}`;
  if (!ARQUIVO_VALIDO.test(arquivo)) throw new Error("Id de envio inválido");
  return PREFIXO + arquivo;
}

export function chaveDoArquivo(arquivo: string): string | null {
  return ARQUIVO_VALIDO.test(arquivo) ? PREFIXO + arquivo : null;
}

export function arquivoDaChave(chave: string): string | null {
  if (!chave.startsWith(PREFIXO)) return null;
  const arquivo = chave.slice(PREFIXO.length);
  return ARQUIVO_VALIDO.test(arquivo) ? arquivo : null;
}
