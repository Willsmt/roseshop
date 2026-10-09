import "server-only";

import { dbDoContexto } from "@/lib/db/contexto";
import { chaveExibivel } from "@/lib/db/fotos";

// Leitura da rota de exibição (contracts/fotos.md §5): a rota não importa db/fotos (§1).
export async function fotoExibivel(chave: string): Promise<boolean> {
  return chaveExibivel(await dbDoContexto(), chave);
}
