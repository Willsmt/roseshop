# Tasks: Produtos do painel (feature 003)

**Branch**: `feature/003-produtos` | **Fontes**: [plan.md](./plan.md), [data-model.md](./data-model.md),
[contracts/produtos.md](./contracts/produtos.md), [quickstart.md](./quickstart.md)

## Como ler

- Cada sub-fase (SF) é **autossuficiente**: a implementação lê só a sua seção e os trechos
  de `contracts/produtos.md` (aqui "C§n") e `data-model.md` (aqui "DM: título") listados
  no topo dela. Cada seção diz também os arquivos que o plano reserva para ela.
- Formato: `- [ ] Txxx [P?] [USn…] Descrição com caminho — **dono**`. `[P]` = pode rodar em
  paralelo com a task vizinha marcada, sem arquivo em comum. Sem `[P]` = em série.
- **Donos**: `principal` = sessão principal (sonnet) · `test-writer` (sonnet) · `ui-dev`
  (sonnet) · `tech-lead` (opus, só revisa) · `redator` (haiku) · `doc-sync`
  (`doc-sync-onboarding`, sonnet) · `humano` (commit, observação).
- Testes antes da implementação (Red → Green) em cada SF. "Pronto" de cada SF = `npm run
  check` (+ `npm run test:int` quando há `*.int.test.ts`) com **output real**.
- Em toda SF que toca `src/lib/db/`, a penúltima task é a revisão do diff pelo tech-lead
  (opus) (E1). **A última task de cada SF é o commit, executado pelo humano**, com a mensagem
  pronta (header e linhas do corpo ≤ 100 caracteres, sem `Co-Authored-By`).
- Nenhuma task toca `wrangler.jsonc`, `.dev.vars*`, `src/lib/auth/`, `src/lib/r2/`,
  `src/lib/ai/`. Nenhuma task roda lock advisory novo nem `db.transaction()` (ADR-008).

## Ordem entre SFs

`SF1 → SF2` · `SF1 → SF3` (SF2 e SF3 independentes entre si) · `SF1 → SF4 → SF5 → SF6` ·
`SF3 + SF6 → SF7` · `SF7 → SF8a → SF8b → SF9`. SF3 pode rodar em paralelo a SF2/SF4,
mas cada SF tem commit próprio, então na prática o humano as commita em série.

---

## SF1 — Tabelas `produtos`/`produto_fotos`, FK `restrict` e troca na 002

**Usa**: DM: Diagrama; DM: Tabela `produtos`; DM: Tabela `produto_fotos`; DM: Invariantes;
DM: Mudanças em código existente (feature 002); DM: Migration `0001`. C§2 (só o parágrafo
final: `contarProdutosDaCategoria`). Plan: linha SF1.
**Arquivos**: `src/lib/db/schema.ts`, `src/lib/db/migrations/0001_*.sql`,
`src/lib/db/categorias.ts`, `src/test/db/categorias-fixtures.ts`,
`src/test/db/produtos-fixtures.ts`, `src/lib/db/categorias.produtos-fixture.int.test.ts`
(renomear para `categorias.produtos.int.test.ts`), `src/lib/db/produtos.schema.int.test.ts`.
**Fecha**: US7-AC1–3 (FK ⇒ `23001`), SC-005 (órfão), invariantes de banco.

- [ ] T001 [US7] **Primeira task** — troca do SQL cru pelo schema, tudo no mesmo passo:
  (a) em `src/lib/db/schema.ts` declarar `produtos` e `produtoFotos` exatamente como o DM:
  `id` `integer` PK `GENERATED ALWAYS AS IDENTITY`; `categoria_id` `integer NOT NULL
  REFERENCES categorias(id) ON DELETE RESTRICT` (`onDelete: "restrict"` explícito, o default
  do Drizzle é `no action`) + índice `produtos_categoria_id_idx`; `nome` `text NOT NULL` com
  checks `produtos_nome_tamanho` (`char_length BETWEEN 3 AND 80`), `produtos_nome_sem_pontas`
  (`= btrim`), `produtos_nome_sem_espacos_duplos` (`!~ '\s{2,}'`); `chave` `text`
  `GENERATED ALWAYS AS (categoria_chave(nome)) STORED NOT NULL` com constraint
  `produtos_chave_unique`; `descricao` `text` NULL ou `char_length <= 1000`
  (`produtos_descricao_tamanho`); `preco_centavos` `integer` NULL ou `BETWEEN 1 AND 9999999`
  (`produtos_preco_faixa`); `a_partir_de` `boolean NOT NULL DEFAULT false` com
  `produtos_a_partir_de_com_preco`: `NOT a_partir_de OR preco_centavos IS NOT NULL`;
  `esgotado` `boolean NOT NULL DEFAULT false`; `destaque_vaga` `smallint` NULL com
  `produtos_destaque_vaga_faixa` (`BETWEEN 1 AND 8`), índice único parcial
  `produtos_destaque_vaga_unique ON (destaque_vaga) WHERE destaque_vaga IS NOT NULL` e
  `produtos_destaque_disponivel`: `NOT (esgotado AND destaque_vaga IS NOT NULL)`; `versao`
  `integer NOT NULL DEFAULT 1`; `criado_por`/`atualizado_por` `text NOT NULL`;
  `criado_em`/`atualizado_em` `timestamptz NOT NULL DEFAULT now()` (sem trigger). `produto_fotos`:
  `id` identity PK; `produto_id` `integer NOT NULL REFERENCES produtos(id) ON DELETE
  CASCADE`; `posicao` `smallint NOT NULL CHECK BETWEEN 1 AND 3`, `UNIQUE (produto_id,
  posicao)`; `chave_objeto` `text NOT NULL`; `criado_em` `timestamptz NOT NULL DEFAULT now()`;
  (b) `contarProdutosDaCategoria` em `src/lib/db/categorias.ts` passa a
  `db.select({ n: count() }).from(produtos).where(eq(produtos.categoriaId, id))`, assinatura
  inalterada, um único `count(*)`; (c) em `src/test/db/categorias-fixtures.ts` remover
  `criarFixtureProdutos`, `descartarFixtureProdutos` e o estado `produtosCriadaPeloHelper`, e
  fazer `resetCategorias` limpar `produtos` antes de `categorias`; (d) `npm run
  db:generate` (migration `0001`) e conferir no SQL o `ON DELETE restrict` literal e o
  `WHERE` do índice parcial, sem editar à mão — **principal**
- [ ] T002 [US7] Criar `src/test/db/produtos-fixtures.ts` (inserção real de produtos com
  nome, categoria, autoria; limpeza) e renomear/reescrever
  `categorias.produtos-fixture.int.test.ts` → `categorias.produtos.int.test.ts` para inserir
  produtos reais (US7-AC2/AC3: `remover` categoria ⇒ `tem_produtos` com N; cadastro
  simultâneo à remoção nunca deixa produto órfão) — **test-writer**
- [ ] T003 [US7] `src/lib/db/produtos.schema.int.test.ts`, uma prova por linha de "Invariantes":
  `DELETE` de categoria com produto ⇒ `23001`; `UPDATE` de `id` recusado (identity
  `ALWAYS`); `UNIQUE(chave)` para nomes equivalentes ⇒ `23505`; cada `CHECK` de nome,
  descrição, preço (0 e 10000000 falham) e `a_partir_de` sem preço ⇒ `23514`; vaga 9 ⇒
  `23514`, vaga repetida ⇒ `23505`; esgotado com vaga ⇒ `23514`; foto na posição 4 ⇒
  `23514`, posição repetida no mesmo produto ⇒ `23505`; remover produto apaga as fotos
  (CASCADE) — **test-writer**
- [ ] T004 Subir `db:up`, `db:reset` se houver sobra da fixture antiga, `db:migrate`, rodar
  `npm run check` e `npm run test:int`; colar o output real; conferir que `npx drizzle-kit
  generate` responde "No schema changes" e que os testes da 002 seguem verdes — **principal**
- [ ] T005 Revisão do diff pelo tech-lead (opus): `schema.ts`, migration `0001`,
  `categorias.ts`, fixtures; checar `RESTRICT` literal, índice parcial, coluna gerada,
  ausência de lock/transação — **tech-lead**
- [ ] T006 Commit (humano), mensagem:
  ```text
  feat(db): cria tabela produtos com FK restrict para categorias

  Declara produtos e produto_fotos no schema (migration 0001) com checks,
  UNIQUE sobre a chave do nome, vagas de destaque 1-8 e FK ON DELETE RESTRICT.
  contarProdutosDaCategoria passa a usar o schema; a fixture de produtos da 002
  sai de src/test/db e o teste usa a tabela real.
  ```
  — **humano**

---

## SF2 — Prova da FK no Neon dev (probe do CI)

**Usa**: DM: Invariantes (linha "Categoria com produtos não é removida"); DM: Tabela
`produtos` (`categoria_id`). Quickstart §2. Plan: linha SF2 (D9: batch revertido pelo
próprio `23001`). Sem seções do contrato.
**Arquivos**: probe novo em `src/lib/db/` (ao lado do probe do `db.batch` da 002, mesmo
padrão de nome), `vitest.probe.config.mts`.
**Fecha**: US7 no Neon dev, sem resíduo.

- [ ] T007 [US7] Teste do probe: dentro de um único `db.batch` no driver HTTP do Neon,
  inserir categoria e produto e depois `DELETE` da categoria; o batch deve falhar com
  `23001` (via `codigoSqlstate` de `src/lib/db/erros-pg.ts`) e **reverter tudo**, sem criar
  linhas fora do batch (D9). Seguir o padrão do probe do `db.batch` da 002 — **test-writer**
- [ ] T008 Incluir o arquivo do probe, **por caminho literal**, no `include` de
  `vitest.probe.config.mts` — **principal**
- [ ] T009 Rodar o probe contra o banco local (`vitest run --config vitest.probe.config.mts`
  com o proxy Neon do `db:up`) e `npm run check`; output real. O log do CI do PR e a
  contagem `SELECT count(*) FROM produtos` no Neon dev (igual à de antes) são conferidos no
  PR (registrar na T058) — **principal**
- [ ] T010 Revisão do diff pelo tech-lead (opus) — **tech-lead**
- [ ] T011 Commit (humano), mensagem:
  ```text
  test(db): prova a FK restrict de produtos no Neon dev

  Probe do CI do PR: batch que tenta apagar categoria com produto falha com 23001
  e reverte tudo, sem deixar resíduo no Neon dev.
  ```
  — **humano**

---

## SF3 — Domínio: validação, preço, código, mensagens e `normalizarNome`

**Usa**: C§1 (parágrafo "Mudança no contrato da 002 (D5)"); C§3 (parágrafo
`validarCamposProduto`, tipo `Falha`, `Motivo`); C§4 (formato do preço e do código em
`ItemLista`/`DetalheProduto`; regra de busca por código); C§6 (tabela de motivos/mensagens
e avisos de sucesso). DM: Tabela `produtos` (colunas `nome`, `descricao`, `preco_centavos`,
`a_partir_de`). Plan: linha SF3 e decisões D5, D8, D10.
**Arquivos**: `src/lib/categorias/index.ts`, `src/test/conformance/categorias-acesso.test.ts`,
`specs/002-categorias/contracts/categorias.md` (§1), `src/lib/produtos/{validacao,preco,
codigo,erros,mensagens}.ts` + `*.test.ts`.
**Fecha**: FR-003/006/009/010, D8, D10, edge cases de entrada; US1-AC2/3/5/6.

- [ ] T012 [P] [US1] Testes unitários `src/lib/produtos/preco.test.ts` (D8): aceitos "12",
  "12,90", "12.90", "R$ 12,90", "1.290,00" (⇒ centavos inteiros); recusados "1.290"
  (`preco_ambiguo`), "0", negativo, texto, acima de 9999999 centavos (`preco_invalido`);
  formatação `R$ 12,90` e "a partir de R$ 12,90" — **test-writer**
- [ ] T013 [P] [US1] Testes unitários `src/lib/produtos/codigo.test.ts`: `#0042` a partir
  de 42 (`lpad(id, 4, '0')`, acima de 9999 sem truncar); interpretação da busca por código
  "42", "0042", "#0042" (`^#?\d{1,9}$`), nome comum não é código — **test-writer**
- [ ] T014 [P] [US1] Testes unitários `src/lib/produtos/validacao.test.ts`
  (`validarCamposProduto`): nome vazio / 3 a 80 / só símbolos (`nome_vazio`, `nome_tamanho`,
  `nome_invalido`), espaços das pontas e duplos normalizados via `normalizarNome`;
  `categoria_obrigatoria`; descrição até 1000 (`descricao_tamanho`) e vazia ⇒ `null`;
  `a_partir_de_sem_preco`; `id`/`versao` válidos e inválidos (`falha_geral`); várias falhas
  juntas em `falhas[]` com `campo` — **test-writer**
- [ ] T015 [P] Testes unitários `src/lib/produtos/mensagens.test.ts` (uma entrada por motivo
  de C§6, texto simples, sem jargão; `nome_repetido` carrega `codigoExistente`) e
  `src/lib/produtos/erros.test.ts` (tradução dos resultados de C§2 para `Falha`: `ausente` ⇒
  `nao_existe`, `versao_diferente` ⇒ `alterado`, `limite` ⇒ `limite_destaques`,
  `vaga_disputada`, `esgotado` ⇒ `esgotado_nao_destaca`, `categoria_ausente` ⇒
  `categoria_invalida`, `nome_repetido`) — **test-writer**
- [ ] T016 Atualizar `src/test/conformance/categorias-acesso.test.ts` (allowlist
  `EXPORTS_PERMITIDOS` inclui `normalizarNome`) — teste vermelho até o barrel mudar —
  **test-writer**
- [ ] T017 Exportar `normalizarNome(nome: string): string` (NFC + trim + colapso de
  espaços) em `src/lib/categorias/index.ts` (nada movido de arquivo) e atualizar o §1 de
  `specs/002-categorias/contracts/categorias.md` (única edição de `specs/` desta tarefa,
  prevista no plano) — **principal**
- [ ] T018 [P] Implementar `src/lib/produtos/preco.ts` e `src/lib/produtos/codigo.ts` até
  T012/T013 ficarem verdes — **principal**
- [ ] T019 [P] Implementar `src/lib/produtos/mensagens.ts` e `src/lib/produtos/erros.ts` até
  T015 ficar verde (tipos `Motivo`, `Falha` de C§3) — **principal**
- [ ] T020 Implementar `src/lib/produtos/validacao.ts` (server-only por importar o
  barrel; Zod 4; `validarCamposProduto` ⇒ `{ ok: true; campos: CamposProduto } | { ok:
  false; falhas: Falha[] }`; schemas de `idProduto`/`versaoProduto`) até T014 ficar verde —
  **principal**
- [ ] T021 `npm run check` com output real; `categorias-acesso` e testes da 002 verdes —
  **principal**
- [ ] T022 Commit (humano), mensagem:
  ```text
  feat(produtos): valida campos, preço e código de referência

  Exporta normalizarNome no barrel de categorias e cria o domínio de produtos:
  validação de nome, descrição, categoria e "a partir de", entrada de preço em
  centavos, código #0042, motivos de falha e mensagens em português simples.
  ```
  — **humano**

---

## SF4 — SQL de escrita: `inserir`, `editar`, `remover`

**Usa**: C§2 (tipos `ProdutoDb`, `CamposProduto`, resultados; funções `inserir`, `editar`,
`remover`; tabela de garantias; regra "leitura depois de 0 linhas só escolhe a mensagem");
DM: Tabela `produtos` (todas as colunas e regras); DM: Invariantes; DM: Transições de estado
(remover). Plan: linha SF4.
**Arquivos**: `src/lib/db/produtos.ts` (novo), `src/lib/db/produtos.escrita.int.test.ts`,
`src/lib/db/produtos.concorrencia.int.test.ts`.
**Fecha**: US1-AC1/4/7/8, US4-AC1–5, US6-AC3–6, SC-005 (nome e código).

- [ ] T023 [US1] [US4] [US6] `src/lib/db/produtos.escrita.int.test.ts`: `inserir` ⇒ `{ tipo:
  "ok", id }` com `versao = 1`, `criado_por = atualizado_por = sessao.email`; nome
  equivalente ⇒ `nome_repetido` com `codigoExistente`; categoria inexistente ⇒
  `categoria_ausente` (`23503`); `editar` incrementa `versao`, grava `atualizado_por` e
  `atualizado_em`, `a_partir_de` forçado a `false` com preço `NULL`, `versao_diferente`,
  `ausente`, `nome_repetido`, `categoria_ausente`; `remover` ⇒ `removido`, `ausente`,
  `versao_diferente`, fotos em cascata, `remover` não grava autoria — **test-writer**
- [ ] T024 [US1] `src/lib/db/produtos.concorrencia.int.test.ts` (rodando em série como o
  resto): duas inserções simultâneas de nome equivalente ⇒ 1 `ok` + 1 `nome_repetido` com o
  código do outro; N cadastros simultâneos ⇒ códigos distintos; código de produto removido
  não volta; dois `editar`/`remover` com a mesma `versao` ⇒ 1 aceito, 1 `versao_diferente`,
  nada sobrescrito — **test-writer**
- [ ] T025 Implementar em `src/lib/db/produtos.ts` os tipos `ProdutoDb`, `CamposProduto`,
  `NomeRepetido`, `CategoriaAusente`, `Ausente`, `VersaoDiferente` e as funções `inserir`,
  `editar`, `remover` de C§2: cada uma **um único statement** (`INSERT ... RETURNING id` com
  `23505` ⇒ busca do `id` por `chave = categoria_chave($nome)`; `UPDATE ... SET campos,
  versao+1, atualizado_por, atualizado_em WHERE id AND versao`; `DELETE ... WHERE id AND
  versao RETURNING id`); 0 linhas ⇒ leitura só para escolher `ausente` × `versao_diferente`;
  SQLSTATE só por `codigoSqlstate`; erro inesperado propaga; sem lock advisory nem
  `db.transaction()` — **principal**
- [ ] T026 `npm run check` e `npm run test:int` com output real; testes de SF1 seguem
  verdes — **principal**
- [ ] T027 Revisão do diff pelo tech-lead (opus): SQL de `produtos.ts`, ausência de "lê e
  depois grava", tradução de `23505`/`23503` — **tech-lead**
- [ ] T028 Commit (humano), mensagem:
  ```text
  feat(db): grava, edita e remove produtos com concorrência otimista

  inserir, editar e remover em um statement cada; versão estrita no WHERE,
  nome repetido devolve o código existente e categoria ausente vira resultado.
  Testes de integração cobrem nome e código simultâneos.
  ```
  — **humano**

---

## SF5 — SQL de status e destaque (teto de 8)

**Usa**: C§2 (funções `esgotar`, `disponibilizar`, `destacar`, `tirarDoDestaque`; tabela de
garantias; regra "leitura depois de 0 linhas"); DM: Tabela `produtos` (`esgotado`,
`destaque_vaga` e seus checks/índice); DM: Invariantes; DM: Transições de estado. Plan:
linha SF5 e D1 (sem retry, sem lock). Quickstart §1 (linhas "Esgotar em destaque", "7
destaques + 2 simultâneos", "Teto pelo banco").
**Arquivos**: `src/lib/db/produtos.ts`, `src/lib/db/produtos.destaque.int.test.ts`.
**Fecha**: US2-AC1–3/5/6, US5-AC1–6, SC-005 (teto).

- [ ] T029 [US2] [US5] `src/lib/db/produtos.destaque.int.test.ts`: `esgotar` ⇒ `esgotado =
  true`, `destaque_vaga = NULL` na mesma linha, `saiuDoDestaque` verdadeiro só se estava em
  destaque; `disponibilizar` não recoloca no destaque (FR-017); `destacar` usa a **menor
  vaga livre** de 1..8 e reaproveita vaga liberada; `destacar` esgotado ⇒ `esgotado`; com 8
  em destaque ⇒ `limite`; já em destaque ⇒ não duplica; `tirarDoDestaque` zera a vaga;
  todas incrementam `versao`/`atualizado_por`/`atualizado_em`; `ausente` e
  `versao_diferente`; **7 destaques + 2 `destacar` simultâneos ⇒ exatamente 1 `ok`, o outro
  `vaga_disputada`, total 8**; duas ações com a mesma `versao` ⇒ 1 aceita — **test-writer**
- [ ] T030 [US2] [US5] Implementar em `src/lib/db/produtos.ts`: `esgotar` (CTE `antes` +
  `UPDATE ... SET esgotado = true, destaque_vaga = NULL, versao+1 ... RETURNING (SELECT
  estava FROM antes)`), `disponibilizar` (não toca `destaque_vaga`), `destacar` (`UPDATE ...
  SET destaque_vaga = livre.vaga ... FROM (menor vaga livre de 1..8) livre WHERE id AND
  versao AND NOT esgotado AND destaque_vaga IS NULL AND livre.vaga IS NOT NULL`; `23505` ⇒
  `vaga_disputada`, **sem retry**; 0 linhas ⇒ leitura escolhe `ausente`/`versao_diferente`/
  `esgotado`/`limite`), `tirarDoDestaque` — todas statement único, sem lock — **principal**
- [ ] T031 `npm run check` e `npm run test:int` com output real — **principal**
- [ ] T032 Revisão do diff pelo tech-lead (opus): corretude do `UPDATE ... FROM` da vaga
  livre e do `vaga_disputada` sob concorrência — **tech-lead**
- [ ] T033 Commit (humano), mensagem:
  ```text
  feat(db): troca status e destaque de produtos com teto de 8

  esgotar tira do destaque no mesmo UPDATE; destacar usa a menor vaga livre de
  1 a 8 e, em colisão, devolve vaga_disputada sem retry. Teto garantido pelo
  banco (CHECK e índice único parcial), sem lock advisory.
  ```
  — **humano**

---

## SF6 — Leitura: `obterPorId`, `listar`, `painel.ts`

**Usa**: C§2 (tipo `ProdutoDb`, funções `obterPorId`, `listar`, linha `listar` da tabela
de garantias); C§4 inteiro (`FiltroLista`, `listarProdutosDoPainel`, `obterProdutoDoPainel`,
`ItemLista`, `DetalheProduto`, regras de URL/cursor/busca); C§1 (fronteiras: `painel.ts` é
server-only, SQL só em `db/produtos.ts`); DM: Tabela `produtos` (índices, `chave`). Plan:
linha SF6, D3. Quickstart §4 (SC-007).
**Arquivos**: `src/lib/db/produtos.ts`, `src/lib/produtos/painel.ts`,
`src/lib/db/produtos.leitura.int.test.ts`, `src/lib/produtos/painel.test.ts`.
**Fecha**: US3-AC1–6, SC-007 (nível de banco), FR de `voltar` sem redirecionamento aberto.

- [ ] T034 [US3] `src/lib/db/produtos.leitura.int.test.ts`: `obterPorId` com `categoriaNome`
  (JOIN) e `null` para inexistente; `listar` ordena por `id DESC`, devolve 20 + `haMais`
  (consulta `LIMIT 21`); keyset `antes` não repete nem pula item **com cadastro e remoção no
  meio da paginação**; filtro por categoria e por situação (disponível/esgotado); busca por
  nome via `strpos(chave, categoria_chave($busca)) > 0` ("meia-soquete" encontra "Meia
  soquete"), busca por código "42"/"0042"/"#0042", busca normalizada vazia ⇒ sem filtro;
  combinação de filtros — **test-writer**
- [ ] T035 [US3] `src/lib/produtos/painel.test.ts` (unitário, `db` mockado): schema Zod
  único `filtroLista` — valor inválido ignorado (lista sem aquele filtro), nunca erro;
  `verMais` mantém os mesmos filtros com `antes` = último id; `voltarAoComeco` só quando há
  `antes`; `ItemLista.href` carrega `?voltar=` com a query atual; `obterProdutoDoPainel`:
  id inválido/inexistente ⇒ `null`, `fotos: []`, `podeDestacar` (= não esgotado e fora do
  destaque), `voltarHref` = `/painel/produtos` + `voltar` revalidado (caminho fixo; `voltar`
  com URL absoluta, `//host` ou outro caminho ⇒ lista sem filtro) — **test-writer**
- [ ] T036 [US3] Implementar `obterPorId` e `listar` (tipo `FiltroDb`) em
  `src/lib/db/produtos.ts` até T034 ficar verde — **principal**
- [ ] T037 [US3] Implementar `src/lib/produtos/painel.ts` (server-only;
  `listarProdutosDoPainel`, `obterProdutoDoPainel`, `filtroLista`; usa `preco.ts`/`codigo.ts`
  da SF3 e `listarCategorias` pelo barrel) até T035 ficar verde — **principal**
- [ ] T038 [US3] Medição local com 500 produtos: script de teste em `src/test/db/` (não vai
  para produção, só stack local, ADR-006) que popula 500 produtos; medir `listar` (página,
  próxima página, filtro, busca) e registrar tempos (meta < 2 s; a medição no `preview` fica
  na SF9) — **principal**
- [ ] T039 `npm run check` e `npm run test:int` com output real — **principal**
- [ ] T040 Revisão do diff pelo tech-lead (opus): SQL de `listar`/`obterPorId`, índices
  usados, sem N+1 — **tech-lead**
- [ ] T041 Commit (humano), mensagem:
  ```text
  feat(produtos): lista, filtra e busca produtos no painel

  Leitura paginada por cursor (código decrescente, 20 por página) com filtros
  de categoria e situação e busca por código ou nome. O filtro da URL é validado
  por um schema único e o link de volta não aceita redirecionamento aberto.
  ```
  — **humano**

---

## SF7 — Server Actions e conformidade `produtos-acesso`

**Usa**: C§3 inteiro (ordem fixa, `ResultadoAction`, `Falha`, assinaturas das 7 actions,
tabela de entradas, "a action nunca redireciona em erro"); C§1 (regras 1–5 de conformidade);
C§6 (motivos e avisos de sucesso); C§2 (assinaturas e resultados consumidos). Plan: linha
SF7.
**Arquivos**: `src/lib/produtos/actions.ts` (`"use server"`),
`src/lib/produtos/actions.test.ts`, `src/test/conformance/produtos-acesso.test.ts`.
**Fecha**: US1 (action), US2-AC4, sessão expirada (quickstart §3 passo 10).

- [ ] T042 [P] [US1] [US2] `src/lib/produtos/actions.test.ts` (`db`, guard, `revalidatePath`
  e barrel mockados): para cada uma das 7 actions (`criarProduto`, `editarProduto`,
  `marcarEsgotado`, `marcarDisponivel`, `destacarProduto`, `tirarProdutoDoDestaque`,
  `removerProduto`): `requireAdminAction()` é chamado **antes de tudo** e sem sessão
  `UnauthorizedError` propaga sem tocar no banco; Zod antes de qualquer SQL (entrada
  inválida ⇒ `falha_geral`/falhas por `campo`, sem chamar `db`); `exigirCategoriaValida`
  antes de `inserir`/`editar`; tradução de cada resultado de C§2 para `ResultadoAction`;
  `marcarEsgotado` devolve `saiuDoDestaque` (US2-AC4: aviso "...e saiu do destaque");
  sucesso chama `revalidatePath` da lista e do detalhe; falha nunca redireciona e devolve o
  que permite preservar o digitado — **test-writer**
- [ ] T043 [P] `src/test/conformance/produtos-acesso.test.ts` (AST, nega por padrão, mesmo
  estilo de `categorias-acesso.test.ts`): regra 1 `@/lib/db/produtos` só em `src/lib/produtos/`
  e `src/lib/db/`; regra 2 bindings `produtos`/`produtoFotos` do schema só nesses dois
  diretórios; regra 3 `@/lib/produtos/actions` só em `src/app/painel/` (exceção para os
  testes unitários ao lado); regra 4 `@/lib/produtos/painel` só em `src/app/painel/` e
  `src/lib/produtos/`; regra 5 `src/lib/produtos/` acessa categorias só por `@/lib/categorias`
  — **test-writer**
- [ ] T044 [US1] [US2] Implementar `src/lib/produtos/actions.ts` (`"use server"`) até T042 e
  T043 ficarem verdes, usando `validacao.ts`, `erros.ts`, `mensagens.ts`, `db/produtos.ts`
  e `requireAdminAction` (barrel de auth) — **principal**
- [ ] T045 `npm run check` com output real (inclui `categorias-acesso`, `painel-guard`,
  `produtos-acesso`) — **principal**
- [ ] T046 Commit (humano), mensagem:
  ```text
  feat(produtos): server actions do painel de produtos

  Sete actions (criar, editar, esgotar, disponibilizar, destacar, tirar do
  destaque e remover): guard primeiro, Zod antes do SQL, resultados traduzidos
  para mensagens. Conformidade produtos-acesso nega imports fora das fronteiras.
  ```
  — **humano**

---

## SF8a — Primitivos de formulário em `src/components/ui/`

**Usa**: C§5 — subseção "Primitivos de formulário (E2)" (tabela de props e regras de
`CampoTexto`, `AreaTexto`, `Selecao`, `CaixaMarcacao`, `MensagemCampo`, `Aviso`); C§1
(`src/components/ui/` é a única fonte de primitivos). Plan: linha SF8a, E2 (estilo mínimo;
ADR-005 reestiliza depois). Constitution V (alvo ≥ 48 px, texto ≥ 16 px).
**Arquivos**: `src/components/ui/{campo-texto,area-texto,selecao,caixa-marcacao,
mensagem-campo,aviso}.tsx` e um `*.test.tsx` ao lado de cada um.
**Fecha**: base de US1/US4 na UI.

- [ ] T047 Testes de componente (Testing Library/jsdom) para os 6 primitivos, um arquivo
  cada: rótulo visível ligado ao controle (`htmlFor`/`id`); com `erro`, `aria-invalid` e
  `aria-describedby` apontando para `MensagemCampo`; `defaultValue`/`defaultChecked`
  preservados; `Selecao` nativa (`<select>`) com `vazio?` como opção inicial; `CaixaMarcacao`
  com a área de toque incluindo o rótulo; `Aviso` com `role="status"` (sucesso) e
  `role="alert"` (erro); classes de alvo ≥ 48 px e texto ≥ 16 px — **test-writer**
- [ ] T048 Implementar os 6 primitivos em `src/components/ui/` até T047 ficar verde, com as
  props de C§5 (`CampoTexto`: `name`, `rotulo`, `defaultValue`, `erro?`, `inputMode?`,
  `maxLength?`; `AreaTexto`: igual + `linhas?`; `Selecao`: `name`, `rotulo`, `opcoes`,
  `defaultValue`, `erro?`, `vazio?`; `CaixaMarcacao`: `name`, `rotulo`, `defaultChecked`,
  `erro?`; `MensagemCampo`: `id`, `children`; `Aviso`: `tipo`, `children`), seguindo o estilo
  do `button.tsx` existente — **ui-dev**
- [ ] T049 `npm run check` com output real — **principal**
- [ ] T050 Commit (humano), mensagem:
  ```text
  feat(ui): primitivos de formulário

  Cria CampoTexto, AreaTexto, Selecao, CaixaMarcacao, MensagemCampo e Aviso em
  src/components/ui com rótulo ligado, erro acessível e alvos de 48 px.
  ```
  — **humano**

---

## SF8b — Telas de produtos no painel

**Usa**: C§5 inteiro (tabela de rotas, ações e textos de cada tela; primitivos); C§4
(`ItemLista`, `DetalheProduto`, `verMais`, `voltarAoComeco`, `voltarHref`, `podeDestacar`);
C§3 (assinaturas das actions e `ResultadoAction`/`Falha`); C§6 (mensagens e avisos de
sucesso); DM: Transições de estado (quais botões em cada estado). Plan: linha SF8b.
Quickstart §3 (roteiro). A UI só consome o contrato: não cria action, não importa Drizzle,
não toca `src/lib/` (se faltar campo ou action: parar e reportar).
**Arquivos**: `src/app/painel/(protegido)/produtos/{page.tsx, novo/page.tsx,
form-produto.tsx, [id]/page.tsx, [id]/editar/page.tsx, [id]/remover/page.tsx}`, entrada do
painel apontando para produtos (home de `src/app/painel/(protegido)/page.tsx`), testes ao
lado.
**Fecha**: US1, US2, US3, US4, US5, US6 na UI; SC-008.

- [ ] T051 [US1] [US3] [US6] Testes de componente das telas, a partir de C§5: lista
  (itens com código, nome, categoria, "Esgotado", "Em destaque", preço ou "Sem preço";
  marcador "sem foto"; "Ver mais produtos" e "Voltar ao começo" só quando os hrefs
  existem; vazio com convite "Novo produto"; "nada encontrado" com "Limpar filtros");
  detalhe ("Produto não encontrado" com volta à lista para inexistente; "Voltar à lista"
  usa `voltarHref`; **"Destacar" oculto para esgotado** (`podeDestacar`); "Tirar do
  destaque" quando em destaque; aviso `vaga_disputada`; aviso "...e saiu do destaque");
  formulário novo/editar (**preservação do digitado** em qualquer falha, mensagem junto do
  campo, `nome_repetido` com o código como link para o detalhe, campos ocultos `id`/`versao`
  na edição, mensagem de `alterado`); remover (confirmação exata "O produto #0042 Meia
  soquete listrada será apagado de vez e não poderá ser recuperado"; sucesso ⇒ lista com
  "Produto removido.") — **test-writer**
- [ ] T052 [US1] [US4] Implementar `form-produto.tsx` (client; `useActionState` com
  `criarProduto`/`editarProduto`, usando os primitivos da SF8a), `novo/page.tsx` e
  `[id]/editar/page.tsx` — **ui-dev**
- [ ] T053 [US3] Implementar `page.tsx` da lista (Server Component; filtros de
  categoria e situação, busca, `listarProdutosDoPainel(searchParams)`, "Ver mais produtos",
  "Voltar ao começo", estados vazio/nada encontrado) — **ui-dev**
- [ ] T054 [US2] [US5] [US6] Implementar `[id]/page.tsx` (detalhe "como a cliente veria" +
  ações de esgotar/disponibilizar/destacar/tirar do destaque, autoria, "Voltar à lista") e
  `[id]/remover/page.tsx` (confirmação com código e nome) — **ui-dev**
- [ ] T055 Apontar a entrada do painel para `/painel/produtos` em
  `src/app/painel/(protegido)/page.tsx` (ao lado do link de categorias) — **ui-dev**
- [ ] T056 `npm run check` com output real; `painel-guard` verde (as 5 rotas novas herdam o
  guard do layout `(protegido)`); sem import proibido (`produtos-acesso`) — **principal**
- [ ] T057 Commit (humano), mensagem:
  ```text
  feat(painel): telas de produtos

  Lista com filtros, busca e "Ver mais", cadastro, detalhe com esgotar e
  destaque, edição e remoção com confirmação. Formulários preservam o digitado
  e mostram o erro junto do campo.
  ```
  — **humano**

---

## SF9 — Fechamento: preview, mensagens, observação, README e docs

**Usa**: Quickstart inteiro (§1 gate, §2 Neon dev, §3 roteiro do preview, §4 desempenho,
§5 observação); C§6 (mensagens, para a revisão SC-008); Plan: linha SF9 e tabela de
cobertura. Sem seções novas de data-model. Regra do CLAUDE.md: agentes não commitam docs; o
humano commita README e `docs/` em commits separados.
**Arquivos**: `README.md`, `docs/` (via `doc-sync-onboarding`), `CLAUDE.md` (seções
"Comandos"/"Estrutura"/"Estado atual", via doc-sync), registro da observação (em
`specs/003-produtos/` só se o humano pedir; senão no PR).
**Fecha**: SC-001–003, SC-007, SC-008, fechamento da FXX.

- [ ] T058 Gate completo com output real: `npm run check`, `npm run test:int`, `npx
  drizzle-kit generate` ("No schema changes"); conferir no PR o log do CI com o teste da FK
  passando (`23001`), o probe do `db.batch` da 002 verde e `SELECT count(*) FROM produtos`
  no Neon dev igual ao de antes (quickstart §2) — **principal**
- [ ] T059 Rodar `npm run preview` e percorrer o roteiro do quickstart §3 (passos 1–10) em
  390 px, registrando o resultado de cada passo (passos de celular real: humano) —
  **principal**
- [ ] T060 Medição SC-007 no `preview` local com 500 produtos (script da T038): abrir a
  lista, "Ver mais produtos", filtrar e buscar, cada resposta < 2 s excluída a primeira após
  banco ocioso; registrar tempos — **principal**
- [ ] T061 Revisão das mensagens de C§6 e dos avisos de sucesso (SC-008: sem jargão,
  texto simples); ajustes de texto vão em `src/lib/produtos/mensagens.ts` e nos testes
  correspondentes, `npm run check` de novo — **redator**
- [ ] T062 Observação com a administradora no dev online, pelo celular dela (quickstart §5):
  cadastrar produto ≤ 3 min, esgotar e voltar ≤ 30 s, achar o "42" ≤ 15 s; registrar tempos
  e travas — **humano**
- [ ] T063 Atualizar `README.md` com os produtos do painel (cadastro, lista, busca,
  destaque, remoção; comandos inalterados) — **redator**
- [ ] T064 Commit do README (humano), mensagem:
  ```text
  docs(readme): documenta os produtos do painel

  Descreve cadastro, lista com filtros e busca, esgotado, destaque (até 8) e
  remoção de produtos no painel das administradoras.
  ```
  — **humano**
- [ ] T065 Acionar o `doc-sync-onboarding` (critérios do CLAUDE.md: schema/migration, rotas
  e actions novas, módulo novo em `src/`, probe no CI): sincronizar `docs/` e as seções
  "Comandos"/"Estrutura"/"Estado atual" do `CLAUDE.md`; o agente só propõe a mensagem —
  **doc-sync**
- [ ] T066 Commit dos docs (humano), mensagem:
  ```text
  docs(onboarding): sincroniza docs com a feature 003 de produtos

  Atualiza docs/ e as seções Comandos, Estrutura e Estado atual do CLAUDE.md
  com tabelas, rotas, actions e probe de produtos.
  ```
  — **humano**

---

## Cobertura (spec → SF)

| História | SFs |
|---|---|
| US1 cadastrar | SF3, SF4, SF7, SF8b |
| US2 status | SF5, SF7, SF8b |
| US3 lista | SF6, SF8b |
| US4 editar | SF4, SF8b |
| US5 destaque | SF5, SF8b |
| US6 remover | SF4, SF8b |
| US7 categoria com produtos | SF1, SF2 |
| SC-005 concorrência | SF1, SF4, SF5 |
| SC-007 desempenho | SF6, SF9 |
| SC-001–003, SC-008 | SF9 |
