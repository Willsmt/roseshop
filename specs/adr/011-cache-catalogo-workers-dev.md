# ADR-011 — Páginas públicas dinâmicas no `*.workers.dev` (catálogo, feature 005)

**Status:** aceito em 2026-10-15 (aprovado pelo humano no GATE, T014 da feature 005), com as
emendas da spec FR-024/US2.8 e FR-020/SC-005 aplicadas (E1 e E2 abaixo).
**Data:** 2026-10-15
**Origem:** `specs/005-catalogo-publico/`: research D1, D2, D5, D11, D13, D16 e §5 (resultado do
spike SF0); tasks SF0 (T003, T005, T008); spec FR-020, FR-024, US2.8, SC-005, SC-008.

## Contexto

- O catálogo público (`/` e `/p/<código>`) roda no Worker em `*.workers.dev` (ADR-001,
  ADR-006). Nesse domínio não há cache de borda da Cloudflare nem Cache API utilizável: o único
  cache possível é o do navegador ou um cache gravado pelo próprio Worker.
- O FR-020 e o SC-005 exigem que qualquer alteração do painel apareça no catálogo em **até 1
  minuto**. O FR-024 pede, com o banco fora, a versão guardada da página quando existir; sem
  ela, 503 sem cache, nunca 404.
- O plano preferia o ISR do OpenNext (cache incremental no R2, fila em Durable Object,
  `revalidate` 15 s + `expireTime` 35 s + navegador 20 s = 55 s). O D2 já registrava um ponto
  não provado: o `expire` num isolate novo. O spike SF0 era o portão, e o fallback para páginas
  dinâmicas estava aprovado de antemão (P1).

## Decisão

- **Páginas públicas dinâmicas**: `/` e `/p/[codigo]` com `export const dynamic =
  "force-dynamic"`, renderizadas a cada pedido que chega ao Worker. Sem cache incremental, sem
  fila, sem Durable Object, sem bucket de cache e sem guarda de build (D13). `open-next.config.ts`,
  `next.config.ts` e os bindings do `wrangler.jsonc` não mudam por causa do cache.
- **Cache só no navegador**: o Worker grava `Cache-Control: public, max-age=60` nas respostas
  200, 308 e 404 de `/` e `/p/*` (D5, ramo FALLBACK). Pela RFC 9111 §4.2.3, a idade da resposta
  inclui o tempo do pedido (`response_delay`), e o banco é lido depois do envio, então o dado
  exibido tem no máximo 60 s (o D2 dizia "60 s + render"; leitura nova, sem teste). A rota
  `/fotos/*` já usa `max-age=60` (D6) e é o limite de qualquer forma. O 404 também fica 60 s:
  um produto recém-cadastrado aparece em até 60 s no navegador que já abriu o link.
  **E2 (GATE):** mantidos 60 s, sem folga: baixar só as páginas não muda o pior caso (a rota de
  fotos fica em 60 s) e aumenta a CPU por visita.
- **Falha do banco**: todo 500 de `/` e `/p/*` vira **503** `no-store` com `Retry-After: 30`,
  com a página "Não foi possível carregar agora" e "Tentar de novo". Não há versão guardada no
  servidor para servir. O FR-024 continua cumprido ("quando existir": nunca existe).
  **E1 (GATE):** FR-024, US2.8 e o edge case "Banco fora do ar" emendados: sem a cláusula da
  versão guardada, que só existia por causa do ISR.
- **Registro (D11)**: o Worker passa ao `handler.fetch` um `ctx` próprio do pedido, que chega
  intacto em `getCloudflareContext().ctx` (provado no spike pelo marcador `ctxTemRoseshop: true`;
  o log com `causa: "banco"` não foi capturado, prova na SF3/SF6). A leitura marca `causa = "banco"` e
  o Worker registra `catalogo.banco_indisponivel` ou `catalogo.erro_inesperado` com
  `resultado: "503"`. O `ctx` próprio repassa `waitUntil` e `passThroughOnException` com `bind`,
  porque espalhar o `ExecutionContext` perde os métodos do protótipo.
- **Configuração inválida** (por exemplo, sem `WHATSAPP_NUMBER`) registrada uma vez por isolate
  (D10), não a cada renderização.
- **Filtro por categoria no servidor**: a página inicial lê `searchParams.categoria` (D7
  simplificado); o GET da lista fica só para o "Carregar mais".
- **Token do CI inalterado**: sem cache no R2, o deploy não popula nada, e a ampliação com
  *Workers R2 Storage: Edit* (D16) não acontece.

## Evidência ([research §5](../005-catalogo-publico/research.md#5-resultado-do-spike-sf0))

O spike rodou no `preview` (workerd local, `@opennextjs/cloudflare` 1.20.8, `next` 16.3.8). Pela
opção aprovada na sessão, o worker descartável `roseshop-spike` só seria criado se o `preview`
passasse, e ele não passou. Nenhum recurso foi criado na nuvem.

- **Cenário a falhou**: por ~48 s depois de subir, `/` serviu a entrada do build, sem produtos
  (HIT e depois STALE). Causa: o `lastModified` do cache é o `uploaded` do objeto no R2, e o
  populate do `preview` (e, pela leitura do código, também o do deploy) regrava a entrada de
  build com a hora atual. Os cabeçalhos vêm do relato do humano e estão incompletos.
- **Cenário b falhou no detalhe**: `/p/0002` gerado, produto esgotado, servidor parado por mais
  de 70 s e reiniciado (isolate novo). O primeiro pedido veio `STALE`, sem "Esgotado". Causa:
  `dynamicRoutes["/p/[codigo]"]` no prerender manifest não tem `fallbackExpire`, e o Next procura
  a rota pelo caminho concreto (`/p/0002`), não pelo padrão; um caminho criado em tempo de
  execução só ganha `expire` depois de renderizado naquele isolate. Num isolate novo vale o
  stale-while-revalidate sem teto, o que viola o FR-020 numa página pouco visitada.
- **Passaram**: o cenário b na página inicial (rota pré-renderizada, com `initialExpireSeconds`)
  e o cenário c no mesmo isolate.
- **Banco fora com o ISR**: passados os 35 s, o detalhe em cache respondeu 503, e não a versão
  anterior que a leitura do `response-cache` previa (D5/P9). Não foi aprofundado; fica como
  registro para quem reabrir o ISR.

## Alternativas descartadas

- **ISR do OpenNext com R2 + fila em DO** (D1–D3): reprovado no spike pelos cenários a e b.
  Avaliação (não provada): contornar cada falha (repopular sem a entrada de build, forçar
  `expire` por rota dinâmica) exigiria remendar o adaptador ou o Next, fora do caminho
  documentado.
- **ISR com revalidação sob demanda** (`revalidatePath`/`revalidateTag` nas actions do painel):
  é o caminho canônico para o FR-020 com ISR e anularia o cenário b sem depender do `expire`.
  Descartada: exige tag cache (DO de tags), mexe nas actions das features 002, 003 e 004 e não
  resolve o cenário a (populate do deploy).
- **ISR só na página inicial e detalhe dinâmico**: a página inicial passou no cenário b, mas
  continua falhando o cenário a logo após subir (observado no `preview`; no deploy, pela
  leitura do código), e seriam dois mecanismos de cache para
  manter. Não proposto.
- **Cópia própria da última versão (HTML no R2) para o FR-024**: reimplementa o ISR, com
  escrita no R2 a cada renderização e um binding novo, para um cenário raro (Neon fora).

## Consequências

- **CPU e banco por visita**: cada primeira visita de um navegador (e cada visita depois de
  60 s) renderiza a página e consulta o Neon. Isso agrava o risco de CPU da T139/ADR-010 (10 ms
  no Workers Free). A medição de `/` e `/p/<código>` no dev foi antecipada para logo depois da
  SF8 (T072a/T072b), sem esperar a SF11. Sinal: Erro 1102. Contingência: Workers Paid com
  emenda da constitution VII (ADR-010).
- **Free tier (SC-008)**: sem R2 de cache nem Durable Object; o custo variável é CPU do Worker e
  compute do Neon, já no R3 (varredura) e no `docs/operacao.md`.
- **Banco fora**: a cliente vê 503 com "Tentar de novo" em vez de uma versão anterior; quando o
  banco volta, a página seguinte já mostra o estado atual (sem cache do erro).
- **Sem migration de remoção**: a classe `DOQueueHandler` nunca foi publicada no `roseshop-dev`
  nem no `roseshop`.
- **Como reverter para ISR**: reabrir o spike quando o OpenNext ou o Next registrar `expire` para
  caminhos de rota dinâmica criados em tempo de execução e o populate preservar a data da
  entrada; os passos da SF0 (T002, T015–T018) continuam em `tasks.md` como referência.

## Fora do escopo

- Revalidação sob demanda (`revalidatePath`/`revalidateTag` a partir do painel).
- Domínio próprio com cache de borda e rate limiting (contingência do R3).
