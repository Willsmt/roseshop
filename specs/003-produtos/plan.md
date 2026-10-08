# Implementation Plan: Produtos do painel

**Branch**: `feature/003-produtos` | **Date**: 2026-10-07 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/003-produtos/spec.md`

**Status**: decisões D1–D10, E1 e E2 tomadas pelo humano em 2026-10-07 (ver
"Decisões" no fim e [research.md §3](./research.md#3-decisões-tomadas-humano-2026-10-07)).
Emenda ao [ADR-008](../adr/008-integridade-de-dados-neon-http.md) aprovada em 2026-10-07 (D1, D4, D9).

## Summary

CRUD de produtos no painel das administradoras: cadastro (nome, categoria, descrição,
preço com "a partir de"), código de referência sequencial, lista paginada com filtros
e busca por código/nome, detalhe com troca de status e destaque, edição e remoção
definitiva — tudo com concorrência otimista estrita. A tabela `produtos` torna real o
bloqueio de remoção de categoria com produtos (FK `ON DELETE RESTRICT`, SQLSTATE
`23001`, contrato §5 da 002). Fotos entram só no modelo (`produto_fotos`, até 3).

Abordagem técnica: com `neon-http` sem transação interativa (ADR-008), cada garantia de
concorrência vai para o banco ou para um único statement/batch: `UNIQUE` sobre a chave
de equivalência gerada por `categoria_chave(nome)` (mesma regra da 002), identity para o
código, FK para a categoria, `CHECK` para esgotado × destaque, `UPDATE ... WHERE id AND
versao` para a otimista e vagas numeradas 1–8 com índice único parcial para o teto de 8
destaques. Nenhum lock advisory novo. Lista com keyset por código decrescente e cursor
na URL.

## Technical Context

**Language/Version**: TypeScript strict, Node 24 (dev/CI), runtime workerd (Cloudflare Workers via OpenNext)

**Primary Dependencies**: Next.js 16 (App Router, Server Actions), Drizzle ORM 0.45 + `drizzle-orm/neon-http`, `@neondatabase/serverless`, Zod 4, Auth.js v5 (guards da 001), Tailwind v4. **Nenhuma dependência nova.**

**Storage**: Postgres 18 — Docker + proxy HTTP do Neon (local), Neon `dev`, Neon `production`. Migration nova `0001` (tabelas `produtos`, `produto_fotos`).

**Testing**: Vitest — unitários `*.test.ts` (domínio, actions com mocks, componentes com Testing Library/jsdom, conformidade AST); integração `*.int.test.ts` em série no banco local; probe no Neon dev via `vitest.probe.config.mts` no CI do PR.

**Target Platform**: Cloudflare Workers (free tier); painel mobile-first.

**Project Type**: aplicação web única (Next.js), sem backend separado.

**Performance Goals**: SC-007 — lista/página/filtro/busca < 2 s com 500 produtos em rede móvel, excluída a partida a frio do Neon.

**Constraints**: sem `db.transaction()`; toda garantia de concorrência atômica (constraint, índice, identity ou statement/batch único), nunca "lê e depois grava"; sem extensões do Postgres; free tier; preço em centavos inteiros; UTC no banco.

**Scale/Scope**: 3 administradoras, ~500 produtos, 5 telas novas no painel, 7 Server Actions, 2 tabelas, 6 primitivos de formulário.

Sem `NEEDS CLARIFICATION`.

## Constitution Check

*GATE: antes da Phase 0 e de novo após a Phase 1.*

| Princípio | Verificação | Pré | Pós-design |
|---|---|---|---|
| I. Fonte de verdade | Spec com Given/When/Then e clarificações; cada critério mapeado a teste (tabela "Cobertura"). Spec **Approved**. Sem ADR novo; emenda ao ADR-008 (D1, D4, D9) aprovada em 2026-10-07 | ✅ | ✅ |
| II. Stack fechada | Nenhuma dependência nova; Zod em toda fronteira; Drizzle/Neon conforme ADR-002 | ✅ | ✅ |
| III. Segurança | `requireAdminAction` em toda action e guard do layout `(protegido)` em toda tela (FR-001, `painel-guard` nega por padrão); Zod em form, query string e campos ocultos; descrição exibida como texto puro; nenhum segredo novo; zona protegida tocada: **`src/lib/db/`** (schema, migration, `categorias.ts`, `produtos.ts`) ⇒ diff revisado pelo tech-lead antes de cada commit (E1) + revisão humana; `wrangler.jsonc`/`.dev.vars*` intocados | ✅ | ✅ |
| IV. Arquitetura | Server Components por padrão, forms client só onde há interação; mutações só por Server Actions; SQL só em `src/lib/db/produtos.ts`; **preço em centavos `integer`**; `timestamptz` UTC, formatação pt-BR na apresentação | ✅ | ✅ |
| V. UX | Uma tarefa por tela (lista, novo, detalhe, editar, remover); alvos ≥ 48 px e texto ≥ 16 px; mensagens sem jargão (§6 do contrato, SC-008); remoção com confirmação nomeando código e nome; mobile-first; preservação do digitado | ✅ | ✅ |
| VI. Qualidade e entrega | "Pronto" = `npm run check` + `test:int` com output real; um commit Conventional Commits por sub-fase, **sem `Co-Authored-By`**; README atualizado no fechamento | ✅ | ✅ |
| VII. Plataforma | Nada pesado no Worker; consultas simples sobre ~500 linhas; sem recurso pago | ✅ | ✅ |
| VIII. Ambientes | Migration `0001` local → dev (CI do PR) → produção (merge); teste no Neon dev sem resíduo (D9: batch revertido pelo próprio `23001`); carga só local | ✅ | ✅ |

**Resultado**: PASS. Sem violações; *Complexity Tracking* vazio. Notas: emenda ao ADR-008
(D1, D4, D9) aprovada em 2026-10-07; E1 diverge do CLAUDE.md
("tech-lead dono exclusivo das zonas protegidas") por decisão do humano, só nesta feature.

## Project Structure

### Documentation (this feature)

```text
specs/003-produtos/
├── spec.md
├── plan.md              # este arquivo
├── research.md          # fatos, decisões fixadas, D1–D10, E1–E2
├── data-model.md        # produtos, produto_fotos, invariantes, transições
├── quickstart.md        # roteiro de validação
├── contracts/
│   └── produtos.md      # camadas, SQL, actions, leitura, rotas, mensagens
├── checklists/
└── tasks.md             # /speckit-tasks (não criado aqui)
```

### Source Code (repository root)

```text
src/lib/db/
├── schema.ts                         # + produtos, produtoFotos            [protegido]
├── migrations/0001_*.sql             # gerada pelo drizzle-kit             [protegido]
├── categorias.ts                     # contarProdutosDaCategoria → schema  [protegido]
├── produtos.ts                       # SQL de produtos (contrato §2)       [protegido]
└── produtos.*.int.test.ts            # schema/FK, escrita, concorrência, leitura
src/lib/categorias/index.ts           # barrel passa a exportar normalizarNome (D5)
src/lib/produtos/
├── validacao.ts  preco.ts  codigo.ts # domínio (+ *.test.ts)
├── erros.ts  mensagens.ts            # resultado db → Falha/mensagem
├── painel.ts                         # leitura do painel (server-only)
└── actions.ts                        # Server Actions ("use server")
src/app/painel/(protegido)/produtos/
├── page.tsx                          # lista
├── novo/page.tsx  form-produto.tsx
└── [id]/page.tsx  [id]/editar/page.tsx  [id]/remover/page.tsx
src/components/ui/                    # + campo-texto, area-texto, selecao, caixa-marcacao,
                                      #   mensagem-campo, aviso (E2; contrato §5)
src/test/conformance/produtos-acesso.test.ts
src/test/conformance/categorias-acesso.test.ts  # allowlist + normalizarNome
src/test/db/categorias-fixtures.ts    # sem fixture de produtos
src/test/db/produtos-fixtures.ts      # fixtures reais de produtos
vitest.probe.config.mts               # + teste da FK no Neon dev (D9)
```

**Structure Decision**: aplicação Next.js única; domínio em `src/lib/produtos/` espelhando
`src/lib/categorias/`, SQL em `src/lib/db/produtos.ts`, telas no grupo `(protegido)`.

## Sub-fases

Cada sub-fase fecha com testes passando (output real) e **um commit próprio**. Testes
antes da implementação (Red → Green). Execução (E1): toda implementação em **sonnet**
(sessão principal, `test-writer` para testes, `ui-dev` para telas); o **tech-lead
(opus) só revisa** o diff de tudo que toca `src/lib/db/` antes do commit da sub-fase.

| SF | Escopo | Testes que fecham | Commit | Dono |
|---|---|---|---|---|
| **SF1** | **Primeira task**: troca do SQL cru de `contarProdutosDaCategoria` pela referência ao schema e remoção de `criarFixtureProdutos`/`descartarFixtureProdutos` de `src/test/db/` — o que exige, no mesmo passo, declarar `produtos` (FK `onDelete: "restrict"`, vaga com índice único parcial) e `produto_fotos` no `schema.ts` e gerar a migration `0001`. `resetCategorias` limpa `produtos` antes. Teste da fixture da 002 passa a usar a tabela real. | int: FK ⇒ `23001`; `remover` ⇒ `tem_produtos` com N; US7-AC2/AC3; checks, `UNIQUE(chave)`, vaga 1–8 única, esgotado × vaga, identity recusa `UPDATE`, fotos 1–3 únicas; `drizzle-kit generate` = "No schema changes"; testes da 002 verdes | `feat(db): cria tabela produtos com FK restrict para categorias` | sonnet (sessão principal; testes: `test-writer`) · revisão tech-lead |
| **SF2** | Teste da FK `23001` no Neon dev via CI (D9: batch revertido); include literal no `vitest.probe.config.mts` | probe local verde; no PR, log do CI com o teste passando e Neon dev sem resíduo | `test(db): prova a FK restrict de produtos no Neon dev` | sonnet (`test-writer`) · revisão tech-lead |
| **SF3** | Domínio: `normalizarNome` exportado pelo barrel (D5) + allowlist da conformidade + §1 do contrato da 002; `validacao.ts` (nome, descrição, categoria obrigatória, "a partir de", `idProduto`/`versaoProduto`), `preco.ts` (D8 + formato R$), `codigo.ts` (`#0042`, busca por código), `mensagens.ts`, `erros.ts` | unitários de cada regra (FR-003/006/009/010, D10, edge cases); `categorias-acesso` e testes da 002 verdes | `feat(produtos): valida campos, preço e código de referência` | sonnet (`test-writer` → sessão principal) |
| **SF4** | SQL de escrita: `inserir`, `editar`, `remover` (otimista, `nome_repetido` com código, `categoria_ausente`) | int: US1-AC1/4/7/8, US4-AC1–5, US6-AC3–6, concorrência de nome e de código | `feat(db): grava, edita e remove produtos com concorrência otimista` | sonnet (`test-writer` → sessão principal) · revisão tech-lead |
| **SF5** | SQL de status e destaque: `esgotar` (vaga = NULL, `saiuDoDestaque`), `disponibilizar`, `destacar` (menor vaga livre, `vaga_disputada` em `23505`, sem retry), `tirarDoDestaque` | int: US2-AC1–3/5/6, US5-AC1–6 (7 destaques + 2 simultâneos ⇒ 1 aceito, 1 `vaga_disputada`, total 8) | `feat(db): troca status e destaque de produtos com teto de 8` | sonnet (`test-writer` → sessão principal) · revisão tech-lead |
| **SF6** | Leitura: `obterPorId`, `listar` (filtros, busca, `ORDER BY id DESC`, keyset `antes`) em `db/produtos.ts`; `painel.ts` com schema Zod único `filtroLista` para URL e `voltar` | int: US3-AC1–6 (página sem repetir/pular com cadastro e remoção no meio); unitários do `filtroLista` (inválido ignorado, `voltar` sem redirecionamento aberto); medição com 500 produtos local | `feat(produtos): lista, filtra e busca produtos no painel` | sonnet (`test-writer` → sessão principal) · revisão tech-lead |
| **SF7** | Server Actions (`actions.ts`) + conformidade `produtos-acesso` | unitários das 7 actions (guard primeiro, Zod antes do SQL, tradução de cada resultado, US2-AC4, sessão expirada); conformidade nega imports fora das fronteiras | `feat(produtos): server actions do painel de produtos` | sonnet (`test-writer` → sessão principal) |
| **SF8a** | Primitivos de formulário em `src/components/ui/` (E2, contrato §5) | componentes: rótulo ligado, erro com `aria-*`, valor preservado, alvos/texto mínimos | `feat(ui): primitivos de formulário` | sonnet (`test-writer` → `ui-dev`) |
| **SF8b** | Telas: as 5 rotas, marcador "sem foto", "Ver mais"/"Voltar ao começo"/"Voltar à lista", entrada do painel apontando para produtos | componentes: preservação do digitado, mensagens junto do campo, link do código repetido, "Destacar" oculto para esgotado, aviso `vaga_disputada`, confirmação de remoção, vazio/nada encontrado, "Produto não encontrado"; `painel-guard` verde | `feat(painel): telas de produtos` | sonnet (`test-writer` → `ui-dev`) |
| **SF9** | Fechamento: `preview` com o roteiro do quickstart, revisão das mensagens (SC-008), observação SC-001–003 no dev, README | output real do `check`, `test:int`, `preview`; registro da observação | `docs(readme): ...` + sync do `doc-sync-onboarding` em commit `docs(...)` próprio | sonnet (redator, doc-sync) |

### Cobertura dos critérios de aceite

| História | Sub-fase(s) |
|---|---|
| US1 (cadastrar) | SF3 (AC2, AC3, AC5, AC6), SF4 (AC1, AC4, AC7, AC8), SF7, SF8b |
| US2 (status) | SF5 (AC1–3, AC5, AC6), SF7 (AC4), SF8b |
| US3 (lista) | SF6 (AC1–6), SF8b (AC6, AC7) |
| US4 (editar) | SF4 (AC1–5), SF6/SF8b (AC6) |
| US5 (destaque) | SF5 (AC1–6), SF8b (AC5 oculto) |
| US6 (remover) | SF4 (AC3–6), SF8b (AC1–3) |
| US7 (categoria com produtos) | SF1 (AC1–3), SF2 (Neon dev) |
| SC-005 (concorrência, 0 ocorrências) | SF1, SF4, SF5 |
| SC-007 (desempenho) | SF6, SF9 |
| SC-001–003, SC-008 | SF9 |

## Complexity Tracking

Sem violações da constitution a justificar.

## Decisões

Tomadas pelo humano em 2026-10-07. Detalhes e alternativas descartadas em
[research.md §3](./research.md#3-decisões-tomadas-humano-2026-10-07).

| # | Decisão | Escolha | ADR |
|---|---|---|---|
| D1 | Teto de 8 destaques | C — `destaque_vaga` 1–8 com índice único parcial; `CHECK` esgotado ⇒ sem vaga; menor vaga livre num único `UPDATE`; colisão ⇒ `vaga_disputada` ("tente de novo"), sem retry; sem lock advisory | emenda ao ADR-008 (aprovada) |
| D2 | Id interno × código | A — uma coluna identity | — |
| D3 | Paginação | B — keyset por código decrescente, "Ver mais"; **cursor na URL** (`?antes=`), página substitui, `voltar` revalidado no detalhe | — |
| D4 | Chave do nome | A — coluna gerada `UNIQUE` com `categoria_chave` | emenda ao ADR-008 (aprovada) |
| D5 | Normalização em TS | B — `normalizarNome` exportado pelo barrel `@/lib/categorias`; nada movido | — (contrato §1 da 002 atualizado na SF3) |
| D6 | Status | A — `esgotado boolean` | — |
| D7 | Fotos ao remover | A — `ON DELETE CASCADE` (R2 é da 004) | — |
| D8 | Entrada do preço | C — "12", "12,90", "12.90", "1.290,00"; "1.290" recusado como ambíguo | — |
| D9 | FK no Neon dev | A — batch revertido pelo próprio `23001` | emenda ao ADR-008 (aprovada) |
| D10 | Regras menores | confirmadas em bloco | — |
| E1 | Execução | implementação em sonnet; tech-lead (opus) só revisa diffs de `src/lib/db/` | — |
| E2 | Primitivos de formulário | criados em `src/components/ui/`; ADR-005 reestiliza depois | — |
