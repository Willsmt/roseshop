"use server";

import { z } from "zod";

import { type AdminSession, requireAdminAction } from "@/lib/auth";
import { dbDoContexto } from "@/lib/db/contexto";
import { descartarEnvio, emitirEnvio, marcarConfirmado, obterEnvio } from "@/lib/db/fotos";
import {
  apagarObjetos,
  arquivoDaChave,
  assinarEnvio,
  configR2,
  lerObjeto,
  modoVerificacao,
  verificarImagem,
} from "@/lib/r2";

import { falhaFoto, motivoDaVerificacao } from "./erros";
import { uuidEnvio } from "./validacao";
import type { FalhaFoto, MotivoFoto } from "./tipos";

// Server Actions de envio de foto (contracts/fotos.md §3). Ordem fixa: guard antes de tudo,
// Zod antes de qualquer SQL, só então banco e R2. Sem sessão, `UnauthorizedError` propaga.
// Chamadas programáticas (objeto, não FormData); nunca redirecionam.

const TAMANHO_MAXIMO = 1_048_576;
const LOG_REGISTRO = "fotos.verificacao.registro";

type Falhou = { ok: false } & FalhaFoto;
const falhar = (motivo: MotivoFoto): Falhou => ({ ok: false, ...falhaFoto(motivo) });

const entradaPedido = z.object({
  formato: z.enum(["webp", "jpeg"]),
  tamanho: z.number().int().min(1),
});
const entradaConfirmacao = z.object({ envioId: uuidEnvio });

type Db = Awaited<ReturnType<typeof dbDoContexto>>;

export async function pedirEnvio(e: { formato: "webp" | "jpeg"; tamanho: number }): Promise<
  | {
      ok: true;
      envioId: string;
      url: string;
      headers: Record<"content-type" | "if-none-match", string>;
    }
  | Falhou
> {
  const sessao = await requireAdminAction();
  const v = entradaPedido.safeParse(e);
  if (!v.success) return falhar("falha_geral");
  const { formato, tamanho } = v.data;
  if (tamanho > TAMANHO_MAXIMO) return falhar("grande");

  try {
    // Config do R2 antes de gravar: ausente ⇒ falha_geral sem deixar linha `emitido` contando no
    // teto de pendentes (D13).
    await configR2();
  } catch {
    return falhar("falha_geral");
  }

  const id = crypto.randomUUID();
  let db: Db;
  let chave: string;
  try {
    db = await dbDoContexto();
    const r = await emitirEnvio(db, sessao, { id, formato, tamanho });
    if (r.tipo === "muitos_pendentes") return falhar("muitos_pendentes");
    chave = r.chave;
  } catch {
    return falhar("falha_geral");
  }

  try {
    const assinado = await assinarEnvio({ chave, formato, tamanho });
    return {
      ok: true,
      envioId: id,
      url: assinado.url,
      headers: {
        "content-type": assinado.headers["content-type"],
        "if-none-match": assinado.headers["if-none-match"],
      },
    };
  } catch {
    // A linha já foi gravada: sai em melhor esforço (o objeto nunca foi enviado).
    try {
      await descartarEnvio(db, sessao, id);
    } catch {
      console.warn("fotos.envio.linha_nao_descartada");
    }
    return falhar("falha_geral");
  }
}

// TL-2: apaga a LINHA primeiro; o objeto só se a linha voltar. Uma confirmação concorrente
// que já marcou `confirmado` não perde o objeto.
async function recusar(db: Db, sessao: AdminSession, id: string, motivo: MotivoFoto): Promise<Falhou> {
  const chave = await descartarEnvio(db, sessao, id);
  if (chave) {
    try {
      await apagarObjetos([chave]);
    } catch {
      // Melhor esforço: o objeto órfão sai na limpeza diária (§6).
      console.warn("fotos.confirmacao.objeto_nao_apagado", { envioId: id });
    }
  }
  return falhar(motivo);
}

function confirmado(envioId: string, chave: string) {
  const arquivo = arquivoDaChave(chave);
  if (!arquivo) return falhar("falha_geral");
  return { ok: true as const, envioId, arquivo };
}

export async function confirmarEnvio(e: {
  envioId: string;
}): Promise<{ ok: true; envioId: string; arquivo: string } | Falhou> {
  const sessao = await requireAdminAction();
  const v = entradaConfirmacao.safeParse(e);
  if (!v.success) return falhar("falha_geral");
  const id = v.data.envioId;

  try {
    const db = await dbDoContexto();
    const envio = await obterEnvio(db, sessao, id);
    if (!envio) return falhar("falha_geral");
    // Idempotente: já confirmado não é verificado de novo.
    if (envio.estado === "confirmado") return confirmado(id, envio.chave);

    const objeto = await lerObjeto(envio.chave);
    // A linha fica: "Tentar de novo" pede um envio novo.
    if (!objeto) return falhar("nao_enviada");
    // O tamanho vem dos metadados: o corpo não é lido.
    if (objeto.tamanho > TAMANHO_MAXIMO || objeto.tamanho !== envio.tamanho) {
      return recusar(db, sessao, id, "grande");
    }

    const declarado = envio.chave.endsWith(".webp") ? "webp" : "jpeg";
    const modo = modoVerificacao();
    const r = verificarImagem(await objeto.bytes(), { declarado, modo });
    // Modo registro (research D4): só blocos, motivo e regra; nunca bytes.
    if (!r.ok) {
      if (modo === "registro") {
        console.warn(LOG_REGISTRO, {
          envioId: id,
          resultado: "recusado",
          motivo: r.motivo,
          regra: r.regra,
          blocos: r.blocos,
        });
      }
      return recusar(db, sessao, id, motivoDaVerificacao(r.motivo));
    }
    if (modo === "registro") {
      console.warn(LOG_REGISTRO, { envioId: id, resultado: "aceito", blocos: r.blocos });
    }

    if (await marcarConfirmado(db, sessao, id)) return confirmado(id, envio.chave);
    // 0 linhas: outra confirmação concorrente ganhou (ok) ou a linha sumiu (falha).
    const relido = await obterEnvio(db, sessao, id);
    return relido?.estado === "confirmado" ? confirmado(id, relido.chave) : falhar("falha_geral");
  } catch {
    return falhar("falha_geral");
  }
}
