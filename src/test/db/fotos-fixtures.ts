// Infra de teste de integração da feature 004 (envios de fotos). Não é teste nem produção.
// Usa SQL direto de propósito: não depende de src/lib/db/fotos.ts (os testes da camada SQL
// precisam criar envios em estados arbitrários, inclusive expirados).
import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";

import type { Db } from "@/lib/db/client";

export type EnvioFixture = {
  id?: string;
  formato?: "webp" | "jpeg";
  tamanho?: number;
  enviadoPor: string;
  estado?: "emitido" | "confirmado";
  /** Idade do envio em horas (criado_em = now() - idade). Padrão 0. */
  idadeHoras?: number;
};

/** Insere um envio no estado pedido e devolve id, chave (gerada pelo banco) e criado_em. */
export async function inserirEnvio(
  db: Db,
  { id = randomUUID(), formato = "webp", tamanho = 1000, enviadoPor, estado = "confirmado", idadeHoras = 0 }: EnvioFixture,
): Promise<{ id: string; chave: string; criadoEm: Date }> {
  const confirmado = estado === "confirmado";
  const r = await db.execute(sql`
    INSERT INTO fotos_envio (id, formato, tamanho, enviado_por, estado, criado_em, confirmado_em)
    VALUES (${id}::uuid, ${formato}, ${tamanho}, ${enviadoPor}, ${estado},
            now() - make_interval(hours => ${idadeHoras}::int),
            CASE WHEN ${confirmado} THEN now() - make_interval(hours => ${idadeHoras}::int) ELSE NULL END)
    RETURNING chave, criado_em`);
  const linha = (r.rows as { chave: string; criado_em: string | Date }[])[0];
  return { id, chave: linha.chave, criadoEm: new Date(linha.criado_em) };
}

export async function limparEnvios(db: Db): Promise<void> {
  await db.execute(sql.raw("DELETE FROM fotos_envio"));
}

export async function contarEnvios(db: Db): Promise<number> {
  const r = await db.execute(sql`SELECT count(*)::int AS n FROM fotos_envio`);
  return (r.rows as { n: number }[])[0].n;
}
