// Operações puras da sacola (contracts/sacola.md §2, research D4, data-model §1). Cada operação
// recebe a sacola relida do aparelho e confere os limites sobre o resultado (FR-008a).

export const MAX_PRODUTOS = 15,
  QTD_MIN = 1,
  QTD_MAX = 10,
  VALIDADE_MS = 7 * 24 * 3600 * 1000;

// Código canônico sem "#" (research D6), no mesmo limite do `lerProduto` e da rota da conferência.
const CODIGO = /^(?:\d{4}|[1-9]\d{4,9})$/;
const MAX_ID = 2_147_483_647;

export function codigoValido(c: string): boolean {
  return CODIGO.test(c) && c !== "0000" && Number(c) <= MAX_ID;
}

export type Item ={ codigo: string; quantidade: number; precoVisto: number | null; aPartirDe: boolean };
export type Sacola = { versao: 1; alteradaEm: number; itens: Item[] };

// Resultado da conferência (data-model §2). Declarado aqui para conferencia.ts (SF4) reexportar
// sem dependência circular.
export type ProdutoConferido = {
  nome: string;
  href: string;
  precoCentavos: number | null;
  aPartirDe: boolean;
  capa: { url: string; alt: string } | null;
};
export type ItemConferencia =
  | { codigo: string; estado: "ok"; produto: ProdutoConferido }
  | { codigo: string; estado: "esgotado"; produto: ProdutoConferido }
  | { codigo: string; estado: "inexistente" };

export type Resultado =
  | { ok: true; sacola: Sacola; mudou: boolean }
  | { ok: false; motivo: "limite_produtos" | "quantidade_fora" | "nao_esta" };
export type Operacao = (relida: Sacola, agora: number) => Resultado;

const semMudanca = (s: Sacola): Resultado => ({ ok: true, sacola: s, mudou: false });

function gravar(itens: Item[], agora: number): Resultado {
  if (itens.length > MAX_PRODUTOS) return { ok: false, motivo: "limite_produtos" };
  return { ok: true, sacola: { versao: 1, alteradaEm: agora, itens }, mudou: true };
}

export function adicionar(p: { codigo: string; precoCentavos: number | null; aPartirDe: boolean }): Operacao {
  return (s, agora) => {
    if (estaNaSacola(s, p.codigo)) return semMudanca(s);
    const novo: Item = { codigo: p.codigo, quantidade: 1, precoVisto: p.precoCentavos, aPartirDe: p.aPartirDe };
    return gravar([...s.itens, novo], agora);
  };
}

export function mudarQuantidade(codigo: string, quantidade: number): Operacao {
  return (s, agora) => {
    if (!Number.isInteger(quantidade) || quantidade < QTD_MIN || quantidade > QTD_MAX) {
      return { ok: false, motivo: "quantidade_fora" };
    }
    const atual = s.itens.find((i) => i.codigo === codigo);
    if (!atual) return { ok: false, motivo: "nao_esta" };
    if (atual.quantidade === quantidade) return semMudanca(s);
    return gravar(
      s.itens.map((i) => (i === atual ? { ...i, quantidade } : i)),
      agora,
    );
  };
}

export function remover(codigo: string): Operacao {
  return (s, agora) => {
    if (!estaNaSacola(s, codigo)) return semMudanca(s);
    return gravar(
      s.itens.filter((i) => i.codigo !== codigo),
      agora,
    );
  };
}

export function limpar(): Operacao {
  return (_s, agora) => gravar([], agora);
}

// Toca só os códigos cobertos pela resposta: inexistente sai; ok/esgotado passam a guardar o preço
// atual. A quantidade nunca muda (US3.2: o esgotado que volta mantém a quantidade).
export function aplicarConferencia(itens: ItemConferencia[]): Operacao {
  const porCodigo = new Map(itens.map((c) => [c.codigo, c]));
  return (s, agora) => {
    let mudou = false;
    const resultado: Item[] = [];
    for (const item of s.itens) {
      const c = porCodigo.get(item.codigo);
      if (!c) {
        resultado.push(item);
      } else if (c.estado === "inexistente") {
        mudou = true;
      } else if (c.produto.precoCentavos !== item.precoVisto || c.produto.aPartirDe !== item.aPartirDe) {
        mudou = true;
        resultado.push({ ...item, precoVisto: c.produto.precoCentavos, aPartirDe: c.produto.aPartirDe });
      } else {
        resultado.push(item);
      }
    }
    return mudou ? gravar(resultado, agora) : semMudanca(s);
  };
}

export function estaNaSacola(s: Sacola, codigo: string): boolean {
  return s.itens.some((i) => i.codigo === codigo);
}

export function cheia(s: Sacola): boolean {
  return s.itens.length >= MAX_PRODUTOS;
}
