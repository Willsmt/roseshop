import { and, eq, sql, type SQL } from "drizzle-orm";

import type { AdminSession } from "@/lib/auth";

import type { Db } from "./client";
import { LOCK_FOTOS } from "./locks";
import { fotosEnvio } from "./schema";

// Camada SQL dos envios de foto (contracts/fotos.md §2.1). Emissão, confirmação e descarte
// são um statement cada, fora do LOCK_FOTOS: não consomem envio nem tocam `produto_fotos`
// (ADR-008, emenda de 2026-10-09). O consumo (adoção) mora nos writers de `produtos.ts`.
// Todo array vai como UM parâmetro: `${sql.param(ids)}::uuid[]` (TL-3).

export type FormatoFoto = "webp" | "jpeg";

export type EnvioLinha = {
  id: string;
  formato: FormatoFoto;
  chave: string;
  tamanho: number;
  enviadoPor: string;
  estado: "emitido" | "confirmado";
  criadoEm: Date;
  confirmadoEm: Date | null;
};

/** Envios da mesma pessoa nas últimas 24 h (D13). Aproximado sob concorrência dela mesma. */
export const TETO_PENDENTES = 20;

/**
 * `VALIDO(e)` do contrato: da própria pessoa, confirmado e com menos de 24 h. Usado na
 * leitura e repetido no INSERT e no DELETE da adoção (TL-11), sempre com o alias `e`.
 */
export function envioValido(sessao: AdminSession): SQL {
  return sql`e.enviado_por = ${sessao.email} AND e.estado = 'confirmado'
    AND e.criado_em > now() - interval '24 hours'`;
}

export async function emitirEnvio(
  db: Db,
  sessao: AdminSession,
  envio: { id: string; formato: FormatoFoto; tamanho: number },
): Promise<{ tipo: "ok"; chave: string } | { tipo: "muitos_pendentes" }> {
  const r = await db.execute(sql`
    INSERT INTO fotos_envio (id, formato, tamanho, enviado_por)
    SELECT ${envio.id}::uuid, ${envio.formato}::text, ${envio.tamanho}::integer,
           ${sessao.email}::text
    WHERE (SELECT count(*) FROM fotos_envio
           WHERE enviado_por = ${sessao.email}
             AND criado_em > now() - interval '24 hours') < ${TETO_PENDENTES}
    RETURNING chave`);
  const linha = (r.rows as { chave: string }[])[0];
  return linha ? { tipo: "ok", chave: linha.chave } : { tipo: "muitos_pendentes" };
}

export async function obterEnvio(
  db: Db,
  sessao: AdminSession,
  id: string,
): Promise<EnvioLinha | undefined> {
  const [linha] = await db
    .select()
    .from(fotosEnvio)
    .where(and(eq(fotosEnvio.id, id), eq(fotosEnvio.enviadoPor, sessao.email)))
    .limit(1);
  return linha as EnvioLinha | undefined;
}

/** Só `emitido` → `confirmado`. Já confirmado ⇒ false; a idempotência é da action (D13). */
export async function marcarConfirmado(db: Db, sessao: AdminSession, id: string): Promise<boolean> {
  const linhas = await db
    .update(fotosEnvio)
    .set({ estado: "confirmado", confirmadoEm: sql`now()` })
    .where(
      and(
        eq(fotosEnvio.id, id),
        eq(fotosEnvio.enviadoPor, sessao.email),
        eq(fotosEnvio.estado, "emitido"),
      ),
    )
    .returning({ id: fotosEnvio.id });
  return linhas.length > 0;
}

/** Recusa na confirmação: apaga só `emitido` da própria pessoa e devolve a chave do objeto. */
export async function descartarEnvio(
  db: Db,
  sessao: AdminSession,
  id: string,
): Promise<string | undefined> {
  const [linha] = await db
    .delete(fotosEnvio)
    .where(
      and(
        eq(fotosEnvio.id, id),
        eq(fotosEnvio.enviadoPor, sessao.email),
        eq(fotosEnvio.estado, "emitido"),
      ),
    )
    .returning({ chave: fotosEnvio.chave });
  return linha?.chave;
}

/** Ids que são `VALIDO` agora (TL-10). Serve à precedência de `foto_expirada` e à IA. */
export async function enviosValidos(
  db: Db,
  sessao: AdminSession,
  ids: string[],
): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const r = await db.execute(sql`
    SELECT e.id FROM fotos_envio e
    WHERE e.id = ANY(${sql.param(ids)}::uuid[]) AND ${envioValido(sessao)}`);
  return new Set((r.rows as { id: string }[]).map((l) => l.id));
}

/**
 * Exibição (contracts/fotos.md §5, ADR-009 D4): a chave só é servida se está em uma foto de
 * produto ou em um envio `confirmado`. Um statement.
 */
export async function chaveExibivel(db: Db, chave: string): Promise<boolean> {
  const r = await db.execute(sql`
    SELECT EXISTS (SELECT 1 FROM produto_fotos WHERE chave_objeto = ${chave}::text)
        OR EXISTS (SELECT 1 FROM fotos_envio WHERE chave = ${chave}::text
                                               AND estado = 'confirmado') AS exibivel`);
  return (r.rows as { exibivel: boolean }[])[0]?.exibivel === true;
}

// Conjunto de fotos de produto existente (contracts/fotos.md §2.3). Writer de fotos: altera só
// `fotos_versao`, `fotos_operacao`, `atualizado_por` e `atualizado_em`, nunca `versao` (emenda
// de 2026-10-09 do ADR-008; a concorrência dos campos da 003 segue independente).

export type FotoLinha = { posicao: number; chave: string; enviadoPor: string; enviadoEm: Date };

export type EntradaConjunto = {
  produtoId: number;
  fotosVersao: number; // a que a tela tinha
  atuais: string[]; // chaves lidas por lerConjunto na MESMA versão, em ordem
  novas: FotoLinha[]; // lista final, 1..3, em ordem (posicao = índice + 1)
  envioId?: string; // adicionar/trocar: a linha nova vem dele
};

export type ResultadoConjunto =
  | { tipo: "ok"; fotosVersao: number }
  | { tipo: "ausente" }
  | { tipo: "alterado" }
  | { tipo: "foto_expirada" };

type ConjuntoLido = { fotos_versao: number; chaves: string[] };

// Um statement só: versão e fotos do mesmo snapshot.
export async function lerConjunto(
  db: Db,
  produtoId: number,
): Promise<{ fotosVersao: number; fotos: FotoLinha[] } | undefined> {
  const r = await db.execute(sql`
    SELECT p.fotos_versao, coalesce((
      SELECT json_agg(json_build_object('posicao', f.posicao, 'chave', f.chave_objeto,
                                        'enviadoPor', f.enviado_por, 'enviadoEm', f.enviado_em)
                      ORDER BY f.posicao)
      FROM produto_fotos f WHERE f.produto_id = p.id), '[]'::json) AS fotos
    FROM produtos p WHERE p.id = ${produtoId}`);
  const linha = (
    r.rows as {
      fotos_versao: number;
      fotos: (Omit<FotoLinha, "enviadoEm"> & { enviadoEm: string })[];
    }[]
  )[0];
  if (!linha) return undefined;
  return {
    fotosVersao: linha.fotos_versao,
    fotos: linha.fotos.map((f) => ({ ...f, enviadoEm: new Date(f.enviadoEm) })),
  };
}

// FR-003: nunca 0 nem mais de 3 fotos, posições 1..n sem repetição nem buraco. Entrada fora
// disso é bug de quem chama (a action monta a lista): lança antes de tocar o banco.
function validarNovas(novas: FotoLinha[]): void {
  const ok =
    novas.length >= 1 &&
    novas.length <= 3 &&
    novas.every((f, i) => f.posicao === i + 1) &&
    new Set(novas.map((f) => f.chave)).size === novas.length;
  if (!ok)
    throw new Error(
      "substituirConjunto: novas deve ter de 1 a 3 fotos, posições 1..n e chaves distintas",
    );
}

/**
 * Batch sob LOCK_FOTOS (global): o UPDATE de `produtos` decide (fotos_versao lida, conjunto atual
 * igual ao lido, envio VALIDO, se houver, e chave nova = a do envio) e grava o token; os
 * statements seguintes só agem com a guarda G(tok). Mudança de conjunto = apagar todas as linhas do produto e reinserir a lista nova
 * nas posições 1..n: o UNIQUE (produto_id, posicao) não é adiável (research F10).
 */
export async function substituirConjunto(
  db: Db,
  sessao: AdminSession,
  entrada: EntradaConjunto,
): Promise<ResultadoConjunto> {
  validarNovas(entrada.novas);
  const { produtoId, fotosVersao, atuais, novas } = entrada;
  const chaves = novas.map((f) => f.chave);
  // Minúsculas como em `inserirComFotos`: o Postgres devolve o uuid assim.
  const envioId = entrada.envioId?.toLowerCase() ?? null;
  // `enviadoEm` das fotos existentes volta via Date (ms; o banco guarda µs): trunca uma vez e
  // fica estável. Nenhuma regra lê `enviado_em` (a limpeza usa a idade do objeto no R2).
  const tok = crypto.randomUUID();
  const guarda = sql`EXISTS (SELECT 1 FROM produtos
                             WHERE id = ${produtoId} AND fotos_operacao = ${tok}::uuid)`;
  const [, decisao] = await db.batch([
    db.execute(sql`SELECT pg_advisory_xact_lock(${LOCK_FOTOS}::bigint)`),
    db.execute(sql`
      UPDATE produtos
      SET fotos_versao = fotos_versao + 1, fotos_operacao = ${tok}::uuid,
          atualizado_por = ${sessao.email}, atualizado_em = now()
      WHERE id = ${produtoId} AND fotos_versao = ${fotosVersao}
        AND (SELECT coalesce(array_agg(chave_objeto ORDER BY posicao), '{}')
             FROM produto_fotos WHERE produto_id = ${produtoId}) = ${sql.param(atuais)}::text[]
        AND ${sql.param(chaves)}::text[] <@ (${sql.param(atuais)}::text[] || ARRAY(
             SELECT e.chave FROM fotos_envio e
             WHERE e.id = ${envioId}::uuid AND ${envioValido(sessao)}))
        AND (${envioId}::uuid IS NULL OR EXISTS (
             SELECT 1 FROM fotos_envio e
             WHERE e.id = ${envioId}::uuid AND ${envioValido(sessao)}
               AND e.chave = ANY(${sql.param(chaves)}::text[])))
      RETURNING fotos_versao`),
    // Sem envioId, `id = NULL` não casa com nada. VALIDO não se repete: só o UPDATE acima decide,
    // `now()` é fixo na transação e nada fora do LOCK_FOTOS tira um envio de `confirmado`
    // (`descartarEnvio` só apaga `emitido`; limpeza e adoções rodam sob o lock). Se o descarte
    // ou a limpeza saírem do lock, repetir VALIDO aqui.
    db.execute(sql`DELETE FROM fotos_envio WHERE id = ${envioId}::uuid AND ${guarda}`),
    db.execute(sql`DELETE FROM produto_fotos WHERE produto_id = ${produtoId} AND ${guarda}`),
    db.execute(sql`
      INSERT INTO produto_fotos (produto_id, posicao, chave_objeto, enviado_por, enviado_em)
      SELECT ${produtoId}, o.ord, o.chave, o.por, o.em
      FROM unnest(${sql.param(chaves)}::text[],
                  ${sql.param(novas.map((f) => f.enviadoPor))}::text[],
                  ${sql.param(novas.map((f) => f.enviadoEm))}::timestamptz[])
           WITH ORDINALITY AS o(chave, por, em, ord)
      WHERE ${guarda}`),
  ]);
  const gravada = (decisao.rows as { fotos_versao: number }[])[0];
  if (gravada) return { tipo: "ok", fotosVersao: gravada.fotos_versao };
  // 0 linhas: nada mudou; a leitura só escolhe a resposta (ausente → alterado → foto_expirada
  // → lança, F§2.3).
  const r = await db.execute(sql`
    SELECT fotos_versao, ARRAY(SELECT chave_objeto FROM produto_fotos
                               WHERE produto_id = ${produtoId} ORDER BY posicao) AS chaves
    FROM produtos WHERE id = ${produtoId}`);
  const atual = (r.rows as ConjuntoLido[])[0];
  if (!atual) return { tipo: "ausente" };
  const mesmoConjunto =
    atual.chaves.length === atuais.length && atual.chaves.every((c, i) => c === atuais[i]);
  if (atual.fotos_versao !== fotosVersao || !mesmoConjunto) return { tipo: "alterado" };
  let chaveEnvio: string | null = null;
  if (envioId !== null) {
    const e = await db.execute(sql`
      SELECT e.chave FROM fotos_envio e WHERE e.id = ${envioId}::uuid AND ${envioValido(sessao)}`);
    const valido = (e.rows as { chave: string }[])[0];
    if (!valido) return { tipo: "foto_expirada" };
    chaveEnvio = valido.chave;
  }
  if (!chaveNovaDoEnvio(chaves, atuais, chaveEnvio)) {
    throw new Error("substituirConjunto: chave nova em novas não é a do envio informado");
  }
  // Com as chaves em ordem, só resta a corrida do envio confirmado depois do batch: a tela recebe
  // o conjunto atual e a pessoa tenta de novo. Sem envio é inalcançável (fotos_versao só cresce).
  return envioId === null ? { tipo: "alterado" } : { tipo: "foto_expirada" };
}

// A mesma regra do UPDATE (F§2.3, opção ii): toda chave nova está em `atuais` ou é a do envio, e
// com envio essa chave está na lista. Só serve para distinguir a corrida do bug de quem chama.
function chaveNovaDoEnvio(chaves: string[], atuais: string[], chaveEnvio: string | null): boolean {
  const permitidas = new Set(chaveEnvio === null ? atuais : [...atuais, chaveEnvio]);
  return (
    chaves.every((c) => permitidas.has(c)) && (chaveEnvio === null || chaves.includes(chaveEnvio))
  );
}
