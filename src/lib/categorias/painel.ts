import "server-only";

import { z } from "zod";

import { type CategoriaDb, listar, obterPorId } from "@/lib/db/categorias";
import { dbDoContexto } from "@/lib/db/contexto";

// Leitura do painel (contrato §2, H4-A): inclui `versao`, que só serve aos formulários
// (FR-019). Fora do barrel; importável só por src/app/painel/** e src/lib/categorias/**.
// A página chama `requireAdminPage` antes de ler.

export type CategoriaDoPainel = CategoriaDb;

// O `[id]` chega da URL como string. Só decimal canônico ("3"); o regex barra o que o
// `Number()` do z.coerce aceitaria por engano (" 3", "1e2", "0x10", "3.0", "03", ""),
// e o teto do `integer` do Postgres evita erro do banco (22003) em vez de `null`.
const idDaUrl = z
  .string()
  .regex(/^[1-9]\d{0,9}$/)
  .pipe(z.coerce.number<string>().int().positive().max(2_147_483_647));

export async function listarCategoriasDoPainel(): Promise<CategoriaDoPainel[]> {
  return listar(await dbDoContexto());
}

export async function obterCategoriaDoPainel(id: string): Promise<CategoriaDoPainel | null> {
  const valido = idDaUrl.safeParse(id);
  if (!valido.success) return null;
  return obterPorId(await dbDoContexto(), valido.data);
}
