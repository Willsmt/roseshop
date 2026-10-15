// JPEG de teste sem dependências: baseline, 4:4:4, só coeficiente DC (um tom por bloco de 8x8).
// Serve para o seed dar fotos distintas e visíveis ao catálogo; não é um codificador geral.
// Quantização 8 em tudo: o nível do DC é exatamente (componente - 128).

export type Rgb = readonly [number, number, number];

// Tabela DC de luminância do padrão (K.3): contagem de códigos por tamanho e símbolos 0..11.
const DC_BITS = [0, 1, 5, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0];
const DC_VALS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
// Tabela AC mínima: um único símbolo, o fim de bloco (0x00), com código "0".
const AC_BITS = [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
const AC_VALS = [0x00];

type Codigo = { valor: number; tamanho: number };

function codigosCanonicos(bits: number[], vals: number[]): Map<number, Codigo> {
  const mapa = new Map<number, Codigo>();
  let codigo = 0;
  let k = 0;
  for (let tamanho = 1; tamanho <= 16; tamanho++) {
    for (let i = 0; i < bits[tamanho - 1]; i++) mapa.set(vals[k++], { valor: codigo++, tamanho });
    codigo <<= 1;
  }
  return mapa;
}

const DC = codigosCanonicos(DC_BITS, DC_VALS);
const FIM_DE_BLOCO = codigosCanonicos(AC_BITS, AC_VALS).get(0x00)!;

class Bits {
  private bytes: number[] = [];
  private acumulado = 0;
  private n = 0;

  escrever(valor: number, tamanho: number) {
    for (let i = tamanho - 1; i >= 0; i--) {
      this.acumulado = (this.acumulado << 1) | ((valor >> i) & 1);
      if (++this.n === 8) this.byte();
    }
  }

  private byte() {
    this.bytes.push(this.acumulado);
    if (this.acumulado === 0xff) this.bytes.push(0x00);
    this.acumulado = 0;
    this.n = 0;
  }

  fechar(): number[] {
    while (this.n !== 0) this.escrever(1, 1);
    return this.bytes;
  }
}

const limitar = (x: number) => Math.max(-128, Math.min(127, Math.round(x)));

function paraYcc([r, g, b]: Rgb): [number, number, number] {
  return [
    limitar(0.299 * r + 0.587 * g + 0.114 * b - 128),
    limitar(-0.168736 * r - 0.331264 * g + 0.5 * b),
    limitar(0.5 * r - 0.418688 * g - 0.081312 * b),
  ];
}

function escreverDc(bits: Bits, diferenca: number) {
  const magnitude = Math.abs(diferenca);
  const categoria = magnitude === 0 ? 0 : Math.floor(Math.log2(magnitude)) + 1;
  const codigo = DC.get(categoria)!;
  bits.escrever(codigo.valor, codigo.tamanho);
  if (categoria > 0) {
    const extra = diferenca < 0 ? diferenca + (1 << categoria) - 1 : diferenca;
    bits.escrever(extra, categoria);
  }
}

const u16 = (n: number) => [(n >> 8) & 0xff, n & 0xff];

function segmento(marcador: number, corpo: number[]): number[] {
  return [0xff, marcador, ...u16(corpo.length + 2), ...corpo];
}

/** Gradiente diagonal de `de` a `ate`. `lado` deve ser múltiplo de 8 (aqui: 400, o mínimo da 004). */
export function gerarJpegGradiente(de: Rgb, ate: Rgb, lado = 400): Uint8Array {
  if (lado % 8 !== 0 || lado < 8 || lado > 65_528) throw new Error("lado inválido");
  const blocos = lado / 8;
  const bits = new Bits();
  const anterior = [0, 0, 0];
  for (let by = 0; by < blocos; by++) {
    for (let bx = 0; bx < blocos; bx++) {
      const t = (bx + by) / (2 * (blocos - 1));
      const cor = de.map((c, i) => c + (ate[i] - c) * t) as unknown as Rgb;
      paraYcc(cor).forEach((nivel, comp) => {
        escreverDc(bits, nivel - anterior[comp]);
        anterior[comp] = nivel;
        bits.escrever(FIM_DE_BLOCO.valor, FIM_DE_BLOCO.tamanho);
      });
    }
  }
  const dados = bits.fechar();
  return Uint8Array.from([
    0xff, 0xd8,
    ...segmento(0xdb, [0x00, ...new Array<number>(64).fill(8)]),
    ...segmento(0xc0, [8, ...u16(lado), ...u16(lado), 3, 1, 0x11, 0, 2, 0x11, 0, 3, 0x11, 0]),
    ...segmento(0xc4, [0x00, ...DC_BITS, ...DC_VALS]),
    ...segmento(0xc4, [0x10, ...AC_BITS, ...AC_VALS]),
    ...segmento(0xda, [3, 1, 0x00, 2, 0x00, 3, 0x00, 0, 63, 0]),
    ...dados,
    0xff, 0xd9,
  ]);
}
