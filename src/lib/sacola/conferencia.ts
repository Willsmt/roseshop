// Conferência da sacola pelo cliente (contracts/sacola.md §5 com o ajuste A1, contracts/
// conferencia.md §6, US3.5, US3.7). `conferir` nunca lança: tempo-limite, rede fora, status ≠ 200
// ou resposta fora do esquema viram "falha", e quem chama não grava nada.

import * as z from "zod/mini";

import { precoPublico } from "@/lib/catalogo/exibicao";
import { codigoValido, type ItemConferencia, type ProdutoConferido, type Sacola } from "./sacola";
import type { LinhaPedido } from "./total";

export type { ItemConferencia, ProdutoConferido } from "./sacola";

export const ROTA = "/api/catalogo/conferencia";
export const TEMPO_LIMITE_MS = 4000;

// Junção do item guardado com a conferência (data-model §3). Só memória, nunca gravado.
export type ItemConferido = {
  codigo: string;
  quantidade: number;
  estado: "ok" | "esgotado";
  produto: ProdutoConferido;
  precoUnitario: string;
  precoAlterado: boolean;
};

const Codigo = z.string().check(z.refine(codigoValido));

const Produto = z.strictObject({
  nome: z.string(),
  href: z.string(),
  precoCentavos: z.nullable(z.int().check(z.minimum(1), z.maximum(9_999_999))),
  aPartirDe: z.boolean(),
  capa: z.nullable(z.strictObject({ url: z.string(), alt: z.string() })),
});

const Resposta = z.strictObject({
  itens: z.array(
    z.discriminatedUnion("estado", [
      z.strictObject({ codigo: Codigo, estado: z.literal("ok"), produto: Produto }),
      z.strictObject({ codigo: Codigo, estado: z.literal("esgotado"), produto: Produto }),
      z.strictObject({ codigo: Codigo, estado: z.literal("inexistente") }),
    ]),
  ),
});

export function lerRespostaConferencia(json: unknown): ItemConferencia[] | null {
  const r = Resposta.safeParse(json);
  return r.success ? r.data.itens : null;
}

// A rota devolve um item por código pedido, na ordem pedida (contracts/conferencia.md §2).
function cobreOPedido(codigos: string[], itens: ItemConferencia[]): boolean {
  return itens.length === codigos.length && itens.every((i, k) => i.codigo === codigos[k]);
}

export async function conferir(
  codigos: string[],
  opcoes: { fetch?: typeof fetch; timeoutMs?: number } = {},
): Promise<ItemConferencia[] | "falha"> {
  const controle = new AbortController();
  let relogio: ReturnType<typeof setTimeout> | undefined;
  // O tempo-limite cobre o pedido e a leitura do corpo, mesmo se o fetch ignorar o sinal.
  const estouro = new Promise<"falha">((resolver) => {
    relogio = setTimeout(() => {
      controle.abort();
      resolver("falha");
    }, opcoes.timeoutMs ?? TEMPO_LIMITE_MS);
  });
  const pedido = (async (): Promise<ItemConferencia[] | "falha"> => {
    const res = await (opcoes.fetch ?? fetch)(ROTA, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ codigos }),
      cache: "no-store",
      signal: controle.signal,
    });
    if (res.status !== 200) return "falha";
    const itens = lerRespostaConferencia(await res.json());
    return itens !== null && cobreOPedido(codigos, itens) ? itens : "falha";
  })().catch(() => "falha" as const);
  try {
    return await Promise.race([pedido, estouro]);
  } finally {
    clearTimeout(relogio);
  }
}

function precoDifere(visto: Sacola["itens"][number], atual: ProdutoConferido): boolean {
  return visto.precoVisto !== atual.precoCentavos || visto.aPartirDe !== atual.aPartirDe;
}

// Inexistentes saem (a operação aplicarConferencia os remove); códigos não cobertos ficam de fora.
export function juntar(sacola: Sacola, itens: ItemConferencia[]): ItemConferido[] {
  const porCodigo = new Map(itens.map((c) => [c.codigo, c]));
  return sacola.itens.flatMap((item): ItemConferido[] => {
    const c = porCodigo.get(item.codigo);
    if (!c || c.estado === "inexistente") return [];
    return [
      {
        codigo: item.codigo,
        quantidade: item.quantidade,
        estado: c.estado,
        produto: c.produto,
        precoUnitario: precoPublico(c.produto.precoCentavos, c.produto.aPartirDe),
        precoAlterado: precoDifere(item, c.produto),
      },
    ];
  });
}

// Só os disponíveis entram no subtotal e na mensagem, com nome e preço da conferência (US3.1, SC-003).
export function linhasDoPedido(itens: ItemConferido[]): LinhaPedido[] {
  return itens
    .filter((i) => i.estado === "ok")
    .map((i) => ({
      quantidade: i.quantidade,
      nome: i.produto.nome,
      codigo: i.codigo,
      precoCentavos: i.produto.precoCentavos,
      aPartirDe: i.produto.aPartirDe,
    }));
}

// US3.5: no envio, algo que a cliente não viu na tela barra o WhatsApp. `anteriores` é a
// conferência que a tela mostra; sem ela, todo esgotado conta como novo. Mudança de estado em
// qualquer sentido conta (o esgotado que volta entraria na mensagem sem ter sido visto).
export function houveMudanca(antes: Sacola, itens: ItemConferencia[], anteriores?: ItemConferencia[]): boolean {
  const estadoAntes = new Map(anteriores?.map((c) => [c.codigo, c.estado]));
  const porCodigo = new Map(itens.map((c) => [c.codigo, c]));
  return antes.itens.some((item) => {
    const c = porCodigo.get(item.codigo);
    if (!c) return false;
    if (c.estado === "inexistente") return true;
    if (anteriores ? estadoAntes.get(item.codigo) !== c.estado : c.estado === "esgotado") return true;
    return precoDifere(item, c.produto);
  });
}
