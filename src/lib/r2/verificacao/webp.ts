import { type Analise, Blocos, type RegraVerificacao, sanitizar } from "./analise";
import { analisarIcc } from "./icc";

// Passada pelos chunks do RIFF/WebP (contracts/fotos.md §4), sem decodificar.

const FLAG_ICC = 0x20;
const FLAG_EXIF = 0x08;
const FLAG_XMP = 0x04;
const FLAG_ANIMACAO = 0x02;
const FLAG_ALPHA = 0x10;
// Bits reservados do byte de flags do VP8X.
const FLAGS_RESERVADAS = 0xc1;

type Dimensoes = { largura: number; altura: number };

function u16(b: Uint8Array, i: number): number {
  return b[i] | (b[i + 1] << 8);
}

function u24(b: Uint8Array, i: number): number {
  return b[i] | (b[i + 1] << 8) | (b[i + 2] << 16);
}

function u32(b: Uint8Array, i: number): number {
  return (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24)) >>> 0;
}

// VP8: frame tag de 3 bytes (bit 0 = 0 no keyframe), 9D 01 2A, 14 bits de cada lado.
function dimensoesVp8(p: Uint8Array): Dimensoes | null {
  if (p.length < 10 || (p[0] & 1) !== 0) return null;
  if (p[3] !== 0x9d || p[4] !== 0x01 || p[5] !== 0x2a) return null;
  const largura = u16(p, 6) & 0x3fff;
  const altura = u16(p, 8) & 0x3fff;
  return largura === 0 || altura === 0 ? null : { largura, altura };
}

// VP8L: 0x2F e 14+14 bits (lado − 1), versão 0 nos 3 bits de cima.
function dimensoesVp8l(p: Uint8Array): Dimensoes | null {
  if (p.length < 5 || p[0] !== 0x2f) return null;
  const bits = u32(p, 1);
  if (bits >>> 29 !== 0) return null;
  return { largura: (bits & 0x3fff) + 1, altura: ((bits >>> 14) & 0x3fff) + 1 };
}

export function analisarWebp(bytes: Uint8Array): Analise {
  const blocos = new Blocos();
  const corrompida = (regra: RegraVerificacao): Analise => ({
    falha: "corrompida",
    regra,
    blocos: blocos.lista(),
  });
  const fim = bytes.length;
  if (fim < 12 || u32(bytes, 4) + 8 !== fim) return corrompida("riff_tamanho");

  // Primeira regra de cada categoria, na ordem do arquivo.
  let animada: RegraVerificacao | null = null;
  let metadado: RegraVerificacao | null = null;
  let vp8x: (Dimensoes & { flags: number }) | null = null;
  let imagem: Dimensoes | null = null;
  let temIcc = false;
  let temAlph = false;
  let primeiro = true;

  let pos = 12;
  while (pos < fim) {
    if (pos + 8 > fim) return corrompida("webp_chunk_truncado");
    const nome = sanitizar(bytes.subarray(pos, pos + 4)).trimEnd();
    const tamanho = u32(bytes, pos + 4);
    const ini = pos + 8;
    const prox = ini + tamanho + (tamanho & 1);
    if (prox > fim) return corrompida("webp_chunk_truncado");
    const payload = bytes.subarray(ini, ini + tamanho);
    blocos.add(nome);

    switch (nome) {
      case "VP8X": {
        if (!primeiro || payload.length !== 10) return corrompida("vp8x_estrutura");
        // Mais estrito que a spec (que manda o leitor ignorar): deliberado, revisto na T098.
        if (payload[0] & FLAGS_RESERVADAS || payload[1] | payload[2] | payload[3]) {
          return corrompida("vp8x_reservado");
        }
        vp8x = { flags: payload[0], largura: u24(payload, 4) + 1, altura: u24(payload, 7) + 1 };
        if (vp8x.flags & FLAG_ANIMACAO) animada ??= "vp8x_animacao";
        if (vp8x.flags & (FLAG_EXIF | FLAG_XMP)) metadado ??= "vp8x_flag_metadado";
        break;
      }
      case "ICCP": {
        if (!vp8x || temIcc || imagem) return corrompida("iccp_posicao");
        if (!(vp8x.flags & FLAG_ICC)) return corrompida("iccp_sem_flag");
        temIcc = true;
        const icc = analisarIcc(payload);
        if (icc.resultado === "corrompida") return corrompida("icc_estrutura");
        for (const tag of icc.proibidas) blocos.add(`ICC:${tag}`);
        if (icc.regra) metadado ??= icc.regra;
        break;
      }
      case "ALPH": {
        if (!vp8x || temAlph || imagem) return corrompida("alph_posicao");
        if (!(vp8x.flags & FLAG_ALPHA)) return corrompida("alph_sem_flag");
        temAlph = true;
        break;
      }
      case "VP8":
      case "VP8L": {
        if (imagem) return corrompida("imagem_duplicada");
        // ALPH só acompanha o VP8 com perda; o VP8L carrega o próprio alpha.
        if (nome === "VP8L" && temAlph) return corrompida("alph_com_vp8l");
        imagem = nome === "VP8" ? dimensoesVp8(payload) : dimensoesVp8l(payload);
        if (!imagem) return corrompida(nome === "VP8" ? "vp8_cabecalho" : "vp8l_cabecalho");
        break;
      }
      case "ANIM":
      case "ANMF":
        animada ??= "anim";
        break;
      default:
        // EXIF, XMP e qualquer outro chunk.
        metadado ??= "chunk_fora_da_lista";
    }
    primeiro = false;
    pos = prox;
  }

  if (vp8x && vp8x.flags & FLAG_ICC && !temIcc) return corrompida("iccp_sem_chunk");
  if (!imagem) {
    if (!animada) return corrompida("imagem_ausente");
    const lista = blocos.lista();
    return { falha: null, formato: null, animada, metadado, largura: 0, altura: 0, blocos: lista };
  }
  if (vp8x && (vp8x.largura !== imagem.largura || vp8x.altura !== imagem.altura)) {
    return corrompida("vp8x_dimensao");
  }
  return {
    falha: null,
    formato: null,
    animada,
    metadado,
    largura: imagem.largura,
    altura: imagem.altura,
    blocos: blocos.lista(),
  };
}
