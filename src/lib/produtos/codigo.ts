// Código de referência do produto = id com zeros à esquerda (research D2, contrato §4).

export function formatarCodigo(id: number): string {
  return `#${String(id).padStart(4, "0")}`;
}

// Texto de busca que casa `^#?\d{1,9}$` vira id; 0 não é id (identity começa em 1).
export function interpretarCodigoBusca(texto: string): number | null {
  if (!/^#?\d{1,9}$/.test(texto)) return null;
  const n = Number(texto.replace("#", ""));
  return n >= 1 ? n : null;
}
