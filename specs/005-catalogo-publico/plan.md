# Implementation Plan: Catálogo público

**Branch**: `feature/005-catalogo-publico` | **Date**: 2026-10-15 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/005-catalogo-publico/spec.md`

**Status**: rascunho para revisão humana. Restrições H1–H4 do humano e decisões P1–P8 tomadas
nesta sessão ([research.md §1–2](./research.md#1-restrições-do-humano-entrada-do-plan-não-reabrir)).
A SF0 é um spike que decide entre ISR com `expire` e o fallback dinâmico já aprovado.

> **Ramo FALLBACK (2026-10-15, GATE T014):** o spike SF0 reprovou o ISR. As páginas públicas
> são dinâmicas (`force-dynamic`), com `Cache-Control: public, max-age=60` no navegador, sem cache
> incremental, fila, Durable Object, guarda de build nem permissão nova no token do CI; todo 500
> público vira 503. Os trechos de ISR abaixo (cache, prazo 15/35/20, deploy do cache, filtro no
> cliente) **não se aplicam** e ficam como registro. Vale o
> [ADR-011](../adr/011-cache-catalogo-workers-dev.md) e a tabela
> [Tasks condicionais](./tasks.md#tasks-condicionais-isr--fallback), coluna FALLBACK.

## Summary

Página inicial (`/`) e detalhe (`/p/0042`) públicos, sem login, com destaques, lista em blocos de
24 por "Carregar mais", filtro por categoria e botão "Perguntar no WhatsApp". As fotos saem por
uma rota pública que confere no banco, a cada pedido, se a chave pertence a um produto.

Abordagem técnica:

- **Cache.** Em `*.workers.dev` não há cache de borda, então as páginas públicas usam ISR do
  OpenNext: cache incremental num bucket R2 próprio por ambiente e fila de revalidação em
  Durable Object (SQLite, Free).
- **Prazo de 1 minuto (FR-020).** O `revalidate` fica em 15 s e o `expireTime` em 35 s (35 s é
  o `expireTime`, não o `revalidate`): depois disso o pedido espera a página ser refeita. O
  navegador guarda por até 20 s. Pior caso: 35 + 20 = 55 s + tempo de render (5 s de folga,
  A2). Um teste de conformidade trava a soma em ≤ 60 s. O spike SF0 prova que o `expire`
  funciona no OpenNext; se falhar, as páginas viram dinâmicas.
- **Deploy do cache (A4).** O token do CI ganha *Workers R2 Storage: Edit* para o deploy popular
  o cache R2; provado no spike com token de mesmo escopo antes do GATE (research D16).
- **Filtro.** A página inicial não lê a query (senão deixaria de ser ISR). O filtro
  `?categoria=<slug>` é aplicado no cliente por um GET público, que também serve o
  "Carregar mais", com cursor opaco (data de cadastro em µs + código).
- **Worker próprio.** O `cloudflare/worker.ts` canoniza `/p/<código>`, recusa formatos inválidos
  sem criar cache, aplica `Cache-Control`/`X-Robots-Tag` e converte 500 em 503 `no-store`
  (FR-024).
- **Banco.** Nenhuma migration. O SQL público fica num arquivo novo, `src/lib/db/catalogo.ts`.

## Technical Context

**Language/Version**: TypeScript strict, Node 24 (dev/CI), runtime workerd (Cloudflare Workers via OpenNext)

**Primary Dependencies**:
- Runtime: as da 004. Sem dependência nova.
- Overrides do `@opennextjs/cloudflare` 1.20.x já instalado: `r2-incremental-cache`, `do-queue`.
- Dev: **`axe-core`** (versão exata, justificativa no commit; P6).

**Storage**:
- Postgres (local, Neon dev, Neon produção), só leitura de `categorias`, `produtos` e
  `produto_fotos`.
- R2 de fotos (inalterado) + **R2 de cache novo**: `roseshop-cache-{local,dev,prod}`.
- Durable Object `DOQueueHandler` (SQLite).

**Testing**: Vitest.
- Unitários: `exibicao`, `cursor`, `slug`, `config`, `publico.ts` do worker, rotas com mocks e
  componentes com axe-core.
- Integração no banco local: consultas de `catalogo.ts`, keyset com empates e remoção entre
  blocos, `fotoPublica` contra envios pendentes.
- Conformidade: as rotas públicas não importam auth, o JSON só tem campos públicos e o 404 da
  foto é idêntico em todos os casos.
- Spike e roteiros manuais (quickstart).

**Target Platform**: Cloudflare Workers Free em `*.workers.dev`; clientes no Chrome Android.

**Project Type**: aplicação web única (Next.js 16 App Router).

**Performance Goals**: SC-002, conteúdo útil ≤ 3 s em 4G com fotos reais e ≥ 24 produtos.
SC-005, alterações visíveis ≤ 60 s.

**Constraints**:
- Free tier (constitution VII; SC-008): a CPU por pedido é risco aceito da T139, a medir no dev.
- Sem cache de borda nem Cache API (`workers.dev`).
- Sem revalidação sob demanda; sem mudar `produtos.ts` nem o schema.
- Servidor não processa imagem (sem `next/image` otimizado).

**Scale/Scope**:
- Volume: ~500 produtos, ≤ 1.500 fotos, tráfego de loja que circula por link.
- Superfície: 2 páginas, 1 GET de lista, 1 rota de fotos, `robots.ts`.
- Infra: 1 bucket e 1 DO novos por ambiente; 1 secret e 1 var novos; [ISR] token do CI ampliado com *Workers R2 Storage: Edit* (D16).

Sem `NEEDS CLARIFICATION`. O R1 (`expire` num isolate novo) é tratado como prova da SF0 com
fallback aprovado.

## Constitution Check

*GATE: antes da Phase 0 e de novo após a Phase 1.*

| Princípio | Verificação | Pré | Pós-design |
|---|---|---|---|
| I. Fonte de verdade | Spec com Given/When/Then e 3 clarificações; cada critério mapeado a teste ([Cobertura](#cobertura)); correções da spec feitas antes do código: Notas para o plan (sem "cache de borda") e nota no FR-002 sobre o cursor; **ADR-011** (cache do catálogo em `workers.dev`: ISR + R2 + DO, orçamento de 60 s) escrito após a SF0 e aprovado pelo humano antes da SF1 | ✅ | ✅ |
| II. Stack fechada | Sem troca de stack: R2 e Workers já estão na tabela; ISR e DO são recursos do OpenNext/Workers (ADR-001); `axe-core` é só de dev (justificado no commit); Zod em query, cursor, slug, código e configuração | ✅ | ✅ |
| III.1 Segredos | `WHATSAPP_NUMBER` só em `wrangler secret`/`.dev.vars` (P5, repositório público); `SITE_URL` é pública (`vars`); token do CI ampliado só com *Workers R2 Storage: Edit* e nenhum secret novo (D16); logs sem número, chave, IP nem mensagem de exceção | ✅ | ✅ |
| III.2 Allowlist | O painel não muda; nenhuma rota pública importa `@/lib/auth` (conformidade); a rota de fotos do painel continua com sessão | ✅ | ✅ |
| III.3 Zod | `codigo`, `categoria`, `depois`, `arquivo` (regex da 004), `WHATSAPP_NUMBER` (E.164), `SITE_URL` | ✅ | ✅ |
| III.4 Upload | Não se aplica (só leitura); o bucket de fotos continua privado (FR-016); o bucket de cache não tem token S3 nem CORS | ✅ | ✅ |
| III.5 IA | Não se aplica | ✅ | ✅ |
| III.6 Ambientes | Bucket de cache, DO e número do WhatsApp separados por ambiente; local usa só o R2 simulado e o DO local | ✅ | ✅ |
| III.7 Zonas protegidas | `wrangler.jsonc`, `cloudflare/worker.ts`/`publico.ts`, `src/lib/db/catalogo.ts`, `.dev.vars.example`, `open-next.config.ts`, `next.config.ts` ⇒ tech-lead + revisão humana; `src/lib/r2/` só pelo barrel, sem mudança | ✅ | ✅ |
| IV. Arquitetura | Server Components por padrão; client só na lista (filtro, "Carregar mais", restauração) e no `error.tsx`; sem mutação nova; SQL só em `src/lib/db/`; regras de exibição em módulo puro (FR-022); preço em centavos, formatado só na apresentação | ✅ | ✅ |
| V. UX | Regras de 16 px e 48 px, linguagem simples e mobile-first aplicadas às telas públicas (Assumptions da spec) | ✅ | ✅ |
| VI. Qualidade | Testes antes da implementação por SF; `check` como gate; README com `WHATSAPP_NUMBER`, `SITE_URL`, bucket de cache e `axe-core` | ✅ | ✅ |
| VII. Free tier | ISR no R2 (10 M leituras e 1 M escritas/mês grátis), DO SQLite (Free), Workers Logs (Free: 3 dias); CPU = risco aceito da T139, medido no dev; varredura = risco aceito R3 (P8) | ✅ | ✅ |
| VIII. Ambientes | Local só com recursos locais; produção só pelo CI; buckets e secrets de produção configurados antes do merge (modelo T148) | ✅ | ✅ |

Sem violação; Complexity Tracking vazio.

## Project Structure

### Documentation (this feature)

```text
specs/005-catalogo-publico/
├── spec.md
├── plan.md              # este arquivo
├── research.md          # H1–H4, P1–P8, D1–D15, riscos, resultado do spike
├── data-model.md        # visões públicas, consultas, cursor, configuração, estados
├── quickstart.md        # configuração, spike, roteiros
├── contracts/
│   ├── publico.md       # worker, páginas, GET da lista, rota de fotos, módulos, logs
│   └── telas.md         # esqueleto das telas e acessibilidade
├── checklists/
└── tasks.md             # /speckit-tasks (SF0 a SF12)
```

### Source Code (repository root)

```text
cloudflare/
├── worker.ts                     # + prepararPedido/ajustarResposta, + export DOQueueHandler [protegido]
└── publico.ts                    # NOVO: regras puras do worker para rotas públicas [protegido]
open-next.config.ts               # r2IncrementalCache + doQueue
next.config.ts                    # expireTime: 35 [ISR]
wrangler.jsonc                    # NEXT_INC_CACHE_R2_BUCKET, NEXT_CACHE_DO_QUEUE + migrations, SITE_URL (3 ambientes) [protegido]
.dev.vars.example                 # + WHATSAPP_NUMBER [protegido]
src/app/
├── layout.tsx                    # lang pt-BR, metadata padrão "Roseshop"
├── robots.ts                     # NOVO: allow "/", sem Disallow
├── (public)/                     # NOVO
│   ├── layout.tsx                # robots noindex, metadataBase, Open Graph da loja
│   ├── page.tsx                  # ISR: destaques + filtro + 1º bloco
│   ├── error.tsx                 # "Não foi possível carregar agora" + "Tentar de novo"
│   ├── p/[codigo]/page.tsx       # ISR: detalhe + generateMetadata
│   ├── p/[codigo]/not-found.tsx  # "Produto não encontrado"
│   └── _catalogo/                # cartao-produto, lista-catalogo (client), filtro, galeria, botao-whatsapp, textos.ts
├── api/catalogo/produtos/route.ts  # NOVO: GET do bloco
└── fotos/[arquivo]/route.ts      # NOVO: foto pública
src/lib/
├── db/catalogo.ts                # NOVO: SQL público [protegido]
└── catalogo/                     # NOVO: exibicao, slug, cursor (puros); config, registro, leitura, index (server-only)
src/test/
├── conformance/catalogo-acesso.test.ts   # NOVO: sem auth, campos públicos, cursor, 404 idêntico, noindex
├── conformance/catalogo-orcamento.test.ts # NOVO: soma dos prazos ≤ 60 s (K1)
├── conformance/fotos-bucket-privado.test.ts # NOVO: CORS sem leitura, sem domínio público (K1)
└── db/catalogo-fixtures.ts       # NOVO
```

**Structure Decision**: mesma aplicação Next.js. O grupo `(public)` previsto no `CLAUDE.md` passa
a existir; o domínio novo fica em `src/lib/catalogo/`, como `produtos/` e `fotos/`. O `CLAUDE.md`
"Estrutura" é atualizado pelo `doc-sync-onboarding` ao fechar a feature.

## Decisões (resumo)

Detalhe e alternativas em [research.md §3](./research.md#3-decisões-técnicas).

| # | Decisão |
|---|---|
| D1 | ISR com `r2IncrementalCache` em bucket próprio por ambiente; sem tag cache |
| D2 | `revalidate` 15 s + `expireTime` 35 s + navegador 20 s = 55 s + render (A2); SF0 prova; fallback dinâmico aprovado |
| D3 | Fila em Durable Object (`DOQueueHandler`, SQLite) |
| D4 | O worker canoniza `/p/<n>` (308) e reescreve formatos inválidos para `/p/0` |
| D5 | O worker aplica `Cache-Control: public, max-age=20` e `X-Robots-Tag`; no 500 repete o pedido uma vez: versão anterior (`no-store`, só nessa resposta) se houver, senão 503 `no-store` + `Retry-After` (P9, A1); pedidos de revalidação da fila (`x-isr: 1`) passam sem mudança e só registram |
| D6 | `GET /fotos/[arquivo]`: banco a cada pedido (só `produto_fotos`), `public, max-age=60`, 404 idêntico, 503 em falha |
| D7 | Slug = `replace(chave,' ','-')` (injetivo, sem desempate); filtro no cliente via GET; página inicial sem `searchParams` |
| D8 | Ordem `criado_em DESC, id DESC`; cursor opaco `base64url(µs.id)`; bloco de 24; GET público `max-age=20`; sem índice novo |
| D9 | `noindex, nofollow` em meta e cabeçalho; `robots.txt` sem `Disallow` |
| D10 | `WHATSAPP_NUMBER` em secret, E.164, `wa.me` com `encodeURIComponent`; inválido ⇒ sem botão + log |
| D11 | `console.error` JSON com causa fechada; banco × inesperado marcados no `ctx` do pedido, com eventos distintos; Workers Logs (Free: 3 dias, 200 mil/dia) |
| D12 | `SITE_URL` por ambiente em `vars` para `metadataBase` e link da mensagem |
| D13 | Build sem banco: `NEXT_PHASE` de build devolve "indisponível"; regenerado pelo D2 |
| D14 | `axe-core` nos testes de componente; `<img loading>` sem otimizador; `lang="pt-BR"` |
| D15 | Voltar do detalhe: `sessionStorage` por filtro (itens, cursor, scroll), validade de 30 min (exceção do FR-020, A3); restauração antes do GET; URL só com o filtro; "Ver o catálogo" limpa |
| D16 | Token do CI ampliado com *Workers R2 Storage: Edit* (risco marginal); prova no spike com token de mesmo escopo; credenciais S3 por bucket descartadas (A4) |

## Subfeatures

Numeração única, igual à do [tasks.md](./tasks.md) (SF0 a SF12). Cada SF fecha com `npm run
check` verde (e `test:int` em série, quando houver) e um commit do humano.

| SF | Conteúdo | Dono |
|---|---|---|
| SF0 | Spike do `expire` (quickstart §2) no `preview` e num worker descartável `roseshop-spike` (bucket `roseshop-cache-spike`, apagados ao fim); registrar resultado e ramo; ADR-011 para aprovação (GATE). Só no ramo ISR, depois do GATE: buckets `roseshop-cache-dev`/`-prod`, token do CI ampliado com *Workers R2 Storage: Edit* e `docs/operacao.md` atualizado, e infra definitiva (`open-next.config.ts`, `next.config.ts`, `wrangler.jsonc` com DO e migration, reexportação no worker) | tech-lead + humano |
| SF1 | `src/lib/db/catalogo.ts` + integração (keyset, empates, remoção entre blocos, slug, `fotoPublica`) | tech-lead (testes: test-writer) |
| SF2 | `src/lib/catalogo/` puros: `exibicao`, `cursor`, `slug` | principal (testes: test-writer) |
| SF3 | `config`, `registro`, `leitura`, barrel e regra de lint; `SITE_URL` no `wrangler.jsonc`; `WHATSAPP_NUMBER` no `.dev.vars.example` | tech-lead (testes: test-writer) |
| SF4 | Rota pública de fotos + conformidade (incluindo bucket privado) | tech-lead (testes: test-writer) |
| SF5 | `GET /api/catalogo/produtos` + conformidade do JSON | principal (testes: test-writer) |
| SF6 | Worker (`publico.ts`, `worker.ts`), `robots.ts` e teste do orçamento de 60 s | tech-lead (testes: test-writer) |
| SF7 | Telas do detalhe, erro e 404; layouts; `axe-core` | ui-dev (testes: test-writer) |
| SF8 | Página inicial: destaques, filtro e 1º bloco | ui-dev (testes: test-writer) |
| SF9 | Lista cliente: "Carregar mais", filtro no cliente e retorno do detalhe | ui-dev (testes: test-writer) |
| SF10 | Roteiro no `preview` (quickstart §4) | júnior + humano |
| SF11 | Dev: WhatsApp, prévia, SC-002, CPU (quickstart §5) | humano + principal |
| SF12 | Produção configurada antes do merge, README, `docs/` (incluindo `docs/operacao.md` com R3), rastreabilidade, merge | humano + tech-lead + doc-sync |

## Cobertura

Critério da spec → onde é provado. U = unitário, I = integração (banco local), C = conformidade,
M = manual (quickstart).

| Critério | Prova |
|---|---|
| US1.1, FR-001 | C (páginas sem `@/lib/auth`; sem ações do painel no HTML) |
| US1.2, FR-006 | I (ordem por `criado_em`; editar não move) |
| US1.3/1.4, FR-009 | I (`destaque_vaga ASC`) + U (seção omitida) |
| US1.5, FR-007 | I (keyset com empate de `criado_em` e remoção entre blocos) + U (cursor) |
| US1.6, US2.6, FR-023 | U (rótulo em texto) |
| US1.7, FR-012 | U (`precoPublico`, milhar) |
| US1.8, FR-005 | U (estado vazio) |
| US1.9, FR-007 | U (restauração por `sessionStorage`; URL sem blocos; restauração antes do GET) + M §4.4–4.5 |
| US2.1, FR-014, FR-017 | U (componente do detalhe, alt) + I (`obterPublico` com fotos ordenadas) |
| US2.2/2.5, FR-013 | U (`prepararPedido`: 308 canônico) + M §4.7 |
| US2.3/2.4 | U (`prepararPedido` → `/p/0`; página → `notFound`) + M §4.8 |
| US2.7, FR-002 | C (chaves do JSON e do RSC payload sem campos internos nem e-mail) |
| US2.8, FR-024 | U (`ajustarResposta` com handler falso: 500 → repetição 200 = versão anterior; 500 → 500 = 503 `no-store`; `x-isr: 1` passa sem mudança e registra; evento por causa) + U (rota de fotos e GET → 503) + spike SF0 (P9) + M §4.11 |
| US3.1/3.2, FR-018 | U (`linkWhatsapp` com `&#?`, acento, emoji, ida e volta) + M §5.1 |
| US3.3 | U (esgotado ⇒ sem botão) |
| US3.4/3.5, FR-019 | U (`configCatalogo`: E.164, ausente ⇒ `null` + log) + M §4.14 |
| US4.1–4.6, FR-010/011 | I (`categoriasComProdutos`, slug) + U (fallback para "Todas") |
| US4.7 | U (axe-core; `aria-current` vindo do filtro efetivo na lista cliente, `aria-live`) |
| US5.1–5.3, FR-021 | U (`generateMetadata`; 404 sem Open Graph de produto) + M §5.2 |
| US5.4, US6.3, FR-015, FR-020, SC-005 | C (orçamento: `revalidate` + `expireTime` + `max-age` das páginas, `max-age` do GET e das fotos ≤ 60 s) + U (fotos sem `immutable`) + spike SF0 + M §4.15 (cronômetro) |
| US6.1–6.4, FR-015 | I (`fotoPublica` × envio pendente) + C (404 idêntico, mesmos cabeçalhos) |
| US6.5, FR-016 | C (CORS de `infra/r2/` sem `GET`/`HEAD`; `wrangler.jsonc` sem domínio público nem bucket de fotos fora de `PRODUCT_IMAGES`) + M |
| FR-003 | U (texto com `<b>` e `**` exibido literal) |
| FR-004, SC-009 | U (`ajustarResposta`) + C (metadata do layout) + M §4.13 |
| FR-008 | U (`loading` por posição) |
| FR-022, SC-007 | U (axe-core) + M §4.16 |
| SC-001 | M (observação; pendência de entrega) |
| SC-002 | M §5.3 |
| SC-008 | M §5.4 (CPU) + research R2/R3 |

## Complexity Tracking

Sem violações da constitution.
