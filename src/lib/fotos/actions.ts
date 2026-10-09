"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { type AdminSession, requireAdminAction } from "@/lib/auth";
import { dbDoContexto } from "@/lib/db/contexto";
import {
  descartarEnvio,
  emitirEnvio,
  type FotoLinha,
  lerConjunto,
  marcarConfirmado,
  obterEnvio,
  substituirConjunto,
} from "@/lib/db/fotos";
import {
  apagarObjetos,
  arquivoDaChave,
  assinarEnvio,
  configR2,
  lerObjeto,
  modoVerificacao,
  verificarImagem,
} from "@/lib/r2";

import { type AcaoConjunto, aplicarAcao, type NovaFoto } from "./conjunto";
import { falhaFoto, motivoDaVerificacao } from "./erros";
import { uuidEnvio } from "./validacao";
import type { Conjunto, FalhaFoto, FotoVista, MotivoFoto, ResultadoFotos } from "./tipos";

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

// Ações do conjunto (contracts/fotos.md §3). Ordem fixa: guard → Zod → lerConjunto → regra pura
// (conjunto.ts) → substituirConjunto → R2 em melhor esforço. A chave nova e a autoria vêm do
// envio lido no banco pela sessão, nunca do cliente. Toda resposta que pode ler o conjunto traz o
// atual e a fotos_versao dele (FR-024), para a tela usar na ação seguinte.

const LISTA = "/painel/produtos";

const produtoId = z.number().int().positive();
const fotosVersao = z.number().int().min(0);
const posicao = z.number().int().min(1).max(3);

const entradaAdicionar = z.object({ produtoId, fotosVersao, envioId: uuidEnvio });
const entradaTrocar = z.object({ produtoId, fotosVersao, posicao, envioId: uuidEnvio });
const entradaRemover = z.object({ produtoId, fotosVersao, posicao });
const entradaMover = z.object({ produtoId, fotosVersao, de: posicao, para: posicao });

type Lido = { fotosVersao: number; fotos: FotoLinha[] };

function vistaFotos(fotos: FotoLinha[]): FotoVista[] {
  return fotos.map((f) => {
    const arquivo = arquivoDaChave(f.chave);
    if (!arquivo) throw new Error("Chave de foto fora do formato");
    return { posicao: f.posicao, arquivo, url: `/painel/fotos/${arquivo}` };
  });
}

const vista = (lido: Lido): Conjunto => ({
  fotosVersao: lido.fotosVersao,
  fotos: vistaFotos(lido.fotos),
});

const falharCom = (motivo: MotivoFoto, lido: Lido): Falhou => ({
  ok: false,
  ...falhaFoto(motivo, vista(lido)),
});

// Releitura depois de uma falha do batch: o atual que a tela precisa. Produto sumido ⇒ nao_existe;
// releitura que também falha ⇒ o motivo sem atual.
async function falharRelendo(db: Db, id: number, motivo: MotivoFoto): Promise<Falhou> {
  try {
    const lido = await lerConjunto(db, id);
    if (!lido) return falhar("nao_existe");
    return falharCom(motivo, lido);
  } catch {
    return falhar(motivo);
  }
}

async function alterarConjunto(
  base: { produtoId: number; fotosVersao: number; envioId?: string },
  montar: (nova: NovaFoto | undefined) => AcaoConjunto | undefined,
  sessao: AdminSession,
): Promise<ResultadoFotos> {
  const { produtoId: id, envioId } = base;
  let db: Db;
  let lido: Lido | undefined;
  try {
    db = await dbDoContexto();
    lido = await lerConjunto(db, id);
  } catch {
    return falhar("falha_geral");
  }
  if (!lido) return falhar("nao_existe");

  let gravado: { fotosVersao: number; fotos: FotoVista[]; saiu?: string };
  try {
    if (lido.fotosVersao !== base.fotosVersao) return falharCom("alterado", lido);

    let nova: NovaFoto | undefined;
    if (envioId) {
      // Só um envio confirmado da própria sessão vira foto; a validade de 24 h é do batch.
      const envio = await obterEnvio(db, sessao, envioId);
      if (!envio || envio.estado !== "confirmado") return falharCom("foto_expirada", lido);
      nova = { chave: envio.chave, enviadoPor: envio.enviadoPor, enviadoEm: envio.criadoEm };
    }

    const acao = montar(nova);
    if (!acao) return falharCom("falha_geral", lido);
    const regra = aplicarAcao(lido.fotos, acao);
    if (!regra.ok) return falharCom(regra.motivo, lido);
    // A vista sai antes do batch: um erro nela vira falha_geral sem gravar nada.
    const fotos = vistaFotos(regra.novas);

    const r = await substituirConjunto(db, sessao, {
      produtoId: id,
      fotosVersao: lido.fotosVersao,
      atuais: lido.fotos.map((f) => f.chave),
      novas: regra.novas,
      ...(envioId ? { envioId } : {}),
    });
    if (r.tipo === "ausente") return falhar("nao_existe");
    if (r.tipo !== "ok") return falharRelendo(db, id, r.tipo);
    gravado = { fotosVersao: r.fotosVersao, fotos, saiu: regra.saiu };
  } catch {
    return falharRelendo(db, id, "falha_geral");
  }

  // Daqui em diante o batch já valeu: nada abaixo transforma o sucesso em falha.
  revalidatePath(LISTA);
  revalidatePath(`${LISTA}/${id}`);
  if (gravado.saiu) {
    try {
      await apagarObjetos([gravado.saiu]);
    } catch {
      // Melhor esforço (FR-036): o batch fica; o objeto órfão sai na limpeza diária (§6).
      console.warn("fotos.conjunto.objeto_nao_apagado", { produtoId: id });
    }
  }
  return { ok: true, fotosVersao: gravado.fotosVersao, fotos: gravado.fotos };
}

export async function adicionarFoto(e: {
  produtoId: number;
  fotosVersao: number;
  envioId: string;
}): Promise<ResultadoFotos> {
  const sessao = await requireAdminAction();
  const v = entradaAdicionar.safeParse(e);
  if (!v.success) return falhar("falha_geral");
  return alterarConjunto(v.data, (nova) => nova && { tipo: "adicionar", nova }, sessao);
}

export async function trocarFoto(e: {
  produtoId: number;
  fotosVersao: number;
  posicao: 1 | 2 | 3;
  envioId: string;
}): Promise<ResultadoFotos> {
  const sessao = await requireAdminAction();
  const v = entradaTrocar.safeParse(e);
  if (!v.success) return falhar("falha_geral");
  const { posicao: p } = v.data;
  return alterarConjunto(v.data, (nova) => nova && { tipo: "trocar", posicao: p, nova }, sessao);
}

export async function removerFoto(e: {
  produtoId: number;
  fotosVersao: number;
  posicao: 1 | 2 | 3;
}): Promise<ResultadoFotos> {
  const sessao = await requireAdminAction();
  const v = entradaRemover.safeParse(e);
  if (!v.success) return falhar("falha_geral");
  const { posicao: p } = v.data;
  return alterarConjunto(v.data, () => ({ tipo: "remover", posicao: p }), sessao);
}

export async function moverFoto(e: {
  produtoId: number;
  fotosVersao: number;
  de: 1 | 2 | 3;
  para: 1 | 2 | 3;
}): Promise<ResultadoFotos> {
  const sessao = await requireAdminAction();
  const v = entradaMover.safeParse(e);
  if (!v.success) return falhar("falha_geral");
  const { de, para } = v.data;
  return alterarConjunto(v.data, () => ({ tipo: "mover", de, para }), sessao);
}
