# Research: Catálogo público (005)

**Data**: 2026-10-15 | **Plan**: [plan.md](./plan.md) | **Spec**: [spec.md](./spec.md)

Fontes conferidas nesta sessão: código instalado de `@opennextjs/cloudflare` 1.20.8 e `next` 16.3.8
(`node_modules`), documentação atual do OpenNext (opennext.js.org/cloudflare/caching) e da
Cloudflare (Workers Logs, preços de Durable Objects).

## 1. Restrições do humano (entrada do plan, não reabrir)

| # | Restrição | Onde vira decisão |
|---|---|---|
| H1 | `*.workers.dev` não tem Cache API nem cache de borda (o cache é por zona). Páginas públicas com ISR do OpenNext, revalidação por tempo, cache incremental no R2, Cache-Control de até 60 s no navegador. Fotos consultam o banco a cada pedido e usam só o cache do navegador. Sem revalidação sob demanda. | D1–D5 |
| H2 | Filtro por slug calculado do nome (`?categoria=meias`), sem coluna nova e sem expor id. | D7 |
| H3 | Falhas por `console.error` estruturado + Workers Logs (`observability`). | D11 |
| H4 | Destaques por `destaque_vaga ASC` sem migration e sem mudar `produtos.ts`; `noindex` sem `Disallow`; voltar do detalhe restaura blocos pelo histórico do navegador, nunca pela URL; cursor composto (criado_em, código); `WHATSAPP_NUMBER` por ambiente em E.164. | D6, D8, D9, D10, D12 |

## 2. Decisões do humano nesta sessão (2026-10-15)

Perguntas feitas durante o plan, com a opção recomendada aceita em todas:

| # | Pergunta | Resposta |
|---|---|---|
| P1 | Como o ISR cumpre o prazo de 1 minuto (FR-020) se entrega a versão antiga antes de atualizar? | ISR com `expire`: revalidate 20 s, expire 40 s, navegador 20 s (soma 60 s; ajustado para 15/35/20 na A2). Primeiro spike prova o `expire` no OpenNext; se falhar, renderização dinâmica com navegador 60 s, sem reabrir o plan (D2). |
| P2 | `?categoria=` torna a página dinâmica: como filtrar? | Página inicial em ISR; o filtro é aplicado no cliente, que pede o 1º bloco filtrado a um GET público (D7). |
| P3 | Como responder 503 se a página só gera 500? | `cloudflare/worker.ts` pós-processa as rotas públicas: 500 → 503 `no-store` + `Retry-After` (D5). |
| P4 | Qual fila de revalidação? | Durable Object (SQLite, Free) (D3). |
| P5 | `WHATSAPP_NUMBER`: secret ou var? (o repositório é público) | `wrangler secret` + `.dev.vars` (D10). |
| P6 | Verificação automática de acessibilidade (SC-007)? | `axe-core` (dev) nos testes de componente, no `npm test` (D14). |
| P7 | O cursor composto expõe a data de cadastro (fora da lista do FR-002)? | Cursor opaco base64url com data (µs) + código; nota no FR-002 dizendo que o cursor é meio técnico, não dado exibido (D8). |
| P8 | Varredura de `/p/<código>` gasta escrita do R2 e compute do Neon? | Risco aceito + monitoramento; o worker já recusa formatos inválidos antes do Next (D4, R3). |
| P9 | FR-024 com ISR (revisão do plan, 2026-10-15) | Regeneração falha com versão em cache ⇒ servir a versão anterior; 503 só sem nenhuma versão guardada. Fotos continuam 503 com o banco fora (consulta a cada pedido). O log do 500 → 503 distingue falha de banco de erro inesperado. Spec atualizada: FR-024, edge case "Banco fora do ar", US2.8 (D5, D11). |

### Decisões do humano no analyze (2026-10-15)

| # | Achado | Decisão |
|---|---|---|
| A1 | Versão anterior servida com `max-age=20` depois da repetição (I1) | Spec emendada: a versão anterior vale durante a falha e até 1 min depois que o banco volta; só a resposta repetida sai `no-store` (D5) |
| A2 | Orçamento de 60 s sem folga (B1) | `revalidate` 15 s + `expireTime` 35 s + navegador 20 s = 55 s + tempo de render (D2) |
| A3 | Restauração de até 30 min × FR-020 (I3) | Exceção explícita no FR-020 para o voltar do navegador (D15) |
| A4 | Token do CI sem permissão de R2 para popular o cache (C2) | Revista pelo humano: ampliar o token do CI com *Workers R2 Storage: Edit*, provado no spike com token de mesmo escopo antes do GATE (D16) |
| A5 | `criado_em` no cursor (F1) | Mantida a P7; a conformidade decodifica o cursor (D8) |
| A6 | `SITE_URL` inválida (F2) | Spec emendada (FR-018/FR-019): mensagem sem link + registro (D12) |

Também aplicados, sem decisão: pedidos de revalidação da fila passam direto pelo worker (D5,
C1), filtro dentro da lista cliente (D7, I2), registro da config inválida uma vez por isolate no
FALLBACK (D10), teste do orçamento e do bucket privado (K1), URL sem blocos e ordem
restauração × GET (D15, U1/U2) e limpeza da restauração pelo "Ver o catálogo" (D15, F3).

## 3. Decisões técnicas

### D1. Cache: ISR do OpenNext com R2 + fila DO, sem tag cache

- **Decision**: `open-next.config.ts` com `incrementalCache: r2IncrementalCache` e
  `queue: doQueue`; sem `tagCache` (só seria necessário com `revalidateTag`/`revalidatePath`,
  que não usamos — H1). Binding `NEXT_INC_CACHE_R2_BUCKET` num **bucket próprio por ambiente**
  (`roseshop-cache-local`, `roseshop-cache-dev`, `roseshop-cache-prod`), não num prefixo do
  bucket de fotos.
- **Rationale**:
  - A doc do OpenNext exige, para revalidação por tempo, cache incremental (R2 recomendado; KV
    não, por ser eventualmente consistente) e uma fila ("A queue must be setup for projects using
    Time-Based revalidation").
  - Bucket separado: a limpeza da SF12 da 004 lista o prefixo `fotos/` (ok hoje), mas um bucket próprio
    elimina o risco de uma mudança futura na limpeza apagar o cache. O token S3 das URLs
    pré-assinadas (T148) fica restrito ao bucket de fotos e não alcança o cache. O CORS não
    muda.
  - R2 no Free: 10 milhões de leituras (Class B) e 1 milhão de escritas (Class A) por mês, e 10 GB.
    Cada página regenerada é 1 escrita; com o tráfego da loja, ordens de grandeza abaixo do teto.
- **Alternatives considered**: prefixo `incremental-cache/` no bucket de fotos (mais simples, mas
  mistura dado regenerável com dado de negócio e amplia o alcance do token); KV (rejeitado pela
  própria doc); renderização dinâmica pura (fallback do D2).

### D2. Prazo de 1 minuto: `revalidate` 15 s + `expireTime` 35 s + navegador 20 s (A2)

- **Problema**: o ISR é *stale-while-revalidate*. Passado o `revalidate`, o próximo pedido recebe
  a versão antiga e dispara a regeneração em segundo plano. Numa página pouco visitada, a primeira
  visita horas depois veria o estado antigo, por exemplo um produto removido, ou esgotado ainda
  com o botão do WhatsApp. Isso violaria o FR-020.
- **O que o Next 16.3.8 oferece** (`next/dist/server/lib/incremental-cache/index.js`, ~linha 449):
  se `expire` da rota passou desde `lastModified`, `isStale = -1` e a resposta **espera** uma nova
  renderização ("force a blocking revalidation"). O `expire` vem de `expireTime` no
  `next.config` (padrão 1 ano), gravado no prerender manifest como `initialExpireSeconds`
  (rotas pré-renderizadas) e `fallbackExpire` (rotas dinâmicas).
- **Ponto não provado**: `SharedCacheControls.get` diz "A new runtime pathname has no initial
  lifetime" — um caminho criado em tempo de execução (`/p/0042`) só tem `expire` se a rota
  dinâmica `/p/[codigo]` estiver em `dynamicRoutes` com `fallbackExpire`, ou depois de renderizado
  naquele isolate. Num isolate novo do Worker, o `expire` pode faltar ⇒ volta o SWR sem teto.
  Além disso, o `lastModified` vem do `uploaded` do objeto no R2 (`r2-incremental-cache.js`).
- **Decision**: `export const revalidate = 15` nas páginas públicas; `expireTime: 35` no
  `next.config.ts`; `Cache-Control: public, max-age=20` no navegador (D5). **Atenção aos
  nomes**: 35 s é o `expireTime` (idade máxima da entrada; passado, o pedido **espera** a
  regeneração), não o `revalidate` (15 s, a partir do qual o pedido recebe a versão em cache e
  dispara a regeneração em segundo plano). Trocar um pelo outro quebra o orçamento. Pior caso:
  entrada com até 35 s + navegador com até 20 s = **55 s**, mais o tempo de render (o
  `lastModified` é o upload no R2, que acontece depois da leitura do banco; com o Neon frio, o
  render leva segundos). Os 5 s de folga cobrem esse atraso (FR-020, SC-005). O teste de
  conformidade do orçamento (tasks, SF6) falha se a soma passar de 60 s. **SF0 (spike) é a
  primeira tarefa**:
  provar no `preview` e num worker descartável `roseshop-spike` (`*.workers.dev`, bucket de
  cache `roseshop-cache-spike`, mesma branch dev do Neon com secret próprio; nunca no
  `roseshop-dev`) que, num isolate novo, um pedido a `/` e a `/p/<código>` com entrada mais
  velha que 35 s espera a regeneração. O worker e o bucket do spike são apagados ao fim do SF0.
  Os buckets definitivos (`roseshop-cache-dev` e `-prod`) e a migration do `DOQueueHandler` só
  entram no `roseshop-dev` e no `roseshop` no ramo ISR, depois da aprovação do ADR-011.
- **Fallback (aprovado em P1, sem reabrir o plan)**: se o spike falhar, as páginas públicas viram
  dinâmicas (`export const dynamic = "force-dynamic"`), com `Cache-Control: public, max-age=60` e
  sem cache incremental nem fila (pior caso: 60 s de navegador + render). O fallback retira
  D1, D3, D16 e o build guard (D13), e a página
  inicial passa a ler `searchParams` no servidor (D7 fica simplificado). O resto do plan não
  muda. Como o spike nunca publica a classe `DOQueueHandler` no `roseshop-dev` nem no
  `roseshop`, o fallback não precisa de migration de remoção. O resultado do spike é registrado
  em `research.md` §5.
- **Alternatives considered**: ISR puro de 60 s (rejeitado em P1: sem teto real); renderização
  dinâmica direto (é o fallback; custa banco e CPU a cada primeira visita do navegador).

### D3. Fila de revalidação: Durable Object

- **Decision**: `queue: doQueue` (`@opennextjs/cloudflare/overrides/queue/do-queue`), binding
  `NEXT_CACHE_DO_QUEUE` → classe `DOQueueHandler`, migration `new_sqlite_classes` nos três
  ambientes. `cloudflare/worker.ts` reexporta a classe do `open-next-worker` (o comentário atual
  do arquivo já prevê isso).
- **Rationale**: é a fila que a doc recomenda para produção (deduplica entre isolates). A memory
  queue "deduplica só por isolate… use por sua conta em produção". DO com SQLite está no Free
  (100 mil pedidos/dia, 5 GB); a classe do OpenNext usa `ctx.storage.sql` (conferido em
  `dist/api/durable-objects/queue.js`). O KV-backed é só Paid e não é usado.
- **Alternatives considered**: memory queue (sem infra nova; rejeitada em P4).

### D4. Rotas públicas e o que o worker faz antes do Next

- `cloudflare/worker.ts` passa a ter duas responsabilidades novas, isoladas numa função pura
  testável (`cloudflare/publico.ts`):
  1. **Antes do Next** (`/p/<x>`): se `x` não casa `^\d{1,9}$`, reescreve internamente para o
     caminho fixo `/p/0` (que o Next responde como "Produto não encontrado"), de modo que lixo
     não cria entradas novas no cache (P8). Se casa, mas não está na forma canônica
     (`padStart(4, "0")`, sem zeros a mais), responde **308** para a forma canônica sem chamar o
     Next (FR-013). Se o número passa do teto do `integer` do Postgres, também vai para `/p/0`.
  2. **Depois do Next**: ver D5.
- A página `/p/[codigo]` repete a validação (defesa em profundidade; `next dev` não passa pelo
  worker).

### D5. Cabeçalhos das respostas públicas e o 503

- **Decision**: o worker pós-processa as respostas de `/` e `/p/*` (só GET/HEAD):
  - status 200, 308 ou 404: `Cache-Control: public, max-age=20` (o Next grava `s-maxage` nas
    páginas ISR, que não vale para o navegador; o Next também sobrescreve `Cache-Control`
    definido no `next.config` para páginas). O 404 fica em cache curto como o resto: um produto
    cadastrado aparece em até 60 s.
  - status 500: o worker **repete o pedido uma vez** em processo (P9, ver "Versão anterior"
    abaixo). Se a repetição vier 200, entrega essa resposta (a versão guardada) com
    `Cache-Control: no-store`. Se vier 500 de novo, responde **503** com `Cache-Control: no-store`
    e `Retry-After: 30`. O corpo é a página de erro do Next (`(public)/error.tsx`, "Não foi possível
    carregar agora" + "Tentar de novo"). Registro em D11.
  - todos: `X-Robots-Tag: noindex, nofollow` (D9).
- `/fotos/*` e `/api/catalogo/*` definem os próprios cabeçalhos no route handler (D6/D7). O worker
  só acrescenta `X-Robots-Tag`.
- **Rationale**: no App Router, um componente de servidor só gera 404 (`notFound`),
  redirecionamentos, 401/403. Um erro vira 500. O worker já é nosso (SF12 da 004) e é o único ponto que
  vê o status final. Todo 500 público vira 503: aceito em P3. Um bug também aparece como
  indisponível, mas fica no log.
- **ISR e erro**: o Next não grava em cache uma renderização que falhou. Com a entrada entre 15 e
  35 s, uma regeneração falha em segundo plano mantém a anterior e a cliente recebe a anterior.
- **Versão anterior (P9)**: passados os 35 s, o pedido espera a regeneração. Se ela falha, o Next
  16.3.8 (`response-cache/index.js` ~linha 304) lança o erro (500) **e regrava a entrada
  anterior** com `lastModified` novo, `revalidate` = o anterior limitado a 3–30 s (15 s) e
  `expire` = máx(`revalidate` + 3, anterior) (35 s), "to prevent non-stop retrying". Por isso a
  repetição do pedido pelo worker acha a entrada válida e devolve a versão anterior com 200. Sem
  entrada anterior (página nunca gerada), a repetição falha de novo ⇒ 503. Custo: uma invocação
  interna a mais, só quando há 500.
- **Só a resposta repetida sai `no-store` (A1)**: depois da regravação, os pedidos seguintes
  recebem a mesma versão anterior com **200 de primeira** (cache válido até 15 s, depois SWR até
  35 s), e o worker, que só vê o status, aplica `max-age=20` como em qualquer 200. O ciclo se
  repete enquanto o banco estiver fora. Consequência, já na spec (US2.8, FR-024): a versão
  anterior pode passar de 60 s durante a falha e continuar sendo servida por até 1 minuto
  (35 + 20 s + render) depois que o banco volta. Marcar `no-store` em todo `STALE` não resolve:
  o `HIT` da entrada regravada também traz conteúdo antigo.
- **Pedidos de revalidação da fila (C1)**: o `DOQueueHandler` revalida mandando um `HEAD` ao
  próprio worker com `x-prerender-revalidate` e `x-isr: 1` (`dist/api/durable-objects/queue.js`
  ~linha 86) e interpreta o status: 200 sem `x-nextjs-cache: REVALIDATED` é `FatalError`, 500
  entra no estado de falha com nova tentativa. Por isso o worker deixa esses pedidos passarem
  **sem mudança**: sem repetição, sem 503 e sem cabeçalhos novos. No 500 de um pedido com
  `x-isr: 1`, ele só registra o evento (D11) com `resultado: "revalidacao"`; é assim que a falha
  em segundo plano (entrada entre 15 e 35 s) fica registrada (FR-024).
  O comportamento é provado no spike SF0 (quickstart §2) e coberto por teste unitário de
  `ajustarResposta` com handler falso.

### D6. Rota pública de fotos `GET /fotos/[arquivo]`

- **Decision**: route handler novo, irmão de `/painel/fotos/[arquivo]`, sem sessão:
  `chaveDoArquivo` (regex antes do binding) → `fotoPublica(chave)` em `src/lib/db/catalogo.ts`
  (só `produto_fotos`; **envio confirmado não conta**, diferente de `chaveExibivel` do painel) →
  `servirObjeto` com `If-None-Match` (304). Cabeçalhos do 200/304: `Cache-Control: public,
  max-age=60` (sem `immutable`: FR-015), `ETag`, `nosniff`, `Content-Security-Policy:
  default-src 'none'`. Recusa = 404 vazio idêntico em todos os casos. Banco ou R2 com erro = 503
  `no-store`, nunca 404 (FR-024).
- **Rationale**: H1 — banco a cada pedido e só o navegador guarda. 60 s no navegador cumprem o
  FR-015 (o pedido seguinte revalida com `If-None-Match`; se a foto saiu do produto, 404). A
  checagem no banco antes do R2 impede distinguir "existe no bucket" de "não existe" (US6.2).
- O endereço é usado no `og:image` (absoluto, D12); o crawler do WhatsApp não tem sessão, por isso
  a rota é pública.

### D7. Filtro por categoria: slug do nome, aplicado no cliente

- **Slug**: `replace(categorias.chave, ' ', '-')`, calculado no SQL. **Colisão impossível**: a
  coluna gerada `chave = categoria_chave(nome)` (minúsculas, sem acento NFD 0300–036F, hífen →
  espaço, espaços colapsados) é `UNIQUE` desde a migration `0000`, e a 002 só aceita
  `[\p{L}\p{N} -]` com ao menos uma letra/dígito. Como a `chave` não contém hífen, trocar espaço
  por hífen é injetivo ⇒ duas categorias nunca geram o mesmo slug. **Sem desempate.**
- **Comparação**: o servidor resolve o slug pedido comparando com o slug de cada categoria com
  produtos (Zod: `^[\p{Ll}\p{N}]+(-[\p{Ll}\p{N}]+)*$`, até 60). Slug desconhecido ou de categoria
  vazia ⇒ "Todas", com `categoria: null` na resposta (FR-011, US4.6). Renomear quebra links
  antigos, e o fallback cobre (nota da spec).
- **Renderização (P2)**: a página inicial (ISR) **não lê `searchParams`**. Ela entrega destaques,
  opções do filtro e o 1º bloco de "Todas". O componente cliente `ListaCatalogo` lê
  `useSearchParams()` (dentro de `<Suspense>`, exigência do Next para não tornar a página
  dinâmica). Se houver `categoria`, pede o 1º bloco filtrado a `GET /api/catalogo/produtos` e
  mostra estado de carregando na lista. O filtro são links `?categoria=<slug>` com
  `aria-current`; trocar de filtro é navegação do cliente na mesma página.
- **Filtro dentro da lista cliente (I2)**: no ISR, a navegação do filtro é renderizada pela
  própria `ListaCatalogo`, e o `aria-current` vem do `categoria` efetivo (o da URL até o GET
  responder, depois o `categoria` devolvido, que pode ser `null` ⇒ "Todas", US4.6). Um filtro
  renderizado no servidor sem `searchParams` marcaria sempre "Todas" (FR-023, US4.7). No
  FALLBACK, o servidor já conhece o slug efetivo e o passa por props.
- **Alternatives considered**: página inicial dinâmica (rejeitada em P2); caminho `/c/<slug>`
  (contraria H2).

### D8. "Carregar mais": cursor composto opaco e GET público

- **Ordem**: `ORDER BY criado_em DESC, id DESC` (FR-006; editar não muda `criado_em`). O painel
  (003) continua por `id DESC`; não há mudança em `produtos.ts` (H4).
- **Cursor (P7)**: `base64url("<µs>.<id>")`, em que `µs = floor(extract(epoch from
  criado_em) * 1e6)::bigint` (o `extract` devolve `numeric` no PG ≥ 14, sem perda). Continuação:
  `(criado_em, id) < ('epoch'::timestamptz + $µs * interval '1 microsecond', $id)`. O
  `Date` do JS perde microssegundos, por isso o instante nunca passa por ele. Zod no servidor:
  base64url válido, `^\d{1,17}\.\d{1,10}$`, id ≤ teto do integer. Cursor inválido ⇒ 400 sem
  detalhe. Exato mesmo se o último item for removido entre os blocos (US1.5, edge case).
- **Bloco**: 24 itens; consulta `LIMIT 25` para `haMais`.
- **Transporte**: `GET /api/catalogo/produtos?categoria=<slug>&depois=<cursor>`, route handler
  dinâmico com `Cache-Control: public, max-age=20`. É GET e não Server Action porque é leitura
  pública e idempotente, e não precisa do custo de uma action. Resposta JSON com só os campos
  públicos (contrato).
- **Cursor e FR-002 (A5)**: o conteúdo decodificado é exatamente `^\d{1,17}\.\d{1,10}$` (µs e
  código, nada mais); a conformidade do GET decodifica o `proximo` e confere esse formato.
- **Índice**: sem migration. Com ~500 produtos, um sort em memória do Postgres é desprezível
  (mesma escala do `test:perf` da 003). Se a medição do SC-002 apontar a consulta, o índice
  `(criado_em DESC, id DESC)` vira tarefa com migration própria.

### D9. Não indexação

- `metadata.robots = { index: false, follow: false }` no layout `(public)` (vira
  `<meta name="robots" content="noindex, nofollow">`) **e** `X-Robots-Tag: noindex, nofollow` pelo
  worker (D5) em páginas, fotos e API públicas. `src/app/robots.ts` com `allow: "/"` e **sem
  `Disallow`** (um `Disallow` impediria o buscador de ler o `noindex`). O crawler do WhatsApp
  ignora `noindex` para a prévia; isso é conferido no roteiro do dev (US5).

### D10. WhatsApp

- `WHATSAPP_NUMBER` por `wrangler secret put --env dev|production` e `.dev.vars` no local; só a
  chave no `.dev.vars.example` (P5: repositório público).
- Validação Zod em `src/lib/catalogo/config.ts`: E.164 `^\+[1-9]\d{7,14}$`. O link usa os dígitos
  sem `+`: `https://wa.me/<dígitos>?text=<encodeURIComponent(mensagem)>`.
  `encodeURIComponent` codifica `&`, `#`, `?`, acentos e emoji (UTF-8) sem perda (US3.2).
- Mensagem: `Olá! Tenho interesse no produto <nome> (#0042): <SITE_URL>/p/0042`.
- Ausente ou inválido ⇒ o botão não é renderizado e é registrado
  `{evento:"catalogo.whatsapp_invalido"}`, sem o valor (D11). Com ISR, o registro acontece a
  cada renderização, no máximo uma vez a cada 15 s por página. No FALLBACK (toda visita
  renderiza), `configCatalogo()` registra a falha **uma vez por isolate** (memo em módulo), para
  não gastar o teto de 200 mil eventos/dia do Workers Logs.

### D11. Registro de falhas

- `src/lib/catalogo/registro.ts`: `registrarFalha({evento, rota, causa})` → `console.error(
  JSON.stringify(...))`. `causa` é um código fechado (`"banco"`, `"r2"`, `"config"`,
  `"inesperado"`), nunca a mensagem da exceção (pode trazer chave, URL com credencial ou dado
  pessoal), nunca IP, cabeçalho ou e-mail. Mesmo padrão do `fotos.exibicao.falha` da 004.
- **Falha de banco × erro inesperado no 500 das páginas (P9)**: o worker só vê o status, e por
  isso a causa é marcada onde a exceção acontece. O worker passa ao `handler.fetch` um `ctx`
  próprio do pedido (o `ExecutionContext` original + `{ roseshop: { causa: null } }`), que o
  OpenNext devolve em `getCloudflareContext().ctx`. Em `leitura.ts`, toda chamada a
  `src/lib/db/catalogo.ts` fica num `try`: se lançar, marca `causa = "banco"` e relança. Qualquer
  outro erro deixa `causa = null`. No 500, o worker registra campos diferentes:
  - banco: `{ evento: "catalogo.banco_indisponivel", rota, causa: "banco", resultado:
    "versao_anterior" | "503" }`
  - inesperado: `{ evento: "catalogo.erro_inesperado", rota, causa: "inesperado", resultado:
    "versao_anterior" | "503" }`
  - revalidação da fila (`x-isr: 1`, D5): o mesmo evento conforme a causa, com `resultado:
    "revalidacao"` e a resposta repassada sem mudança.
  A cliente vê a mesma coisa nos dois casos. Que o OpenNext repassa o `ctx` é conferido no spike
  SF0. Se não repassar, o marcador vai num `AsyncLocalStorage` publicado em `globalThis` pelo
  worker (mesmo efeito, sem mudar o contrato do log).
- `observability.enabled: true` já está no topo do `wrangler.jsonc` e é herdado pelos `env`
  (não é binding). Sem `head_sampling_rate` (padrão 1 = todos os pedidos).
- **Retenção confirmada** (developers.cloudflare.com, Workers Logs): Free = **3 dias**, até
  **200 mil eventos/dia**; Paid = 7 dias. O roteiro de operação diz para olhar os logs em até
  3 dias após um alerta.

### D12. URL pública do site (`SITE_URL`)

- O `og:image` precisa ser absoluto (`metadataBase`) e a mensagem do WhatsApp leva o link do
  produto. Uma página ISR não pode ler `headers()` (viraria dinâmica) e a regeneração vem da fila
  com outro host. Por isso a URL base vem de configuração.
- **Decision**: `SITE_URL` em `vars` do `wrangler.jsonc` por ambiente (valor público, não
  segredo): local `http://localhost:8787`, dev `https://roseshop-dev.willsmt.workers.dev`,
  produção `https://roseshop.willsmt.workers.dev`. Validado com Zod (`url()`, `https:` fora do
  local). Ausente ou inválido ⇒ prévia sem imagem e mensagem sem link, com registro (o resto
  funciona). Previsto na spec desde a A6 (FR-018/FR-019).

### D13. Build sem banco (pré-renderização de `/`)

- **Problema**: uma página ISR sem parâmetro (`/`) é pré-renderizada no `next build`, e o CI não
  tem banco.
- **Decision**: a leitura da página inicial checa `process.env.NEXT_PHASE ===
  "phase-production-build"` e, no build, devolve o estado "indisponível" sem tocar no banco. O
  deploy grava essa entrada no R2 (populate cache, D16). Pelo D2, ela é regenerada no primeiro
  pedido depois de 15 s e, passados 35 s, o pedido espera a regeneração. Na prática, ninguém vê a
  página do build. `/p/[codigo]` usa `generateStaticParams` → `[]` e não é pré-renderizada.
- **Verificação**: faz parte do spike SF0 (abrir `/` logo após o `preview` e o deploy do
  `roseshop-spike`, e após 35 s).

### D14. Acessibilidade e telas

- `axe-core` (dev, versão exata) rodando nos testes de componente das telas públicas (jsdom), sem
  violações `serious`/`critical` (SC-007). Contraste e tamanho real de alvo ficam no roteiro manual
  (jsdom não calcula layout).
- Regras de exibição em módulo puro `src/lib/catalogo/exibicao.ts` (preço via `formatarPreco` da
  003, código via `formatarCodigo`, rótulo de esgotado, texto alternativo, link e mensagem do
  WhatsApp), separadas dos componentes (FR-022).
- Fotos fora da primeira tela: `<img loading="lazy" decoding="async" width height>`. Na
  primeira tela (destaques e os primeiros itens): `loading="eager"`. Usa-se `<img>` simples, sem
  `next/image`: o otimizador de imagens processaria no Worker (constitution VII).
- `lang="pt-BR"` no `<html>` do layout raiz, e o metadata padrão "Create Next App" sai.
- Descrição com quebras: `white-space: pre-line` sobre texto puro (React escapa; FR-003).

### D15. Voltar do detalhe (FR-007, H4)

- `sessionStorage` (por aba, então um link copiado noutro aparelho ou aba começa do zero),
  chave `catalogo:<slug|todas>`, com `{itens, cursor, scrollY, salvoEm}`. É gravado no clique
  num item, antes da navegação, e lido na montagem da lista quando existir para o filtro atual e
  tiver menos de 30 min. Depois de usado, é apagado. A posição é restaurada com `scrollTo` depois
  de pintar. Sem `history.state`: o App Router usa o próprio `history.state` e escrever nele
  disputa com o router.
- Os itens restaurados podem ter até 30 min (estado do navegador, como o "voltar" de qualquer
  site). A spec registra essa exceção no FR-020 (A3): o detalhe, onde fica o botão do WhatsApp,
  e o próximo "Carregar mais" seguem o prazo de 1 minuto.
- **Ordem na montagem (U2)**: se houver restauração válida para o filtro atual, ela vale e o
  GET do 1º bloco **não** é feito; sem restauração, a lista segue o fluxo normal (no ISR, GET do
  1º bloco filtrado quando há `categoria`).
- **URL (U1)**: "Carregar mais" e a restauração não mexem na URL (nem `router.push`/`replace`,
  nem `history.pushState`/`replaceState` pela lista); a URL só muda pelos links do filtro.
- **Limpeza (F3)**: o link "Ver o catálogo" (404 e detalhe aberto direto) apaga as restaurações
  guardadas antes de navegar, para que abrir `/` por ele comece do 1º bloco.

### D16. Permissão do CI para popular o cache (A4)

- **Problema**: o `opennextjs-cloudflare deploy` sempre popula o cache R2 remoto
  (`dist/cli/commands/deploy.js` ~linha 22). Antes de gravar, chama `ensureR2Bucket`
  (`populate-cache.js` ~linha 165) e sobe um worker remoto com binding do bucket, o que exige
  permissão de R2 na conta. O token do CI hoje só tem *Workers Scripts: Edit* e leituras de
  conta/usuário (`docs/operacao.md`), então o deploy do ramo ISR falharia.
- **Decision (opção a)**: no ramo ISR, ampliar o token do CI (`CLOUDFLARE_API_TOKEN` dos
  environments `dev` e `production` do GitHub) com *Workers R2 Storage: Edit*, mantendo a
  restrição à conta e a validade atual. Workflows e scripts de deploy não mudam.
- **Rationale (risco marginal)**: o token do CI já publica o worker, e o worker tem binding para
  o bucket de fotos (`PRODUCT_IMAGES`). Quem controla esse token já pode publicar um worker que
  lê ou apaga as fotos. A permissão de R2 na conta acrescenta pouco a esse alcance e mantém o
  caminho documentado do OpenNext, sem dependência nova.
- **Prova antes do GATE**: o deploy do `roseshop-spike` (T006) é feito com um token temporário
  de **mesmo escopo** que o token ampliado do CI (sem o login OAuth do mantenedor), e o log
  precisa mostrar o populate do cache com sucesso. O token temporário é apagado na T009. A
  ampliação do token real só acontece no ramo ISR, depois do GATE (T015a).
- **Alternatives considered**:
  - **(c) credenciais S3 limitadas ao bucket de cache**, pela opção de cópia via rclone do
    OpenNext (conferida no 1.20.8: lê `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` e
    `CF_ACCOUNT_ID` e não chama `ensureR2Bucket`). **Descartada**: (1) exige uma dependência
    opcional cujo script de instalação baixa um executável em **todo** `npm ci`, inclusive nos
    jobs que não fazem deploy; (2) os nomes das variáveis coincidem com as chaves de fotos da 004, e localmente o
    `.dev.vars` sobrepõe o ambiente do processo, então um deploy manual usaria as chaves de
    fotos; (3) o caminho completo só seria provado no deploy do PR, já no fim da feature.
  - **(b) `wrangler deploy` sem popular o cache**: sai do caminho documentado do OpenNext e mexe
    nos scripts de deploy.

## 4. Riscos## 4. Riscos

| # | Risco | Tratamento |
|---|---|---|
| R1 | `expire` não respeitado num isolate novo ⇒ SWR sem teto | Spike SF0; fallback dinâmico aprovado (D2) |
| R2 | CPU do Workers Free (10 ms) na renderização e na regeneração | Mesmo risco aceito da T139/ADR-010: medir CPU de `/` e `/p/<código>` no dev (SF de prova); sinal = Erro 1102 |
| R3 | Varredura de `/p/<n>` e `/fotos/<uuid>` gasta escrita do R2 e compute do Neon (P8) | Risco aceito; o worker recusa formato inválido sem cache novo; `docs/operacao.md` ganha o sinal (Class A do R2 e compute do Neon) e a contingência (domínio próprio com rate limiting) |
| R4 | `useSearchParams` sem `<Suspense>` derruba a página inteira para CSR no build | Teste de conformidade: build do `preview` + checagem de que `/` sai como ISR (`x-nextjs-cache`) no spike |
| R5 | Crawler do WhatsApp não gera a prévia (noindex, tamanho da imagem, tempo) | Roteiro manual no dev (US5); a imagem tem no máximo 1 MiB (004) e o WhatsApp aceita até ~5 MB |
| R6 | Entrada de build ("indisponível") vista logo após o deploy | D13; janela de segundos; checada no spike |
| R7 | Token do CI com *Workers R2 Storage: Edit* na conta (D16) alcança também o bucket de fotos | Risco marginal aceito (o token já publica o worker com binding para as fotos); token restrito à conta, só nos environments do GitHub, validade em `docs/operacao.md`; nota no ADR-011 |

## 5. Resultado do spike SF0

_(preenchido na implementação)_
