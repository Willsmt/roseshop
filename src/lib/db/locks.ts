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

/**
 * Serializa as remoções de categoria para manter ao menos uma (feature 002, FR-020,
 * D3-B). Usado só por `remover` em `categorias.ts`.
 */
export const LOCK_REMOCAO_CATEGORIAS = 2_002;

/**
 * Serializa as fotos (feature 004, ADR-008 emenda de 2026-10-09). Global, não por produto:
 * toda escrita em `produto_fotos` e todo consumo de `fotos_envio` (cadastro com fotos,
 * ações do conjunto, remoção de produto, limpeza). Emissão, confirmação e descarte de
 * `fotos_envio` ficam fora.
 */
export const LOCK_FOTOS = 4_001;

/** Torna exatos os limites de sugestões da IA (feature 004, contracts/ia.md §3). */
export const LOCK_IA_USO = 4_002;
