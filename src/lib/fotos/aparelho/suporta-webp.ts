// Teste único de suporte a WebP (research D4): toBlob de um canvas 1×1 com "image/webp". O
// Safari antigo devolve PNG em silêncio; isso conta como "não suporta". O resultado vale para a
// sessão; cada foto ainda confere o blob.type na hora (codificar.ts).

export type CanvasCodificavel = {
  width: number;
  height: number;
  toBlob(callback: (blob: Blob | null) => void, tipo?: string, qualidade?: number): void;
};

export function criarSuportaWebp(criarCanvas: () => CanvasCodificavel): () => Promise<boolean> {
  let resultado: Promise<boolean> | null = null;
  return () => {
    resultado ??= new Promise<boolean>((resolver) => {
      try {
        const canvas = criarCanvas();
        canvas.width = 1;
        canvas.height = 1;
        canvas.toBlob((blob) => resolver(blob?.type === "image/webp"), "image/webp");
      } catch {
        resolver(false);
      }
    });
    return resultado;
  };
}

export const suportaWebp = criarSuportaWebp(() => document.createElement("canvas"));
