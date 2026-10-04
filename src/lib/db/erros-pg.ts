import { NeonDbError } from "@neondatabase/serverless";

// SQLSTATE do driver (contrato §4). O código não sai de src/lib/db/: a camada db o
// converte em resultado discriminado antes de devolver.

/**
 * Lê o SQLSTATE nas duas formas observadas (contrato §4, ADR-008):
 * - statement isolado: `DrizzleQueryError` embrulha o `NeonDbError` ⇒ `error.cause.code` (T002);
 * - `db.batch`: o `NeonDbError` chega sem embrulho ⇒ `error.code` (SF4).
 * `code` no topo só vale para instância real de `NeonDbError` (nunca pelo `name`); em
 * qualquer outro erro é ignorado de propósito.
 */
export function codigoSqlstate(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const daCausa = codigoString((error as { cause?: unknown }).cause);
  if (daCausa !== undefined) return daCausa;
  return error instanceof NeonDbError ? codigoString(error) : undefined;
}

function codigoString(valor: unknown): string | undefined {
  if (typeof valor !== "object" || valor === null) return undefined;
  const code: unknown = (valor as { code?: unknown }).code;
  return typeof code === "string" ? code : undefined;
}
