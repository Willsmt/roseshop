# Implementation Plan: Categorias do catálogo

**Branch**: `feature/002-categorias` | **Date**: 2026-10-04 | **Spec**: [spec.md](./spec.md)

**Input**: `specs/002-categorias/spec.md` (clarify concluído), constitution v1.0.0,
CLAUDE.md, ADR-002 (banco/driver), ADR-003 (auth), ADR-006 (ambientes/entrega),
`docs/architecture.md` e `docs/operacao.md`.

> **Status do plano: COMPLETO. D1–D5 decididas pelo humano em 2026-10-04.**
> Opções descartadas e trade-offs ficam em [research.md](./research.md) como
> histórico. D2 e D3 estão rascunhadas no
> [ADR-008](../adr/008-integridade-de-dados-neon-http.md) (status: proposto;
> **a implementação só começa com o ADR aceito**). Sem `tasks.md`, sem código, sem migration.

## Summary

Entregar uma lista única de categorias (id estável, nome, chave normalizada, versão),
com tela de painel para listar/criar/renomear/remover e um ponto de leitura único
(`src/lib/categorias`) para a 003 e a IA. Garantias de integridade: unicidade por
equivalência e bloqueio com produtos **no banco** (função + coluna gerada + `UNIQUE`,
FK); mínimo de 1 categoria e concorrência via `db.batch` com lock advisory e versão.
Tudo funciona com o driver atual
(`@neondatabase/serverless` HTTP via `drizzle-orm/neon-http`), que **não tem
transação interativa** (`db.transaction()` lança erro; só `db.batch()` = uma
transação de statements pré-montados). Sem dependência nova de runtime.

## Technical Context

**Language/Version**: TypeScript strict, Node 24 (local/CI), runtime workerd em dev/prod

**Primary Dependencies**: Next.js 16 (Server Components + Server Actions), Drizzle ORM
0.45.3, `@neondatabase/serverless` 1.2.0, Zod 4. **Nenhuma dependência nova.**

**Storage**: Postgres 18 (Docker local / Neon `dev` / Neon `production`). Tabela nova
`categorias` + função SQL `categoria_chave` (ver [data-model.md](./data-model.md)).
Migrations via `drizzle-kit` (primeira do projeto; SQL escrito à mão).

**Testing**: Vitest. Unitários (`*.test.ts`): Zod do nome, mapeamento de erros,
mensagens. Integração (`*.int.test.ts`, exige `db:up` + `db:migrate`, sem paralelismo
entre arquivos): equivalência via `categoria_chave`, concorrência (criar/renomear/remover),
mínimo de 1, ordenação, seed, fixture temporária de `produtos`. Conformidade: `painel-guard.test.ts` cobre a rota/actions novas.

**Target Platform**: Cloudflare Workers (OpenNext); validar no `npm run preview`.

**Project Type**: web (Next.js App Router, projeto único).

**Performance Goals**: lista de dezenas de itens; 1 query de leitura por render; sem paginação.

**Constraints**: free tier (sem extensão paga, sem CPU extra); driver HTTP único
(ADR-002); acesso a banco só em `src/lib/db/` (constitution IV); UI ≥16px/≥48px.

**Scale/Scope**: ≤ dezenas de categorias; 3 administradoras; 1 tela com 3 ações.

## Reaproveitamento da sessão de admin (feature 001)

Apenas localizado, sem leitura além do necessário. Reuso, sem alterar a 001:

- Páginas: `requireAdminPage(currentPath)` — `src/lib/auth/guard.ts:28`
- Server Actions: `requireAdminAction()` — `src/lib/auth/guard.ts:36` (lança `UnauthorizedError`)
- Import pelo barrel `@/lib/auth` (`src/lib/auth/index.ts`), nunca direto de `next-auth`.
- A rota nova fica em `src/app/painel/(protegido)/categorias/`, sob o layout protegido
  existente; o teste `src/test/conformance/painel-guard.test.ts` (nega por padrão)
  passa a cobrir as funções exportadas novas, sem exceção pública.

## Respostas às seis perguntas

Legenda: **[DETERMINADO]** = decorre da spec/constitution/ADRs ou de decisão do
humano (Dn); opções descartadas em `research.md`.

### 1. Seed da lista inicial, uma vez por ambiente (FR-002, FR-003) — **[DETERMINADO: D1-A + D5-A]**

**Decisão**: o `INSERT` das 5 categorias fica **na mesma migration** que cria a
tabela. O journal do `drizzle-kit` (`__drizzle_migrations`) marca a migration como
aplicada; `db:migrate` não a reexecuta, então categorias removidas/renomeadas nunca
voltam e nada é sobrescrito (FR-003). Criação da tabela e seed são atômicos.

| Ambiente | Quando o seed roda |
|----------|--------------------|
| Local | `npm run db:migrate` (e de novo após `db:reset`, que recria a lista de propósito) |
| Dev online | passo `Migrations (Neon dev)` de `pull-request.yml`, antes do deploy |
| Produção | passo `Migrations (Neon production)` de `main.yml`, antes do deploy |
| Banco de teste (local e CI) | `npm run db:migrate` **antes** do `test:int` (D5-A): novo passo em `.github/workflows/checks.yml` (job `integration`) e documentação do fluxo local |

Os workflows condicionam `db:migrate` à existência de
`src/lib/db/migrations/meta/_journal.json`; esta feature cria o journal, então será
a **primeira migration real** do projeto em dev e produção (validar no Neon `dev`
antes, ADR-006). O ADR-006 diz "produção só com dados reais": as 5 categorias são
dados reais da loja, sem conflito.

Regras para os testes de integração (D5-A):
- Não assumem tabela vazia. Helper de reset: `TRUNCATE categorias RESTART IDENTITY`
  seguido do seed, onde o teste precisa de estado conhecido. A fixture temporária
  `produtos` (D4) é descartada antes do `TRUNCATE` (a FK o bloquearia).
- Teste de seed em banco limpo: `TRUNCATE`, reexecuta o bloco de seed da própria
  migration (lido do arquivo, sem cópia) e confere as 5 linhas. Outro teste confere
  que `db:migrate` repetido não duplica nem recria categoria removida.
- Arquivos `*.int.test.ts` que tocam `categorias` não podem rodar em paralelo (o
  `TRUNCATE` de um quebraria o outro): `vitest.int.config.mts` precisa de
  `fileParallelism: false` (ou equivalente). Registrar nas tasks.

### 2. Equivalência de nomes (FR-005) — **[DETERMINADO: D2-B]**

**Decisão**: a chave é calculada **pelo banco**. Uma função SQL `categoria_chave(text)`
(`IMMUTABLE`, `STRICT`, `PARALLEL SAFE`, só built-ins: `lower`, `normalize(NFD)`,
`regexp_replace` removendo `U+0300–U+036F`, `replace` hífen→espaço, colapso de `\s+`,
`btrim`) é usada pela **coluna gerada**
`categorias.chave GENERATED ALWAYS AS (categoria_chave(nome)) STORED` com
`UNIQUE(chave)`. A mesma função serve ao lookup após `23505`:
`SELECT nome FROM categorias WHERE chave = categoria_chave($1)`; a mensagem "Já existe
uma categoria chamada X." não depende de uma segunda implementação em TS.

Unicidade garantida pelo banco, não pela aplicação: nenhum writer (app, SQL manual,
seed) informa a chave, logo nenhum pode errá-la ou contorná-la. `unaccent` não é usado
(não é IMMUTABLE e exigiria extensão). Verificado no Postgres 18 local, em transação
revertida: função + coluna gerada + `UNIQUE` aceitaram "Guarda-chuvas" e o lookup com
`categoria_chave('GUÁRDA  chuvas')` encontrou a linha (`guarda chuvas`).

Pontos de atenção (também no ADR-008 e nas tasks):
- Mudar a regra de normalização exige migration que **recria a coluna gerada e o
  índice** (alterar o corpo da função não recalcula valores gravados).
- O `drizzle-kit` não modela a função: migration SQL escrita à mão
  (`drizzle-kit generate --custom`); coluna declarada no schema com
  `generatedAlwaysAs(sql\`categoria_chave(nome)\`)`; conferir que o diff do
  `drizzle-kit` não proponha recriá-la.
- Caracteres que o NFD não decompõe (`ß`, `æ`, `ø`, `ł`) ficam distintos; aceito.
- Exige banco em UTF8 (local e Neon são).

### 3. Ordenação alfabética sem caixa e sem acento (FR-012) — **[DETERMINADO]**

`ORDER BY chave COLLATE "C", id` na **única** query de listagem
(`listarCategorias`). Como `chave` já é minúscula, sem acento e com espaços
normalizados, a ordem não depende de locale/collation do servidor (musl local vs
glibc Neon) nem de `Intl` no Worker. Todo consumidor passa por essa query (item 6),
então a ordem é uma só. Nuance aceita: hífen conta como espaço na ordenação
("Guarda-chuvas" ordena como "guarda chuvas"). `chave` é a coluna gerada de D2-B.

### 4. Atomicidade de FR-011, FR-019 e FR-020 sob concorrência

Restrição do driver: `neon-http` executa **cada statement isolado** ou um
`db.batch([...])` como **uma transação** de statements pré-montados (sem ler o
resultado de um para decidir o próximo). Não há `BEGIN … SELECT … COMMIT`
interativo. Nível de isolamento: READ COMMITTED (padrão).

| Regra | Mecanismo | Estado |
|-------|-----------|--------|
| FR-005 criar | `INSERT (nome)`; `chave` é gerada pelo banco; violação do `UNIQUE(chave)` (`23505`) vira mensagem de duplicado, com lookup via `categoria_chave`; corrida de dois criadores: um vence, o outro recebe `23505` | **[DETERMINADO]** (D2-B) |
| FR-005/006 renomear | `UPDATE … SET nome, chave` — índice único exclui a própria linha (aceita só trocar caixa/acento) | **[DETERMINADO]** |
| FR-019 mesma categoria | Concorrência otimista: coluna `versao`; `UPDATE/DELETE … WHERE id = $1 AND versao = $2 … RETURNING`; 0 linhas ⇒ "alterada por outra pessoa / não existe mais". O formulário carrega a `versao` lida com a lista. Cobre também rename×delete (linha travada, reavaliação do `WHERE`) | **[DETERMINADO]** |
| FR-011 produtos | FK `produtos.categoria_id → categorias.id ON DELETE RESTRICT` (criada pela 003); o banco recusa o `DELETE` (`23503`), inclusive contra insert concorrente de produto (lock `FOR KEY SHARE`). A contagem da mensagem é lida após a recusa | **[DETERMINADO]** (mecanismo; contrato com a 003 em D4-A) |
| FR-020 mínimo 1, inclusive remoções simultâneas | Um `DELETE … WHERE (select count(*)) > 1` isolado **não basta**: dois deletes concorrentes enxergam o mesmo snapshot (2 linhas) e ambos passam. **Decisão D3-B**: `db.batch([ SELECT pg_advisory_xact_lock(k), DELETE … WHERE id = $1 AND versao = $2 AND (SELECT count(*) FROM categorias) > 1 RETURNING id ])`. Batch = uma transação READ COMMITTED; o lock serializa e o 2º statement toma snapshot novo depois do lock. 0 linhas ⇒ leitura posterior só para escolher a mensagem (`nao_existe` / `alterada` / `ultima`) | **[DETERMINADO]** (D3-B; ADR-008) |

Consequência de D3-B (aceita, registrada no ADR-008): FR-020 vale para quem usar a
função de remoção; a única porta de escrita é a action (FR-015, teste de conformidade);
não há trigger. O lock é de transação (`xact`), compatível com o pooler do Neon.

### 5. Bloqueio "N produtos" sem tabela de produtos (FR-011) — **[DETERMINADO: D4-A]**

A 002 **não** cria `produtos`. A garantia em banco é a FK da 003 (`ON DELETE
RESTRICT`). A 002 entrega o fluxo de remoção que traduz `23503` em mensagem com
contagem, atrás de `contarProdutosDaCategoria` (assinatura fixa; retorna 0 até a 003
implementá-la). O mecanismo é provado por **teste de integração** que cria uma tabela
`produtos` temporária (SQL cru, `categoria_id integer NOT NULL REFERENCES
categorias(id) ON DELETE RESTRICT`), insere produtos e confere bloqueio + contagem; a
tabela é removida no teardown.

**Contrato com a 003**: referenciar por `categorias.id`, `NOT NULL`, `ON DELETE
RESTRICT`; validar com `exigirCategoriaValida(id)`. **A primeira task da 003
substitui o SQL cru da fixture pela referência ao schema Drizzle de `produtos` e
remove a fixture** (e implementa `contarProdutosDaCategoria`). Ver
`contracts/categorias.md`.

### 6. Ponto de acesso único (FR-014, FR-015) — **[DETERMINADO]**

- Consultas e escritas SQL: `src/lib/db/categorias.ts` (constitution IV; zona protegida).
- Módulo de domínio `src/lib/categorias/` com barrel `index.ts` **somente leitura**:
  `listarCategorias()`, `obterCategoria(id)`, `categoriaExiste(id)` /
  `exigirCategoriaValida(id)` (rejeita id fora da lista — SC-006). 003 e IA importam
  **só** do barrel.
- Escrita (`criar`, `renomear`, `remover`) **não** é exportada pelo barrel: vive em
  `src/lib/categorias/actions.ts` ("use server"), cada action começando por
  `requireAdminAction()`, e as funções SQL de escrita recebem um `AdminSession`.
- FR-015 imposto por teste de conformidade (novo, no estilo do `painel-guard`): nenhum
  arquivo fora de `src/lib/categorias/` e `src/lib/db/` importa as funções de escrita
  nem o schema de `categorias`; `src/lib/ai/` só importa o barrel. Regra
  `no-restricted-imports` no ESLint como segunda camada.
- Referência por `id` (inteiro, identity), nunca pelo nome (FR-009, US5-4).

## Constitution Check

*Refeito após as decisões D1–D5 (2026-10-04). Sem violações; ressalvas abaixo.*

| Princípio | Resultado |
|-----------|-----------|
| I. Fonte de verdade / ADR | OK **condicionado**: D2 e D3 mudam a forma de garantir integridade com o driver atual e estão no **ADR-008 (proposto)**; a implementação não começa antes da aprovação humana. D1/D4/D5 não trocam stack, lib nem provedor |
| II. Stack fechada | OK. Drizzle + `@neondatabase/serverless` HTTP mantidos; **sem dependência nova, sem extensão, sem WebSocket** (D2-C e D3-C descartadas). Função SQL própria vive em migration |
| III. Segurança | OK. Zod em toda fronteira (nome, id, versão); `requireAdminAction`/`requireAdminPage` em toda action/página; conformidade FR-015; nenhum segredo novo; mensagens sem vazar erro do banco. Zona protegida `src/lib/db/` (schema, migrations) ⇒ só tech-lead + revisão humana |
| IV. Arquitetura | OK. Server Components por padrão; mutações por Server Action; SQL só em `src/lib/db/`; regra de negócio fora do client; timestamps UTC. Ressalva consciente: a regra de normalização passa a viver **no banco** (D2-B); a aplicação não a reimplementa |
| V. UX | OK. ≥16px, ≥48px, uma tarefa por tela, confirmação de remoção, pt-BR sem jargão (`contracts/categorias.md`) |
| VI. Qualidade | OK. Testes antes da implementação; "pronto" = lint+typecheck+testes (+ `test:int` com migrations aplicadas). Commits sem trailer de co-autoria (a constitution prevalece sobre a instrução de atribuição do harness). `checks.yml` e docs alterados ⇒ doc-sync no fechamento |
| VII. Free tier | OK. Tabela pequena, funções built-in, sem extensão nem conexão persistente |
| VIII. Ambientes | OK. Migration local → dev → produção pelo fluxo do ADR-006; seed vem na migration; `test:int` roda contra Postgres local/CI, nunca dev/prod. Atenção: **primeira migration real** do projeto |

Pontos de atenção residuais (não são violações):
1. FR-020 (D3-B) é garantido pela aplicação, não pelo banco: um delete fora da função
   de remoção o contornaria. Mitigação: conformidade FR-015 e ADR-008.
2. Lock advisory e `db.batch` precisam ser validados contra o proxy local **e** o
   Neon `dev` (concorrência real) antes de produção.
3. `fileParallelism: false` no vitest de integração deixa os testes mais lentos.

**Complexity Tracking**: sem violações a justificar.

## Project Structure

### Documentation (this feature)

```text
specs/002-categorias/
├── spec.md
├── plan.md              # este arquivo
├── research.md          # decisões D1–D5 tomadas + opções descartadas (histórico)
├── data-model.md        # entidade Categoria, função categoria_chave, constraints, estados
├── quickstart.md        # roteiro de validação ponta a ponta
├── contracts/
│   └── categorias.md    # leitura (consumidores), actions, mensagens, contrato com a 003
└── tasks.md             # NÃO gerado (/speckit-tasks, após D1–D5 decididas)
```

### Source Code (previsão; nada criado agora)

```text
src/lib/db/
├── schema.ts                  # + tabela categorias            [protegido, tech-lead]
├── categorias.ts              # queries/escritas SQL            [protegido, tech-lead]
└── migrations/                # 1ª migration, SQL à mão: categoria_chave, tabela, coluna gerada, UNIQUE, seed (D1-A)
src/lib/categorias/            # novo módulo (⇒ doc-sync)
├── index.ts                   # barrel SOMENTE LEITURA (consumidores 003/IA)
├── nome.ts                    # Zod do nome: trim, espaços, NFC, 2–40, charset (a chave é do banco)
├── mensagens.ts               # textos pt-BR
├── erros.ts                   # mapeia 23505/23503/0 linhas → motivo
└── actions.ts                 # "use server": criar/renomear/remover
src/app/painel/(protegido)/categorias/   # página + formulários   [ui-dev]
src/test/conformance/          # + teste "só lê categorias fora do módulo" (FR-015)
```

**Structure Decision**: projeto único Next.js; leitura/escrita separadas por barrel;
SQL confinado a `src/lib/db/`.

## Pós-plano

Doc-sync (`doc-sync-onboarding`) no fechamento: schema/migration alterados, rota
nova, módulo novo em `src/`, mudança em CI (`checks.yml`, D5-A) e ADR-008 aceito.
Fora deste passo.
