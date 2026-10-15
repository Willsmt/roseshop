import "server-only";

import { getCloudflareContext } from "@opennextjs/cloudflare";

import type { CausaFalha } from "./falha";

// `registrarFalha` e os tipos fechados de evento, rota e causa vivem em `falha.ts` (puro, para o
// worker também usar).
export { type CausaFalha, type EventoFalha, type Falha, registrarFalha, type ResultadoFalha, type RotaFalha } from "./falha";

// O worker (SF6) passa ao OpenNext um `ctx` do pedido com `roseshop: { causa: null }`, e o
// OpenNext o devolve em `getCloudflareContext().ctx` (D11, conferido no spike). Onde a exceção
// acontece se marca a causa; o worker lê a marca no 500. Fora do worker não há `roseshop`.
export async function marcarCausaBanco(): Promise<void> {
  try {
    const { ctx } = await getCloudflareContext({ async: true });
    const marca = (ctx as unknown as { roseshop?: { causa: CausaFalha | null } }).roseshop;
    if (marca) marca.causa = "banco";
  } catch {
    // Sem contexto Cloudflare (teste, build): a marca é só um auxílio do log.
  }
}
