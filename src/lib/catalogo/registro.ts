import "server-only";

import { getCloudflareContext } from "@opennextjs/cloudflare";

// Registro estruturado de falhas do catálogo (contracts/publico.md §7, research D11).
// `causa` é um código fechado: nunca a mensagem da exceção, o valor de configuração, a chave de
// objeto, IP, cabeçalho ou e-mail.
export type CausaFalha = "banco" | "r2" | "config" | "inesperado";

export type Falha = {
  evento: string;
  rota: string;
  causa: CausaFalha;
  resultado?: string;
};

export function registrarFalha({ evento, rota, causa, resultado }: Falha): void {
  console.error(JSON.stringify({ evento, rota, causa, resultado }));
}

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
