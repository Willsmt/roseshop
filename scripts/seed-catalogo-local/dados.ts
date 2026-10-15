// Plano de dados do seed local (T080a). Puro e determinístico: o script grava, aqui só se decide.
// Cobre o roteiro Q§4: mais de 24 produtos (2 blocos), datas distintas, destaques, esgotados,
// categoria só com esgotados, categoria vazia e um nome com & # ? acento e emoji.

import type { Rgb } from "./jpeg";

export const AUTOR_SEED = "seed@local";

export const CATEGORIAS = {
  meias: "Meias",
  bolsas: "Bolsas",
  guardaChuvas: "Guarda-chuvas",
  panos: "Panos de prato",
  // Só com produtos esgotados: tem de aparecer no filtro mesmo assim.
  soEsgotados: "Linha encerrada",
  // Sem produtos: tem de ficar fora do filtro.
  vazia: "Tupperware",
} as const;

export const NOME_ESPECIAL = "Meia & Cia #1? Ação 🌹";

export type ProdutoSeed = {
  nome: string;
  categoria: string;
  descricao: string | null;
  precoCentavos: number | null;
  aPartirDe: boolean;
  esgotado: boolean;
  destaqueVaga: number | null;
  /** Dias antes de `agora` (inteiro, distinto por produto) e minutos para desempatar a hora. */
  diasAtras: number;
  fotos: 1 | 2 | 3;
  cores: [Rgb, Rgb];
};

const PALETA: [Rgb, Rgb][] = [
  [[244, 143, 177], [136, 14, 79]],
  [[255, 204, 128], [230, 81, 0]],
  [[165, 214, 167], [27, 94, 32]],
  [[144, 202, 249], [13, 71, 161]],
  [[206, 147, 216], [74, 20, 140]],
  [[255, 245, 157], [245, 127, 23]],
  [[176, 190, 197], [38, 50, 56]],
  [[239, 154, 154], [183, 28, 28]],
];

const MODELOS: Record<string, string[]> = {
  [CATEGORIAS.meias]: ["Meia Algodão", "Meia Soquete", "Meia Térmica", "Meia Listrada", "Meia Fantasia", "Meia Esportiva"],
  [CATEGORIAS.bolsas]: ["Bolsa Tiracolo", "Bolsa Mini", "Bolsa Tote", "Necessaire", "Bolsa Térmica"],
  [CATEGORIAS.guardaChuvas]: ["Guarda-chuva Dobrável", "Guarda-chuva Longo", "Guarda-chuva Infantil"],
  [CATEGORIAS.panos]: ["Pano de Prato Bordado", "Pano de Prato Liso", "Pano de Prato Xadrez"],
};

const CORES = ["Rosa", "Azul", "Verde", "Lilás", "Cinza", "Vermelho", "Amarelo"];

// (categoria, quantos): 38 produtos comuns; com o especial e os 2 da linha encerrada, 41 no total.
const QUANTIDADES: [string, number][] = [
  [CATEGORIAS.meias, 16],
  [CATEGORIAS.bolsas, 10],
  [CATEGORIAS.guardaChuvas, 6],
  [CATEGORIAS.panos, 6],
];

// Posições (0-based, na ordem de geração) dos produtos esgotados e dos em destaque. Destaque e
// esgotado nunca coincidem (CHECK produtos_destaque_disponivel). Vagas fora da ordem de cadastro.
const ESGOTADOS = new Set([3, 9, 14, 21, 30, 35]);
const DESTAQUES = new Map<number, number>([
  [0, 3],
  [5, 1],
  [12, 5],
  [18, 2],
  [25, 4],
]);

export function planejarProdutos(): ProdutoSeed[] {
  const lista: ProdutoSeed[] = [];
  let i = 0;
  for (const [categoria, quantidade] of QUANTIDADES) {
    for (let k = 0; k < quantidade; k++, i++) {
      const modelos = MODELOS[categoria];
      lista.push({
        nome: `${modelos[k % modelos.length]} ${CORES[(k + i) % CORES.length]} ${i + 1}`,
        categoria,
        descricao: i % 3 === 0 ? null : `Peça de teste ${i + 1} para o roteiro do catálogo.`,
        precoCentavos: i % 7 === 6 ? null : 990 + ((i * 370) % 20_000),
        aPartirDe: i % 7 !== 6 && i % 5 === 0,
        esgotado: ESGOTADOS.has(i),
        destaqueVaga: DESTAQUES.get(i) ?? null,
        diasAtras: 0,
        fotos: ((i % 3) + 1) as 1 | 2 | 3,
        cores: PALETA[i % PALETA.length],
      });
    }
  }
  lista.push({
    nome: NOME_ESPECIAL,
    categoria: CATEGORIAS.meias,
    descricao: "Nome com & # ? acento e emoji, para o link do WhatsApp.",
    precoCentavos: 1990,
    aPartirDe: false,
    esgotado: false,
    destaqueVaga: null,
    diasAtras: 0,
    fotos: 2,
    cores: PALETA[0],
  });
  for (const [n, nome] of ["Meia Edição Antiga", "Bolsa Coleção Passada"].entries()) {
    lista.push({
      nome,
      categoria: CATEGORIAS.soEsgotados,
      descricao: null,
      precoCentavos: 1500 + n * 500,
      aPartirDe: false,
      esgotado: true,
      destaqueVaga: null,
      diasAtras: 0,
      fotos: 1,
      cores: PALETA[(n + 6) % PALETA.length],
    });
  }
  // Datas distintas, do mais antigo (maior `diasAtras`) ao mais novo, na ordem de geração.
  return lista.map((p, posicao) => ({ ...p, diasAtras: lista.length - posicao }));
}
