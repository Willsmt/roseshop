import "server-only";

import { type CategoriaDb, listar, obterPorId } from "@/lib/db/categorias";
import { dbDoContexto } from "@/lib/db/contexto";

import { idCategoria } from "./nome";

// Leitura do painel (contrato §2, H4-A): inclui `versao`, que só serve aos formulários
// (FR-019). Fora do barrel; importável só por src/app/painel/** e src/lib/categorias/**.
// A página chama `requireAdminPage` antes de ler.

export type CategoriaDoPainel = CategoriaDb;

export async function listarCategoriasDoPainel(): Promise<CategoriaDoPainel[]> {
  return listar(await dbDoContexto());
}

export async function obterCategoriaDoPainel(id: string): Promise<CategoriaDoPainel | null> {
  // O `[id]` chega da URL como string; só o decimal canônico passa (contrato §2).
  const valido = idCategoria.safeParse(id);
  if (!valido.success) return null;
  return obterPorId(await dbDoContexto(), valido.data);
}
