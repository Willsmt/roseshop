import { and, eq, sql, type SQL } from "drizzle-orm";

import type { AdminSession } from "@/lib/auth";

import type { Db } from "./client";
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
export async function marcarConfirmado(
  db: Db,
  sessao: AdminSession,
  id: string,
): Promise<boolean> {
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
