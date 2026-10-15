import handler from "open-next-worker";

import { criarFetch } from "./publico";

// Worker próprio (contracts/fotos.md §6, ADR-009 D5): o `fetch` é o do OpenNext, embrulhado por
// `publico.ts` (rotas públicas do catálogo, contracts/publico.md §1; o resto passa intacto); o `scheduled`
// chama a rota da limpeza em processo, sem rede (`interno.invalid` não resolve).
// O `.open-next/worker.js` também exporta classes de Durable Object (fila e cache de tags); hoje
// não há `durable_objects` no wrangler.jsonc. Se o cache com DO for ligado, reexporte-as aqui.
export default {
  fetch: criarFetch(handler.fetch),
  async scheduled(_evento, env, ctx) {
    const resposta = await handler.fetch(
      new Request("https://interno.invalid/api/interno/limpeza", {
        method: "POST",
        headers: { authorization: `Bearer ${env.CRON_SECRET}` },
      }),
      env,
      ctx,
    );
    console.log(JSON.stringify({ evento: "limpeza", status: resposta.status }));
    // Sem lançar, o cron aparece "Ok" mesmo com erro (R3).
    if (resposta.status !== 200) throw new Error(`limpeza: status ${resposta.status}`);
  },
} satisfies ExportedHandler<CloudflareEnv>;
