import { NeonDbError } from "@neondatabase/serverless";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { createDb } from "@/lib/db/client";
import { codigoSqlstate } from "@/lib/db/erros-pg";
import { LOCK_PROBE_BATCH } from "@/lib/db/locks";

// Feature 002, T005 (D3-B, ADR-008): prova determinística de que db.batch roda numa
// única transação. NÃO toca em tabelas; reutilizado contra o Neon dev no CI (T062).
// O caso (d) prova o Fato 1 (forma do erro no db.batch: NeonDbError sem embrulho, sem
// `cause`, código em `error.code`) com o SQLSTATE 23001 sem usar tabela. O Fato 2
// (FK ON DELETE RESTRICT => 23001) exige tabela e é provado por fk-produtos.int.test.ts
// (feature 003), que roda no banco local e no Neon dev pelo CI do PR.
const db = createDb({
  DATABASE_URL: process.env.DATABASE_URL ?? "",
  NEON_FETCH_ENDPOINT: process.env.NEON_FETCH_ENDPOINT,
});

const S = Number(process.env.PROBE_SLEEP_S ?? "2");
const PRAZO_POLLING_MS = 5_000;
const INTERVALO_MS = 100;
const TIMEOUT_MS = (S + 2) * 1000 + PRAZO_POLLING_MS + 10_000;

/** Primeira coluna da primeira linha, seja a linha objeto ou array. */
function celula(resultado: unknown): unknown {
  const rows = Array.isArray(resultado) ? resultado : (resultado as { rows: unknown[] }).rows;
  const linha = rows[0];
  return Array.isArray(linha) ? linha[0] : Object.values(linha as object)[0];
}

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function locksConcedidos(): Promise<number> {
  const r = await db.execute(sql`
    SELECT count(*)::int AS n
    FROM pg_locks
    WHERE locktype = 'advisory'
      AND granted
      AND ((classid::bigint << 32) | objid::bigint) = ${LOCK_PROBE_BATCH}::bigint`);
  return Number((r.rows[0] as { n: number }).n);
}

async function esperarLockDeA(): Promise<void> {
  const limite = Date.now() + PRAZO_POLLING_MS;
  while (Date.now() < limite) {
    if ((await locksConcedidos()) === 1) return;
    await espera(INTERVALO_MS);
  }
  throw new Error(`lock advisory do batch A não apareceu em pg_locks em ${PRAZO_POLLING_MS} ms`);
}

describe("db.batch roda numa única transação (D3-B, ADR-008)", () => {
  it("(a) dois txid_current no mesmo batch são iguais; chamadas isoladas diferem", { timeout: TIMEOUT_MS }, async () => {
    const [a, b] = await db.batch([db.execute(sql`SELECT txid_current()::text`), db.execute(sql`SELECT txid_current()::text`)]);
    expect(celula(a)).toBe(celula(b));

    const isolada1 = await db.execute(sql`SELECT txid_current()::text`);
    const isolada2 = await db.execute(sql`SELECT txid_current()::text`);
    expect(celula(isolada1)).not.toBe(celula(isolada2));
  });

  it(
    "(b) o lock advisory de transação de A é mantido até o fim do batch e bloqueia C",
    { timeout: TIMEOUT_MS },
    async () => {
      const batchA = db.batch([
        db.execute(sql`SELECT pg_advisory_xact_lock(${LOCK_PROBE_BATCH}::bigint)`),
        db.execute(sql`SELECT pg_sleep(${S})`),
        db.execute(sql`SELECT extract(epoch FROM clock_timestamp())::float8 AS ts`),
      ]);
      // Evita rejeição não tratada se o polling falhar antes de A terminar.
      const aSettled = batchA.then(
        () => undefined,
        () => undefined,
      );

      try {
        await esperarLockDeA();

        const [, fimC] = await db.batch([
          db.execute(sql`SELECT pg_advisory_xact_lock(${LOCK_PROBE_BATCH}::bigint)`),
          db.execute(sql`SELECT extract(epoch FROM clock_timestamp())::float8 AS ts`),
        ]);
        const resultadoA = await batchA;
        const fimA = Number(celula(resultadoA[2]));
        expect(Number(celula(fimC))).toBeGreaterThanOrEqual(fimA);
      } finally {
        await aSettled;
      }

      expect(await locksConcedidos()).toBe(0);
    },
  );

  it("(c) o isolamento é read committed (snapshot novo por statement, depois do lock)", { timeout: TIMEOUT_MS }, async () => {
    const [iso] = await db.batch([
      db.execute(sql`SELECT current_setting('transaction_isolation')`),
      db.execute(sql`SELECT txid_current()::text`),
    ]);
    expect(celula(iso)).toBe("read committed");
  });

  it("(d) erro dentro do db.batch chega como NeonDbError sem cause, com code 23001", { timeout: TIMEOUT_MS }, async () => {
    let erro: unknown;
    let rejeitou = false;
    try {
      await db.batch([
        db.execute(sql`SELECT 1`),
        db.execute(sql.raw("DO $$ BEGIN RAISE EXCEPTION 'probe 23001' USING ERRCODE = 'restrict_violation'; END $$")),
      ]);
    } catch (e) {
      rejeitou = true;
      erro = e;
    }
    expect(rejeitou, "o batch deveria rejeitar").toBe(true);
    expect(erro).toBeInstanceOf(NeonDbError);
    expect((erro as NeonDbError).code).toBe("23001");
    expect((erro as { cause?: unknown }).cause).toBeUndefined();
    expect(codigoSqlstate(erro)).toBe("23001");
  });
});
