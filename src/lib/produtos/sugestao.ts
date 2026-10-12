"use server";

import { z } from "zod";

import { pedirSugestao, LIMITE_POR_PESSOA, LIMITE_TOTAL, type ImagemSugestao } from "@/lib/ai";
import { requireAdminAction } from "@/lib/auth";
import { listarCategorias } from "@/lib/categorias";
import { dbDoContexto } from "@/lib/db/contexto";
import { enviosValidos, obterEnvio } from "@/lib/db/fotos";
import { consumirSugestao } from "@/lib/db/ia-uso";
import { envioIdsCadastro } from "@/lib/fotos/validacao";
import { lerObjeto } from "@/lib/r2";

import { validarDescricao, validarNome } from "./validacao";

// Server Action da sugestão por IA no cadastro (contracts/ia.md §2, FR-034). Ordem fixa: guard,
// Zod, envios válidos (só fotos confirmadas da própria pessoa, < 24 h: FR-033), consumo do
// limite ANTES da chamada, categorias, bytes pelo binding, IA e validação campo a campo
// (FR-029). Nada é gravado (FR-030). Fora o guard, toda falha vira `ia_indisponivel`: o
// cadastro manual segue (SC-009).

type Sugestao = { nome: string | null; categoriaId: number | null; descricao: string | null };
type Motivo = "ia_indisponivel" | "ia_pausada";

const MENSAGENS: Record<Motivo, string> = {
  ia_indisponivel: "Não deu para sugerir agora. Preencha você mesma.",
  ia_pausada: "As sugestões estão pausadas por agora. Preencha você mesma.",
};

const entrada = z.object({ envioIds: envioIdsCadastro });

const falhar = (motivo: Motivo) => ({ ok: false as const, motivo, mensagem: MENSAGENS[motivo] });

const TIPOS = { webp: "image/webp", jpeg: "image/jpeg" } as const;

// Base64 por rotina nativa (TL-9): `toBase64` onde o runtime oferece, senão o Buffer.
function emBase64(bytes: Uint8Array): string {
  const nativo = (bytes as Uint8Array & { toBase64?: () => string }).toBase64;
  if (typeof nativo === "function") return nativo.call(bytes);
  return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString("base64");
}

export async function sugerirProduto(e: { envioIds: string[] }): Promise<
  { ok: true; sugestao: Sugestao } | { ok: false; motivo: Motivo; mensagem: string }
> {
  const sessao = await requireAdminAction();
  const v = entrada.safeParse(e);
  if (!v.success) return falhar("ia_indisponivel");
  const ids = v.data.envioIds;

  try {
    const db = await dbDoContexto();
    const validos = await enviosValidos(db, sessao, ids);
    if (!ids.every((id) => validos.has(id))) return falhar("ia_indisponivel");
    const envios = await Promise.all(ids.map((id) => obterEnvio(db, sessao, id)));
    if (envios.some((envio) => !envio)) return falhar("ia_indisponivel");

    const consumiu = await consumirSugestao(db, sessao, {
      porPessoa: LIMITE_POR_PESSOA,
      total: LIMITE_TOTAL,
    });
    if (!consumiu) return falhar("ia_pausada");

    const categorias = await listarCategorias();

    const imagens: ImagemSugestao[] = [];
    for (const envio of envios) {
      const objeto = await lerObjeto(envio!.chave);
      if (!objeto) return falhar("ia_indisponivel");
      imagens.push({ tipo: TIPOS[envio!.formato], base64: emBase64(await objeto.bytes()) });
    }

    const r = await pedirSugestao({ imagens, categorias });
    if (!r.ok) return falhar("ia_indisponivel");

    const nome = validarNome(r.sugestao.nome);
    const descricao = validarDescricao(r.sugestao.descricao);
    const categoriaId = r.sugestao.categoriaId;
    const sugestao: Sugestao = {
      nome: nome.falha ? null : (nome.nome ?? null),
      categoriaId:
        categoriaId !== null && categorias.some((c) => c.id === categoriaId) ? categoriaId : null,
      descricao: descricao.falha ? null : (descricao.descricao ?? null),
    };
    if (sugestao.nome === null && sugestao.categoriaId === null && sugestao.descricao === null)
      return falhar("ia_indisponivel");
    return { ok: true, sugestao };
  } catch {
    return falhar("ia_indisponivel");
  }
}
