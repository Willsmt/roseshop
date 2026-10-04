// Registro único das chaves de lock advisory do Postgres (ADR-008).
//
// Regras:
// - Toda chave usada em `pg_advisory_xact_lock` mora aqui, com o comentário do seu uso.
// - Um número nunca é reutilizado, nem depois que a chave deixar de existir: comente-a
//   como aposentada em vez de apagar, para que invariantes futuros não colidam.
// - Inteiros positivos que cabem em bigint e em `Number.MAX_SAFE_INTEGER` (o probe
//   reconstrói a chave em `pg_locks` por `(classid << 32) | objid`).

/** Uso exclusivo do probe de transação do `db.batch` (feature 002, T005/T062). */
export const LOCK_PROBE_BATCH = 2_001;
