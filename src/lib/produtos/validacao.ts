import "server-only";

import { z } from "zod";

import { normalizarNome } from "@/lib/categorias";

import { type CampoProduto, type Falha } from "./erros";
import { type Motivo, mensagemDoMotivo } from "./mensagens";
import { parsePreco } from "./preco";

// Porta única de validação dos campos de produto (FR-032): painel hoje, IA depois.
// Server-only por importar o barrel de categorias (research D5).

export type CamposProduto = {
  nome: string;
  categoriaId: number;
  descricao: string | null;
  precoCentavos: number | null;
  aPartirDe: boolean;
};

export type ResultadoValidacao =
  | { ok: true; campos: CamposProduto; id?: number; versao?: number }
  | { ok: false; falhas: Falha[] };

const INTEIRO_MAX = 2_147_483_647;
const NOME_MIN = 3;
const NOME_MAX = 80;
const DESCRICAO_MAX = 1000;

// Mesma forma do idCategoria da 002 (inteiro positivo ≤ 2³¹−1, ou decimal canônico),
// definida aqui para não acoplar produto ao schema de categoria (D5).
const inteiroPositivo = z.number().int().positive().max(INTEIRO_MAX);
const inteiroDoBanco = z.union([
  inteiroPositivo,
  z
    .string()
    .regex(/^[1-9]\d{0,9}$/)
    .transform(Number)
    .pipe(inteiroPositivo),
]);

export const idProduto = inteiroDoBanco;
export const versaoProduto = inteiroDoBanco;

const tamanho = (s: string) => [...s].length;

function falha(motivo: Motivo, campo?: CampoProduto): Falha {
  return campo
    ? { motivo, mensagem: mensagemDoMotivo(motivo), campo }
    : { motivo, mensagem: mensagemDoMotivo(motivo) };
}

const texto = (v: unknown): string => (typeof v === "string" ? v : "");

function validarNome(v: unknown): { nome?: string; falha?: Falha } {
  const nome = normalizarNome(texto(v));
  if (nome === "") return { falha: falha("nome_vazio", "nome") };
  if (/[\p{Cc}\p{Cf}]/u.test(nome) || !/[\p{L}\p{N}]/u.test(nome))
    return { falha: falha("nome_invalido", "nome") };
  const n = tamanho(nome);
  if (n < NOME_MIN || n > NOME_MAX) return { falha: falha("nome_tamanho", "nome") };
  return { nome };
}

function validarCategoria(v: unknown): { id?: number; falha?: Falha } {
  if (v === undefined || v === null || (typeof v === "string" && v.trim() === ""))
    return { falha: falha("categoria_obrigatoria", "categoria") };
  const r = inteiroDoBanco.safeParse(v);
  return r.success ? { id: r.data } : { falha: falha("categoria_invalida", "categoria") };
}

function validarDescricao(v: unknown): { descricao?: string | null; falha?: Falha } {
  const d = texto(v).replace(/\r\n/g, "\n").trim();
  if (d === "") return { descricao: null };
  if (tamanho(d) > DESCRICAO_MAX) return { falha: falha("descricao_tamanho", "descricao") };
  return { descricao: d };
}

export function validarCamposProduto(
  entrada: unknown,
  modo: "cadastro" | "edicao",
): ResultadoValidacao {
  if (typeof entrada !== "object" || entrada === null || Array.isArray(entrada)) {
    return { ok: false, falhas: [falha("falha_geral")] };
  }
  const e = entrada as Record<string, unknown>;
  const falhas: Falha[] = [];

  let id: number | undefined;
  let versao: number | undefined;
  if (modo === "edicao") {
    const i = idProduto.safeParse(e.id);
    const v = versaoProduto.safeParse(e.versao);
    if (i.success) id = i.data;
    if (v.success) versao = v.data;
    if (!i.success || !v.success) falhas.push(falha("falha_geral"));
  }

  const n = validarNome(e.nome);
  if (n.falha) falhas.push(n.falha);
  const c = validarCategoria(e.categoriaId);
  if (c.falha) falhas.push(c.falha);
  const d = validarDescricao(e.descricao);
  if (d.falha) falhas.push(d.falha);

  const textoPreco = texto(e.preco).trim();
  let precoCentavos: number | null = null;
  if (textoPreco !== "") {
    const p = parsePreco(textoPreco);
    if (p.ok) precoCentavos = p.centavos;
    else falhas.push(falha(p.motivo, "preco"));
  }

  let aPartirDe = e.aPartirDe === true;
  if (aPartirDe && textoPreco === "") {
    if (modo === "cadastro") falhas.push(falha("a_partir_de_sem_preco", "aPartirDe"));
    else aPartirDe = false;
  }

  if (falhas.length > 0) return { ok: false, falhas };
  return {
    ok: true,
    campos: {
      nome: n.nome!,
      categoriaId: c.id!,
      descricao: d.descricao ?? null,
      precoCentavos,
      aPartirDe,
    },
    ...(id !== undefined && versao !== undefined ? { id, versao } : {}),
  };
}
