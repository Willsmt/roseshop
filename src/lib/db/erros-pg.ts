// SQLSTATE do driver (contrato §4). O código não sai de src/lib/db/: a camada db o
// converte em resultado discriminado antes de devolver.

/**
 * Lê o SQLSTATE de `error.cause.code`, onde o `DrizzleQueryError` embrulha o `NeonDbError`
 * (observado em T002). `error.code` no topo é ignorado de propósito (decisão 3 da SF3).
 */
export function codigoSqlstate(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const causa: unknown = (error as { cause?: unknown }).cause;
  if (typeof causa !== "object" || causa === null) return undefined;
  const code: unknown = (causa as { code?: unknown }).code;
  return typeof code === "string" ? code : undefined;
}
