import { sanitizar } from "./analise";

// Regra do ICC (contracts/fotos.md §4, TL-8): só tags de cor + desc e cprt,
// perfil de até 8 KB (provisório, fechado na SF10).
export const ICC_LIMITE_BYTES = 8192;

const TAGS_PERMITIDAS = new Set([
  "wtpt",
  "bkpt",
  "rXYZ",
  "gXYZ",
  "bXYZ",
  "rTRC",
  "gTRC",
  "bTRC",
  "chad",
  "chrm",
  "lumi",
  "desc",
  "cprt",
]);

const CABECALHO = 128;

export type ResultadoIcc = "ok" | "metadado" | "corrompida";

export function verificarIcc(perfil: Uint8Array): ResultadoIcc {
  return analisarIcc(perfil).resultado;
}

// `proibidas` alimenta os `blocos` do log do modo registro (nomes sanitizados);
// `regra` diz o que pesou primeiro no metadado (tamanho antes das tags).
export function analisarIcc(perfil: Uint8Array): {
  resultado: ResultadoIcc;
  regra: "icc_tamanho" | "icc_tag" | null;
  proibidas: string[];
} {
  const proibidas: string[] = [];
  const corrompida = { resultado: "corrompida" as const, regra: null, proibidas };
  const tamanho = perfil.length;
  if (tamanho < CABECALHO + 4) return corrompida;
  const dv = new DataView(perfil.buffer, perfil.byteOffset, tamanho);
  if (dv.getUint32(0) !== tamanho) return corrompida;
  if (sanitizar(perfil.subarray(36, 40)) !== "acsp") return corrompida;
  const n = dv.getUint32(CABECALHO);
  if (CABECALHO + 4 + 12 * n > tamanho) return corrompida;

  for (let i = 0; i < n; i++) {
    const e = CABECALHO + 4 + 12 * i;
    const offset = dv.getUint32(e + 4);
    const tam = dv.getUint32(e + 8);
    if (offset + tam > tamanho) return corrompida;
    const tag = sanitizar(perfil.subarray(e, e + 4));
    if (!TAGS_PERMITIDAS.has(tag)) proibidas.push(tag);
  }
  if (tamanho > ICC_LIMITE_BYTES) return { resultado: "metadado", regra: "icc_tamanho", proibidas };
  if (proibidas.length > 0) return { resultado: "metadado", regra: "icc_tag", proibidas };
  return { resultado: "ok", regra: null, proibidas };
}
