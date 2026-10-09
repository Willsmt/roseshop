// Tipo da foto escolhida, pelos bytes do início do arquivo (contracts/telas.md §3, FR-011).
// Nome, extensão e MIME declarado não entram na decisão. PNG e HEIC são aceitos como ENTRADA;
// o que sai do aparelho é sempre WebP ou JPEG (codificar.ts).

export type TipoEntrada = "jpeg" | "png" | "webp" | "heic" | "outro";

// Quantos bytes o prepararFoto lê do início do arquivo: cobre a caixa ftyp do HEIC.
export const BYTES_CABECALHO = 64;

const MARCAS_HEIC = new Set(["heic", "heix", "heim", "heis", "hevc", "hevx", "hevm", "hevs"]);
const MARCAS_HEIF_GENERICAS = new Set(["mif1", "msf1"]);

function ascii(b: Uint8Array, inicio: number, fim: number): string {
  return String.fromCharCode(...b.subarray(inicio, fim));
}

function comeca(b: Uint8Array, assinatura: readonly number[]): boolean {
  return b.length >= assinatura.length && assinatura.every((v, i) => b[i] === v);
}

function ehHeic(b: Uint8Array): boolean {
  if (b.length < 12 || ascii(b, 4, 8) !== "ftyp") return false;
  const tamanhoCaixa = ((b[0]! << 24) | (b[1]! << 16) | (b[2]! << 8) | b[3]!) >>> 0;
  // Tamanho 1 (estendido): 8 bytes de tamanho antes das marcas. Tamanho 0 (até o fim do
  // arquivo) ou 1: as marcas compatíveis são lidas até o fim do cabeçalho.
  const inicio = tamanhoCaixa === 1 ? 16 : 8;
  if (b.length < inicio + 4) return false;
  const principal = ascii(b, inicio, inicio + 4);
  if (MARCAS_HEIC.has(principal)) return true;
  if (!MARCAS_HEIF_GENERICAS.has(principal)) return false;
  // mif1/msf1 também servem ao AVIF: só é HEIC com uma marca compatível de HEIC dentro da caixa.
  const fim = tamanhoCaixa <= 1 ? b.length : Math.min(tamanhoCaixa, b.length);
  for (let i = inicio + 8; i + 4 <= fim; i += 4) {
    if (MARCAS_HEIC.has(ascii(b, i, i + 4))) return true;
  }
  return false;
}

export function detectarTipo(cabecalho: Uint8Array): TipoEntrada {
  const b = cabecalho;
  if (comeca(b, [0xff, 0xd8, 0xff])) return "jpeg";
  if (comeca(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "png";
  if (b.length >= 12 && ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 12) === "WEBP") return "webp";
  if (ehHeic(b)) return "heic";
  return "outro";
}
