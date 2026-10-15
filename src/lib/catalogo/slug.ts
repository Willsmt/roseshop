// Validação do slug do filtro por categoria (research D7). O slug vem calculado do SQL;
// aqui só se confere o formato do que chega pela URL.

import { z } from "zod";

const slug = z
  .string()
  .max(60)
  .regex(/^[\p{Ll}\p{N}]+(-[\p{Ll}\p{N}]+)*$/u);

export function validarSlug(valor: unknown): string | null {
  const ok = slug.safeParse(valor);
  return ok.success ? ok.data : null;
}
