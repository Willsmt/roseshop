// Helper de teste da verificação de imagens (feature 004, SF2).
// Monta bytes à mão; não é código de produção nem um *.test.ts.

const SEM_BYTES = (): Uint8Array => new Uint8Array(0);

export const TEXTO_GPS_FALSO = "GPSLatitude -23.5505 FALSO";
export const TEXTO_XMP_FALSO = "SEGREDO-XMP";
export const TEXTO_IPTC_FALSO = "SEGREDO-IPTC";
export const TEXTO_COM_FALSO = "SEGREDO-COM";

// ---------- primitivas ----------

export function bytes(...n: number[]): Uint8Array {
  return Uint8Array.from(n);
}

export function ascii(s: string): Uint8Array {
  const saida = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i += 1) saida[i] = s.charCodeAt(i) & 0xff;
  return saida;
}

export const texto = ascii;

export function juntar(...partes: Uint8Array[]): Uint8Array {
  const total = partes.reduce((soma, p) => soma + p.length, 0);
  const saida = new Uint8Array(total);
  let pos = 0;
  for (const p of partes) {
    saida.set(p, pos);
    pos += p.length;
  }
  return saida;
}

export function u16be(n: number): Uint8Array {
  return bytes((n >>> 8) & 0xff, n & 0xff);
}
export function u32be(n: number): Uint8Array {
  return bytes((n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff);
}
export function u16le(n: number): Uint8Array {
  return bytes(n & 0xff, (n >>> 8) & 0xff);
}
export function u24le(n: number): Uint8Array {
  return bytes(n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff);
}
export function u32le(n: number): Uint8Array {
  return bytes(n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff);
}

export function cortar(b: Uint8Array, tamanho: number): Uint8Array {
  return b.slice(0, tamanho);
}

// ---------- outros formatos ----------

export function png(): Uint8Array {
  return juntar(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a), new Uint8Array(32));
}
export function gif(): Uint8Array {
  return juntar(ascii("GIF89a"), bytes(1, 0, 1, 0, 0, 0, 0), bytes(0x3b));
}
export function svg(): Uint8Array {
  return ascii('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800"></svg>');
}
export function svgXml(): Uint8Array {
  return ascii('<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"/>');
}
export function heic(): Uint8Array {
  return juntar(u32be(24), ascii("ftypheic"), new Uint8Array(12));
}
export function pdf(): Uint8Array {
  return ascii("%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF\n");
}

// ---------- JPEG ----------

export function segmentoComprimento(
  marcador: number,
  comprimento: number,
  payload: Uint8Array,
): Uint8Array {
  return juntar(bytes(0xff, marcador), u16be(comprimento), payload);
}

export function segmento(marcador: number, payload: Uint8Array): Uint8Array {
  return segmentoComprimento(marcador, payload.length + 2, payload);
}

export const soi = (): Uint8Array => bytes(0xff, 0xd8);
export const eoi = (): Uint8Array => bytes(0xff, 0xd9);

export function jfif(): Uint8Array {
  return segmento(
    0xe0,
    juntar(ascii("JFIF\0"), bytes(1, 1, 0), u16be(1), u16be(1), bytes(0, 0)),
  );
}
export function jfifComMiniatura(): Uint8Array {
  return segmento(
    0xe0,
    juntar(
      ascii("JFIF\0"),
      bytes(1, 1, 0),
      u16be(1),
      u16be(1),
      bytes(2, 2),
      new Uint8Array(12),
    ),
  );
}
export function jfifComprimento17(): Uint8Array {
  return segmento(
    0xe0,
    juntar(ascii("JFIF\0"), bytes(1, 1, 0), u16be(1), u16be(1), bytes(0, 0, 0)),
  );
}
export function jfxx(): Uint8Array {
  return segmento(0xe0, juntar(ascii("JFXX\0"), bytes(0x10), new Uint8Array(4)));
}
export function app0Outro(): Uint8Array {
  return segmento(0xe0, ascii("ABCD\0xx"));
}
export function app(n: number, payload: Uint8Array): Uint8Array {
  return segmento(0xe0 + n, payload);
}
export function app1Exif(): Uint8Array {
  return segmento(0xe1, juntar(ascii("Exif\0\0"), ascii(TEXTO_GPS_FALSO)));
}
export function app1Xmp(): Uint8Array {
  return segmento(
    0xe1,
    juntar(
      ascii("http://ns.adobe.com/xap/1.0/\0"),
      ascii(`<x:xmpmeta>${TEXTO_XMP_FALSO}</x:xmpmeta>`),
    ),
  );
}
export function app1Outro(): Uint8Array {
  return segmento(0xe1, ascii("Outro\0dados"));
}
export function app2Outro(): Uint8Array {
  return segmento(0xe2, ascii("OUTRO\0dados"));
}
export function iptc(): Uint8Array {
  return segmento(0xed, ascii(`Photoshop 3.0\0` + `8BIM ${TEXTO_IPTC_FALSO}`));
}
export function app14Adobe(): Uint8Array {
  return segmento(0xee, juntar(ascii("Adobe"), bytes(0, 100, 0, 0, 0, 0, 1)));
}
export function com(): Uint8Array {
  return segmento(0xfe, ascii(`comentario ${TEXTO_COM_FALSO}`));
}
export function dnl(): Uint8Array {
  return segmento(0xdc, u16be(800));
}
export function dac(): Uint8Array {
  return segmento(0xcc, u16be(0));
}
export function mpf(): Uint8Array {
  return segmento(0xe2, juntar(ascii("MPF\0"), new Uint8Array(8)));
}
export function dqt(): Uint8Array {
  return segmento(0xdb, juntar(bytes(0), new Uint8Array(64).fill(16)));
}
export function dht(): Uint8Array {
  return segmento(0xc4, juntar(bytes(0), bytes(1), new Uint8Array(15), bytes(0)));
}
export function dri(): Uint8Array {
  return segmento(0xdd, u16be(0));
}
export function sof(
  tipo: number,
  largura: number,
  altura: number,
  nc = 3,
  precisao = 8,
): Uint8Array {
  const componentes: number[] = [];
  for (let i = 0; i < nc; i += 1) componentes.push(i + 1, 0x11, 0);
  return segmento(
    tipo,
    juntar(bytes(precisao), u16be(altura), u16be(largura), bytes(nc), bytes(...componentes)),
  );
}
export function sos(ns = 3): Uint8Array {
  const pares: number[] = [];
  for (let i = 0; i < ns; i += 1) pares.push(i + 1, 0);
  return segmento(0xda, juntar(bytes(ns), bytes(...pares), bytes(0, 63, 0)));
}
export function dadosEntropicos(): Uint8Array {
  return bytes(0x12, 0x34, 0xff, 0x00, 0x56, 0xff, 0xd0, 0x78, 0xff, 0xd1, 0x9a);
}
export function dadosComTodosRst(): Uint8Array {
  const partes: number[] = [0x11, 0xff, 0x00];
  for (let r = 0xd0; r <= 0xd7; r += 1) partes.push(0x22, 0xff, r, 0x33, 0xff, 0x00);
  return bytes(...partes);
}

export function iccPedaco(seq: number, total: number, dados: Uint8Array): Uint8Array {
  return segmento(0xe2, juntar(ascii("ICC_PROFILE\0"), bytes(seq, total), dados));
}

export function iccEmPedacos(
  perfil: Uint8Array,
  n: number,
  opcoes: { seqs?: number[]; totais?: number[] } = {},
): Uint8Array[] {
  const tamanho = Math.ceil(perfil.length / n);
  const saida: Uint8Array[] = [];
  for (let i = 0; i < n; i += 1) {
    const dados = perfil.slice(i * tamanho, (i + 1) * tamanho);
    saida.push(iccPedaco(opcoes.seqs?.[i] ?? i + 1, opcoes.totais?.[i] ?? n, dados));
  }
  return saida;
}

export interface OpcoesJpeg {
  lado?: number;
  largura?: number;
  altura?: number;
  sofTipo?: number;
  nc?: number;
  precisao?: number;
  /** entre o SOI e o JFIF */
  antesDoJfif?: Uint8Array[];
  semJfif?: boolean;
  semSof?: boolean;
  semSos?: boolean;
  semEoi?: boolean;
  /** depois do JFIF, antes do DQT */
  antes?: Uint8Array[];
  /** total de varreduras (SOS); as extras vêm com DHT e DQT antes */
  varreduras?: number;
  /** depois da última varredura, antes do EOI */
  depoisDoSos?: Uint8Array[];
  depoisDoEoi?: Uint8Array[];
}

export function jpegValido(op: OpcoesJpeg = {}): Uint8Array {
  const lado = op.lado ?? 800;
  const partes: Uint8Array[] = [soi(), ...(op.antesDoJfif ?? [])];
  if (!op.semJfif) partes.push(jfif());
  partes.push(...(op.antes ?? []));
  partes.push(dqt());
  if (!op.semSof) {
    partes.push(sof(op.sofTipo ?? 0xc0, op.largura ?? lado, op.altura ?? lado, op.nc ?? 3, op.precisao ?? 8));
  }
  partes.push(dht());
  if (!op.semSos) {
    partes.push(sos(), dadosEntropicos());
    for (let i = 1; i < (op.varreduras ?? 1); i += 1) {
      partes.push(dht(), dqt(), sos(), dadosEntropicos());
    }
  }
  partes.push(...(op.depoisDoSos ?? []));
  if (!op.semEoi) partes.push(eoi());
  partes.push(...(op.depoisDoEoi ?? []));
  return juntar(...partes);
}

// ---------- ICC ----------

export const TAGS_ICC_PERMITIDAS = [
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
] as const;

export interface OpcoesPerfilIcc {
  tags?: string[];
  /** força o tamanho total (preenche com zeros no fim) */
  tamanhoFinal?: number;
  tamanhoDeclarado?: number;
  semAcsp?: boolean;
  contagemDeclarada?: number;
  primeiraEntrada?: { offset?: number; tamanho?: number };
}

export function perfilIcc(op: OpcoesPerfilIcc = {}): Uint8Array {
  const tags = op.tags ?? [...TAGS_ICC_PERMITIDAS];
  const n = tags.length;
  const inicioDados = 132 + 12 * n;
  const base = inicioDados + 8 * n;
  const total = Math.max(base, op.tamanhoFinal ?? base);
  const perfil = new Uint8Array(total);
  const vista = new DataView(perfil.buffer);
  vista.setUint32(0, op.tamanhoDeclarado ?? total);
  if (!op.semAcsp) perfil.set(ascii("acsp"), 36);
  vista.setUint32(128, op.contagemDeclarada ?? n);
  tags.forEach((tag, i) => {
    const pos = 132 + 12 * i;
    perfil.set(ascii(tag).subarray(0, 4), pos);
    const sobrescrita = i === 0 ? op.primeiraEntrada : undefined;
    vista.setUint32(pos + 4, sobrescrita?.offset ?? inicioDados + 8 * i);
    vista.setUint32(pos + 8, sobrescrita?.tamanho ?? 8);
  });
  return perfil;
}

// ---------- WebP ----------

export const FLAG_ICC = 0x20;
export const FLAG_ALPHA = 0x10;
export const FLAG_EXIF = 0x08;
export const FLAG_XMP = 0x04;
export const FLAG_ANIMACAO = 0x02;

export function chunk(fourcc: string, payload: Uint8Array): Uint8Array {
  const preenchimento = payload.length % 2 === 1 ? bytes(0) : SEM_BYTES();
  return juntar(ascii(fourcc), u32le(payload.length), payload, preenchimento);
}

/** Chunk sem preenchimento e com tamanho declarado livre. */
export function chunkBruto(
  fourcc: string,
  tamanhoDeclarado: number,
  payload: Uint8Array,
): Uint8Array {
  return juntar(ascii(fourcc), u32le(tamanhoDeclarado), payload);
}

export function riff(
  chunks: Uint8Array[],
  op: { tamanhoRiff?: number; extraFim?: Uint8Array } = {},
): Uint8Array {
  const corpo = juntar(...chunks);
  const tamanho = op.tamanhoRiff ?? 4 + corpo.length;
  return juntar(ascii("RIFF"), u32le(tamanho), ascii("WEBP"), corpo, op.extraFim ?? SEM_BYTES());
}

export function vp8(
  largura: number,
  altura: number,
  op: { keyframe?: boolean; assinatura?: boolean; extra?: number; escala?: number } = {},
): Uint8Array {
  const escala = (op.escala ?? 0) << 14;
  const payload = juntar(
    bytes((op.keyframe ?? true) ? 0x10 : 0x11, 0, 0),
    (op.assinatura ?? true) ? bytes(0x9d, 0x01, 0x2a) : bytes(0x9d, 0x01, 0x2b),
    u16le(escala | largura),
    u16le(escala | altura),
    new Uint8Array(op.extra ?? 2),
  );
  return chunk("VP8 ", payload);
}

export function vp8l(
  largura: number,
  altura: number,
  op: { marcador?: number; versao?: number; extra?: number } = {},
): Uint8Array {
  const bits =
    (((largura - 1) & 0x3fff) |
      (((altura - 1) & 0x3fff) << 14) |
      ((op.versao ?? 0) << 29)) >>>
    0;
  return chunk(
    "VP8L",
    juntar(bytes(op.marcador ?? 0x2f), u32le(bits), new Uint8Array(op.extra ?? 3)),
  );
}

export function vp8x(
  flags: number,
  largura: number,
  altura: number,
  reservados: [number, number, number] = [0, 0, 0],
): Uint8Array {
  return chunk("VP8X", juntar(bytes(flags, ...reservados), u24le(largura - 1), u24le(altura - 1)));
}
export const iccp = (perfil: Uint8Array): Uint8Array => chunk("ICCP", perfil);
export const alph = (): Uint8Array => chunk("ALPH", bytes(0, 1, 2, 3));
export const exifChunk = (): Uint8Array => chunk("EXIF", ascii(TEXTO_GPS_FALSO));
export const xmpChunk = (): Uint8Array =>
  chunk("XMP ", ascii(`<x:xmpmeta>${TEXTO_XMP_FALSO}</x:xmpmeta>`));
export const anim = (): Uint8Array => chunk("ANIM", new Uint8Array(6));
export const anmf = (): Uint8Array => chunk("ANMF", new Uint8Array(16));

export interface OpcoesWebp {
  lado?: number;
  largura?: number;
  altura?: number;
  bitstream?: "vp8" | "vp8l";
  /** força VP8X; é implícito quando `flags` é informado */
  estendido?: boolean;
  flags?: number;
  dimensoesVp8x?: [number, number];
  /** entre o VP8X e o chunk de imagem */
  antes?: Uint8Array[];
  /** depois do chunk de imagem */
  depois?: Uint8Array[];
  tamanhoRiff?: number;
  extraFim?: Uint8Array;
}

export function webpValido(op: OpcoesWebp = {}): Uint8Array {
  const lado = op.lado ?? 800;
  const largura = op.largura ?? lado;
  const altura = op.altura ?? lado;
  const imagem = (op.bitstream ?? "vp8") === "vp8" ? vp8(largura, altura) : vp8l(largura, altura);
  const estendido = op.estendido ?? op.flags !== undefined;
  const partes: Uint8Array[] = [];
  if (estendido) {
    const [lx, ly] = op.dimensoesVp8x ?? [largura, altura];
    partes.push(vp8x(op.flags ?? 0, lx, ly));
  }
  partes.push(...(op.antes ?? []), imagem, ...(op.depois ?? []));
  return riff(partes, { tamanhoRiff: op.tamanhoRiff, extraFim: op.extraFim });
}
