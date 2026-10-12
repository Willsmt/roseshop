import { sql } from "drizzle-orm";

import type { AdminSession } from "@/lib/auth";

import type { Db } from "./client";
import { LOCK_IA_USO } from "./locks";

// Contador de sugestões da IA (contracts/ia.md §3, ADR-010). Um `db.batch` sob o LOCK_IA_USO:
// o lock serializa os consumos e o INSERT toma snapshot novo depois dele, então os dois limites
// (por pessoa e total do dia de Brasília) são exatos sob concorrência. Os limites chegam como
// parâmetros (TL-15) e o dia é calculado uma vez na CTE.

export type LimitesSugestao = { porPessoa: number; total: number };

/** true ⇒ consumiu uma vaga (pode chamar a IA); false ⇒ sem vaga hoje (`ia_pausada`). */
export async function consumirSugestao(
  db: Db,
  sessao: AdminSession,
  limites: LimitesSugestao,
): Promise<boolean> {
  const [, r] = await db.batch([
    db.execute(sql`SELECT pg_advisory_xact_lock(${LOCK_IA_USO}::bigint)`),
    db.execute(sql`
      WITH d AS (SELECT (now() AT TIME ZONE 'America/Sao_Paulo')::date AS dia)
      INSERT INTO ia_uso (dia, email, n)
        SELECT d.dia, ${sessao.email}::text, 1 FROM d
        WHERE ${limites.porPessoa}::integer >= 1
          AND (SELECT coalesce(sum(u.n), 0) FROM ia_uso u, d WHERE u.dia = d.dia)
              < ${limites.total}::integer
      ON CONFLICT (dia, email) DO UPDATE SET n = ia_uso.n + 1
        WHERE ia_uso.n < ${limites.porPessoa}::integer
          AND (SELECT sum(u.n) FROM ia_uso u WHERE u.dia = EXCLUDED.dia) < ${limites.total}::integer
      RETURNING n`),
  ]);
  return r.rows.length > 0;
}
