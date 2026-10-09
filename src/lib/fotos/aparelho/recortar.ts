import type { CanvasCodificavel } from "./suporta-webp";

// Recorte 1:1 (FR-013, FR-016, FR-018): a área vem em pixels da imagem já orientada (FR-017).
// O lado final fica entre 400 e 1200; a foto é reduzida, nunca ampliada.

export const LADO_MINIMO = 400;
export const LADO_MAXIMO = 1200;

export type AreaRecorte = { x: number; y: number; lado: number };
export type Recorte = { origem: AreaRecorte; lado: number };

export type Pincel = {
  imageSmoothingEnabled: boolean;
  imageSmoothingQuality: "low" | "medium" | "high";
  drawImage(
    img: unknown,
    sx: number,
    sy: number,
    sw: number,
    sh: number,
    dx: number,
    dy: number,
    dw: number,
    dh: number,
  ): void;
};

export type CanvasDesenhavel = CanvasCodificavel & { getContext(tipo: "2d"): Pincel | null };

export function recortar(
  img: { width: number; height: number },
  area: AreaRecorte,
): Recorte | { motivo: "pequena" } {
  const valores = [area.x, area.y, area.lado, img.width, img.height];
  if (!valores.every(Number.isFinite) || area.lado <= 0) return { motivo: "pequena" };
  // A área é limitada à imagem: o que conta é o menor lado com pixels de verdade.
  const x = Math.max(0, Math.floor(area.x));
  const y = Math.max(0, Math.floor(area.y));
  const ladoOrigem = Math.floor(Math.min(area.lado, img.width - x, img.height - y));
  if (ladoOrigem < LADO_MINIMO) return { motivo: "pequena" };
  return { origem: { x, y, lado: ladoOrigem }, lado: Math.min(ladoOrigem, LADO_MAXIMO) };
}

// Redesenhar no canvas descarta EXIF, GPS e qualquer outro metadado do original (FR-013), e só
// o primeiro quadro de um arquivo animado é usado.
export function desenharRecorte(
  img: unknown,
  recorte: Recorte,
  criarCanvas: () => CanvasDesenhavel,
): CanvasDesenhavel {
  const canvas = criarCanvas();
  canvas.width = recorte.lado;
  canvas.height = recorte.lado;
  const pincel = canvas.getContext("2d");
  if (!pincel) throw new Error("Canvas 2d indisponível");
  pincel.imageSmoothingEnabled = true;
  pincel.imageSmoothingQuality = "high";
  const { x, y, lado } = recorte.origem;
  pincel.drawImage(img, x, y, lado, lado, 0, 0, recorte.lado, recorte.lado);
  return canvas;
}
