# Implementation Plan: Catálogo público

**Branch**: `feature/005-catalogo-publico` | **Date**: 2026-10-15 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/005-catalogo-publico/spec.md`

**Status**: rascunho para revisão humana. Restrições H1–H4 do humano e decisões P1–P8 tomadas
nesta sessão ([research.md §1–2](./research.md#1-restrições-do-humano-entrada-do-plan-não-reabrir)).
A SF0 é um spike que decide entre ISR com `expire` e o fallback dinâmico já aprovado.

## Summary

Página inicial (`/`) e detalhe (`/p/0042`) públicos, sem login, com destaques, lista em blocos de
24 por "Carregar mais", filtro por categoria e botão "Perguntar no WhatsApp". As fotos saem por
uma rota pública que confere no banco, a cada pedido, se a chave pertence a um produto.

Abordagem técnica:

- **Cache.** Em `*.workers.dev` não há cache de borda, então as páginas públicas usam ISR do
  OpenNext: cache incremental num bucket R2 próprio por ambiente e fila de revalidação em
  Durable Object (SQLite, Free).
- **Prazo de 1 minuto (FR-020).** O `revalidate` fica em 20 s e o `expireTime` em 40 s: depois
  disso o pedido espera a página ser refeita. O navegador guarda por até 20 s. Pior caso:
  40 + 20 = 60 s. O spike SF0 prova que o `expire` funciona no OpenNext; se falhar, as páginas
  viram dinâmicas.
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
- Infra: 1 bucket e 1 DO novos por ambiente; 1 secret e 1 var novos.

Sem `NEEDS CLARIFICATION`. O R1 (`expire` num isolate novo) é tratado como prova da SF0 com
fallback aprovado.

## Constitution Check

*GATE: antes da Phase 0 e de novo após a Phase 1.*

| Princípio | Verificação | Pré | Pós-design |
|---|---|---|---|
| I. Fonte de verdade | Spec com Given/When/Then e 3 clarificações; cada critério mapeado a teste ([Cobertura](#cobertura)); correções da spec feitas antes do código: Notas para o plan (sem "cache de borda") e nota no FR-002 sobre o cursor; **ADR-011** (cache do catálogo em `workers.dev`: ISR + R2 + DO, orçamento de 60 s) escrito após a SF0 e aprovado pelo humano antes da SF1 | ✅ | ✅ |
| II. Stack fechada | Sem troca de stack: R2 e Workers já estão na tabela; ISR e DO são recursos do OpenNext/Workers (ADR-001); `axe-core` é só de dev (justificado no commit); Zod em query, cursor, slug, código e configuração | ✅ | ✅ |
| III.1 Segredos | `WHATSAPP_NUMBER` só em `wrangler secret`/`.dev.vars` (P5, repositório público); `SITE_URL` é pública (`vars`); logs sem número, chave, IP nem mensagem de exceção | ✅ | ✅ |
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
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
cloudflare/
├── worker.ts                     # + prepararPedido/ajustarResposta, + export DOQueueHandler [protegido]
└── publico.ts                    # NOVO: regras puras do worker para rotas públicas [protegido]
open-next.config.ts               # r2IncrementalCache + doQueue
next.config.ts                    # expireTime: 40
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
├── conformance/catalogo-acesso.test.ts   # NOVO: sem auth, campos públicos, 404 idêntico, noindex
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
| D2 | `revalidate` 20 s + `expireTime` 40 s + navegador 20 s = 60 s; SF0 prova; fallback dinâmico aprovado |
| D3 | Fila em Durable Object (`DOQueueHandler`, SQLite) |
| D4 | O worker canoniza `/p/<n>` (308) e reescreve formatos inválidos para `/p/0` |
| D5 | O worker aplica `Cache-Control: public, max-age=20` e `X-Robots-Tag`; no 500 repete o pedido uma vez: versão anterior (`no-store`) se houver, senão 503 `no-store` + `Retry-After` (P9) |
| D6 | `GET /fotos/[arquivo]`: banco a cada pedido (só `produto_fotos`), `public, max-age=60`, 404 idêntico, 503 em falha |
| D7 | Slug = `replace(chave,' ','-')` (injetivo, sem desempate); filtro no cliente via GET; página inicial sem `searchParams` |
| D8 | Ordem `criado_em DESC, id DESC`; cursor opaco `base64url(µs.id)`; bloco de 24; GET público `max-age=20`; sem índice novo |
| D9 | `noindex, nofollow` em meta e cabeçalho; `robots.txt` sem `Disallow` |
| D10 | `WHATSAPP_NUMBER` em secret, E.164, `wa.me` com `encodeURIComponent`; inválido ⇒ sem botão + log |
| D11 | `console.error` JSON com causa fechada; banco × inesperado marcados no `ctx` do pedido, com eventos distintos; Workers Logs (Free: 3 dias, 200 mil/dia) |
| D12 | `SITE_URL` por ambiente em `vars` para `metadataBase` e link da mensagem |
| D13 | Build sem banco: `NEXT_PHASE` de build devolve "indisponível"; regenerado pelo D2 |
| D14 | `axe-core` nos testes de componente; `<img loading>` sem otimizador; `lang="pt-BR"` |
| D15 | Voltar do detalhe: `sessionStorage` por filtro (itens, cursor, scroll), validade de 30 min |

## Subfeatures (ordem proposta para o `/speckit-tasks`)

| SF | Conteúdo | Dono |
|---|---|---|
| SF0 | Spike do `expire` (quickstart §2) + bucket de cache e DO no local/dev; registrar resultado; ADR-011 para aprovação | tech-lead + humano |
| SF1 | `src/lib/db/catalogo.ts` + integração (keyset, empates, remoção entre blocos, slug, `fotoPublica`) | tech-lead (testes: test-writer) |
| SF2 | `src/lib/catalogo/` puros (`exibicao`, `cursor`, `slug`) + `config`, `registro`, `leitura` | tech-lead / test-writer |
| SF3 | Rota de fotos pública + GET da lista + conformidade | tech-lead |
| SF4 | Worker (`publico.ts`), `open-next.config.ts`, `next.config.ts`, `wrangler.jsonc`, `robots.ts` | tech-lead |
| SF5 | Telas: página inicial, detalhe, erro, 404, lista cliente com filtro, "Carregar mais" e restauração; axe-core | ui-dev (testes: test-writer) |
| SF6 | Roteiro no `preview` (quickstart §4) | júnior + humano |
| SF7 | Dev: WhatsApp, prévia, SC-002, CPU (quickstart §5); produção configurada antes do merge; `docs/operacao.md` (R3) | humano + tech-lead |

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
| US1.9, FR-007 | U (restauração por `sessionStorage`) + M §4.4–4.5 |
| US2.1, FR-014, FR-017 | U (componente do detalhe, alt) + I (`obterPublico` com fotos ordenadas) |
| US2.2/2.5, FR-013 | U (`prepararPedido`: 308 canônico) + M §4.7 |
| US2.3/2.4 | U (`prepararPedido` → `/p/0`; página → `notFound`) + M §4.8 |
| US2.7, FR-002 | C (chaves do JSON e do RSC payload sem campos internos nem e-mail) |
| US2.8, FR-024 | U (`ajustarResposta` com handler falso: 500 → repetição 200 = versão anterior; 500 → 500 = 503 `no-store`; evento por causa) + U (rota de fotos e GET → 503) + spike SF0 (P9) + M §4.11 |
| US3.1/3.2, FR-018 | U (`linkWhatsapp` com `&#?`, acento, emoji, ida e volta) + M §5.1 |
| US3.3 | U (esgotado ⇒ sem botão) |
| US3.4/3.5, FR-019 | U (`configCatalogo`: E.164, ausente ⇒ `null` + log) + M §4.14 |
| US4.1–4.6, FR-010/011 | I (`categoriasComProdutos`, slug) + U (fallback para "Todas") |
| US4.7 | U (axe-core; `aria-current`, `aria-live`) |
| US5.1–5.3, FR-021 | U (`generateMetadata`; 404 sem Open Graph de produto) + M §5.2 |
| US5.4, US6.3, FR-015, FR-020, SC-005 | Spike SF0 + M §4.15 (cronômetro) |
| US6.1–6.4, FR-015 | I (`fotoPublica` × envio pendente) + C (404 idêntico, mesmos cabeçalhos) |
| US6.5, FR-016 | C (bucket sem domínio público; sem CORS de leitura) + M |
| FR-003 | U (texto com `<b>` e `**` exibido literal) |
| FR-004, SC-009 | U (`ajustarResposta`) + C (metadata do layout) + M §4.13 |
| FR-008 | U (`loading` por posição) |
| FR-022, SC-007 | U (axe-core) + M §4.16 |
| SC-001 | M (observação; pendência de entrega) |
| SC-002 | M §5.3 |
| SC-008 | M §5.4 (CPU) + research R2/R3 |

## Complexity Tracking

Sem violações da constitution.
