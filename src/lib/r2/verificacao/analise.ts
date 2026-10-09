// Subcódigo da regra que decidiu a recusa (contracts/fotos.md §4). Vai para o
// log do modo registro na SF10; nunca carrega bytes do arquivo.
export type RegraVerificacao =
  // formato
  | "assinatura"
  | "declarado"
  | "sof_tipo"
  | "sof_precisao"
  | "sof_componentes"
  // corrompida (JPEG)
  | "jpeg_marcador"
  | "jpeg_comprimento"
  | "jpeg_truncado"
  | "jpeg_sem_sof_sos"
  | "jpeg_apos_eoi"
  | "jpeg_bloco_apos_sos"
  | "jpeg_dri"
  | "sof_duplicado"
  | "sof_estrutura"
  | "sof_dimensao_zero"
  | "sos_estrutura"
  | "icc_sequencia"
  // corrompida (WebP)
  | "riff_tamanho"
  | "webp_chunk_truncado"
  | "vp8x_estrutura"
  | "vp8x_reservado"
  | "vp8x_dimensao"
  | "iccp_posicao"
  | "iccp_sem_flag"
  | "iccp_sem_chunk"
  | "alph_posicao"
  | "alph_sem_flag"
  | "alph_com_vp8l"
  | "imagem_duplicada"
  | "imagem_ausente"
  | "vp8_cabecalho"
  | "vp8l_cabecalho"
  // corrompida (ICC)
  | "icc_estrutura"
  // animada
  | "mpf"
  | "vp8x_animacao"
  | "anim"
  // metadado
  | "jfif_miniatura"
  | "jfif_posicao"
  | "app0_outro"
  | "app1"
  | "app2_outro"
  | "appn"
  | "com"
  | "marcador_fora_da_lista"
  | "vp8x_flag_metadado"
  | "chunk_fora_da_lista"
  | "icc_tag"
  | "icc_tamanho"
  // dimensões
  | "nao_quadrada"
  | "lado_maior"
  | "lado_menor";

// Resultado da passada estrutural de um formato. `verificarImagem` aplica a
// ordem dos motivos (contracts/fotos.md §4) sobre ele. Em `formato`, `animada`
// e `metadado` fica a primeira regra achada; `null` quando nada disparou.
export type Analise =
  | { falha: "corrompida"; regra: RegraVerificacao; blocos: string[] }
  | {
      falha: null;
      formato: RegraVerificacao | null;
      animada: RegraVerificacao | null;
      metadado: RegraVerificacao | null;
      largura: number;
      altura: number;
      blocos: string[];
    };

// Teto de nomes: a lista vai inteira para o log do modo registro, e um arquivo
// hostil com milhares de chunks ou tags distintos não pode inflar essa linha.
const TETO_BLOCOS = 64;
const MAIS = "_mais";

// Acumula nomes únicos, na ordem da primeira aparição.
export class Blocos {
  private readonly vistos = new Set<string>();

  add(nome: string): void {
    if (this.vistos.has(MAIS)) return;
    if (this.vistos.size >= TETO_BLOCOS && !this.vistos.has(nome)) {
      this.vistos.add(MAIS);
      return;
    }
    this.vistos.add(nome);
  }

  lista(): string[] {
    return [...this.vistos];
  }
}

// Nome vindo do arquivo (FourCC, tag do ICC) nunca carrega bytes arbitrários.
export function sanitizar(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) {
    const c = String.fromCharCode(b);
    s += /[A-Za-z0-9 ]/.test(c) ? c : "?";
  }
  return s;
}

export function comeca(bytes: Uint8Array, inicio: number, texto: string): boolean {
  if (inicio + texto.length > bytes.length) return false;
  for (let i = 0; i < texto.length; i++) {
    if (bytes[inicio + i] !== texto.charCodeAt(i)) return false;
  }
  return true;
}
