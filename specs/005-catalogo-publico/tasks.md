# Tasks: Catálogo público (feature 005)

**Branch**: `feature/005-catalogo-publico` | **Fontes**: [plan.md](./plan.md),
[research.md](./research.md) ("D<n>", "P<n>", "R<n>"), [data-model.md](./data-model.md) ("DM§n"),
[contracts/publico.md](./contracts/publico.md) ("C§n"), [contracts/telas.md](./contracts/telas.md)
("T§"), [quickstart.md](./quickstart.md) ("Q§n"). Da spec: Clarifications e critérios de aceite.

## Como ler

- Cada sub-fase (SF) é **pequena e autossuficiente**: a implementação lê só a sua seção e os
  trechos citados em **Usa**. Cada seção traz **Usa**, **Arquivos**, **Fecha** (critérios de
  aceite), **Revisão TL**, as tasks e a mensagem de commit.
- Formato: `- [ ] Txxx [P?] [USn…] Descrição com caminho — **dono**`. `[P]` = pode rodar em
  paralelo com a task vizinha, sem arquivo em comum. Sem `[P]` = em série. Nomes de arquivo que
  o plan não fixa são marcados "sugerido".
- **Donos**: `principal` = sessão principal · `test-writer` (sonnet) · `ui-dev` (sonnet) ·
  `tech-lead` (opus, só revisa o diff) · `júnior` (haiku, roda verificação e devolve output) ·
  `redator` (haiku) · `doc-sync` (`doc-sync-onboarding`) · `humano` (executa, aprova, commita).
- Testes antes da implementação (Red → Green) em cada SF. **"Pronto" de cada SF** = `npm run
  check` verde (+ `npm run test:int` quando a SF tem `*.int.test.ts`) com **output real**, nunca
  simulado.
- **`test:int` sempre em série**: nunca duas execuções ao mesmo tempo no banco local (nem por
  agentes em paralelo, nem junto do `test:perf`). Antes de rodar, conferir que nenhum outro
  `vitest` com `vitest.int.config.mts` está ativo.
- **Revisão TL ✅**: a SF toca zona protegida (`src/lib/db/`, `wrangler.jsonc`, `.dev.vars.example`,
  `cloudflare/`, `open-next.config.ts`, `next.config.ts`) ou superfície de segurança pública
  (rota de fotos). Tasks de implementação nessas zonas levam **[TL✅]**. A penúltima task dessas
  SFs é a revisão do diff pelo tech-lead.
- **A última task de cada SF é o commit, feito pelo humano**, com a mensagem pronta
  (Conventional Commits, linhas ≤ 100 caracteres, **sem** trailer de co-autoria). Nas SFs com
  Revisão TL ✅, o humano revisa o diff antes de commitar (constitution III.7).
- Agentes nunca leem, imprimem nem editam `.dev.vars` (só `.dev.vars.example`). Nenhuma task
  acessa o banco do Neon (dev ou produção) a partir da máquina local; R2, secrets, logs e
  `deploy:dev` do dev são operados pelo **humano** via `wrangler`.
- Nenhum `git push` sem confirmação do humano (comando e corpo do PR mostrados antes).

### Ramo ISR × ramo FALLBACK

O SF0 decide o ramo (T008) e registra a decisão em `research.md` §5. Até lá, valem os dois.

- **[ISR]** = task (ou trecho) executada **só** se o SF0 passar: páginas com `revalidate = 15`,
  `expireTime: 35` (35 s é o `expireTime`, não o `revalidate`; research D2/A2), cache incremental
  no R2, fila em DO, navegador `max-age=20`, filtro no cliente (D7), guarda de build (D13),
  repetição do pedido no 500 (P9), passagem direta dos pedidos de revalidação da fila (D5) e
  token do CI com *Workers R2 Storage: Edit* para o deploy popular o cache (D16).
- **[FALLBACK]** = task (ou trecho) executada **só** se o SF0 falhar (research D2, aprovado em
  P1, sem reabrir o plan): páginas `export const dynamic = "force-dynamic"`, navegador
  `public, max-age=60`, sem cache incremental, sem fila, sem guarda de build, sem ampliar o token do CI; a
  página inicial lê `searchParams` no servidor; no 500 não há versão guardada, então todo 500
  público vira 503; configuração inválida é registrada uma vez por isolate (D10).
- Ao executar uma SF, a task do ramo **não escolhido** é marcada `[X]` com a nota
  "não se aplica (ramo <X>, T008)". Trechos marcados dentro de uma task seguem a mesma regra.
- Resumo das tasks condicionais em [Tasks condicionais](#tasks-condicionais-isr--fallback).

## Ordem entre SFs

`SF0 (spike → GATE ADR-011 na T014 → [ISR] buckets, credenciais e infra definitiva T015–T018 → commit T019) → SF1` · `SF1 → SF2 → SF3` · `SF3 → SF4` · `SF3 → SF5` ·
`SF6` (depende do SF0 e da SF2, por `prazos.ts`) · `SF3 + SF6 → SF7 → SF8 → SF9` · `SF4 + SF5 + SF9 → SF10 → SF11 →
SF12`.

SF2 não depende de banco e pode ser feita junto com a SF1 por outra pessoa, mas o commit de cada
uma é separado. Nada vai a `main` antes da SF12.

---

## SF0 — Spike do prazo de 1 minuto com ISR e ADR-011 (bloqueia todas as outras)

**Usa**: research D1, D2, D3, D5 (P9), D11, D13, R1, R4, R6; Q§2 (cenários a, b, c e as
conferências P9 e D11); plan, linha SF0.
**Onde o spike roda**: no `preview` (local) e num worker **descartável** `roseshop-spike`
(`*.workers.dev`, bucket de cache próprio `roseshop-cache-spike`, mesma branch dev do Neon com
secret próprio). **Nunca** no `roseshop-dev` nem no `roseshop`.
**Arquivos descartáveis (nunca commitados)**: toda a T002 (infra do spike, incluindo o
`env.spike`) e toda a T004 (páginas, SQL e trecho `// SPIKE` do worker). A T010 devolve o tree ao
`HEAD`.
**Arquivos commitados**: `research.md` §5, `specs/adr/011-cache-catalogo-workers-dev.md`
(sugerido) e, só **[ISR]**, a infra definitiva da T016 (`open-next.config.ts`, `next.config.ts`,
`wrangler.jsonc`, `cloudflare/worker.ts`, `cloudflare-env.d.ts`) e o `docs/operacao.md` da T015b
(commit `docs` próprio).
**Fecha**: R1, R4 (parcial), R6; decide o ramo. Habilita SF1 após o GATE e, no ramo ISR, após a
infra definitiva.
**Revisão TL**: ✅ (infra protegida + ADR).

- [X] T001 **Humano executa**: `npx wrangler r2 bucket create roseshop-cache-spike` (privado, sem
  CORS, sem token S3) e `npx wrangler r2 bucket list` mostrando o bucket. Entregar o output real
  — **humano** — **não se aplica**: o `roseshop-spike` só rodaria se o `preview` passasse (opção A da sessão, 2026-10-15); nenhum bucket criado
- [X] T002 **[TL✅]** (sem revisão TL: código descartado na T010) Infra do spike, **descartável** (D1, D2, D3):
  `open-next.config.ts` com `incrementalCache: r2IncrementalCache`
  (`@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache`) e `queue: doQueue`
  (`@opennextjs/cloudflare/overrides/queue/do-queue`), **sem** `tagCache`;
  `next.config.ts` com `expireTime: 35` (é o `expireTime`, não o `revalidate`; headers do painel
  inalterados);
  `wrangler.jsonc`: no nível de cima (local), `r2_buckets` += `{ binding:
  "NEXT_INC_CACHE_R2_BUCKET", bucket_name: "roseshop-cache-local" }`, `durable_objects.bindings`
  = `[{ name: "NEXT_CACHE_DO_QUEUE", class_name: "DOQueueHandler" }]` e `migrations` = `[{ tag:
  "v1", new_sqlite_classes: ["DOQueueHandler"] }]`; um bloco `env.spike` com `name:
  "roseshop-spike"`, **`triggers: { crons: [] }`** (o cron da limpeza da 004 **não** pode rodar no
  spike: ele mexeria em `fotos_envio` da branch dev do Neon), `services` `WORKER_SELF_REFERENCE` →
  `roseshop-spike`, `r2_buckets` só com `NEXT_INC_CACHE_R2_BUCKET` → `roseshop-cache-spike` (sem
  `PRODUCT_IMAGES`), o mesmo `durable_objects` e a mesma `migrations`. **`env.dev` e
  `env.production` não mudam.** `cloudflare/worker.ts`: `export { DOQueueHandler } from
  "open-next-worker";`. `npm run cf-typegen` — **principal**
- [X] T003 Conferir no código instalado de `@opennextjs/cloudflare` 1.20.x e `next` 16.3.8 (sem
  rede) e anotar em rascunho para a T007: (a) se o `expire` vai para `fallbackExpire` da rota
  `/p/[codigo]` no prerender manifest gerado em `.open-next/`; (b) se o `ctx` passado a
  `handler.fetch` chega em `getCloudflareContext().ctx` (D11) — **principal**
- [X] T004 Código do spike, **descartável** (listar cada arquivo criado no rascunho da sessão
  para a T010 apagar): substituir temporariamente `src/app/page.tsx` e criar
  `src/app/p/[codigo]/page.tsx`, ambos com `export const revalidate = 15`, mostrando o instante
  da renderização (`gerado em <ISO>`) para observar a regeneração. `/` lista `id`, `nome` e
  `esgotado` por `criado_em DESC` e, no build (`process.env.NEXT_PHASE ===
  "phase-production-build"`), devolve "indisponível" sem tocar no banco (D13). `/p/[codigo]`
  tem `generateStaticParams → []`, chama `notFound()` se o produto não existe e mostra
  "Esgotado" ou o texto "BOTÃO WHATSAPP". SQL temporário em `src/lib/db/spike.ts` via
  `dbDoContexto`. Na falha do banco, marcar `ctx.roseshop.causa = "banco"` (via
  `getCloudflareContext().ctx`) e relançar. No `cloudflare/worker.ts`, um bloco `// SPIKE` que
  passa ao `handler.fetch` um `ctx` próprio `{ ...ctx original, roseshop: { causa: null } }`
  (preservando `waitUntil`/`passThroughOnException`) e, no 500 de `/` ou `/p/*`, repete o pedido
  uma vez, registra `console.error(JSON.stringify({ evento, causa, resultado }))` e responde
  503 `no-store` se vier 500 de novo (D5, P9). Pedido com `x-isr: 1` (revalidação da fila) passa
  sem mudança e, no 500, só registra com `resultado: "revalidacao"` (D5). Nenhum teste novo: o spike não entra no `check`
  — **principal**
- [X] T005 **Humano executa no `preview`** (banco local com ≥ 3 produtos, um deles B e outro C,
  disponíveis): cenários Q§2 **a**, **b** (reiniciar o `preview` durante a espera para ter isolate
  novo; esperar > 60 s) e **c**. Para cada pedido, `curl -s -D - -o /dev/null` com
  `x-nextjs-cache`, `cache-control`, `age`/`date` e o `gerado em` do corpo. Depois, as
  conferências: **P9** (`/p/<código>` em cache, `npm run db:down`, esperar > 35 s, abrir ⇒ 200
  com a versão anterior e `no-store`; código nunca visitado ⇒ 503; logs com `resultado`).
  **Nota (A1)**: só a resposta repetida pelo worker sai `no-store`; pedidos seguintes ao mesmo
  detalhe, ainda com o banco fora, vêm com 200 e `max-age=20`, e isso **não** é falha do P9
  (research D5). Registrar também quanto tempo depois do `db:up` o estado atual aparece
  (esperado ≤ 60 s). **D11** (o log mostra `causa: "banco"`). **C1**: com o banco fora e a
  entrada entre 15 e 35 s, um pedido dispara a revalidação da fila e o log mostra
  `resultado: "revalidacao"`, sem `Retry-After` nem 503 no `HEAD` da fila. `npm run db:up` ao
  fim. Entregar o output real — **humano** — **feito** (relato do humano, 2026-10-15; research §5): a e b (detalhe) falharam; P9 deu 503; D11 passou
- [X] T006 **Humano executa no `roseshop-spike`** (cenários a, b, c; P9 não se repete online
  porque o Neon não é derrubado): criar no painel da Cloudflare um token **temporário**
  `roseshop-spike-deploy` com o **mesmo escopo** que o token do CI terá no ramo ISR (*Workers
  Scripts: Edit*, *Workers R2 Storage: Edit* e as leituras de conta/usuário do token atual,
  restrito à conta; research D16); com ele só numa variável do shell (`read -rs`, exportado como
  `CLOUDFLARE_API_TOKEN`, nunca o login OAuth): `npx opennextjs-cloudflare build && npx
  opennextjs-cloudflare deploy --env spike`, cujo log precisa mostrar "Populating remote R2
  incremental cache" e "Successfully populated cache" (prova do A4 antes do GATE; falha aqui
  não decide o ramo, mas bloqueia o GATE até ser entendida); `npx wrangler secret put DATABASE_URL --env spike` com a string da branch
  dev do Neon (secret próprio do spike, nunca em arquivo); `npx wrangler tail --env spike` em
  outro terminal. Produtos B e C mudados pelo painel do `roseshop-dev` (mesma branch do Neon).
  Mesmos `curl` da T005 contra `https://roseshop-spike.willsmt.workers.dev`. Entregar o output
  real — **humano** — **não se aplica**: o `preview` falhou antes (opção A); nenhum token, worker ou secret criado
- [X] T007 Registrar em `research.md` §5 os outputs reais da T005 e da T006 (resumidos, com os
  cabeçalhos relevantes), o achado da T003 e o resultado de P9, D11 e R6 — **principal** — **feito** (research §5)
- [X] T008 **Decisão do ramo**, registrada no topo de `research.md` §5 e depois neste arquivo,
  na linha "Ramo escolhido" abaixo: **ISR** se os cenários a, b e c passaram no `preview` **e** no
  `roseshop-spike`; **FALLBACK** se qualquer um falhou. P9 e D11 não decidem o ramo: P9 falho no
  ISR ⇒ o FR-024 fica só com o 503 (registrar como limitação no ADR-011); D11 falho ⇒ plano B do
  D11 (`AsyncLocalStorage` em `globalThis`), anotado para a SF3 e a SF6 — **principal** — **feito**: FALLBACK

  **Ramo escolhido**: **FALLBACK** (2026-10-15). Cenários a e b (detalhe) falharam no `preview`;
  detalhes e motivo técnico em `research.md` §5.

- [X] T009 **Humano executa**, ainda com o `env.spike` no `wrangler.jsonc`: `npx wrangler delete
  --env spike` (apaga o worker `roseshop-spike`, seus Durable Objects e o secret); esvaziar o
  bucket `roseshop-cache-spike` (o R2 só apaga bucket vazio; pelo painel da Cloudflare ou por
  `npx wrangler r2 object delete`) e `npx wrangler r2 bucket delete roseshop-cache-spike`;
  conferir com `npx wrangler r2 bucket list` (sem o bucket) e `npx wrangler deployments list
  --env spike` (erro de worker inexistente); apagar no painel o token temporário
  `roseshop-spike-deploy` da T006. Entregar o output real — **humano** — **não se aplica**: nenhum recurso do spike foi criado na nuvem
- [X] T010 Limpar o tree: `git restore` de todos os arquivos alterados na T002 e na T004
  (`open-next.config.ts`, `next.config.ts`, `wrangler.jsonc`, `cloudflare/worker.ts`,
  `cloudflare-env.d.ts`, `src/app/page.tsx`) e apagar os arquivos novos da T004
  (`src/app/p/[codigo]/page.tsx`, `src/lib/db/spike.ts`). `git status` deve mostrar só
  `research.md` e este `tasks.md` — **principal** — **feito** (2026-10-15): `git status` só com `research.md` e `tasks.md`
- [X] T011 Rodar `npm run check`; colar o output real — **júnior** — **feito** (2026-10-15):
  96 arquivos e 2524 testes passaram, depois de apagar o `.next/types` antigo do build do spike
- [X] T012 Rascunhar `specs/adr/011-cache-catalogo-workers-dev.md` (sugerido) no formato dos
  ADRs existentes: contexto (`*.workers.dev` sem cache de borda nem Cache API, FR-020 de 1 min,
  FR-024), decisão conforme o ramo (**[ISR]**: ISR do OpenNext, R2 próprio por ambiente, fila em
  DO SQLite, orçamento `revalidate` 15 + `expireTime` 35 + navegador 20 = 55 s + render, com a
  nota de que 35 s é o `expireTime` e não o `revalidate` (A2); guarda de build; versão anterior
  no 500 se P9 passou, servida durante a falha e até 1 min depois (A1); revalidação da fila
  passa direto pelo worker (D5); token do CI ampliado com *Workers R2 Storage: Edit* para o
  deploy popular o cache, com o argumento do risco marginal (o token já publica o worker, que
  tem binding para o bucket de fotos) e a prova do spike com token de mesmo escopo (D16, A4); a
  opção de credenciais S3 limitadas ao bucket de cache registrada como alternativa descartada
  (executável baixado em todo `npm ci`, colisão de nomes com as chaves de fotos da 004, prova
  só no deploy do PR);
  **[FALLBACK]**: páginas dinâmicas, navegador 60 s, todo 500 vira 503, custo de banco e CPU por
  primeira visita), evidência (link para `research.md` §5, incluindo onde o spike rodou),
  consequências (Free tier, R2/R3, como reverter) e o que fica fora (revalidação sob demanda)
  **[TL✅]** — **principal**
- [X] T013 Revisão pelo tech-lead (opus): coerência do ADR-011 com `research.md` §5, tree sem
  resto do spike, worker e bucket do spike apagados (output da T009) — **tech-lead**
- [X] T014 **GATE — aprovação do humano**: ler e aprovar o ADR-011 e o ramo escolhido. **Nada da
  infra definitiva (T015 a T016) nem a SF1 começam sem esta aprovação** — **humano** — **aprovado** (2026-10-15): FALLBACK e ADR-011; E1, E2 e E3 = A
- [X] T015 **[ISR] Humano executa**: `npx wrangler r2 bucket create roseshop-cache-dev` e `npx
  wrangler r2 bucket create roseshop-cache-prod` (privados, sem CORS); `npx wrangler r2 bucket
  list` com os dois. Entregar o output real — **humano** — **não se aplica (ramo FALLBACK, T008)**
- [X] T015a **[ISR] Humano executa** (research D16): no painel da Cloudflare, editar o token do CI
  (o mesmo valor gravado como `CLOUDFLARE_API_TOKEN` nos environments `dev` e `production` do
  GitHub) e acrescentar *Workers R2 Storage: Edit*, com o mesmo escopo do token temporário
  provado na T006, mantendo a restrição à conta e a validade. Editar as permissões não muda o
  valor, então os secrets do GitHub não mudam. Entregar a lista de permissões do token, sem o
  valor — **humano** — **não se aplica (ramo FALLBACK, T008)**
- [X] T015b Acionar o `doc-sync-onboarding` para atualizar `docs/operacao.md` com as permissões
  do token do CI (*Workers Scripts: Edit* + *Workers R2 Storage: Edit* + leituras de
  conta/usuário, restrito à conta, validade inalterada) e o porquê (o deploy popula o cache R2,
  research D16). Commit `docs` próprio na T019 — **doc-sync** — **não se aplica (ramo FALLBACK, T008)**
- [X] T016 **[ISR] [TL✅]** Infra definitiva do ISR, nos **três** ambientes (bindings não são
  herdados): `open-next.config.ts` e `next.config.ts` como na T002; `wrangler.jsonc` com
  `NEXT_INC_CACHE_R2_BUCKET` → `roseshop-cache-local` | `roseshop-cache-dev` |
  `roseshop-cache-prod`, `durable_objects.bindings` = `[{ name: "NEXT_CACHE_DO_QUEUE",
  class_name: "DOQueueHandler" }]` e `migrations` = `[{ tag: "v1", new_sqlite_classes:
  ["DOQueueHandler"] }]` no nível de cima, no `env.dev` e no `env.production`; **sem** `env.spike`;
  `cloudflare/worker.ts`: `export { DOQueueHandler } from "open-next-worker";` e atualizar o
  comentário do topo (que hoje diz "não há durable_objects"); `npm run cf-typegen`. Workflows e
  scripts de deploy não mudam (D16). A classe só chega ao `roseshop-dev` no deploy do PR e ao
  `roseshop` no merge — **principal** — **não se aplica (ramo FALLBACK, T008)**
- [X] T017 **[ISR]** `npm run check` (o `typecheck` cobre `cloudflare/`: o `tsconfig` inclui `**/*.ts`); colar o output real —
  **júnior** — **não se aplica (ramo FALLBACK, T008)**
- [X] T018 **[ISR]** Revisão do diff da T016 e do `docs/operacao.md` da T015b pelo tech-lead
  (bindings e migration nos três ambientes, nenhum resto do `env.spike`, cron da limpeza intacto,
  `expireTime: 35`, workflows e scripts de deploy sem mudança, permissões do token conferidas
  contra o output da T015a) — **tech-lead** — **não se aplica (ramo FALLBACK, T008)**
- [ ] T019 Commit (humano). Mensagem **[ISR]**:
  ```text
  feat(cache): liga o ISR do catálogo com R2 e fila em DO

  Spike SF0 provou o expire de 35 s num isolate novo no preview e num
  worker descartável. Cache incremental em bucket R2 próprio por ambiente,
  fila de revalidação em Durable Object (SQLite), expireTime 35 s.
  O token do CI ganhou Workers R2 Storage: Edit para o deploy popular o
  cache (ADR-011, research D16 e §5).
  ```
  Mensagem **[ISR]** do commit de docs da T015b:
  ```text
  docs(operacao): registra a permissão de R2 do token do CI
  ```
  Mensagem **[FALLBACK]**:
  ```text
  docs(adr): registra páginas dinâmicas no catálogo público

  O spike SF0 não provou o expire do ISR no OpenNext (research §5). As
  páginas públicas serão dinâmicas, com 60 s no navegador (ADR-011).
  ```
  — **humano**

---

## SF1 — SQL público (`src/lib/db/catalogo.ts`)

**Usa**: DM§1 (campos proibidos), DM§2 (consultas), DM§3 (cursor: forma do µs em texto);
research D6, D7, D8; spec FR-002, FR-006, FR-009, FR-011, FR-015.
**Arquivos**: `src/lib/db/catalogo.ts` (novo, protegido), `src/lib/db/catalogo.int.test.ts`
(sugerido), `src/test/db/catalogo-fixtures.ts`.
**Fecha**: US1.2–1.5 (parte de banco), US4.1/4.3/4.4/4.6 (parte de banco), US6.1–6.3 (parte de
banco), US2.1 (fotos ordenadas).
**Revisão TL**: ✅.

- [ ] T020 [US1] [US4] [US6] Fixtures em `src/test/db/catalogo-fixtures.ts`, nos moldes de
  `produtos-fixtures.ts` e `fotos-fixtures.ts`: produtos com `criado_em` controlado (incluindo
  **dois com o mesmo `criado_em`** e microssegundos diferentes de zero), destaques com vagas fora
  de ordem de cadastro, um esgotado, fotos em posições 1–3, um **envio pendente** e um **envio
  confirmado não adotado** em `fotos_envio`, categorias "Meias", "Guarda-chuvas" (slug com
  hífen), uma vazia e uma só com esgotados. Limpeza no `afterAll` — **test-writer**
- [ ] T021 [US1] [US2] [US4] [US6] **Teste primeiro** — `src/lib/db/catalogo.int.test.ts`
  (vermelho até a T022):
  `listarDestaques`: só `destaque_vaga IS NOT NULL`, `ORDER BY destaque_vaga ASC`, capa = foto da
  posição 1 ou `null`;
  `listarBloco`: `ORDER BY criado_em DESC, id DESC`, `LIMIT 25` (24 + sinal de `haMais`), o
  instante do último item volta **como texto** (`floor(extract(epoch from criado_em)*1e6)::bigint`),
  continuação por `(criado_em, id) < ('epoch'::timestamptz + $µs * interval '1 microsecond',
  $id)` **sem repetir nem pular** no empate de `criado_em`; remover o último item do bloco 1 antes
  de pedir o bloco 2 não repete nem pula; produto editado (`atualizado_em` novo) não muda de
  lugar; filtro por `categoriaId`;
  `categoriasComProdutos`: só categorias com `EXISTS` produto (a só com esgotados entra, a vazia
  não), `slug = replace(chave, ' ', '-')` ("guarda-chuvas"), ordem por `nome COLLATE
  "pt-BR-x-icu"` se a collation existir no Postgres local (o teste registra qual ordem valeu);
  `obterPublico`: produto + nome da categoria + fotos por `posicao` num só statement; `null` para
  id inexistente;
  `fotoPublica`: `true` só para chave em `produto_fotos`; `false` para envio pendente, envio
  confirmado não adotado, chave removida e uuid inventado;
  **nenhuma** linha devolvida tem `versao`, `fotos_versao`, `fotos_operacao`, `destaque_vaga`,
  `criado_por`, `atualizado_por`, `atualizado_em`, `enviado_por`, `enviado_em` nem `id` de
  categoria fora de `categoriasComProdutos` (DM§1) — **test-writer**
- [ ] T022 **[TL✅]** Implementar `src/lib/db/catalogo.ts` com `listarDestaques(db)`,
  `listarBloco(db, { categoriaId?, depois?: { us: string; id: number } })`,
  `categoriasComProdutos(db)`, `obterPublico(db, id)`, `fotoPublica(db, chave)` (DM§2). O µs vai
  ao SQL como texto com cast `::bigint` e nunca passa por `Date` nem `number`. Sem mudança em
  `produtos.ts`, `fotos.ts`, `categorias.ts` nem no schema; sem `db.transaction()` — **principal**
- [ ] T023 `npm run db:up`, `npm run db:migrate`, `npm run check` e `npm run test:int` (**em
  série**, nenhum outro `test:int` rodando); colar o output real — **júnior**
- [ ] T024 Revisão do diff pelo tech-lead: SQL parametrizado, ordem estável, cursor sem perda de
  µs, `fotoPublica` sem `fotos_envio`, nenhum campo interno — **tech-lead**
- [ ] T025 Commit (humano):
  ```text
  feat(db): adiciona as consultas públicas do catálogo

  Destaques por vaga, lista por (criado_em, id) com keyset em µs, categorias
  com produtos e slug do nome, detalhe com fotos e checagem de foto pública
  só em produto_fotos. Sem migration.
  ```
  — **humano**

---

## SF2 — Regras puras de exibição, cursor e slug

**Usa**: DM§1, DM§3; C§6 (linhas `exibicao.ts`, `slug.ts`, `cursor.ts`); research D7, D8, D10;
spec FR-003, FR-012, FR-013, FR-017, FR-018; Assumptions (mensagem do WhatsApp).
**Arquivos**: `src/lib/catalogo/exibicao.ts`, `src/lib/catalogo/slug.ts`,
`src/lib/catalogo/cursor.ts`, `src/lib/catalogo/prazos.ts` e seus `*.test.ts`. Sem `server-only`,
sem banco.
**Fecha**: US1.7, US3.1/3.2 (montagem do link), FR-017 (texto alternativo), cursor válido/inválido.
**Revisão TL**: —.

- [ ] T026 [P] [US1] [US2] [US3] **Teste primeiro** — `src/lib/catalogo/exibicao.test.ts`:
  `precoPublico(null, false)` = "Consulte o valor"; `(1290, false)` = "R$ 12,90"; `(1290, true)` =
  "a partir de R$ 12,90"; `(123456, false)` = "R$ 1.234,56"; `hrefProduto(42)` = "/p/0042",
  `hrefProduto(10000)` = "/p/10000"; `altFoto("Meia", 1, 3)` = "Meia — foto 1 de 3";
  `mensagemWhatsapp("Meia soquete listrada", 42, "https://x.dev")` = "Olá! Tenho interesse no
  produto Meia soquete listrada (#0042): https://x.dev/p/0042" e, com `siteUrl` `null`, a mesma
  frase sem o link; `linkWhatsapp("+5511999999999", msg)` começa com
  `https://wa.me/5511999999999?text=` e `decodeURIComponent` do `text` devolve a mensagem exata
  para nomes com `&`, `#`, `?`, acento e emoji — **test-writer**
- [ ] T027 [P] **Teste primeiro** — `src/lib/catalogo/cursor.test.ts` e `slug.test.ts`:
  ida e volta de `codificarCursor("1760000000123456", 42)`; `lerCursor` devolve `null` para
  base64url inválido, conteúdo fora de `^\d{1,17}\.\d{1,10}$`, id 0 e id > 2.147.483.647, e
  mantém o µs como **string**; `validarSlug` aceita "meias", "guarda-chuvas", "meias-3" e recusa
  "", "Meias", "meias--x", "-meias", "meias-", "a/b" e 61 caracteres — **test-writer**
- [ ] T028 Implementar `exibicao.ts` (reusa `formatarPreco`/`formatarAPartirDe` de
  `src/lib/produtos/preco.ts` e `formatarCodigo` de `src/lib/produtos/codigo.ts`, ambos puros),
  `cursor.ts` (Zod; base64url; µs como texto), `slug.ts` (Zod:
  `^[\p{Ll}\p{N}]+(-[\p{Ll}\p{N}]+)*$`, até 60) e `prazos.ts` (C§6: constantes do orçamento
  de 60 s, conforme o ramo da T008; sem dependências) — **principal**
- [ ] T029 `npm run check`; colar o output real — **júnior**
- [ ] T030 Commit (humano):
  ```text
  feat(catalogo): adiciona regras de preço, link do WhatsApp e cursor

  Módulos puros de exibição (preço, código, alt, mensagem e link wa.me),
  cursor opaco base64url com µs em texto e validação do slug do filtro.
  ```
  — **humano**

---

## SF3 — Configuração, registro e leitura do catálogo (server-only)

**Usa**: C§6 (linhas `config.ts`, `registro.ts`, `leitura.ts`, `index.ts`), C§7 (eventos), DM§1,
DM§4; research D7, D10, D11, D12, D13; resultado de D11 na T008 (`ctx` ou plano B).
**Arquivos**: `src/lib/catalogo/{config,registro,leitura,index}.ts` e testes;
`eslint.config.mjs` (barrel); `wrangler.jsonc` (`SITE_URL`); `.dev.vars.example`
(`WHATSAPP_NUMBER`); `cloudflare-env.d.ts`.
**Fecha**: US3.4/3.5 e FR-019 (config), FR-024 (marca da causa), US4.6 (fallback do filtro),
FR-002 (visões públicas fechadas).
**Revisão TL**: ✅ (`wrangler.jsonc`, `.dev.vars.example`).

- [ ] T031 **[TL✅]** `wrangler.jsonc`: `SITE_URL` em `vars` dos três ambientes (local
  `http://localhost:8787`, dev `https://roseshop-dev.willsmt.workers.dev`, produção
  `https://roseshop.willsmt.workers.dev`), ao lado do `R2_S3_ENDPOINT`; `.dev.vars.example`:
  bloco `WHATSAPP_NUMBER=` com comentário "E.164, ex. +5511999999999; local: qualquer número de
  teste; dev e produção: `wrangler secret put`" — **principal**
- [ ] T032 **Humano executa**: acrescentar `WHATSAPP_NUMBER` ao `.dev.vars` local; depois o
  principal roda `npm run cf-typegen` e confere `SITE_URL` e `WHATSAPP_NUMBER` no
  `cloudflare-env.d.ts` — **humano** + **principal**
- [ ] T033 [P] [US3] **Teste primeiro** — `src/lib/catalogo/config.test.ts` e `registro.test.ts`
  (env mockado como nos testes de `src/lib/r2/config`): `WHATSAPP_NUMBER` válido ⇒ string;
  ausente, vazio, sem `+`, com espaço ou curto ⇒ `whatsapp: null` e **um** `console.error` com
  `{ evento: "catalogo.whatsapp_invalido", causa: "config" }` **sem o valor**; `SITE_URL` sem
  barra final, `https:` ou `http:` só com host `localhost`/`127.0.0.1` ⇒ válida; inválida ⇒
  `siteUrl: null` + `catalogo.site_url_invalida` (a mensagem do WhatsApp sai sem link,
  FR-018/FR-019); **[FALLBACK]** chamadas repetidas de `configCatalogo()` no mesmo isolate
  registram a falha **uma vez** (D10); `registrarFalha` grava exatamente
  `{ evento, rota, causa, resultado? }` em JSON, e `causa` fora de `banco|r2|config|inesperado` é
  erro de tipo — **test-writer**
- [ ] T034 [P] [US1] [US2] [US4] **Teste primeiro** — `src/lib/catalogo/leitura.test.ts`
  (`src/lib/db/catalogo.ts` e o contexto mockados):
  `lerVitrine()` monta `{ destaques, categorias, bloco }` com `ProdutoCartao` (DM§1: só `codigo`,
  `href`, `nome`, `preco`, `esgotado`, `capa`); **[ISR]** com `NEXT_PHASE` de build devolve o
  estado "indisponível" sem chamar o banco (D13); **[FALLBACK]** `lerVitrine(categoria?)` aplica o
  slug e, desconhecido ou vazio, cai em "Todas" com `categoria: null`;
  `lerBloco({ categoria, depois })`: slug desconhecido ⇒ "Todas"; cursor inválido ⇒ resultado
  "invalido"; `haMais` ⇒ `proximo` codificado do 24º item; `lerProduto("42")` devolve
  `ProdutoPublico` com `fotos` (alt de `altFoto`), `whatsapp` `null` se esgotado ou sem número,
  e `"nao_encontrado"` para inexistente, `"abc"`, `"0"`, `"-1"`; `lerFoto(arquivo)` devolve a
  chave só quando `fotoPublica` é `true`;
  falha do banco em qualquer leitura ⇒ marca `causa = "banco"` (no `ctx` do pedido ou no plano B,
  conforme T008) e **relança**; nunca devolve `"nao_encontrado"` por falha (FR-024);
  nenhuma visão devolvida tem chaves fora da lista do DM§1 (comparação de chaves) —
  **test-writer**
- [ ] T035 Implementar `config.ts`, `registro.ts`, `leitura.ts` (único lugar da 005 que chama
  `dbDoContexto`) e `index.ts` (barrel `server-only` com o que páginas e rotas usam). Tipos
  `ProdutoCartao`, `ProdutoPublico`, `CategoriaFiltro`, `BlocoLista` exportados do barrel —
  **principal**
- [ ] T036 Regra de lint em `eslint.config.mjs`, no molde da de `@/lib/r2`: proibir
  `@/lib/catalogo/*` fora de `src/lib/catalogo/`, **exceto** `@/lib/catalogo/exibicao` (puro, usado
  por componentes cliente) — **principal**
- [ ] T037 `npm run check`; colar o output real — **júnior**
- [ ] T038 Revisão do diff pelo tech-lead (`wrangler.jsonc`, `.dev.vars.example`, log sem valor,
  marca da causa) — **tech-lead**
- [ ] T039 Commit (humano):
  ```text
  feat(catalogo): adiciona leitura pública, configuração e registro

  Visões públicas fechadas do catálogo, WHATSAPP_NUMBER (E.164) e SITE_URL
  validados, registro estruturado de falhas e marca da causa banco para o
  worker. SITE_URL em vars nos três ambientes.
  ```
  — **humano**

---

## SF4 — Rota pública de fotos `GET /fotos/[arquivo]`

**Usa**: C§4; research D6; spec US6, FR-015, FR-016, FR-024; rota irmã
`src/app/painel/fotos/[arquivo]/route.ts` (molde, sem a sessão).
**Arquivos**: `src/app/fotos/[arquivo]/route.ts`, `route.test.ts`,
`src/test/conformance/catalogo-acesso.test.ts` (criado aqui, ampliado na SF5, SF7 e SF8),
`src/test/conformance/fotos-bucket-privado.test.ts`.
**Fecha**: US6.1–6.5, FR-015, FR-016, FR-024 (fotos).
**Revisão TL**: ✅ (superfície de segurança).

- [ ] T040 [US6] **Teste primeiro** — `src/app/fotos/[arquivo]/route.test.ts`: válida e de
  produto ⇒ 200 com `Content-Type` pela extensão, `Cache-Control: public, max-age=60` (de
  `NAVEGADOR_FOTOS_S`, sem `immutable`), `ETag`, `X-Content-Type-Options: nosniff`, `Content-Security-Policy: default-src
  'none'`; `If-None-Match` igual ⇒ 304 sem corpo; malformada (`../x`, `x.png`, uuid v7, maiúsculas),
  envio pendente, removida e uuid inventado ⇒ 404 **com corpo vazio e cabeçalhos idênticos entre
  si**; erro do banco ou do R2 ⇒ 503 vazio, `no-store`, log `catalogo.fotos_falha` sem a chave;
  nenhuma chamada ao R2 quando `fotoPublica` é `false` — **test-writer**
- [ ] T041 [US1] [US6] **Teste primeiro** — `src/test/conformance/catalogo-acesso.test.ts`
  (primeira parte): nenhum arquivo de `src/app/fotos/`, `src/app/api/catalogo/` e
  `src/app/(public)/` importa `@/lib/auth` nem chama `getAdminSession` (varredura de imports,
  como em `fotos-rota-guard.test.ts`); o 404 da rota pública é byte a byte igual nos quatro casos
  da T040 — **test-writer**
- [ ] T041a [US6] **Teste primeiro (K1)** — `src/test/conformance/fotos-bucket-privado.test.ts`
  (US6.5, FR-016): todo `infra/r2/cors.*.json` só permite `PUT` (nenhuma regra com `GET` ou
  `HEAD`) e nenhuma origem `*`; o `wrangler.jsonc` (lido como JSONC) não declara `routes` nem
  `custom_domain`, e o bucket de fotos de cada ambiente só aparece no binding `PRODUCT_IMAGES`.
  O que não está no repositório (acesso público `r2.dev`, domínio do bucket) fica na conferência
  manual do quickstart §1.5 — **test-writer**
- [ ] T042 **[TL✅]** Implementar `src/app/fotos/[arquivo]/route.ts`: `lerFoto` (barrel
  `@/lib/catalogo`) → `servirObjeto` (barrel `@/lib/r2`); `chaveDoArquivo` antes do banco;
  `max-age` de `NAVEGADOR_FOTOS_S`; nenhuma mudança em `src/lib/r2/` — **principal**
- [ ] T043 `npm run check`; colar o output real — **júnior**
- [ ] T044 Revisão do diff pelo tech-lead (404 indistinguível, banco antes do R2, 503 sem cache) —
  **tech-lead**
- [ ] T045 Commit (humano):
  ```text
  feat(fotos): adiciona a rota pública de fotos do catálogo

  GET /fotos/[arquivo] sem sessão: entrega só foto de produto cadastrado,
  consultando o banco a cada pedido; 404 idêntico para qualquer recusa,
  60 s no navegador e 503 sem cache se o banco ou o R2 falhar.
  ```
  — **humano**

---

## SF5 — `GET /api/catalogo/produtos` (bloco da lista)

**Usa**: C§3; DM§1 (`BlocoLista`), DM§3; research D7, D8.
**Arquivos**: `src/app/api/catalogo/produtos/route.ts`, `route.test.ts`,
`src/test/conformance/catalogo-acesso.test.ts` (ampliação).
**Fecha**: US1.5 (transporte do "Carregar mais"), US4.1/4.2/4.6 (filtro pelo GET), US2.7/FR-002
(JSON).
**Revisão TL**: —.

- [ ] T046 [US1] [US4] **Teste primeiro** — `route.test.ts`: sem query ⇒ 200 `BlocoLista` de
  "Todas", `Cache-Control: public, max-age=20`, `Content-Type: application/json`, `nosniff`;
  `categoria=meias` ⇒ filtrado e `categoria: "meias"`; `categoria=nao-existe` ou `MEIAS` ⇒ "Todas"
  e `categoria: null`; `depois` inválido ⇒ 400 `{}` `no-store`; banco fora ⇒ 503 `{}` `no-store` e
  log `catalogo.banco_indisponivel` com `rota: "/api/catalogo/produtos"`; POST ⇒ 405 —
  **test-writer**
- [ ] T047 [US2] **Teste primeiro** — ampliar `catalogo-acesso.test.ts`: as chaves de cada item
  do JSON são **exatamente** as de `ProdutoCartao`, e as do envelope são `itens`, `proximo` e
  `categoria`; nenhum valor contém `@` (e-mail); com mais de 24 produtos, o `proximo`
  decodificado de base64url casa **exatamente** `^\d{1,17}\.\d{1,10}$` e o código é o do 24º
  item (nada além de µs e código, FR-002/P7/A5) — **test-writer**
- [ ] T048 Implementar `route.ts` com `lerBloco` do barrel; só GET; `max-age` de
  `NAVEGADOR_LISTA_S` — **principal**
- [ ] T049 `npm run check`; colar o output real — **júnior**
- [ ] T050 Commit (humano):
  ```text
  feat(catalogo): adiciona o GET público do bloco da lista

  GET /api/catalogo/produtos com filtro por slug e cursor opaco, 20 s no
  navegador, 400 para cursor inválido e 503 sem cache se o banco falhar.
  ```
  — **humano**

---

## SF6 — Worker das rotas públicas e `robots.txt`

**Usa**: C§1, C§5, C§7; research D4, D5 (P9), D9, D11; resultado da T008 (ramo e plano de D11).
**Arquivos**: `cloudflare/publico.ts` (novo), `cloudflare/publico.test.ts` (sugerido),
`cloudflare/worker.ts`, `src/app/robots.ts`, `src/app/robots.test.ts` (sugerido),
`src/test/conformance/catalogo-orcamento.test.ts` (criado aqui, ampliado na SF7 e na SF8).
**Fecha**: US2.3–2.5 e FR-013 (canonização), US2.8 e FR-024 (500 → versão anterior ou 503;
revalidação da fila), FR-004/SC-009 (cabeçalho), R3 (formato inválido sem cache novo), FR-020/
SC-005/US5.4/US6.3 (orçamento travado por teste, K1).
**Revisão TL**: ✅.

- [ ] T051 [US2] **Teste primeiro** — `prepararPedido(url, método)`: `/p/abc`, `/p/-1`, `/p/0`,
  `/p/00`, `/p/2147483648`, `/p/1234567890` ⇒ `reescrever` para `/p/0`; `/p/42` ⇒ 308 para
  `/p/0042`; `/p/00042?x=1` ⇒ 308 para `/p/0042?x=1`; `/p/0042`, `/p/10000` ⇒ `seguir`;
  `/p/1/2`, `/painel/x`, `/` ⇒ `seguir`; POST em `/p/42` ⇒ `seguir` — **test-writer**
- [ ] T052 [US2] **Teste primeiro** — `ajustarResposta` com handler falso:
  `/` e `/p/*` com 200, 308 e 404 ⇒ `Cache-Control: public, max-age=20` **[ISR]** ou
  `public, max-age=60` **[FALLBACK]**;
  **[ISR]** 500 → repetição 200 ⇒ 200 com `no-store` e log `resultado: "versao_anterior"`;
  500 → repetição 500 ⇒ 503 `no-store` + `Retry-After: 30`, corpo da repetição, log
  `resultado: "503"`; **[FALLBACK]** 500 ⇒ 503 direto, sem repetição;
  evento `catalogo.banco_indisponivel` (causa `banco`) × `catalogo.erro_inesperado` (causa
  `null` ⇒ `"inesperado"`); rota normalizada (`/` ou `/p/[codigo]`), sem query nem código;
  `X-Robots-Tag: noindex, nofollow` em `/`, `/p/*`, `/fotos/*`, `/api/catalogo/*`; `/painel/*`,
  `/api/auth/*`, `/api/interno/*`, `/api/health` e assets **sem nenhuma mudança**; HEAD segue as
  regras do GET; cada pedido recebe um `ctx` novo com `roseshop.causa = null` (ou o plano B do
  D11); **[ISR]** pedido com `x-isr: 1` e `x-prerender-revalidate` (revalidação da fila, `HEAD`)
  com 200 ou 500 ⇒ resposta **idêntica** à do handler (status, corpo e cabeçalhos), handler
  chamado **uma** vez, e no 500 um log com `resultado: "revalidacao"`; pedido comum com
  `x-isr` mas sem `x-prerender-revalidate` segue a regra normal — **test-writer**
- [ ] T053a [P] **Teste primeiro (K1)** — `src/test/conformance/catalogo-orcamento.test.ts`
  (FR-020, SC-005, US5.4, US6.3): **[ISR]** `REVALIDATE_S` < `EXPIRE_S`; `expireTime` do
  `next.config.ts` (importado) = `EXPIRE_S`; `EXPIRE_S + NAVEGADOR_PAGINA_S` ≤ 55 (5 s de folga
  para o render, A2); **[FALLBACK]** `NAVEGADOR_PAGINA_S` ≤ 60 e o `next.config.ts` sem
  `expireTime`; em ambos: `NAVEGADOR_LISTA_S` ≤ 60, `NAVEGADOR_FOTOS_S` ≤ 60, e o
  `max-age` que `ajustarResposta` aplica a `/` e `/p/*` é `NAVEGADOR_PAGINA_S`. A SF7 e a SF8
  acrescentam o literal `revalidate` das páginas — **test-writer**
- [ ] T053 [P] **Teste primeiro** — `src/app/robots.test.ts`: `rules` = `[{ userAgent: "*", allow:
  "/" }]`, sem `disallow` e sem `sitemap` — **test-writer**
- [ ] T054 **[TL✅]** Implementar `cloudflare/publico.ts` (funções puras; `max-age` de
  `src/lib/catalogo/prazos.ts` por import relativo) e ligar no `cloudflare/worker.ts`: `fetch` =
  `prepararPedido` → (308 direto | reescrita | seguir) → `handler.fetch(pedido, env,
  ctxDoPedido)` → `ajustarResposta`; **[ISR]** pedido de revalidação da fila passa direto (só
  registro no 500). O `scheduled` (SF12 da 004) e a reexportação do `DOQueueHandler` **[ISR]**
  não mudam — **principal**
- [ ] T055 [P] Implementar `src/app/robots.ts` — **principal**
- [ ] T056 `npm run check` (o `typecheck` cobre `cloudflare/`: o `tsconfig` inclui `**/*.ts`); colar o output real — **júnior**
- [ ] T057 Revisão do diff pelo tech-lead (reescrita sem cache novo, 503 `no-store`, painel
  intocado, log sem URL, revalidação da fila intocada, orçamento vindo de `prazos.ts`) —
  **tech-lead**
- [ ] T058 Commit (humano):
  ```text
  feat(worker): canoniza o detalhe e trata falhas das páginas públicas

  /p/<código> fora da forma canônica vira 308, formato inválido vai para
  /p/0 sem cache novo, 500 público vira versão anterior ou 503 sem cache,
  noindex por cabeçalho e robots.txt sem Disallow. Teste trava o orçamento
  de 60 s.
  ```
  ([FALLBACK]: trocar "versão anterior ou 503" por "503") — **humano**

---

## SF7 — Telas do detalhe, erro e não encontrado

**Usa**: C§2; T§ "Detalhe", "Erro (503) e não encontrado (404)", "Textos"; DM§5; research D9,
D12, D14; spec US2, US3, US5, FR-003, FR-014, FR-017, FR-018, FR-021, FR-022, FR-023.
**Arquivos**: `src/app/layout.tsx`, `src/app/(public)/layout.tsx`, `error.tsx`,
`p/[codigo]/page.tsx`, `p/[codigo]/not-found.tsx`, `_catalogo/{galeria,botao-whatsapp,textos}.ts(x)`
e testes; `package.json` (`axe-core`); `src/test/axe.ts` (sugerido).
**Fecha**: US2.1–2.4, US2.6, US2.7, US3.1, US3.3, US3.5 (sem botão), US5.1–5.3, FR-003.
**Revisão TL**: —.

- [ ] T059 Instalar `axe-core` como devDependency com **versão exata** (`npm i -D -E`), publicada
  há pelo menos duas semanas (ADR-007), e criar o helper `src/test/axe.ts` (sugerido) que roda o
  axe no `container` do Testing Library e falha em violações `serious`/`critical`. Justificativa
  da dependência no corpo do commit — **principal**
- [ ] T060 [US2] [US3] [US5] **Teste primeiro** — testes de componente (jsdom) do detalhe:
  produto com 3 fotos ⇒ `<h1>` com nome, "#0042 · Meias", preço de `precoPublico`, `<img>` na ordem
  com `alt` "Nome — foto n de 3", descrição em `whitespace-pre-line`; nome com `<b>x</b>` e
  `**x**` aparece literal (FR-003); descrição vazia ⇒ sem seção "Descrição"; esgotado ⇒ texto
  "Esgotado" e **sem** link do WhatsApp; `whatsapp: null` ⇒ sem link; link `wa.me` sem
  `target="_blank"`; `generateMetadata` ⇒ `title` = nome e `openGraph.images` = URL da capa,
  sem preço nem descrição; `not-found` ⇒ "Produto não encontrado" + link "Ver o catálogo" para
  `/`, sem Open Graph de produto; `error.tsx` ⇒ `<h1>Não foi possível carregar agora</h1>` e botão
  "Tentar de novo" que chama `reset()`; axe sem violações graves em cada tela —
  **test-writer**
- [ ] T061 [US1] [US2] **Teste primeiro** — ampliar `catalogo-acesso.test.ts`: o layout `(public)`
  exporta `metadata.robots` `{ index: false, follow: false }`; o layout raiz tem
  `lang="pt-BR"` e não tem "Create Next App"; as props passadas pela página do detalhe aos
  componentes cliente não contêm chaves fora de `ProdutoPublico` (US2.7). Ampliar
  `catalogo-orcamento.test.ts`: **[ISR]** o literal `export const revalidate = N` de
  `p/[codigo]/page.tsx` (lido como texto: o Next exige literal) = `REVALIDATE_S`; **[FALLBACK]**
  a página exporta `dynamic = "force-dynamic"` e nenhum `revalidate` — **test-writer**
- [ ] T062 `src/app/layout.tsx`: `lang="pt-BR"`, metadata padrão "Roseshop" — **ui-dev**
- [ ] T063 `src/app/(public)/layout.tsx` (robots, `metadataBase` de `configCatalogo().siteUrl`,
  título e `openGraph.siteName` "Roseshop"), `error.tsx` (client: `reset()` + `router.refresh()`),
  `_catalogo/textos.ts` (todos os textos das telas públicas, sem dependências) — **ui-dev**
- [ ] T064 `src/app/(public)/p/[codigo]/page.tsx` + `not-found.tsx` + `_catalogo/galeria.tsx` +
  `_catalogo/botao-whatsapp.tsx`: `lerProduto` do barrel; `"nao_encontrado"` ⇒ `notFound()`;
  código não canônico ⇒ `permanentRedirect` para o canônico (defesa em profundidade; o `next dev`
  não passa pelo worker); falha de leitura **propaga** (nunca `notFound()`). **[ISR]**
  `export const revalidate = 15` (literal = `REVALIDATE_S`), `generateStaticParams → []`,
  `dynamicParams = true`.
  **[FALLBACK]** `export const dynamic = "force-dynamic"`. `<img>` simples (sem `next/image`),
  `loading="eager"` na capa e `lazy` nas demais, `width`/`height` fixos. "Voltar ao catálogo" como
  link para `/` (a SF9 troca pelo `router.back()` condicional) — **ui-dev**
- [ ] T065 `npm run check`; colar o output real — **júnior**
- [ ] T066 Commit (humano):
  ```text
  feat(catalogo): adiciona o detalhe público do produto

  /p/<código> com fotos, preço, esgotado e botão do WhatsApp, prévia de
  link com nome e capa, Produto não encontrado e página de indisponível.
  axe-core (dev) para checar acessibilidade nos testes de componente.
  ```
  — **humano**

---

## SF8 — Página inicial: destaques, filtro e primeiro bloco

**Usa**: C§2 (linha `/`); T§ "Página inicial" (sem `ListaCatalogo` client, que é da SF9); DM§1,
DM§5; research D7, D13, D14; spec US1, US4.3/4.4, FR-005, FR-008, FR-009, FR-012, FR-023.
**Arquivos**: `src/app/(public)/page.tsx`, `_catalogo/{cartao-produto,destaques,filtro}.tsx` e
testes; remoção de `src/app/page.tsx` e migração de `src/app/page.test.tsx`.
**Fecha**: US1.1, US1.3, US1.4, US1.6, US1.7, US1.8, US4.3, US4.4 (tela).
**Revisão TL**: —.

- [ ] T067 [US1] [US4] **Teste primeiro** — componentes (jsdom): `CartaoProduto` com `<a
  href="/p/0042">` envolvendo foto (ou o texto "Sem foto"), nome, "#0042", preço e "Esgotado" em
  texto; seção "Destaques" com `aria-labelledby` e ≤ 8 itens, **omitida** sem destaques; filtro
  em `<nav aria-label="Filtrar por categoria">` com "Todas" e as categorias recebidas (link
  `/?categoria=<slug>`, `aria-current="page"` na escolhida), omitido sem categorias; sem produtos
  ⇒ "Ainda não há produtos." e nenhuma lista; destaques e os 4 primeiros itens com
  `loading="eager"`, o resto `lazy` (FR-008); axe sem violações graves. O `Filtro` é
  apresentacional (recebe categorias e a escolhida por props, sem `server-only`), porque a SF9 o
  passa para dentro da `ListaCatalogo` (I2) — **test-writer**
- [ ] T068 [US1] Migrar `src/app/page.test.tsx` para `src/app/(public)/page.test.tsx`, mantendo a
  regra de que a página pública não oferece "entrar"/"login" (001), e acrescentar: nenhuma ação
  do painel no HTML (US1.1). Ampliar `catalogo-orcamento.test.ts` com o literal `revalidate` de
  `(public)/page.tsx`, como na T061 — **test-writer**
- [ ] T069 Implementar `cartao-produto.tsx` (sem `server-only`: usado também pela lista cliente),
  `destaques.tsx`, `filtro.tsx` (apresentacional, sem `server-only`: usado pela lista cliente
  na SF9) — **ui-dev**
- [ ] T070 `src/app/(public)/page.tsx`, apagando `src/app/page.tsx` (boilerplate). **[ISR]**
  `revalidate = 15` (literal = `REVALIDATE_S`); **não** lê `searchParams`; `lerVitrine()` entrega
  destaques, categorias e o 1º bloco de "Todas"; o filtro mostra "Todas" escolhido (provisório:
  a SF9 move o filtro para a lista cliente e aplica o filtro efetivo).
  **[FALLBACK]** `dynamic = "force-dynamic"`; lê `searchParams.categoria` e chama
  `lerVitrine(categoria)`, que já devolve o 1º bloco filtrado e o slug efetivo para o
  `aria-current`. Em ambos, a lista do 1º bloco é renderizada no servidor (a SF9 a torna
  interativa) — **ui-dev**
- [ ] T071 `npm run check`; colar o output real — **júnior**
- [ ] T072 Commit (humano):
  ```text
  feat(catalogo): adiciona a página inicial com destaques e filtro

  Destaques por vaga, filtro com categorias que têm produtos, primeiro
  bloco da lista e estado vazio. Fotos fora da primeira tela em lazy.
  ```
  — **humano**
- [ ] T072a **Humano executa** (CPU antecipada, risco da T139/ADR-010; o FALLBACK renderiza a cada
  primeira visita do navegador): `npm run deploy:dev` deste branch (manual, permitido no dev) e
  `npx wrangler tail --env dev --format json` em outro terminal; abrir `/` e `/p/<código>` 5 vezes
  cada (a primeira com o Neon frio, as outras com 61 s de intervalo para escapar do `max-age=60`
  do navegador, ou com `curl`). Entregar o `cpuTime`, o `wallTime` e o `outcome` de cada pedido,
  sem cabeçalhos nem corpo. Sem `WHATSAPP_NUMBER` no dev, a página sai sem o botão e registra a
  falha de configuração; isso não afeta a medição — **humano**
- [ ] T072b Registrar a medição da T072a em `research.md` §5 ("CPU das páginas no dev"): acima de
  10 ms sem Erro 1102 ⇒ risco aceito da T139, seguir; Erro 1102 ou falha por limite de CPU ⇒
  parar a SF9 e levar ao humano (contingência do ADR-010: Workers Paid com emenda da constitution
  VII). A T087 da SF11 repete a medição com fotos reais — **principal**
- [ ] T072c Commit (humano):
  ```text
  docs(specs): registra a CPU das páginas no dev
  ```
  — **humano**

---

## SF9 — Lista interativa: "Carregar mais", filtro no cliente e voltar do detalhe

**Usa**: T§ "Página inicial" (`ListaCatalogo`), T§ "Detalhe" ("Voltar ao catálogo"); C§3 (GET);
research D7, D15; spec US1.5, US1.9, US4.1/4.2/4.5/4.6/4.7, FR-007, FR-011; edge case "Rede
lenta ou falha ao tocar em Carregar mais".
**Arquivos**: `src/app/(public)/_catalogo/lista-catalogo.tsx` (client), `restauracao.ts`
(sugerido, sem dependências), testes; `page.tsx` e o detalhe (só a ligação).
**Fecha**: US1.5, US1.9, US4.1, US4.2, US4.5, US4.6, US4.7, FR-007, FR-023 (filtro).
**Revisão TL**: —.

- [ ] T073 [US1] **Teste primeiro** — `restauracao.test.ts` (sugerido): grava
  `{ itens, cursor, scrollY, salvoEm }` em `sessionStorage` na chave `catalogo:<slug|todas>`; lê
  só para o mesmo filtro e com menos de 30 min; apaga depois de ler; `limparRestauracoes()` apaga
  todas as chaves `catalogo:*` (F3); `sessionStorage` que lança (modo privado) ⇒ nada quebra e
  não restaura — **test-writer**
- [ ] T074 [US1] [US4] **Teste primeiro** — `lista-catalogo.test.tsx` (jsdom, `fetch` mockado):
  "Carregar mais" acrescenta o bloco seguinte sem repetir, some quando `proximo` é `null` e move
  o foco para o primeiro item novo; falha do `fetch` mantém os itens, mostra `role="alert"` "Não
  foi possível carregar mais produtos." com "Tentar de novo" que repete o mesmo cursor;
  **[ISR]** com `?categoria=meias`, mostra "Carregando produtos…" (`aria-busy`), pede o 1º bloco
  filtrado ao GET e mostra o resultado; resposta com `categoria: null` ⇒ filtro em "Todas"
  (US4.6); trocar de filtro refaz o pedido; **[FALLBACK]** recebe o 1º bloco já filtrado por
  props e não pede o 1º bloco; em ambos: aviso `aria-live="polite"` "Mostrando produtos de
  Meias" / "Mostrando todos os produtos" (US4.7); a `<nav>` do filtro é renderizada pela lista
  (I2): **[ISR]** com `?categoria=meias`, `aria-current="page"` em "Meias" (e não em "Todas")
  antes e depois do GET, e em "Todas" quando o GET devolve `categoria: null`; **[FALLBACK]** no
  slug efetivo recebido por props; restauração ao montar recoloca os itens guardados (72 itens
  após dois "Carregar mais") e chama `scrollTo` com a posição; **com restauração válida, o
  `fetch` do 1º bloco não é chamado** (U2); **URL (U1)**: depois de "Carregar mais", de "Tentar
  de novo" e da restauração, `location.search` continua só com `categoria` (ou vazio) e a lista
  não chama `history.pushState`/`replaceState` nem `router.push`/`replace`; axe sem violações
  graves — **test-writer**
- [ ] T075 Implementar `restauracao.ts` e `lista-catalogo.tsx`, com a `<nav>` do filtro
  (`filtro.tsx` da SF8) dentro da lista. **[ISR]** `useSearchParams()` dentro de `<Suspense>` na
  `page.tsx` (fallback = a lista de "Todas" do servidor), para a página continuar ISR (R4).
  **[FALLBACK]** recebe o 1º bloco filtrado e o slug efetivo por props. Gravar a restauração no
  clique de um item, antes da navegação; restauração antes do GET (U2). Sem `history.state` e
  sem parâmetro de bloco na URL (D15) — **ui-dev**
- [ ] T076 [US1] [US4] "Voltar ao catálogo" do detalhe (T§ "Detalhe"): `router.back()` quando a
  restauração indica que o detalhe foi aberto pela lista nesta aba; senão, link para `/` que
  chama `limparRestauracoes()` antes de navegar; o "Ver o catálogo" do `not-found.tsx` também
  limpa (F3). Teste de componente das três situações — **ui-dev** (teste: **test-writer**)
- [ ] T077 `npm run check`; colar o output real — **júnior**
- [X] T078 **Humano confere no `preview`** (R4, só **[ISR]**): `curl -s -D - -o /dev/null
  http://localhost:8787/` duas vezes com 25 s de intervalo mostra `x-nextjs-cache` (a página
  inicial continua ISR com o `<Suspense>`). Entregar o output real — **humano** — **não se aplica (ramo FALLBACK, T008)**
- [ ] T079 Commit (humano):
  ```text
  feat(catalogo): adiciona carregar mais, filtro e retorno à lista

  Lista do catálogo no cliente: blocos de 24 pelo GET público, tentar de
  novo após falha, aviso para leitor de tela e retorno do detalhe com os
  mesmos itens e posição, guardados por aba no sessionStorage.
  ```
  — **humano**

---

## SF10 — Roteiro no `preview` (local)

**Usa**: Q§3 e Q§4 (itens 1 a 16); research D5, D9, D10.
**Arquivos**: `research.md` §5 ou `quickstart.md` (registro do resultado, sugerido: seção
"Resultado do roteiro" no fim do quickstart).
**Fecha**: confirmação manual de US1–US4, US6, FR-004, FR-020/SC-005 (cronômetro), FR-022/SC-007
(Lighthouse), FR-024 (item 11).
**Revisão TL**: —.

- [ ] T080 Preparar os dados pelo painel no `preview`: ≥ 30 produtos, alguns em destaque, alguns
  esgotados, uma categoria só com esgotados, uma vazia, um nome com `&`, `#`, `?`, acento e emoji
  (Q§4) — **humano**
- [ ] T081 `npm run check` e `npm run test:int` (**em série**); colar o output real — **júnior**
- [ ] T082 **Humano executa** Q§4 itens 1 a 16, entregando os `curl -sI` dos itens 7, 8, 11, 12 e
  13 e os tempos do item 15. Item 11: **[ISR]** versão anterior num detalhe já visitado (200;
  `no-store` só na primeira resposta, depois `max-age=20`, A1) e 503 num nunca visitado;
  **[FALLBACK]** 503 nos dois; depois do `db:up`, estado atual em até 1 minuto. Item 14 exige o humano tirar o
  `WHATSAPP_NUMBER` do `.dev.vars` e devolver depois — **humano**
- [ ] T083 Registrar os resultados e qualquer desvio; desvio vira task nova na SF que o
  originou (reabrir a SF, corrigir, novo commit) antes de seguir — **principal**
- [ ] T084 Commit (humano):
  ```text
  docs(specs): registra o roteiro do preview da 005
  ```
  — **humano**

---

## SF11 — Prova no dev (celular Android)

**Usa**: Q§1 (itens 2 e 3) e Q§5; research R2, R5.
**Arquivos**: registro no quickstart ou em `research.md` (CPU).
**Fecha**: US3.1/3.4 (número do dev), US5.1–5.3/SC-006, SC-002, SC-008 (CPU), R5.
**Revisão TL**: —.

- [ ] T085 **Humano executa** Q§1.2–1.3 no dev: `npx wrangler secret put WHATSAPP_NUMBER --env dev`
  (número de teste do mantenedor) e `npx wrangler secret list --env dev`; **[ISR]** conferir
  `roseshop-cache-dev` em `npx wrangler r2 bucket list`; Q§1.5 (`npx wrangler r2 bucket dev-url
  get roseshop-dev` e `npx wrangler r2 bucket domain list roseshop-dev`: acesso público desligado,
  nenhum domínio, US6.5). Entregar o output real — **humano**
- [ ] T086 Abrir o PR para `main` (deploy do dev pelo CI, `pull-request.yml`), mostrando antes o
  comando e o corpo completo, **sem** `--force`; só com confirmação do humano. **[ISR]** O log
  do passo de deploy mostra "Populating remote R2 incremental cache" e "Successfully populated
  cache" (prova ponta a ponta da D16 com o token do CI) —
  **principal** + **humano**
- [ ] T087 **Humano executa** Q§5.1 a 5.4 num Chrome Android: botão do WhatsApp (US3), prévia do
  link de produto, da página inicial e de `/p/9999` (US5, SC-006), SC-002 com throttling 4G e
  ≥ 24 produtos com fotos reais, e `cpuTime` de `/`, `/p/<código>`, GET da lista e `/fotos/<arquivo>`
  pelo `wrangler tail --env dev` (alerta = Erro 1102). Entregar o output real — **humano**
- [ ] T088 Registrar os resultados (CPU como risco aceito da T139 se passar de 10 ms sem falha;
  SC-002 falho por peso das fotos ⇒ registrar como feature própria, conforme Assumptions) —
  **principal**
- [ ] T089 Commit (humano):
  ```text
  docs(specs): registra a prova da 005 no dev
  ```
  — **humano**

---

## SF12 — Fechamento: produção, docs e entrega

**Usa**: Q§1 (produção, modelo T148); plan, linha SF12; research R2, R3; CLAUDE.md "Documentação".
**Arquivos**: `README.md`, `docs/` (pelo doc-sync, inclui `docs/operacao.md` com R3),
`specs/005-catalogo-publico/rastreabilidade.md` (critérios de sucesso, como o da 004).
**Fecha**: produção configurada antes do merge; SC-008 (registro); SC-001 fica como pendência de
entrega.
**Revisão TL**: ✅ (produção).

- [ ] T090 **Humano executa** (produção, antes do merge): `npx wrangler secret put WHATSAPP_NUMBER
  --env production` (número da Rose); `npx wrangler secret list --env production` e, **[ISR]**,
  `npx wrangler r2 bucket list` com o `roseshop-cache-prod` criado na T015; `npx wrangler r2 bucket dev-url get
  roseshop-prod` e `npx wrangler r2 bucket domain list roseshop-prod` (US6.5). Entregar o output
  real — **humano**
- [ ] T091 Revisão pelo tech-lead: `wrangler.jsonc` de produção (bucket de cache e DO
  **[ISR]**, `SITE_URL`), segredos listados, nada de dev apontando para produção — **tech-lead**
- [ ] T092 [P] `README.md`: `WHATSAPP_NUMBER`, `SITE_URL`, **[ISR]** bucket de cache por ambiente e
  a permissão de R2 do token do CI, `axe-core` — **redator**
- [ ] T093 [P] `specs/005-catalogo-publico/rastreabilidade.md` (critério de sucesso → prova, com
  os pendentes de entrega) — **principal**
- [ ] T094 Acionar o `doc-sync-onboarding` (feature fechada, rotas e binding novos, zona protegida
  alterada): `docs/` (incluindo `docs/operacao.md`: sinais de R2 Class A e compute do Neon, e a
  contingência do R3; logs do Workers Free retidos por 3 dias; **[ISR]** conferir que a permissão de R2
  do token do CI registrada na T015b continua correta; **[FALLBACK]** registro da config inválida uma vez por isolate) e as seções "Estrutura" e
  "Estado atual" do `CLAUDE.md` — **doc-sync**
- [ ] T095 `npm run check` e `npm run test:int` (**em série**); colar o output real — **júnior**
- [ ] T096 Commits (humano): `docs(readme): …` (T092), `docs(specs): …` (T093) e `docs(onboarding):
  …` (T094), mensagens propostas pelo redator — **humano**
- [ ] T097 Merge em `main` (humano) e conferência pós-deploy: `/api/health` 200,
  `curl -sI https://roseshop.willsmt.workers.dev/` com `X-Robots-Tag`, e um detalhe com foto em
  produção. **[ISR]** O log do deploy de produção mostra o populate do cache com sucesso, e
  dois `curl -sI` em `/` com 20 s de intervalo mostram `x-nextjs-cache`. **[FALLBACK]** `/` com
  `Cache-Control: public, max-age=60` — **humano**
- [ ] T098 Pendências de entrega (não bloqueiam o merge): SC-001 (observação com uma cliente real,
  junto da T143 da 004) — **humano**

---

## Tasks condicionais (ISR × FALLBACK)

| Task | ISR | FALLBACK |
|---|---|---|
| T002, T004 | descartáveis (apagadas na T010); `revalidate = 15`, `expireTime: 35` | descartáveis (apagadas na T010) |
| T005 | P9 (só a repetição sai `no-store`, A1) e C1 conferidos | P9/C1 registrados como não aplicáveis ao ramo |
| T012, T019 | ADR e commit do ISR (com a infra da T016 e o commit `docs` da T015b) | ADR e commit das páginas dinâmicas (só docs) |
| T006 | populate provado com token temporário de mesmo escopo (sem decidir o ramo) | não se aplica: o `preview` falhou antes (opção A, 2026-10-15); prova do D16 não feita (research §5) |
| T015–T015b, T016–T018 | buckets, token do CI com *Workers R2 Storage: Edit*, `docs/operacao.md` e infra definitiva | não se aplica (o token do CI não muda) |
| T028 (`prazos.ts`) | `REVALIDATE_S` 15, `EXPIRE_S` 35, página 20 | página 60, sem `REVALIDATE_S`/`EXPIRE_S` |
| T033/T035 | registro da config inválida por renderização | registro uma vez por isolate |
| T034/T035 | guarda de build em `lerVitrine()` | `lerVitrine(categoria)` no servidor |
| T052/T054 | `max-age=20`; 500 repete uma vez; `x-isr` passa direto | `max-age=60`; 500 vira 503 direto |
| T053a, T061, T068 | `revalidate` literal = `REVALIDATE_S`; `EXPIRE_S + 20` ≤ 55 | `force-dynamic`, sem `expireTime`; página ≤ 60 |
| T058 | mensagem "versão anterior ou 503" | mensagem com "503" |
| T064, T070 | `revalidate = 15`, `generateStaticParams → []` | `dynamic = "force-dynamic"` |
| T070, T074, T075 | filtro no cliente (`useSearchParams` + `<Suspense>` + GET), `aria-current` pela URL e pelo GET | filtro no servidor, slug efetivo por props; GET só para "Carregar mais" |
| T078 | conferência do `x-nextjs-cache` | não se aplica |
| T082 (item 11) | versão anterior (`no-store` só na 1ª) ou 503 | sempre 503 |
| T085, T090, T091, T092, T094 | bucket de cache, DO, permissão de R2 do token do CI | sem bucket de cache, DO nem permissão nova |
| T086, T097 | log do populate do cache; `x-nextjs-cache` em produção | `max-age=60` em produção |

## Cobertura (spec → SF)

| Critério | SFs |
|---|---|
| US1.1, FR-001 | SF4 (conformidade sem auth), SF8 (sem ações do painel) |
| US1.2, US1.5, FR-006, FR-007 | SF1 (keyset), SF2 (cursor), SF5 (GET), SF9 (tela) |
| US1.3, US1.4, FR-009 | SF1, SF8 |
| US1.6, US2.6, FR-023 | SF7, SF8 |
| US1.7, FR-012 | SF2, SF8 |
| US1.8, FR-005 | SF8 |
| US1.9 | SF9 (restauração antes do GET, URL sem blocos, limpeza pelo "Ver o catálogo"), SF10 (Q§4.4–4.5) |
| US2.1, FR-014, FR-017 | SF1, SF2, SF7 |
| US2.2–2.5, FR-013 | SF6 (worker), SF7 (defesa na página), SF10 (Q§4.7–4.8) |
| US2.7, FR-002 | SF1, SF3, SF5, SF7 (conformidade) |
| US2.8, FR-024 | SF0 (P9, C1), SF3 (marca), SF4/SF5 (503), SF6 (worker, revalidação da fila), SF7 (`error.tsx`), SF10 (Q§4.11) |
| US3.1, US3.2, FR-018 | SF2, SF7, SF11 |
| US3.3 | SF3, SF7 |
| US3.4, US3.5, FR-019 | SF3, SF10 (Q§4.14), SF11, SF12 (T090) |
| US4.1–4.6, FR-010, FR-011 | SF1, SF3, SF5, SF8, SF9 |
| US4.7, FR-023 (filtro) | SF9 (`aria-current` pelo filtro efetivo) |
| US5.1–5.3, FR-021 | SF7, SF11 |
| US5.4, US6.3, FR-015, FR-020, SC-005 | SF0 (spike), SF4 (60 s), SF6/SF7/SF8 (teste do orçamento, T053a), SF10 (Q§4.15) |
| US6.1–6.4 | SF1 (`fotoPublica`), SF4 |
| US6.5, FR-016 | SF4 (T041a, conformidade do bucket), SF11 (T085) e SF12 (T090) (acesso público e domínio) |
| FR-003 | SF7 |
| FR-004, SC-009 | SF6 (cabeçalho, `robots.txt`), SF7 (meta), SF10 (Q§4.13) |
| FR-008 | SF8 |
| FR-022, SC-007 | SF7, SF8, SF9 (axe-core), SF10 (Q§4.16) |
| SC-001 | SF12 (pendência de entrega) |
| SC-002, SC-006 | SF11 |
| SC-003, SC-004 | SF2, SF4, SF5, SF7 |
| SC-008 | SF0 (ADR-011), SF8 (CPU antecipada, T072a/T072b), SF11 (CPU com fotos reais) |

## Pontos de atenção

- O spike (T002, T004) mexe em `src/app/page.tsx`, no worker e no `wrangler.jsonc`; a T010
  precisa deixar o tree limpo antes de qualquer commit. O `roseshop-dev` e o `roseshop` nunca
  recebem o spike: ele roda só no `preview` e no `roseshop-spike`, apagado na T009 junto do
  bucket `roseshop-cache-spike`. A T009 roda **antes** da T010, porque o `wrangler delete --env
  spike` precisa do `env.spike` no `wrangler.jsonc`.
- O `env.spike` não pode herdar o cron da limpeza (`triggers: { crons: [] }` na T002): o spike usa
  a branch dev do Neon e a limpeza mexeria nos envios de foto do dev.
- A classe `DOQueueHandler` só chega ao `roseshop-dev` e ao `roseshop` pela T016 (ramo ISR),
  depois do GATE; no ramo FALLBACK ela nunca é publicada fora do spike e não há migration de
  remoção.
- A T032 depende do humano editar o `.dev.vars`; sem ela, o `cf-typegen` não tipa o
  `WHATSAPP_NUMBER` e o `typecheck` da SF3 falha.
- `test:int` só aparece na SF1, na SF10 e na SF12; em todas, em série.
- **[ISR]** O token do CI ganha *Workers R2 Storage: Edit* (T015a) só depois do GATE; antes,
  o spike prova o populate com um token temporário de mesmo escopo (T006), apagado na T009. No
  ramo FALLBACK o token do CI não muda.
- Os 35 s do ramo ISR são o `expireTime`, não o `revalidate` (15 s). O teste do orçamento
  (T053a) falha se alguém trocar um pelo outro.
- A dívida do teste de `preparar-foto.test.ts` (tempo-limite com vitest concorrente, registrada na
  004) pode reaparecer nos `check` desta feature; não é regressão da 005.
