"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireAdminAction } from "@/lib/auth";
import { inserir, renomear } from "@/lib/db/categorias";
import { dbDoContexto } from "@/lib/db/contexto";

import { type Falha, falhaDeNome, falhaGeral, traduzirExcecao, traduzirResultado } from "./erros";
import { idCategoria, validarNome, versaoCategoria } from "./nome";

// Server Actions do painel (contrato §3). Ordem fixa em cada uma: guard (FR-016) antes de
// tudo, validação antes de qualquer SQL, só então banco. Sem sessão, `UnauthorizedError`
// propaga. Arquivo "use server": só funções async exportadas (e tipos).

export type ResultadoAction = { ok: true } | ({ ok: false } & Falha);

const LISTA = "/painel/categorias";

// `nome` fica `unknown` aqui: `validarNome` decide o motivo exato mostrado no campo.
// `id` e `versao` vêm de campos ocultos; inválidos não são erro de digitação.
const entradaCriar = z.object({ nome: z.unknown() });
const entradaRenomear = z.object({ id: idCategoria, versao: versaoCategoria, nome: z.unknown() });

const falhar = (f: Falha): ResultadoAction => ({ ok: false, ...f });

export async function criarCategoria(entrada: unknown): Promise<ResultadoAction> {
  const sessao = await requireAdminAction();
  const dados = entradaCriar.safeParse(entrada);
  if (!dados.success) return falhar(falhaGeral());
  const nome = validarNome(dados.data.nome);
  if (!nome.ok) return falhar(falhaDeNome(nome.motivo));

  try {
    const r = await inserir(await dbDoContexto(), sessao, nome.nome);
    if (r.tipo !== "ok") return falhar(traduzirResultado(r));
  } catch (erro) {
    return falhar(traduzirExcecao(erro));
  }
  revalidatePath(LISTA);
  return { ok: true };
}

export async function renomearCategoria(entrada: unknown): Promise<ResultadoAction> {
  const sessao = await requireAdminAction();
  const dados = entradaRenomear.safeParse(entrada);
  if (!dados.success) return falhar(falhaGeral());
  const nome = validarNome(dados.data.nome);
  if (!nome.ok) return falhar(falhaDeNome(nome.motivo));

  try {
    const { id, versao } = dados.data;
    const r = await renomear(await dbDoContexto(), sessao, id, versao, nome.nome);
    if (r.tipo !== "ok") return falhar(traduzirResultado(r));
  } catch (erro) {
    return falhar(traduzirExcecao(erro));
  }
  revalidatePath(LISTA);
  return { ok: true };
}
