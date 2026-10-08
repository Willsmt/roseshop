"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { type AdminSession, requireAdminAction } from "@/lib/auth";
import { CategoriaInvalidaError, exigirCategoriaValida } from "@/lib/categorias";
import { dbDoContexto } from "@/lib/db/contexto";
import {
  destacar,
  disponibilizar,
  editar,
  esgotar,
  inserir,
  remover,
  tirarDoDestaque,
} from "@/lib/db/produtos";

import { type Falha, type ValoresFormulario, falhaDoResultado } from "./erros";
import { mensagemDoMotivo } from "./mensagens";
import { idProduto, validarCamposProduto, versaoProduto } from "./validacao";

// Server Actions do painel de produtos (contrato §3). Ordem fixa em cada uma: guard antes de
// tudo, validação antes de qualquer SQL, `exigirCategoriaValida` antes de inserir/editar, só
// então banco. Sem sessão, `UnauthorizedError` propaga. Arquivo "use server": só funções
// async exportadas (e tipos). A action nunca redireciona: o destino de um sucesso é da UI.

export type ResultadoAction<T = object> = ({ ok: true } & T) | ({ ok: false } & Falha);

const LISTA = "/painel/produtos";

const idEVersao = z.object({ id: idProduto, versao: versaoProduto });

const falhar = (f: Falha): { ok: false } & Falha => ({ ok: false, ...f });
const falhaGeral = (): Falha => ({ motivo: "falha_geral", mensagem: mensagemDoMotivo("falha_geral") });

const texto = (formData: FormData, nome: string): string => {
  const v = formData.get(nome);
  return typeof v === "string" ? v : "";
};

// O checkbox chega como "on" ou ausente.
function lerValores(formData: FormData): ValoresFormulario {
  return {
    nome: texto(formData, "nome"),
    categoriaId: texto(formData, "categoriaId"),
    descricao: texto(formData, "descricao"),
    preco: texto(formData, "preco"),
    aPartirDe: formData.get("aPartirDe") === "on",
  };
}

function revalidar(id: number) {
  revalidatePath(LISTA);
  revalidatePath(`${LISTA}/${id}`);
}

// `valores` (o que foi enviado) acompanha toda falha dos formulários, para reidratar.
const falharComValores = (f: Falha, valores: ValoresFormulario) => falhar({ ...f, valores });

async function categoriaValida(categoriaId: number): Promise<Falha | null> {
  try {
    await exigirCategoriaValida(categoriaId);
    return null;
  } catch (erro) {
    if (erro instanceof CategoriaInvalidaError) return falhaDoResultado({ tipo: "categoria_ausente" });
    return falhaGeral();
  }
}

export async function criarProduto(
  _anterior: ResultadoAction<{ id: number }> | null,
  formData: FormData,
): Promise<ResultadoAction<{ id: number }>> {
  const sessao = await requireAdminAction();
  const valores = lerValores(formData);
  const v = validarCamposProduto(valores, "cadastro");
  if (!v.ok) return falharComValores(v.falhas[0], valores);

  const recusaCategoria = await categoriaValida(v.campos.categoriaId);
  if (recusaCategoria) return falharComValores(recusaCategoria, valores);

  let id: number;
  try {
    const r = await inserir(await dbDoContexto(), sessao, v.campos);
    if (r.tipo !== "ok") return falharComValores(falhaDoResultado(r), valores);
    id = r.id;
  } catch {
    return falharComValores(falhaGeral(), valores);
  }
  revalidar(id);
  return { ok: true, id };
}

export async function editarProduto(
  _anterior: ResultadoAction<{ id: number; versao: number }> | null,
  formData: FormData,
): Promise<ResultadoAction<{ id: number; versao: number }>> {
  const sessao = await requireAdminAction();
  const valores = lerValores(formData);
  const v = validarCamposProduto(
    { ...valores, id: formData.get("id"), versao: formData.get("versao") },
    "edicao",
  );
  if (!v.ok) return falharComValores(v.falhas[0], valores);
  const { id, versao } = v;
  if (id === undefined || versao === undefined) return falharComValores(falhaGeral(), valores);

  const recusaCategoria = await categoriaValida(v.campos.categoriaId);
  if (recusaCategoria) return falharComValores(recusaCategoria, valores);

  try {
    const r = await editar(await dbDoContexto(), sessao, id, versao, v.campos);
    if (r.tipo !== "ok") return falharComValores(falhaDoResultado(r), valores);
  } catch {
    return falharComValores(falhaGeral(), valores);
  }
  revalidar(id);
  // O UPDATE soma 1 à versão: devolve a nova, para o próximo envio do mesmo formulário.
  return { ok: true, id, versao: versao + 1 };
}

// id e versão vêm de campos ocultos; inválidos não são erro de digitação ⇒ falha_geral.
function lerIdEVersao(formData: FormData): z.infer<typeof idEVersao> | null {
  const r = idEVersao.safeParse({ id: formData.get("id"), versao: formData.get("versao") });
  return r.success ? r.data : null;
}

export async function marcarEsgotado(
  _anterior: ResultadoAction<{ saiuDoDestaque: boolean }> | null,
  formData: FormData,
): Promise<ResultadoAction<{ saiuDoDestaque: boolean }>> {
  const sessao = await requireAdminAction();
  const alvo = lerIdEVersao(formData);
  if (!alvo) return falhar(falhaGeral());

  let saiuDoDestaque: boolean;
  try {
    const r = await esgotar(await dbDoContexto(), sessao, alvo.id, alvo.versao);
    if (r.tipo !== "ok") return falhar(falhaDoResultado(r));
    saiuDoDestaque = r.saiuDoDestaque;
  } catch {
    return falhar(falhaGeral());
  }
  revalidar(alvo.id);
  return { ok: true, saiuDoDestaque };
}

type Executar = (
  db: Awaited<ReturnType<typeof dbDoContexto>>,
  sessao: AdminSession,
  id: number,
  versao: number,
) => Promise<{ tipo: "ok" } | { tipo: "removido" } | Parameters<typeof falhaDoResultado>[0]>;

// O guard é de cada action exportada (painel-guard): a sessão chega aqui já validada.
async function mudarProduto(
  sessao: AdminSession,
  formData: FormData,
  executar: Executar,
): Promise<ResultadoAction> {
  const alvo = lerIdEVersao(formData);
  if (!alvo) return falhar(falhaGeral());

  try {
    const r = await executar(await dbDoContexto(), sessao, alvo.id, alvo.versao);
    if (r.tipo === "ok" || r.tipo === "removido") {
      revalidar(alvo.id);
      return { ok: true };
    }
    return falhar(falhaDoResultado(r));
  } catch {
    return falhar(falhaGeral());
  }
}

export async function marcarDisponivel(
  _anterior: ResultadoAction | null,
  formData: FormData,
): Promise<ResultadoAction> {
  return mudarProduto(await requireAdminAction(), formData, disponibilizar);
}

export async function destacarProduto(
  _anterior: ResultadoAction | null,
  formData: FormData,
): Promise<ResultadoAction> {
  return mudarProduto(await requireAdminAction(), formData, destacar);
}

export async function tirarProdutoDoDestaque(
  _anterior: ResultadoAction | null,
  formData: FormData,
): Promise<ResultadoAction> {
  return mudarProduto(await requireAdminAction(), formData, tirarDoDestaque);
}

// A confirmação é da UI (tela própria): a action só é chamada depois dela.
export async function removerProduto(
  _anterior: ResultadoAction | null,
  formData: FormData,
): Promise<ResultadoAction> {
  return mudarProduto(await requireAdminAction(), formData, remover);
}
