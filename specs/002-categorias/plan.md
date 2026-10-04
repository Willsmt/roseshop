# Implementation Plan: Categorias do catálogo

**Branch**: `feature/002-categorias` | **Date**: 2026-10-04 | **Spec**: [spec.md](./spec.md)

**Input**: `specs/002-categorias/spec.md` (clarify concluído), constitution v1.0.0,
CLAUDE.md, ADR-002 (banco/driver), ADR-003 (auth), ADR-006 (ambientes/entrega),
`docs/architecture.md` e `docs/operacao.md`.

> **Status do plano: COMPLETO. D1–D5 decididas pelo humano em 2026-10-04.**
> Opções descartadas e trade-offs ficam em [research.md](./research.md) como
> histórico. D2 e D3 estão no
> [ADR-008](../adr/008-integridade-de-dados-neon-http.md) (status: **aceito**, com emenda
> de 2026-10-04 sobre a geração da migration). `tasks.md` gerado e revisado após o
> `/speckit-analyze` (decisões H3-A, H4-A, H7-A e C1-A) e da segunda análise (N1–N17),
> ver "Decisões da análise".
> Sem código, sem migration.

## Decisões da análise (2026-10-04)

| ID | Decisão |
|----|---------|
| H3-A | `contarProdutosDaCategoria` conta de verdade já na 002 (`count(*)`; o `to_regclass` original saiu em N10); SC-009 fecha na 002 |
| H4-A | Leitura própria do painel (`@/lib/categorias/painel`) com `versao`; o barrel dos consumidores não expõe `versao` |
| H7-A | Telas separadas: lista, criar, renomear, confirmar remoção |
| C1-A | Probe do batch no Neon dev em passo de CI do `pull-request.yml`, com secret do environment `dev`; a máquina local nunca conecta ao dev |
| L4 | Charset `\p{L}`, `\p{N}`, espaço e hífen; normalização NFC (spec, Clarifications e FR-008) |
| N1 | O probe no Neon dev usa o mesmo `secrets.DATABASE_URL` do environment `dev` que a migration e o app já usam (string **direta**, sem pooler); nenhum secret novo. Se o app passar a usar a string pooled, o probe é repetido (ADR-008) |
| N2 | "Escrita" na conformidade = funções de `@/lib/db/categorias`; `@/lib/categorias/actions` só em `src/app/painel/**` |
| N3/N4 | Probe ganha o caso (c) `transaction_isolation = read committed`; polling em `pg_locks` com prazo; A devolve `clock_timestamp()`; `pg_sleep` maior no CI |
| N10 | `contarProdutosDaCategoria` sem `to_regclass`: um único `SELECT count(*)::int` (só roda após `23503`) |
| N17 | PR em rascunho aberto no início da SF6, com SF1–SF5 fechadas; o 1º run congela a migration `0000` no Neon dev |

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
Migrations via `drizzle-kit` (primeira do projeto; gerada pelo `drizzle-kit generate` e
editada à mão: função antes do `CREATE TABLE`, seed depois).

**Testing**: Vitest. Unitários (`*.test.ts`): Zod do nome, mapeamento de erros,
mensagens. Integração (`*.int.test.ts`, exige `db:up` + `db:migrate`, sem paralelismo
entre arquivos): equivalência via `categoria_chave`, probe determinístico do `db.batch`
(mesmo txid; lock visível em `pg_locks` e bloqueante), concorrência (criar/renomear/remover),
mínimo de 1, ordenação, seed, tabela de teste `produtos` (comum, criada e descartada pelo
teste). Componentes (jsdom, obrigatórios). Conformidade: `painel-guard.test.ts` cobre as rotas/actions novas.

**Target Platform**: Cloudflare Workers (OpenNext); validar no `npm run preview`.

**Project Type**: web (Next.js App Router, projeto único).

**Performance Goals**: lista de dezenas de itens; 1 query de leitura por render; sem paginação.

**Constraints**: free tier (sem extensão paga, sem CPU extra); driver HTTP único
(ADR-002); acesso a banco só em `src/lib/db/` (constitution IV); UI ≥16px/≥48px.

**Scale/Scope**: ≤ dezenas de categorias; 3 administradoras; 4 telas (lista, criar, renomear, confirmar remoção; H7-A).

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
- Não assumem tabela vazia. Helper de reset (`src/test/db/categorias-fixtures.ts`, do
  tech-lead): `TRUNCATE categorias RESTART IDENTITY` seguido do seed, onde o teste precisa
  de estado conhecido. A tabela de teste `produtos` (D4) é comum (não `TEMP`), criada pelo
  helper e descartada só por ele, no `afterAll` do teste, antes do `TRUNCATE` (a FK o bloquearia).
- Teste de seed em banco limpo: `TRUNCATE`, reexecuta o bloco de seed da própria
  migration (lido do arquivo, sem cópia) e confere as 5 linhas. O mesmo arquivo aciona
  `npx drizzle-kit migrate` por `execFileSync` (mesmo `DATABASE_URL` TCP do setup) e confere
  que o migrate repetido não duplica nem recria categoria removida ou renomeada.
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
- O `drizzle-kit` não modela a função: a migration é gerada pelo `drizzle-kit generate`
  (normal) e editada à mão — função antes do `CREATE TABLE`, seed depois, separados por
  `--> statement-breakpoint`. **Não usar `--custom`**: ele grava um snapshot copiado do
  anterior, sem a tabela, e a geração seguinte recriaria `categorias`. Coluna declarada no
  schema com `generatedAlwaysAs(sql\`categoria_chave(nome)\`)`; conferir que o
  `drizzle-kit generate` seguinte responda "No schema changes".
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
| FR-005/006 renomear | `UPDATE … SET nome = $3, versao = versao + 1, atualizado_em = now()` — `chave` **não** entra no `SET` (coluna gerada, recalculada pelo banco); o índice único compara com as outras linhas, então trocar só caixa/acento da própria categoria é aceito | **[DETERMINADO]** |
| FR-019 mesma categoria | Concorrência otimista: coluna `versao`; `UPDATE/DELETE … WHERE id = $1 AND versao = $2 … RETURNING`; 0 linhas ⇒ "alterada por outra pessoa / não existe mais". O formulário carrega a `versao` lida com a lista. Cobre também rename×delete (linha travada, reavaliação do `WHERE`) | **[DETERMINADO]** |
| FR-011 produtos | FK `produtos.categoria_id → categorias.id ON DELETE RESTRICT` (criada pela 003); o banco recusa o `DELETE` (`23503`), inclusive contra insert concorrente de produto (lock `FOR KEY SHARE`). A contagem da mensagem é lida após a recusa | **[DETERMINADO]** (mecanismo; contrato com a 003 em D4-A) |
| FR-020 mínimo 1, inclusive remoções simultâneas | Um `DELETE … WHERE (select count(*)) > 1` isolado **não basta**: dois deletes concorrentes enxergam o mesmo snapshot (2 linhas) e ambos passam. **Decisão D3-B**: `db.batch([ SELECT pg_advisory_xact_lock(k), DELETE … WHERE id = $1 AND versao = $2 AND (SELECT count(*) FROM categorias) > 1 RETURNING id ])`. Batch = uma transação READ COMMITTED; o lock serializa e o 2º statement toma snapshot novo depois do lock. 0 linhas ⇒ leitura posterior só para escolher o resultado (`ausente` / `versao_diferente` / `ultima`). Pré-requisito: probe determinístico provando que o batch roda numa única transação, em READ COMMITTED, com o lock mantido até o fim do batch, no proxy local (`test:int`) e no Neon dev (passo de CI) | **[DETERMINADO]** (D3-B; ADR-008) |

Consequência de D3-B (aceita, registrada no ADR-008): FR-020 vale para quem usar a
função de remoção; a única porta de escrita é a action (FR-015, teste de conformidade);
não há trigger. O lock é de transação (`xact`), compatível com o pooler do Neon.

### 5. Bloqueio "N produtos" sem tabela de produtos (FR-011) — **[DETERMINADO: D4-A]**

A 002 **não** cria `produtos`. A garantia em banco é a FK da 003 (`ON DELETE
RESTRICT`). A 002 entrega o fluxo de remoção que traduz `23503` em mensagem com
contagem, atrás de `contarProdutosDaCategoria(db, categoriaId)`, que **já conta de
verdade (H3-A)**: um único `SELECT count(*)::int FROM produtos WHERE categoria_id = $1`
em SQL cru (N10: sem `to_regclass`; só é chamada após `23503`, que já implica a existência
de `produtos`). Contagem ≤ 0 após `23503` ou erro na contagem ⇒ `falha_geral`. O
mecanismo é provado por **teste de integração** que cria uma tabela `produtos` **comum**
(não `TEMP`: o Postgres recusa FK de temp para tabela permanente, e no neon-http cada
statement é uma sessão nova) com `categoria_id integer NOT NULL REFERENCES categorias(id)
ON DELETE RESTRICT`, insere produtos e confere bloqueio + contagem pelo caminho de
produção; o helper só descarta a tabela que ele mesmo criou.

**Contrato com a 003**: referenciar por `categorias.id`, `NOT NULL`, `ON DELETE
RESTRICT`; validar com `exigirCategoriaValida(id)`. **A primeira task da 003 cria
`produtos` pelo schema, troca o SQL cru de `contarProdutosDaCategoria` pela referência
ao schema e remove as funções de fixture do helper.** Ver
`contracts/categorias.md` §5.

### 6. Ponto de acesso único (FR-014, FR-015) — **[DETERMINADO]**

- Consultas e escritas SQL: `src/lib/db/categorias.ts` (constitution IV; zona protegida).
  Toda função **recebe `db`** e devolve resultado discriminado; `src/lib/categorias/erros.ts`
  traduz em motivo e mensagem (contrato §4). O `db` vem de `dbDoContexto()`
  (`src/lib/db/contexto.ts`, `getCloudflareContext` → `createDb`), chamado pelo barrel, pelo
  módulo do painel e pelas actions; testes de integração injetam `createDb(process.env)`.
- Módulo de domínio `src/lib/categorias/` com barrel `index.ts` **somente leitura**:
  `listarCategorias()`, `obterCategoria(id)`, `exigirCategoriaValida(id)` (rejeita id
  fora da lista — SC-006) e re-export de `CategoriaInvalidaError`. 003 e IA importam
  **só** do barrel.
- Leitura do painel (H4-A): `src/lib/categorias/painel.ts` com
  `listarCategoriasDoPainel()` e `obterCategoriaDoPainel(id)` (o `[id]` da URL chega como
  string e é coagido por `z.coerce` para inteiro positivo), que incluem `versao`; fora
  do barrel, importável só por `src/app/painel/**` e `src/lib/categorias/**`.
- Escrita (`criar`, `renomear`, `remover`) **não** é exportada pelo barrel: vive em
  `src/lib/categorias/actions.ts` ("use server"), cada action começando por
  `requireAdminAction()`, e as funções SQL de escrita recebem um `AdminSession`.
- FR-015 imposto por teste de conformidade (novo, no estilo do `painel-guard`): nenhum
  arquivo fora de `src/lib/categorias/` e `src/lib/db/` importa `@/lib/db/categorias`
  (funções de escrita da camada db) nem o schema de `categorias`;
  `@/lib/categorias/actions` só é importado por `src/app/painel/**` (proibido em
  `src/lib/ai/`, no barrel e no resto de `src/`); `src/lib/ai/` só importa o barrel. Regra
  `no-restricted-imports` no ESLint como segunda camada.
- Referência por `id` (inteiro, identity), nunca pelo nome (FR-009, US5-4).

## Constitution Check

*Refeito após as decisões D1–D5 (2026-10-04). Sem violações; ressalvas abaixo.*

| Princípio | Resultado |
|-----------|-----------|
| I. Fonte de verdade / ADR | OK: D2 e D3 mudam a forma de garantir integridade com o driver atual e estão no **ADR-008 (aceito)**. D1/D4/D5 não trocam stack, lib nem provedor. Todo critério de aceite tem teste automatizado (componentes em jsdom, sem cláusula de escape), exceto SC-002 (manual) e SC-007 (adiado) |
| II. Stack fechada | OK. Drizzle + `@neondatabase/serverless` HTTP mantidos; **sem dependência nova, sem extensão, sem WebSocket** (D2-C e D3-C descartadas). Função SQL própria vive em migration |
| III. Segurança | OK. Zod em toda fronteira (nome, id, versão); `requireAdminAction`/`requireAdminPage` em toda action/página; conformidade FR-015; nenhum segredo novo; mensagens sem vazar erro do banco. Zona protegida `src/lib/db/` (schema, migrations) ⇒ só tech-lead + revisão humana |
| IV. Arquitetura | OK. Server Components por padrão; mutações por Server Action; SQL só em `src/lib/db/`; regra de negócio fora do client; timestamps UTC. Ressalva consciente: a regra de normalização passa a viver **no banco** (D2-B); a aplicação não a reimplementa |
| V. UX | OK. ≥16px, ≥48px, uma tarefa por tela (H7-A: lista, criar, renomear e confirmar remoção em telas separadas), confirmação de remoção, pt-BR sem jargão (`contracts/categorias.md`) |
| VI. Qualidade | OK. Testes antes da implementação; "pronto" = lint+typecheck+testes (+ `test:int` com migrations aplicadas). Commits sem trailer de co-autoria (a constitution prevalece sobre a instrução de atribuição do harness). `checks.yml`, `pull-request.yml` e docs alterados ⇒ doc-sync no fechamento; `README.md` atualizado em commit `docs(readme)` próprio |
| VII. Free tier | OK. Tabela pequena, funções built-in, sem extensão nem conexão persistente |
| VIII. Ambientes | OK. Migration local → dev → produção pelo fluxo do ADR-006; seed vem na migration; `test:int` roda contra Postgres local/CI, nunca dev/prod. O probe do batch no Neon dev roda só no CI (config dedicada que inclui apenas o probe, que não toca tabelas), com o mesmo `secrets.DATABASE_URL` do environment `dev` usado pela migration e pelo app (string direta, sem pooler; nenhum secret novo); a máquina local nunca conecta ao dev. Atenção: **primeira migration real** do projeto; o PR em rascunho só é aberto com SF1–SF5 fechadas, porque o 1º run congela a migration `0000` no Neon dev |

Pontos de atenção residuais (não são violações):
1. FR-020 (D3-B) é garantido pela aplicação, não pelo banco: um delete fora da função
   de remoção o contornaria. Mitigação: conformidade FR-015 e ADR-008.
2. Lock advisory e `db.batch` precisam ser provados de forma determinística (mesmo txid;
   lock visível em `pg_locks`, por polling com prazo, e bloqueando o segundo batch;
   isolamento `read committed`) no proxy local (`test:int`) e no Neon `dev` (passo de CI),
   além dos testes de concorrência em loop, antes de produção.
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
└── tasks.md             # gerado e revisado após o /speckit-analyze
```

### Source Code (previsão; nada criado agora)

```text
src/lib/db/
├── schema.ts                  # + tabela categorias            [protegido, tech-lead]
├── categorias.ts              # queries/escritas SQL (recebem db; resultado discriminado) [protegido]
├── contexto.ts                # dbDoContexto(): getCloudflareContext → createDb
├── locks.ts                   # registro de chaves de lock advisory
├── erros-pg.ts                # codigoSqlstate(error): error.code ou error.cause.code
└── migrations/                # 1ª migration: drizzle-kit generate + edição à mão (função, tabela, seed; D1-A)
src/lib/categorias/            # novo módulo (⇒ doc-sync)
├── index.ts                   # barrel SOMENTE LEITURA (consumidores 003/IA)
├── painel.ts                  # leitura do painel com versao (H4-A)
├── nome.ts                    # Zod do nome: NFC, trim, espaços, 2–40, \p{L}\p{N} espaço hífen (a chave é do banco)
├── mensagens.ts               # textos pt-BR
├── erros.ts                   # CategoriaInvalidaError + resultado discriminado → { motivo, mensagem, campo? }
└── actions.ts                 # "use server": criar/renomear/remover
src/app/painel/(protegido)/categorias/   # [ui-dev] H7-A: uma tarefa por tela
├── page.tsx                   # lista
├── nova/page.tsx              # criar
└── [id]/
    ├── renomear/page.tsx      # renomear
    └── remover/page.tsx       # confirmar remoção
src/test/db/categorias-fixtures.ts   # reset + tabela de teste produtos [tech-lead]
src/test/conformance/          # + teste "só lê categorias fora do módulo" (FR-015)
vitest.probe.config.mts        # só o probe do batch; usado no passo de CI contra o Neon dev
```

**Structure Decision**: projeto único Next.js; leitura/escrita separadas por barrel;
SQL confinado a `src/lib/db/`.

## Pós-plano

Doc-sync (`doc-sync-onboarding`) no fechamento: schema/migration alterados, rotas
novas, módulo novo em `src/`, mudança em CI (`checks.yml`, D5-A; `pull-request.yml`,
probe C1-A) e ADR-008 aceito. `README.md` pelo redator, em commit próprio.
Fora deste passo.
