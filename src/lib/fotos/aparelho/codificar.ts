import type { CanvasCodificavel } from "./suporta-webp";

// Codificação da foto recortada (FR-013, SC-005, research D4): WebP ou JPEG, qualidade
// decrescente até caber no teto de 1 MB do envio (FR-014).

export const TETO_BYTES = 1_048_576;

export type FormatoSaida = "webp" | "jpeg";

export const QUALIDADES: Record<FormatoSaida, readonly number[]> = {
  webp: [0.82, 0.72, 0.62],
  jpeg: [0.85, 0.72, 0.62],
};

// O navegador não gerou o formato pedido nem em JPEG: a tela mostra "Não enviada" (D4).
export class FalhaCodificacao extends Error {}

function gerarBlob(canvas: CanvasCodificavel, tipo: string, qualidade: number): Promise<Blob | null> {
  return new Promise((resolver) => {
    try {
      canvas.toBlob(resolver, tipo, qualidade);
    } catch {
      resolver(null);
    }
  });
}

export async function codificar(
  canvas: CanvasCodificavel,
  formato: FormatoSaida,
  qualidades: readonly number[] = QUALIDADES[formato],
): Promise<{ blob: Blob; formato: FormatoSaida } | { motivo: "grande" }> {
  const tipo = `image/${formato}`;
  for (const qualidade of qualidades) {
    const blob = await gerarBlob(canvas, tipo, qualidade);
    // Tipo diferente do pedido (o Safari devolve PNG em silêncio) nunca é enviado.
    if (blob?.type !== tipo) {
      if (formato === "webp") return codificar(canvas, "jpeg");
      throw new FalhaCodificacao(`O navegador não gerou ${tipo}`);
    }
    if (blob.size <= TETO_BYTES) return { blob, formato };
  }
  return { motivo: "grande" };
}
