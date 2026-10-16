// Sacola guardada no aparelho (contracts/sacola.md §6, data-model §1, research D5, FR-006, FR-007,
// FR-008a). Leitura nunca grava; cada alteração relê imediatamente antes, aplica a operação sobre
// a relida e grava. Todo acesso ao Storage, inclusive obtê-lo, fica em try/catch. Sem
// navigator.locks (research D5, risco R1).

import * as z from "zod/mini";

import {
  MAX_PRODUTOS,
  QTD_MAX,
  QTD_MIN,
  VALIDADE_MS,
  codigoValido,
  type Operacao,
  type Resultado,
  type Sacola,
} from "./sacola";

export const CHAVE = "roseshop.sacola",
  EVENTO_LOCAL = "roseshop:sacola";

const FUTURO_MAX_MS = 24 * 3600 * 1000;

export type Leitura = { disponivel: false } | { disponivel: true; sacola: Sacola };

// Formato gravado, fechado: chave extra em qualquer nível invalida (data-model §1).
const Gravada = z.strictObject({
  v: z.literal(1),
  t: z.int().check(z.minimum(0)),
  i: z
    .array(
      z.strictObject({
        c: z.string().check(z.refine(codigoValido)),
        q: z.int().check(z.minimum(QTD_MIN), z.maximum(QTD_MAX)),
        p: z.nullable(z.int().check(z.minimum(1), z.maximum(9_999_999))),
        a: z.boolean(),
      }),
    )
    .check(
      z.maxLength(MAX_PRODUTOS),
      z.refine((i) => new Set(i.map((x) => x.c)).size === i.length),
    ),
});

const vazia = (agora: number): Sacola => ({ versao: 1, alteradaEm: agora, itens: [] });

function interpretar(bruto: string | null, agora: number): Sacola {
  if (bruto === null) return vazia(agora);
  let json: unknown;
  try {
    json = JSON.parse(bruto);
  } catch {
    return vazia(agora);
  }
  const r = Gravada.safeParse(json);
  if (!r.success) return vazia(agora);
  const { t, i } = r.data;
  if (agora - t > VALIDADE_MS || t - agora > FUTURO_MAX_MS) return vazia(agora);
  return {
    versao: 1,
    alteradaEm: t,
    itens: i.map((x) => ({ codigo: x.c, quantidade: x.q, precoVisto: x.p, aPartirDe: x.a })),
  };
}

function serializar(s: Sacola): string {
  return JSON.stringify({
    v: 1,
    t: s.alteradaEm,
    i: s.itens.map((x) => ({ c: x.codigo, q: x.quantidade, p: x.precoVisto, a: x.aPartirDe })),
  });
}

export function lerSacola(storage: () => Storage, agora: number): Leitura {
  let bruto: string | null;
  try {
    bruto = storage().getItem(CHAVE);
  } catch {
    return { disponivel: false };
  }
  return { disponivel: true, sacola: interpretar(bruto, agora) };
}

export function alterarSacola(
  storage: () => Storage,
  op: Operacao,
  agora: number,
  alvo: Pick<EventTarget, "dispatchEvent"> | undefined = typeof window === "undefined" ? undefined : window,
): Resultado | { ok: false; motivo: "armazenamento" } {
  const lida = lerSacola(storage, agora);
  if (!lida.disponivel) return { ok: false, motivo: "armazenamento" };
  const r = op(lida.sacola, agora);
  if (!r.ok || !r.mudou) return r;
  try {
    const s = storage();
    if (r.sacola.itens.length === 0) s.removeItem(CHAVE);
    else s.setItem(CHAVE, serializar(r.sacola));
  } catch {
    return { ok: false, motivo: "armazenamento" };
  }
  alvo?.dispatchEvent(new Event(EVENTO_LOCAL));
  return r;
}

// Só avisa; quem assina relê (FR-008a). `storage` com key null é o clear() de outra aba.
export function assinarSacola(alvo: Window, aoMudar: () => void): () => void {
  const aoArmazenar = (e: Event) => {
    const { key } = e as StorageEvent;
    if (key === CHAVE || key === null) aoMudar();
  };
  alvo.addEventListener("storage", aoArmazenar);
  alvo.addEventListener(EVENTO_LOCAL, aoMudar);
  return () => {
    alvo.removeEventListener("storage", aoArmazenar);
    alvo.removeEventListener(EVENTO_LOCAL, aoMudar);
  };
}
