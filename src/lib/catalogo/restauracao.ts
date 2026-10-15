// Restauração da lista ao voltar do detalhe (research D15, FR-007). Sem server-only: a lista e o
// link do detalhe (componentes cliente) importam este arquivo. Guarda no sessionStorage da aba
// (nunca na URL, nunca em history.state), uma chave por filtro: `catalogo:<slug|todas>`.

import type { ProdutoCartao } from "./leitura";

export const PREFIXO_RESTAURACAO = "catalogo:";
export const VALIDADE_RESTAURACAO_MS = 30 * 60 * 1000;

export type Restauracao = {
  itens: ProdutoCartao[];
  cursor: string | null;
  scrollY: number;
  // Caminho do item clicado (/p/0042): o detalhe só volta pelo histórico se foi esse que abriu.
  aberto?: string;
  salvoEm: number;
};

const chave = (slug: string | null) => `${PREFIXO_RESTAURACAO}${slug ?? "todas"}`;

// Modo privado ou armazenamento bloqueado: lança no acesso, e nada disso pode quebrar a página.
function armazenamento(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

const itemValido = (i: unknown) => {
  if (typeof i !== "object" || i === null) return false;
  const p = i as Record<string, unknown>;
  const capa = p.capa as Record<string, unknown> | null | undefined;
  return (
    typeof p.href === "string" &&
    typeof p.nome === "string" &&
    typeof p.codigo === "string" &&
    typeof p.preco === "string" &&
    typeof p.esgotado === "boolean" &&
    (capa === null || (typeof capa === "object" && typeof capa.url === "string" && typeof capa.alt === "string"))
  );
};

function valida(valor: unknown, agora: number): valor is Restauracao {
  if (typeof valor !== "object" || valor === null) return false;
  const r = valor as Record<string, unknown>;
  return (
    Array.isArray(r.itens) &&
    r.itens.every(itemValido) &&
    (r.aberto === undefined || typeof r.aberto === "string") &&
    (r.cursor === null || typeof r.cursor === "string") &&
    typeof r.scrollY === "number" &&
    typeof r.salvoEm === "number" &&
    agora - r.salvoEm >= 0 &&
    agora - r.salvoEm < VALIDADE_RESTAURACAO_MS
  );
}

export function salvarRestauracao(slug: string | null, estado: Omit<Restauracao, "salvoEm">, agora = Date.now()) {
  try {
    armazenamento()?.setItem(chave(slug), JSON.stringify({ ...estado, salvoEm: agora }));
  } catch {
    // Cota cheia ou bloqueado: sem restauração, a lista volta do 1º bloco.
  }
}

// Lê só para o mesmo filtro e apaga em seguida (usada ou vencida).
export function lerRestauracao(slug: string | null, agora = Date.now()): Restauracao | null {
  try {
    const s = armazenamento();
    const bruto = s?.getItem(chave(slug));
    if (!s || bruto == null) return null;
    s.removeItem(chave(slug));
    const valor: unknown = JSON.parse(bruto);
    return valida(valor, agora) ? valor : null;
  } catch {
    return null;
  }
}

function chavesRestauracao(s: Storage): string[] {
  const chaves: string[] = [];
  for (let i = 0; i < s.length; i++) {
    const k = s.key(i);
    if (k?.startsWith(PREFIXO_RESTAURACAO)) chaves.push(k);
  }
  return chaves;
}

// O detalhe em `caminho` foi aberto pela lista nesta aba? (restauração válida cujo item clicado é
// esse caminho; não apaga)
export function existeRestauracao(caminho: string, agora = Date.now()): boolean {
  try {
    const s = armazenamento();
    if (!s) return false;
    return chavesRestauracao(s).some((k) => {
      try {
        const r: unknown = JSON.parse(s.getItem(k) ?? "null");
        return valida(r, agora) && r.aberto === caminho;
      } catch {
        return false;
      }
    });
  } catch {
    return false;
  }
}

// F3: "Ver o catálogo" e o "Voltar" sem lista de origem começam do 1º bloco.
export function limparRestauracoes(): void {
  try {
    const s = armazenamento();
    if (s) for (const k of chavesRestauracao(s)) s.removeItem(k);
  } catch {
    // nada a limpar
  }
}
