import { codificar, type FormatoSaida } from "./codificar";
import { BYTES_CABECALHO, detectarTipo } from "./detectar-tipo";
import { desenharRecorte, recortar, type AreaRecorte, type CanvasDesenhavel } from "./recortar";
import { suportaWebp } from "./suporta-webp";
import type { MotivoFoto } from "../tipos";

// Pipeline da foto no aparelho (contracts/telas.md §3): tipo pelos bytes, abertura com a
// orientação da câmera, recorte 1:1 e recodificação. O arquivo original nunca é devolvido
// (FR-013). APIs do navegador injetáveis para os testes.

export type ImagemAberta = { width: number; height: number; close?: () => void };

export type AbrirImagem = (
  fonte: Blob,
  opcoes: { imageOrientation: "from-image" },
) => Promise<ImagemAberta>;

export type DependenciasAparelho = {
  abrir: AbrirImagem;
  criarCanvas: () => CanvasDesenhavel;
  suportaWebp: () => Promise<boolean>;
};

export type FotoPreparada = { blob: Blob; formato: FormatoSaida };
export type MotivoAparelho = Extract<
  MotivoFoto,
  "formato" | "nao_abre" | "pequena" | "grande" | "nao_enviada"
>;

const abrirNoNavegador: AbrirImagem = (fonte, opcoes) => createImageBitmap(fonte, opcoes);

function dependenciasDoNavegador(): DependenciasAparelho {
  return {
    abrir: abrirNoNavegador,
    criarCanvas: () => document.createElement("canvas"),
    suportaWebp,
  };
}

// HEIC que o navegador não abre cai aqui (US2-AC7, research D15: sem biblioteca).
export async function abrirImagem(
  arquivo: Blob,
  abrir: AbrirImagem = abrirNoNavegador,
): Promise<ImagemAberta | { motivo: "nao_abre" }> {
  try {
    return await abrir(arquivo, { imageOrientation: "from-image" });
  } catch {
    return { motivo: "nao_abre" };
  }
}

// Nunca rejeita (telas.md §3, decisão da SF8): falha fora do previsto (leitura do arquivo,
// contexto 2d, nem o JPEG gerado) vira "nao_enviada", a tela só olha o motivo (D4).
export async function prepararFoto(
  arquivo: Blob,
  area: AreaRecorte,
  deps: DependenciasAparelho = dependenciasDoNavegador(),
): Promise<FotoPreparada | { motivo: MotivoAparelho }> {
  try {
    return await preparar(arquivo, area, deps);
  } catch {
    return { motivo: "nao_enviada" };
  }
}

async function preparar(
  arquivo: Blob,
  area: AreaRecorte,
  deps: DependenciasAparelho,
): Promise<FotoPreparada | { motivo: Exclude<MotivoAparelho, "nao_enviada"> }> {
  const cabecalho = new Uint8Array(await arquivo.slice(0, BYTES_CABECALHO).arrayBuffer());
  if (detectarTipo(cabecalho) === "outro") return { motivo: "formato" };

  const img = await abrirImagem(arquivo, deps.abrir);
  if ("motivo" in img) return img;

  let canvas: CanvasDesenhavel;
  try {
    const recorte = recortar(img, area);
    if ("motivo" in recorte) return recorte;
    canvas = desenharRecorte(img, recorte, deps.criarCanvas);
  } finally {
    img.close?.();
  }

  try {
    return await codificar(canvas, (await deps.suportaWebp()) ? "webp" : "jpeg");
  } finally {
    // Libera a memória do canvas já (o Safari do iOS tem teto para canvas).
    canvas.width = 0;
    canvas.height = 0;
  }
}
