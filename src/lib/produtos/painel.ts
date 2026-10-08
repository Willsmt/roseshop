import "server-only";

import { z } from "zod";

import { dbDoContexto } from "@/lib/db/contexto";
import { listar, obterPorId, type FiltroDb, type ProdutoDb } from "@/lib/db/produtos";

import { formatarCodigo, interpretarCodigoBusca } from "./codigo";
import { mensagemDoMotivo } from "./mensagens";
import { formatarAPartirDe, formatarPreco } from "./preco";

// Leitura do painel (contrato §4). Server-only; fora de qualquer barrel. A página chama
// `requireAdminPage` antes de ler. Todo valor da URL passa pelo schema `filtroLista`:
// valor inválido é ignorado (lista sem aquele filtro), nunca erro.

const LISTA = "/painel/produtos";
const MAX_BUSCA = 80;

const inteiroPositivo = z
  .string()
  .regex(/^[1-9]\d{0,8}$/)
  .transform(Number);

// `.catch(undefined)` por campo: um valor ruim não derruba os vizinhos (array, vazio etc.).
const filtroLista = z.object({
  categoria: inteiroPositivo.optional().catch(undefined),
  situacao: z.enum(["disponivel", "esgotado"]).optional().catch(undefined),
  busca: z
    .string()
    .transform((t) => t.trim().slice(0, MAX_BUSCA))
    .optional()
    .catch(undefined),
  antes: inteiroPositivo.optional().catch(undefined),
  aviso: z.enum(["removido", "nao_existe"]).optional().catch(undefined),
});

export type FiltroLista = z.infer<typeof filtroLista>;

export type ItemLista = {
  id: number;
  codigo: string;
  nome: string;
  categoriaNome: string;
  esgotado: boolean;
  emDestaque: boolean;
  preco: string | null;
  href: string;
};

export type DetalheProduto = ProdutoDb & {
  codigo: string;
  preco: string | null;
  fotos: never[];
  podeDestacar: boolean;
  voltarHref: string;
};

export type AvisoLista = { tipo: "sucesso" | "erro"; texto: string };

function lerFiltro(entrada: unknown): FiltroLista {
  const objeto = typeof entrada === "object" && entrada !== null && !Array.isArray(entrada);
  const r = filtroLista.safeParse(objeto ? entrada : {});
  return r.success ? r.data : {};
}

// Mesma regra de `categoria_chave` (migration 0000): minúscula, sem acento, hífen vira espaço.
function buscaVazia(texto: string): boolean {
  const chave = texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replaceAll("-", " ")
    .replace(/\s+/g, " ")
    .trim();
  return chave === "";
}

function buscaValida(f: FiltroLista): string | undefined {
  return f.busca !== undefined && !buscaVazia(f.busca) ? f.busca : undefined;
}

function montarFiltroDb(f: FiltroLista): FiltroDb {
  const filtro: FiltroDb = {};
  if (f.categoria !== undefined) filtro.categoriaId = f.categoria;
  if (f.situacao !== undefined) filtro.esgotado = f.situacao === "esgotado";
  const busca = buscaValida(f);
  if (busca !== undefined) filtro.busca = { texto: busca, codigo: interpretarCodigoBusca(busca) };
  if (f.antes !== undefined) filtro.antes = f.antes;
  return filtro;
}

// Query da lista: só filtros válidos e, se pedido, o cursor. Nunca `aviso`.
function queryDaLista(f: FiltroLista, antes?: number): string {
  const p = new URLSearchParams();
  if (f.categoria !== undefined) p.set("categoria", String(f.categoria));
  if (f.situacao !== undefined) p.set("situacao", f.situacao);
  const busca = buscaValida(f);
  if (busca !== undefined) p.set("busca", busca);
  if (antes !== undefined) p.set("antes", String(antes));
  return p.toString();
}

function hrefDaLista(query: string): string {
  return query === "" ? LISTA : `${LISTA}?${query}`;
}

function precoFormatado(p: Pick<ProdutoDb, "precoCentavos" | "aPartirDe">): string | null {
  if (p.precoCentavos === null) return null;
  return p.aPartirDe ? formatarAPartirDe(p.precoCentavos) : formatarPreco(p.precoCentavos);
}

function avisoDaLista(aviso: FiltroLista["aviso"]): AvisoLista | null {
  if (aviso === "removido") return { tipo: "sucesso", texto: "Produto removido." };
  if (aviso === "nao_existe") return { tipo: "erro", texto: mensagemDoMotivo("nao_existe") };
  return null;
}

export async function listarProdutosDoPainel(searchParams: unknown): Promise<{
  itens: ItemLista[];
  verMais: string | null;
  voltarAoComeco: string | null;
  aviso: AvisoLista | null;
}> {
  const f = lerFiltro(searchParams);
  const { itens, haMais } = await listar(await dbDoContexto(), montarFiltroDb(f));
  const queryAtual = queryDaLista(f, f.antes);
  const voltar = queryAtual === "" ? "" : `?voltar=${encodeURIComponent(queryAtual)}`;
  const ultimo = itens.at(-1);
  return {
    itens: itens.map((p) => ({
      id: p.id,
      codigo: formatarCodigo(p.id),
      nome: p.nome,
      categoriaNome: p.categoriaNome,
      esgotado: p.esgotado,
      emDestaque: p.destaqueVaga !== null,
      preco: precoFormatado(p),
      href: `${LISTA}/${p.id}${voltar}`,
    })),
    verMais: haMais && ultimo ? hrefDaLista(queryDaLista(f, ultimo.id)) : null,
    voltarAoComeco: f.antes !== undefined ? hrefDaLista(queryDaLista(f)) : null,
    aviso: avisoDaLista(f.aviso),
  };
}

// `voltar` é só a query da lista: vira objeto, passa pelo mesmo schema e o caminho é sempre
// o fixo `/painel/produtos` (sem redirecionamento aberto).
function voltarHrefSeguro(voltar: unknown): string {
  if (typeof voltar !== "string") return LISTA;
  const params = new URLSearchParams(voltar.trim().replace(/^\?/, ""));
  const f = lerFiltro(Object.fromEntries(params.entries()));
  return hrefDaLista(queryDaLista(f, f.antes));
}

export async function obterProdutoDoPainel(
  id: unknown,
  voltar: unknown,
): Promise<DetalheProduto | null> {
  const valido = typeof id === "string" ? inteiroPositivo.safeParse(id) : null;
  if (!valido?.success) return null;
  const p = await obterPorId(await dbDoContexto(), valido.data);
  if (!p) return null;
  return {
    ...p,
    codigo: formatarCodigo(p.id),
    preco: precoFormatado(p),
    fotos: [],
    podeDestacar: !p.esgotado && p.destaqueVaga === null,
    voltarHref: voltarHrefSeguro(voltar),
  };
}
