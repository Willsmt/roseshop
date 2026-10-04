# Tasks: Categorias do catálogo (feature 002)

**Input**: `specs/002-categorias/` — spec.md, plan.md, research.md, data-model.md,
contracts/categorias.md, quickstart.md; `specs/adr/008-integridade-de-dados-neon-http.md` (aceito).
**Branch**: `feature/002-categorias`
**Revisão**: 2026-10-04, após `/speckit-analyze` (decisões H3-A, H4-A, H7-A, C1-A; ver plan.md)
e após a segunda análise (N1–N16 e N17; ver plan.md, "Decisões da análise").

## Convenções

- Formato: `- [ ] Txxx [P?] [USn?] [agente] descrição com caminho`.
- **Agentes**: `tech-lead` (opus), `test-writer` (sonnet), `ui-dev` (sonnet), `redator` (haiku),
  `doc-sync-onboarding` (sonnet), `junior` (haiku, só roda comandos e devolve output real).
- **TDD**: dentro de cada sub-fase os testes vêm primeiro e devem falhar (Red) antes da
  implementação; a sub-fase só fecha com tudo verde.
- **[P]** só quando a task não compartilha arquivo nem banco com outra task pendente.
  Qualquer task que toca o Postgres local (`*.int.test.ts`, `db:migrate`, `db:reset`) **não** é [P].
- **Fechamento de cada sub-fase**: `npm run check` + `npm run test:int` (a partir da SF1)
  com output real; depois commit em Conventional Commits, **sem `Co-Authored-By`**
  (a constitution VI e o CLAUDE.md prevalecem sobre a instrução de atribuição do harness).
  Quem commita: o humano (CLAUDE.md "Regras gerais"); a mensagem sugerida está em cada sub-fase.
- Zonas: código de produção, schema e migrations em `src/lib/db/` só pelo tech-lead; testes
  colocalizados (`*.test.ts`, `*.int.test.ts`) pelo test-writer com revisão do tech-lead.
  Infra de teste que não é arquivo de teste (helpers, configs do vitest) é do tech-lead.
  `.github/workflows/` só pelo tech-lead.
- Junior: o `npx drizzle-kit migrate` disparado de dentro do `npm run test:int` local (T003,
  contra o Postgres do Docker) faz parte do `test:int` e é permitido ao junior; fora disso,
  migrations continuam com o tech-lead.
- Textos: se o texto das mensagens mudar, o test-writer atualiza os testes de texto
  (`mensagens.test.ts`); o redator só edita `mensagens.ts` e rótulos das telas.
- Camadas (contrato §4): funções de `src/lib/db/categorias.ts` recebem `db` e devolvem
  resultado discriminado; `src/lib/categorias/erros.ts` traduz em `{ motivo, mensagem, campo? }`;
  barrel, módulo do painel e actions obtêm o `db` por `dbDoContexto()` (`src/lib/db/contexto.ts`).
- Tags de história: US1 lista · US2 criar · US3 renomear · US4 remover · US5 fonte única.

---

## SF1 — Banco: schema, função, seed, prova do batch e infra de teste (US1, US5 base)

**Objetivo**: tabela `categorias` com `chave` gerada pelo banco, função `categoria_chave`,
seed único na migration, banco de teste migrado local e no CI (D1-A, D2-B, D5-A) e prova
determinística de que `db.batch` roda numa única transação no proxy local (pré-requisito de D3-B).
**Fecha com**: `npm run check` e `npm run test:int` verdes (com `db:migrate` aplicado).

### Infra e testes primeiro (Red)

- [x] T001 [tech-lead] Criar helper de integração `src/test/db/categorias-fixtures.ts` (infra de teste, não é teste nem produção): `resetCategorias(db)` = `TRUNCATE categorias RESTART IDENTITY` e reexecuta o bloco de seed lido da migration (entre `-- seed:categorias:start` / `-- seed:categorias:end`); `criarFixtureProdutos(db)` = `CREATE TABLE produtos (id integer generated always as identity primary key, categoria_id integer NOT NULL REFERENCES categorias(id) ON DELETE RESTRICT)` — tabela **comum** (não `TEMP`: o Postgres recusa FK de temp para tabela permanente e, no neon-http, cada statement é uma sessão nova), **sem** `IF NOT EXISTS` (se já existir uma `produtos` real, falha e sinaliza que a fixture deve sair, ver contrato §5), e marca que o helper a criou; `descartarFixtureProdutos(db)` = `DROP TABLE produtos` **somente** se foi este helper que a criou. `resetCategorias` nunca descarta tabelas; quem cria a fixture a descarta no próprio `afterAll`, antes de qualquer reset. Testes não assumem tabela vazia. **Recuperação**: se uma execução for interrompida antes do `afterAll` (Ctrl+C, timeout), a `produtos` sobra no banco local e quebra `criarFixtureProdutos` e o `TRUNCATE` de `resetCategorias` (FK); recuperar com `npm run db:reset` (destrutivo, só local) seguido de `npm run db:migrate`. Registrar essa recuperação em comentário no topo do helper.
- [x] T002 [test-writer] Em `src/lib/db/categorias.schema.int.test.ts`, testes de `categoria_chave` e da tabela (US2-2/3, US3-2/3, FR-005/006/008): `categoria_chave('GUÁRDA  chuvas')` = `guarda chuvas`; `'Panos de prato'`/`'panos de prato'`/`' Panos  de prato '` com a mesma chave; `'Guarda-chuva'` ≠ `'Guarda-chuvas'`; `chave` é gerada (INSERT informando `chave` falha); `UNIQUE(chave)` ⇒ SQLSTATE `23505` (e registrar se o código chega em `error.cause`, pendência de research.md); CHECKs `char_length(nome) BETWEEN 2 AND 40`, `nome = btrim(nome)`, `nome !~ '\s{2,}'`; `versao` default 1; `criado_em`/`atualizado_em` default `now()` timestamptz; premissa NFD: `ß`, `æ`, `ø`, `ł` ficam distintos de `ss`, `ae`, `o`, `l`.
- [x] T003 [test-writer] Em `src/lib/db/categorias.seed.int.test.ts` (FR-002/003, SC-001/008): (1) **bloco de seed da migration** — ler `src/lib/db/migrations/0000_*.sql`, extrair o trecho entre os marcadores, `resetCategorias` (T001) e conferir exatamente Bolsas, Guarda-chuvas, Tupperware, Panos de prato, Meias; (2) **migrate repetido não recria** — `DELETE` de uma categoria inicial e `UPDATE` do nome de outra, depois acionar o migrate por `execFileSync("npx", ["drizzle-kit", "migrate"], { env: process.env, timeout: 60_000 })` (o `vitest.int.setup.ts` já carrega `DATABASE_URL` TCP do `.dev.vars` local ou do ambiente do CI; o drizzle-kit usa a mesma via `drizzle.config.ts`); conferir que a removida continua ausente, a renomeada mantém o nome novo e não há linhas duplicadas; ao fim, `resetCategorias`. Timeout do teste ≥ 60 s.
- [x] T004 [test-writer] Em `src/lib/db/categorias.ordem.int.test.ts` (US1-6, FR-012): `ORDER BY chave COLLATE "C", id` ordena "meias", "Bolsas", "Água" como Água, Bolsas, meias; empate de chave impossível (UNIQUE), mas `id` como desempate estável.
- [x] T005 [test-writer] **Probe determinístico do batch** em `src/lib/db/batch-transacao.int.test.ts` (D3-B, ADR-008; **não toca em nenhuma tabela**; usa `LOCK_PROBE_BATCH` de `@/lib/db/locks`): (a) `db.batch([SELECT txid_current(), SELECT txid_current()])` devolve o **mesmo** txid nos dois statements; controle: duas chamadas isoladas devolvem txids diferentes; (b) batch A = `[SELECT pg_advisory_xact_lock(LOCK_PROBE_BATCH), SELECT pg_sleep(S), SELECT clock_timestamp()]` disparado sem `await` (o 3º statement devolve o fim de A); **polling** com consulta isolada (outra requisição/sessão) em `pg_locks` filtrando `locktype = 'advisory'`, `granted` e a chave, repetida a cada ~100 ms até encontrar **1** lock ou estourar o prazo (ex.: 5 s ⇒ falha), sem espera fixa; em seguida o batch C = `[SELECT pg_advisory_xact_lock(LOCK_PROBE_BATCH), SELECT clock_timestamp()]` só termina **depois** de A (o `clock_timestamp` de C ≥ o `clock_timestamp` devolvido por A, ambos do mesmo servidor); ao final, `pg_locks` não tem mais o lock; (c) `db.batch([SELECT current_setting('transaction_isolation'), SELECT txid_current()])` devolve `"read committed"` no 1º statement (D3-B depende de snapshot novo por statement, tirado depois do lock). `S` vem de `PROBE_SLEEP_S` (padrão 2 s local; maior no CI contra o Neon dev, T062); o timeout do teste acomoda `S` + prazo do polling. O mesmo arquivo é reutilizado contra o Neon dev no CI (T062); por isso usa apenas `createDb(process.env)` e nenhum helper de tabela.
- [x] T006 [test-writer] Rodar os testes novos e confirmar que **falham** pelo motivo certo (tabela/função/`locks.ts` inexistentes); entregar o output ao tech-lead (junior pode rodar: `npm run test:int`).

### Implementação

- [x] T007 [tech-lead] Em `vitest.int.config.mts` adicionar `fileParallelism: false` em `test` (arquivos que fazem `TRUNCATE` em `categorias` não podem rodar em paralelo).
- [x] T008 [tech-lead] Em `src/lib/db/schema.ts` declarar `categorias`: `id integer generated always as identity` PK; `nome text NOT NULL`; **`chave text NOT NULL` com `.generatedAlwaysAs(sql\`categoria_chave(nome)\`)` (coluna `STORED`) e `UNIQUE`**; `versao integer NOT NULL default 1`; `criado_em`/`atualizado_em timestamptz NOT NULL default now()`; os 3 `CHECK` exatamente como em data-model.md (`char_length(nome) BETWEEN 2 AND 40`, `nome = btrim(nome)`, `nome !~ '\s{2,}'`).
- [x] T009 [tech-lead] Gerar a migration com `npm run db:generate` (**geração normal, sem `--custom`**: o `--custom` grava um snapshot copiado do anterior, sem a tabela, e a próxima geração recriaria `categorias`). O kit gera `src/lib/db/migrations/0000_*.sql` com `CREATE TABLE`, coluna gerada, `UNIQUE` e `CHECK`s, e o snapshot em `migrations/meta/` já contém a tabela. Editar o SQL à mão: (1) **no topo**, `CREATE FUNCTION categoria_chave(text) RETURNS text LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE` com `lower` → `normalize(…, NFD)` → remove `U+0300–U+036F` → hífen vira espaço → `\s+` vira um espaço → `btrim` (somente built-ins), seguido de `--> statement-breakpoint`; (2) o `CREATE TABLE` gerado, intacto; conferir que saiu `GENERATED ALWAYS AS (categoria_chave(nome)) STORED`; (3) **no fim**, após `--> statement-breakpoint`, o bloco de seed entre `-- seed:categorias:start` / `-- seed:categorias:end` com `INSERT` de Bolsas, Guarda-chuvas, Tupperware, Panos de prato, Meias (grafia da spec). O migrator divide o arquivo só pelo marcador `--> statement-breakpoint`, então o corpo da função não é cortado.
- [x] T010 [tech-lead] **Conferir o diff do drizzle-kit**: depois da edição, rodar `npx drizzle-kit generate` e exigir "No schema changes" (função e seed não entram no snapshot; coluna gerada e checks já estão nele). Opcional: `npx drizzle-kit check`. Registrar o resultado no PR.
- [x] T011 [tech-lead] Criar `src/lib/db/locks.ts`: registro único de chaves de lock advisory, com `LOCK_PROBE_BATCH` (uso exclusivo do probe T005), comentário do uso de cada chave e a regra de nunca reutilizar um número.
- [x] T012 [tech-lead] Rodar `npm run db:up && npm run db:migrate` no banco local; confirmar `_journal.json` criado e seed aplicado (`npm run db:psql` → `SELECT nome FROM categorias ORDER BY chave COLLATE "C"`). Rodar T005: **se o probe falhar no proxy local, parar e reabrir o ADR-008** antes de qualquer task de remoção (T041–T048).
- [x] T013 [tech-lead] Em `.github/workflows/checks.yml`, job `integration`: adicionar passo `npm run db:migrate` **antes** do `test:int` (D5-A; contra o Postgres do service, nunca dev/prod).
- [x] T014 [tech-lead] Documentar o fluxo local em `CLAUDE.md`/`quickstart.md` só se divergir: `db:up` → `db:migrate` → `test:int` (a sync completa fica para SF7).

### Fechamento SF1

- [x] T015 [junior] Rodar `npm run check` e `npm run test:int`; devolver o output real. T002–T005 verdes.

**Commit sugerido (SF1)**: `feat(db): adiciona tabela categorias, função categoria_chave e seed inicial`
(se preferir dois commits: `feat(db): ...` e `ci: aplica migrations antes dos testes de integração`).

---

## SF2 — Leitura, leitura do painel e fonte única (US1, US5)

**Objetivo**: barrel somente leitura `@/lib/categorias`, leitura do painel com `versao`
(`@/lib/categorias/painel`, H4-A), acesso ao `db` pelo contexto Cloudflare e barreira
FR-014/FR-015 (conformidade e ESLint). Depende de SF1.

### Testes primeiro (Red)

- [x] T016 [test-writer] Em `src/lib/categorias/leitura.int.test.ts` (SC-006, US5; `vi.mock("@/lib/db/contexto")` devolvendo `createDb(process.env)`; reseta via T001): `listarCategorias()` devolve `{ id, nome }[]` (sem `versao`) na ordem alfabética; `obterCategoria(id)` devolve `null` para id inexistente; `exigirCategoriaValida(id)` devolve o id válido e lança `CategoriaInvalidaError` (importado do barrel) para id removido, `0`, negativo e não inteiro; nunca cria categoria; renomear mantém o `id` (US3-6/US5-4).
- [x] T017 [test-writer] Em `src/lib/categorias/painel.int.test.ts` (H4-A, FR-019; mesmo mock de contexto): `listarCategoriasDoPainel()` devolve `{ id, nome, versao }[]` na mesma ordem de `listarCategorias()`; `obterCategoriaDoPainel(id)` recebe o `[id]` da URL como **string** (contrato §2): `"3"` (id existente, em string) devolve `{ id: 3, nome, versao }`; id inexistente, `"0"`, negativo (`"-1"`) e não numérico (`"abc"`) devolvem `null`; `versao` reflete o incremento após um rename.
- [x] T018 [P] [test-writer] Em `src/test/conformance/categorias-acesso.test.ts` (FR-014/FR-015, SC-006; estilo de `painel-guard.test.ts`, nega por padrão, sem banco): varrer `src/**` e falhar se qualquer arquivo fora de `src/lib/categorias/` e `src/lib/db/` importar `@/lib/db/categorias` (as funções de escrita da camada db: `inserir`, `renomear`, `remover`, e as demais queries) ou `categorias` de `@/lib/db/schema`; `@/lib/categorias/actions` só pode ser importado por `src/app/painel/**` (proibido em `src/lib/ai/`, no barrel `index.ts` e no resto de `src/`); `@/lib/categorias/painel` só pode ser importado por `src/app/painel/**` e `src/lib/categorias/**`; `src/lib/ai/` só pode importar `@/lib/categorias` (barrel); o `index.ts` do barrel não exporta `criar`/`renomear`/`remover`, nem o schema, nem o módulo do painel.
- [x] T019 [test-writer] Confirmar Red de T016–T018 (devolver output).

### Implementação

- [x] T020 [tech-lead] Criar `src/lib/db/contexto.ts` com `dbDoContexto()`: `getCloudflareContext({ async: true })` → `createDb({ DATABASE_URL, NEON_FETCH_ENDPOINT })`, no padrão de `src/app/api/health/route.ts`. Única porta de obtenção do `db` para barrel, módulo do painel e actions.
- [x] T021 [tech-lead] Em `src/lib/db/categorias.ts`, funções que **recebem `db`**: `listar(db)` (`ORDER BY chave COLLATE "C", id`, devolve `id`, `nome`, `versao`), `obterPorId(db, id)`; só SQL via Drizzle/neon-http, confinado a `src/lib/db/` (constitution IV).
- [x] T022 [tech-lead] Criar `src/lib/categorias/erros.ts` com `CategoriaInvalidaError` e, em `src/lib/categorias/index.ts`, o barrel **somente leitura**: `listarCategorias()` (projeta `{ id, nome }`), `obterCategoria(id)`, `exigirCategoriaValida(id)` (contrato §1; id validado com Zod: inteiro positivo) e **re-export de `CategoriaInvalidaError`**.
- [x] T023 [tech-lead] Criar `src/lib/categorias/painel.ts` (H4-A, contrato §2): `listarCategoriasDoPainel()` e `obterCategoriaDoPainel(id: string)` com `versao`; o `[id]` da URL é coagido por `z.coerce.number().int().positive()` (inválido ⇒ `null`); não exportado pelo barrel.
- [x] T024 [tech-lead] Regra `no-restricted-imports` no `eslint.config.*` como segunda camada de FR-015 (bloqueia importar `@/lib/db/categorias` e `categorias` de `@/lib/db/schema` fora de `src/lib/categorias/` e `src/lib/db/`; `@/lib/categorias/actions` fora de `src/app/painel/`; e `@/lib/categorias/painel` fora de `src/app/painel/` e `src/lib/categorias/`).

### Fechamento SF2

- [x] T025 [junior] `npm run check` + `npm run test:int` com output real; T016–T018 verdes.

**Commit sugerido (SF2)**: `feat(categorias): adiciona leitura somente leitura, leitura do painel e conformidade de acesso (FR-014, FR-015)`

---

## SF3 — Criar e renomear (US2, US3)

**Objetivo**: validação Zod do nome, mensagens pt-BR, resultado discriminado da camada db,
tradução em `erros.ts` e Server Actions `criarCategoria`/`renomearCategoria`
(FR-005–FR-009, FR-016, FR-017, FR-019). Depende de SF2.

**Decisões do humano (2026-10-04, abertura da SF3)**:
1. **Nome com letra ou número** (spec, Clarifications "implementação da SF3", e FR-008): após
   normalizar, o nome precisa ter ao menos um `\p{L}` ou `\p{N}` ("--"/"- -" gerariam chave vazia
   e colidiriam no `UNIQUE`). Motivo novo `nome_sem_letra`, mensagem "O nome precisa ter pelo
   menos uma letra ou número." (contrato §3). Afeta T026, T027, T034, T035.
2. **Id rígido em `nome.ts`**: schema `idCategoria` vive uma só vez em `src/lib/categorias/nome.ts`
   e é usado pelo barrel e por `obterCategoriaDoPainel` (substitui os schemas locais de
   `index.ts`/`painel.ts`); aceita só decimal sem formatação, positivo, ≤ 2147483647 (contrato
   §1/§2, que dizia `z.coerce` puro). Afeta T026, T034.
3. **SQLSTATE só em `error.cause.code`** (observado em T002): `codigoSqlstate` em
   `src/lib/db/erros-pg.ts` lê `cause.code`, nunca `error.code`; testes de mapeamento usam essa
   forma (contrato §4). Afeta T029, T031, T036, T038.
4. **Conformidade**: a exceção de import de `./actions` para `actions.test.ts` e
   `actions.remocao.test.ts` já existe (teste e ESLint); `../actions` vindo de subpasta de
   `src/lib/categorias/` é coberto pelo teste de conformidade, não pelo ESLint (contrato §1).

### Testes primeiro (Red)

- [x] T026 [P] [test-writer] Em `src/lib/categorias/nome.test.ts` (unitário, sem banco; US2-4..7, FR-007/FR-008, SC-010): normaliza NFC, trim e colapso de espaços (`"  Bolsas   de   Praia  "` ⇒ `"Bolsas de Praia"`; `"Meias"` em NFD vira NFC); vazio/só espaços ⇒ `nome_vazio`; tamanho **2–40** após normalizar (1 e 41 ⇒ `nome_tamanho`; 2 e 40 aceitos); charset **`\p{L}`, `\p{N}`, espaço, hífen** (aceita letras de qualquer alfabeto, decisão da clarify): `"Bolsas!"` e `"Meias 😀"` ⇒ `nome_caracteres`; **(decisão 1)** `"--"`, `"- -"` e `"---"` ⇒ `nome_sem_letra`, `"A-"` aceito; **(decisão 2)** `idCategoria`: `"3"` e `3` aceitos; `" 3"`, `"1e2"`, `"03"`, `"99999999999"`, `0`, negativo e não numérico recusados; `versao` inteiro positivo.
- [x] T027 [P] [test-writer] Em `src/lib/categorias/mensagens.test.ts` (unitário): cada motivo da tabela de `contracts/categorias.md` mapeia para o texto exato, incl. `nome_repetido` com `{nome existente}`, `tem_produtos` com singular para N = 1 ("1 produto") e plural; nenhum texto contém jargão/SQLSTATE.
- [x] T028 [P] [test-writer] Em `src/lib/categorias/erros.test.ts` (unitário; contrato §4): traduz cada resultado discriminado da camada db em `{ motivo, mensagem, campo? }`: `nome_repetido` (com `nomeExistente`) ⇒ `nome_repetido` com `campo: "nome"`; `ausente` ⇒ `nao_existe`; `versao_diferente` ⇒ `alterada`; `ultima` ⇒ `ultima`; `tem_produtos` com `quantidade ≥ 1` ⇒ `tem_produtos` com N; `tem_produtos` com `quantidade ≤ 0` (corrida entre a recusa e a contagem) ⇒ `falha_geral`; exceção desconhecida ⇒ `falha_geral` sem expor texto, host ou usuário do banco.
- [x] T029 [P] [test-writer] Em `src/lib/db/erros-pg.test.ts` (unitário, erros do driver simulados): **(decisão 3)** `codigoSqlstate(error)` lê o SQLSTATE de `error.cause.code` (forma observada em T002: `DrizzleQueryError` → `NeonDbError`); `error.code` sozinho é ignorado; devolve `undefined` para erro sem código, `null`/não objeto.
- [x] T030 [test-writer] Em `src/lib/categorias/actions.test.ts` (unitário, `requireAdminAction`, `@/lib/db/contexto` e camada db mockados; FR-016, US2-9): sem sessão ⇒ `UnauthorizedError`, sem efeito e sem chamar a camada de dados nem `dbDoContexto`; entradas inválidas rejeitadas pelo Zod antes de qualquer SQL; sucesso ⇒ `{ ok: true }` e `revalidatePath("/painel/categorias")`.
- [x] T031 [test-writer] Em `src/lib/db/categorias.escrita.int.test.ts` (reseta via T001): `inserir(db, sessao, "Bolsas de Praia")` ⇒ `{ tipo: "ok", id }` com `versao = 1`; "panos de prato", "GUÁRDA-chuvas", " Meias " ⇒ `{ tipo: "nome_repetido", nomeExistente }` com o nome gravado (lookup `WHERE chave = categoria_chave($1)`; US2-2/8); "Guarda-chuva" aceito (US2-3); `renomear` "bolsas" → "Bolsas" aceito (próprio registro, FR-006); "Meias" → "bolsas" ⇒ `nome_repetido`; rename incrementa `versao` e `atualizado_em`, preserva `id`; versão velha ⇒ `versao_diferente`; id ausente ⇒ `ausente` (FR-019).
- [x] T032 [test-writer] Em `src/lib/db/categorias.concorrencia-escrita.int.test.ts` (concorrência real com `Promise.all`; FR-005, FR-019, SC-003): duas criações de nomes equivalentes simultâneas ⇒ 1 `ok`, 1 `nome_repetido`; dois renames da mesma categoria com a mesma `versao` ⇒ 1 `ok`, outro `versao_diferente`.
- [x] T033 [test-writer] Confirmar Red de T026–T032 (output real).

### Implementação

- [x] T034 [tech-lead] Criar `src/lib/categorias/nome.ts` (Zod): NFC, `trim`, colapso de espaços, **2–40**, charset `^[\p{L}\p{N} -]+$` (flag `u`); **(decisão 1)** ao menos um `\p{L}`/`\p{N}` ⇒ senão `nome_sem_letra`; **(decisão 2)** `idCategoria` rígido (decimal canônico, positivo, ≤ 2147483647), único para barrel e `painel.ts` (remover os schemas locais deles), e `versao` inteiro positivo. A `chave` **não** é calculada em TS (é do banco).
- [x] T035 [tech-lead] Criar `src/lib/categorias/mensagens.ts` com os textos pt-BR de `contracts/categorias.md` (FR-017), um por motivo.
- [x] T036 [tech-lead] Criar `src/lib/db/erros-pg.ts` com `codigoSqlstate(error)` (**decisão 3**: lê só `error.cause.code`); o SQLSTATE do driver não sai de `src/lib/db/`.
- [x] T037 [tech-lead] **Estender** `src/lib/categorias/erros.ts` (criado em T022): tradução do resultado discriminado da camada db em `{ motivo, mensagem, campo? }` e de exceção desconhecida em `falha_geral` (contrato §4).
- [x] T038 [tech-lead] Em `src/lib/db/categorias.ts`: `inserir(db, sessao: AdminSession, nome)` e `renomear(db, sessao, id, versao, nome)` com `UPDATE … SET nome = $3, versao = versao + 1, atualizado_em = now() WHERE id = $1 AND versao = $2 RETURNING …` (`chave` nunca entra no `SET`; é gerada); `23505` (via `codigoSqlstate`) ⇒ `buscarPorChave(db, nome)` via `categoria_chave($1)` e retorno `{ tipo: "nome_repetido", nomeExistente }`; 0 linhas no rename ⇒ leitura por id para devolver `ausente` ou `versao_diferente`; outros erros propagam.
- [x] T039 [tech-lead] Criar `src/lib/categorias/actions.ts` (`"use server"`): `criarCategoria({ nome })` e `renomearCategoria({ id, versao, nome })`, cada uma começando por `requireAdminAction()` (`src/lib/auth/guard.ts:36`), depois Zod, `dbDoContexto()`, camada db e tradução por `erros.ts`; retorno `{ ok: true }` ou `{ ok: false, motivo, mensagem, campo? }`; `revalidatePath("/painel/categorias")`.

### Fechamento SF3

- [x] T040 [junior] `npm run check` + `npm run test:int` (output real). Conformidade FR-015 (T018) continua verde: `@/lib/db/categorias` só é importado em `src/lib/categorias/` e `src/lib/db/`.

**Commit sugerido (SF3)**: `feat(categorias): adiciona criar e renomear com validação, mensagens e concorrência otimista`

---

## SF4 — Remover com mínimo de 1 (US4)

**Objetivo**: remoção com confirmação delegada à UI, bloqueio por produtos (FK `23503`) com
contagem real (H3-A) e mínimo de 1 categoria sob concorrência via `db.batch` +
`pg_advisory_xact_lock` (D3-B, ADR-008, FR-010, FR-011, FR-019, FR-020). Depende de SF3 e do
probe T005 verde (T012).

### Testes primeiro (Red)

- [ ] T041 [test-writer] Em `src/lib/db/categorias.remocao.int.test.ts` (reseta via T001): `remover(db, sessao, id, versao)` com `id` + `versao` corretos apaga a linha (`{ tipo: "removido" }`); `versao` velha ⇒ `versao_diferente`; id ausente ⇒ `ausente`; id e versão batem mas só resta 1 ⇒ `ultima` (leitura posterior escolhe o resultado).
- [ ] T042 [test-writer] Em `src/lib/db/categorias.produtos-fixture.int.test.ts` (D4-A, H3-A, SC-009): `beforeAll` chama `criarFixtureProdutos` (T001; tabela **comum**; se falhar por `produtos` sobrada de execução interrompida, recuperar com `npm run db:reset` + `npm run db:migrate`, ver T001); com 3 produtos vinculados, `contarProdutosDaCategoria` devolve `3` e `remover` ⇒ `{ tipo: "tem_produtos", quantidade: 3 }` sem apagar nada; com 1 produto ⇒ `quantidade: 1`; sem produtos remove; `afterAll` chama `descartarFixtureProdutos` **antes** de qualquer `resetCategorias` (a FK bloquearia o `TRUNCATE`).
- [ ] T043 [test-writer] Em `src/lib/db/categorias.concorrencia-remocao.int.test.ts` (SC-009, FR-020, FR-019; `Promise.all` no driver HTTP/proxy local): com 2 categorias restantes, duas remoções simultâneas de ids diferentes ⇒ exatamente 1 `removido` e 1 `ultima`, e a tabela termina com 1 linha; remover e renomear a mesma categoria simultaneamente ⇒ 1 vence, outro `versao_diferente`/`ausente`; repetir o cenário várias vezes (ex.: 20 rodadas) para expor corrida. Complementa o probe determinístico T005; não o substitui.
- [ ] T044 [P] [test-writer] Em `src/lib/categorias/actions.remocao.test.ts` (unitário, dados mockados): `removerCategoria` sem sessão ⇒ `UnauthorizedError`; cada resultado discriminado traduzido conforme `erros.ts`; entrada `{ id, versao }` validada.
- [ ] T045 [test-writer] Confirmar Red de T041–T044 (output real).

### Implementação

- [ ] T046 [tech-lead] Em `src/lib/db/locks.ts`, registrar `LOCK_REMOCAO_CATEGORIAS`; em `src/lib/db/categorias.ts`: `remover(db, sessao, id, versao)` com **`db.batch([ SELECT pg_advisory_xact_lock(LOCK_REMOCAO_CATEGORIAS), DELETE FROM categorias WHERE id = $1 AND versao = $2 AND (SELECT count(*) FROM categorias) > 1 RETURNING id ])`**; 0 linhas ⇒ leitura posterior para devolver `ausente` / `versao_diferente` / `ultima`; `23503` ⇒ `contarProdutosDaCategoria` e `{ tipo: "tem_produtos", quantidade }`; nenhum outro caminho de `DELETE` em `categorias` (FR-020).
- [ ] T047 [tech-lead] Em `src/lib/db/categorias.ts`: `contarProdutosDaCategoria(db, categoriaId)` (H3-A, contrato §5): um único statement `SELECT count(*)::int FROM produtos WHERE categoria_id = $1` (SQL cru). Só é chamada após `23503`, que já implica a existência de `produtos`; erro aqui propaga e vira `falha_geral` na tradução. Comentário: a 003 troca o SQL cru pela referência ao schema Drizzle de `produtos`.
- [ ] T048 [tech-lead] Em `src/lib/categorias/actions.ts`: `removerCategoria({ id, versao })` com `requireAdminAction()` primeiro, Zod, `dbDoContexto()`, tradução por `erros.ts`, retorno tipado; a confirmação é da UI (tela própria, SF5).

### Fechamento SF4

- [ ] T049 [junior] `npm run check` + `npm run test:int` (output real), incluindo T043 repetido.

**Commit sugerido (SF4)**: `feat(categorias): adiciona remoção com bloqueio por produtos e mínimo de uma categoria`

---

## SF5 — Telas do painel (US1–US4, UI; H7-A: uma tarefa por tela)

**Objetivo**: quatro telas no celular, uma tarefa por tela (constitution V, FR-018):

| Rota | Tarefa |
|------|--------|
| `/painel/categorias` | lista; botão "Nova categoria"; em cada linha, "Renomear" e "Remover" |
| `/painel/categorias/nova` | formulário de criação |
| `/painel/categorias/[id]/renomear` | formulário de renomeação (nome atual preenchido; `versao` oculta) |
| `/painel/categorias/[id]/remover` | confirmação com texto claro; "Remover" e "Cancelar" |

`ui-dev` só consome o contrato existente (actions, barrel, `@/lib/categorias/painel`,
`src/components/ui/`); não importa Drizzle nem toca `src/lib/`. Se faltar campo ou action,
para e reporta ao tech-lead. Depende de SF4.

### Testes primeiro (Red)

- [ ] T050 [test-writer] Estender `src/test/conformance/painel-guard.test.ts` (ou novo arquivo irmão) para exigir `requireAdminPage(<rota>)` em cada uma das quatro páginas de `src/app/painel/(protegido)/categorias/**/page.tsx` e `requireAdminAction()` como **primeiro** statement de cada action de `src/lib/categorias/actions.ts` (nega por padrão; FR-016, SC-004). Validação do argumento por **prefixo da rota**: string literal igual à rota estática (`"/painel/categorias"`, `"/painel/categorias/nova"`); nas rotas dinâmicas, template literal cujo trecho estático inicial é `/painel/categorias/` e cujo trecho final é `/renomear` ou `/remover`, conforme a pasta da página.
- [ ] T051 [P] [test-writer] Testes de componente **obrigatórios**, cada arquivo começando com `// @vitest-environment jsdom` (ambiente já usado em `src/app/painel/(protegido)/*.test.tsx`), em `src/app/painel/(protegido)/categorias/`: lista renderiza uma linha por categoria na ordem recebida, com links "Renomear"/"Remover" e "Nova categoria" (US1-1/2); formulários de criar e renomear mostram a `mensagem` da action junto ao campo e **preservam o texto digitado** (US2-8, US3-4/7, FR-017); tela de remoção exibe o nome e o aviso de que não pode ser desfeita, "Cancelar" não chama a action e "Remover" chama com `{ id, versao }` (US4-1/2, FR-010); mensagem `tem_produtos`/`ultima` exibida junto à ação (US4-4/5); botões e campos com classes de alvo ≥ 48px e texto ≥ 16px (FR-018). Sem cláusula de escape: critério sem teste bloqueia a SF5 (constitution I).
- [ ] T052 [test-writer] Confirmar Red de T050 e T051.

### Implementação

- [ ] T053 [ui-dev] Criar `src/app/painel/(protegido)/categorias/page.tsx` (Server Component; `requireAdminPage("/painel/categorias")`; lê `listarCategoriasDoPainel()`; uma linha por categoria com links para renomear/remover; botão "Nova categoria"; texto ≥ 16px, alvos ≥ 48px).
- [ ] T054 [ui-dev] Criar `src/app/painel/(protegido)/categorias/nova/page.tsx` (`requireAdminPage("/painel/categorias/nova")`) + formulário de cliente mínimo: chama `criarCategoria`; erro exibido com `mensagem` junto ao campo, texto preservado; sucesso volta para a lista.
- [ ] T055 [ui-dev] Criar `src/app/painel/(protegido)/categorias/[id]/renomear/page.tsx` + formulário: `requireAdminPage` com a rota da página (`` `/painel/categorias/${id}/renomear` ``); `obterCategoriaDoPainel(id)` com o `[id]` da URL em string (`null` ⇒ mensagem `nao_existe`, "Esta categoria não existe mais. Atualize a lista." com link para a lista); chama `renomearCategoria({ id, versao, nome })`; erro junto ao campo, texto preservado; sucesso volta para a lista.
- [ ] T056 [ui-dev] Criar `src/app/painel/(protegido)/categorias/[id]/remover/page.tsx` + componente de confirmação, alinhado a T055: `requireAdminPage` com a rota da página (`` `/painel/categorias/${id}/remover` ``); `obterCategoriaDoPainel(id)` com o `[id]` da URL em string para obter `nome` e `versao` (`null` ⇒ mensagem `nao_existe`, "Esta categoria não existe mais. Atualize a lista.", com link para a lista, sem botão "Remover"); chama `removerCategoria({ id, versao })`; texto claro com o nome e "não pode ser desfeita"; botões "Remover" e "Cancelar" ≥ 48px usando `src/components/ui/button.tsx`; "Cancelar" volta à lista sem chamar a action; recusa exibida junto à ação; sucesso volta para a lista.
- [ ] T057 [ui-dev] Adicionar link/entrada "Categorias" no layout/página do painel existente (`src/app/painel/(protegido)/`), sem alterar guards nem `src/lib/`; conferir que sem sessão todas as rotas levam a `/painel/entrar` (US1-3), sem middleware.

### Fechamento SF5

- [ ] T058 [junior] `npm run check` + `npm run test:int`; e `npm run preview` para os cenários 1–5 do quickstart no workerd (listar o que foi exercitado).

**Commit sugerido (SF5)**: `feat(painel): adiciona telas de categorias para listar, criar, renomear e remover`

---

## SF6 — Revisão de textos e validação com concorrência real (SC-002, SC-005, SC-009, FR-017)

**Objetivo**: textos pt-BR revisados, D3-B provado no proxy local em loop e no Neon dev via CI
(C1-A; a máquina local nunca acessa o Neon dev, constitution VIII). Depende de SF1–SF5
fechadas e commitadas.

**Abertura da SF6 (pré-passo, tech-lead; push e PR pelo humano)**: com SF1–SF5 fechadas, abrir
o PR para `main` **em rascunho** (draft). O primeiro run do `pull-request.yml` aplica a
migration `0000` no Neon dev e publica o `roseshop-dev`; **a partir daí a migration `0000`
está congelada** (não pode mais ser editada; correção só por migration nova). Esse primeiro
run ainda não tem o passo do probe (entra em T062); o deploy no dev sem o probe é aceito
porque o dev é o ambiente de validação, e o PR só sai de rascunho depois do probe verde (T067).

- [ ] T059 [redator] Revisar **somente texto** em `src/lib/categorias/mensagens.ts` e nos rótulos das telas (`src/app/painel/(protegido)/categorias/**`): pt-BR, sem jargão, tom claro para público com pouca familiaridade; não mudar lógica nem chaves de motivo; o redator edita **só** `mensagens.ts` e rótulos, nunca testes; se algum texto mudar, o **test-writer** atualiza os testes de texto (T027, `mensagens.test.ts`) em seguida; sugerir a mensagem do commit.
- [ ] T060 [tech-lead] Revisar o diff do redator (contrato `contracts/categorias.md` ainda coincide com os textos) e atualizar a tabela de mensagens do contrato se o texto mudou.
- [ ] T061 [tech-lead] **Concorrência real no proxy local**: rodar o probe T005 e o cenário T043 isolados e em loop (ex.: 50 execuções, `npx vitest run -c vitest.int.config.mts categorias.concorrencia-remocao`), anexar o output; zero ocorrência de lista vazia.
- [ ] T062 [tech-lead] **Probe no Neon dev via CI (C1-A)**, com o PR em rascunho já aberto (abertura da SF6): criar `vitest.probe.config.mts` que inclui **somente** `src/lib/db/batch-transacao.int.test.ts` (impede rodar testes que fazem `TRUNCATE` contra o dev); em `.github/workflows/pull-request.yml`, depois do passo `Migrations (Neon dev)` e antes do deploy, adicionar o passo `npx vitest run --config vitest.probe.config.mts` com `DATABASE_URL: ${{ secrets.DATABASE_URL }}` — o **mesmo secret** do environment `dev` que a migration e o app já usam (connection string **direta**, sem pooler); **nenhum secret novo** — com `PROBE_SLEEP_S` maior que o local (ex.: 5) e sem `NEON_FETCH_ENDPOINT`. O probe roda os casos (a), (b) com polling em `pg_locks` e prazo, e (c) `transaction_isolation = read committed` de T005; não toca em tabelas. A aplicação da migration `0000` é confirmada pelo **log do passo `Migrations (Neon dev)`** (saída do `drizzle-kit migrate` no run de abertura do PR). Falha do probe bloqueia o deploy dev: **parar e reabrir o ADR-008**. Se o app passar a usar a string pooled, o probe precisa ser repetido com ela (ADR-008, emenda). Nenhuma conexão da máquina local ao Neon dev; registrar no PR o link do run com o probe verde.
- [ ] T063 [tech-lead] Depois do run de T062 verde: repetir os cenários 1–7 do `quickstart.md` no `npm run preview` e no `dev` online publicado pelo PR em rascunho (uso pelo navegador); **verificar SC-002 manualmente** no celular (toques contados e tempo < 30 s para criar, renomear e remover) e anotar no PR; anotar no PR que **SC-007 é validação adiada**, vinculada ao SC-005 da feature 001.

### Fechamento SF6

- [ ] T064 [junior] `npm run check` + `npm run test:int` (output real).

**Commit sugerido (SF6)**: `refactor(categorias): revisa mensagens em português e valida concorrência na remoção`
(`ci: adiciona probe de transação do batch no Neon dev` à parte para T062;
`docs(spec)` à parte se a tabela de mensagens do contrato mudar).

---

## SF7 — Fechamento e documentação

**Objetivo**: `docs/`, `CLAUDE.md` e `README.md` em sincronia (critérios "Aciona": rota nova,
módulo novo em `src/`, schema/migration, CI alterado, feature fechada; constitution VI para o
README). Depende de SF6.

- [ ] T065 [doc-sync-onboarding] Sincronizar `docs/` e as seções "Comandos"/"Estrutura" do `CLAUDE.md`: `src/lib/categorias/` (barrel, `painel.ts`), `src/lib/db/categorias.ts`, `contexto.ts`, `locks.ts`, `erros-pg.ts`, `src/test/db/`, migration `0000`, rotas `/painel/categorias` (lista, `nova`, `[id]/renomear`, `[id]/remover`), `fileParallelism: false`, `vitest.probe.config.mts`, passo `db:migrate` no `checks.yml`, passo do probe no `pull-request.yml`, fluxo `db:up → db:migrate → test:int`, ADR-008, recuperação de fixture sobrada (`db:reset`). **Resolver em `docs/operacao.md` a contradição sobre qual connection string o Worker dev usa**: deixar o documento coerente com a decisão N1 (o app, a migration e o probe usam o mesmo `DATABASE_URL` direto, sem pooler) e remover qualquer trecho que diga "pooled, a mesma que o Worker usa"; o passo do probe usa `secrets.DATABASE_URL` do environment `dev`, sem secret novo. Não editar `specs/`, código, testes nem configs. Propor a mensagem do commit (o humano commita).
- [ ] T066 [redator] Atualizar o `README.md` (constitution VI): feature de categorias no painel, lista inicial e fluxo local `db:up → db:migrate → test:int`; sem variáveis nem secrets novos (o probe de T062 reutiliza `DATABASE_URL` do environment `dev`). Propor commit próprio `docs(readme): documenta categorias e fluxo de migrations` (o humano commita).
- [ ] T067 [tech-lead] Revisão final: critérios de aceite × testes (SC-001..SC-010; SC-002 manual e SC-007 adiado anotados no PR), `npm run check` + `npm run test:int` verdes, checklist do contrato com a 003 (contrato §5: FK `ON DELETE RESTRICT`, `exigirCategoriaValida`, `contarProdutosDaCategoria` troca o SQL cru pelo schema Drizzle, 1ª task da 003 remove `criarFixtureProdutos`/`descartarFixtureProdutos` do helper `src/test/db/categorias-fixtures.ts` e o teste T042 passa a usar a tabela real), links dos runs (probe verde de T062) e anotações de T063 no PR, e **tirar o PR de rascunho** (aberto na abertura da SF6; marcar "pronto para revisão" é do humano; merge só por humano).

**Commit sugerido (SF7)**: `docs(categorias): sincroniza onboarding da feature 002` (proposto pelo doc-sync; commit do humano)
e `docs(readme): ...` (T066) em commit próprio.

---

## Dependências e paralelismo

- Ordem: SF1 → SF2 → SF3 → SF4 → SF5 → abertura do PR em rascunho → SF6 → SF7 (cada uma fecha verde e com commit antes da próxima; todas tocam o mesmo banco local e `src/lib/db/categorias.ts`).
- PR em rascunho só depois de SF1–SF5 fechadas: o primeiro run aplica a migration `0000` no Neon dev e a congela. Dentro da SF6: abertura do PR → T062 (probe no CI) → T063 (cenários no dev online); T067 tira o PR de rascunho depois do probe verde e de T063 anotado.
- O probe T005 (verde em T012) é pré-requisito da implementação da remoção (T046): se falhar, D3-B não vale e o ADR-008 é reaberto.
- Dentro das sub-fases, só são [P] os testes unitários sem banco em arquivos distintos: T018 (SF2), T026–T029 (SF3), T044 (SF4), T051 (SF5). Todo o resto compartilha arquivo (`categorias.ts`, `actions.ts`, `mensagens.ts`, `erros.ts`) ou o Postgres local.
- Dentro de uma sub-fase: testes (Red) → implementação (Green) → fechamento (`junior`).

## Cobertura (rastreabilidade)

| Requisito | Teste | Implementação |
|-----------|-------|---------------|
| FR-001 | T018 | T021, T022 |
| FR-002 | T003 | T009, T012 |
| FR-003 | T003 | T009 |
| FR-004 | T050, T051 | T039, T048, T053–T056 |
| FR-005 | T002, T031, T032 | T008, T009, T038 |
| FR-006 | T031 | T038 |
| FR-007 | T026 | T034 |
| FR-008 | T026, T002 | T034, T008 |
| FR-009 | T016, T031 | T038 |
| FR-010 | T051 | T056 |
| FR-011 | T042 | T046, T047, T048 |
| FR-012 | T004, T016, T017 | T021 |
| FR-013 | — (contrato com a 003) | T067 (checklist) |
| FR-014 | T016, T018 | T022 |
| FR-015 | T018 | T024 |
| FR-016 | T030, T044, T050 | T039, T048, T053–T056 |
| FR-017 | T027, T028, T051 | T035, T037, T059 |
| FR-018 | T051 | T053–T056 |
| FR-019 | T017, T031, T032, T043 | T038, T046 |
| FR-020 | T041, T043 (+ probe T005) | T046 |
| SC-001 | T003 | T009, T012, T013 (+ T062 no dev) |
| SC-002 | verificação manual T063 | T053–T056 |
| SC-003 | T031, T032 | T038 |
| SC-004 | T030, T044, T050 | T039, T048, T053–T056 |
| SC-005 | T027 + revisão T059 | T035 |
| SC-006 | T016, T018 | T022, T024 |
| SC-007 | validação adiada (anotada no PR, T063) | — |
| SC-008 | T003 | T009 (+ T063) |
| SC-009 | T041, T042, T043, T044 | T046, T047, T048 |
| SC-010 | T026, T004 | T034, T021 |

| Item operacional | Tasks |
|------------------|-------|
| `fileParallelism: false` no vitest de integração | T007 |
| Fixture `produtos` como tabela comum, descartada só por quem a criou | T001, T042 |
| Teste de seed lendo o bloco da migration e migrate repetido | T003 (+ T009 marcadores) |
| `generatedAlwaysAs` no `schema.ts` | T008 |
| Migration gerada normal + edição à mão; conferência do diff | T009, T010 |
| `db:migrate` antes do `test:int`, local e no `checks.yml` | T012, T013, T014 |
| Registro de chaves de lock | T011, T046 |
| Probe determinístico do batch (local e Neon dev via CI) | T005, T012, T062 |
| Concorrência real em loop | T032, T043, T061 |
| Conformidade FR-015 | T018, T024, T050 |
| Revisão pt-BR (FR-017) | T059, T060 |
| README (constitution VI) | T066 |
| Fechamento doc-sync | T065 |

## Estratégia

MVP = SF1 + SF2 + SF5 reduzida à lista (US1) seria possível, mas as histórias P1 (criar,
renomear) e P2 (remover) são curtas e compartilham as mesmas peças; a ordem acima entrega
integridade (banco → regras → UI) e mantém cada commit verde e revisável.
