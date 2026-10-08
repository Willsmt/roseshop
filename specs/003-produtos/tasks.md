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
- Em toda SF que toca `src/lib/db/`, e também na SF3 (edita o §1 do contrato da 002), a
  penúltima task é a revisão do diff pelo tech-lead (opus) (E1). **A última task de cada SF
  é o commit, executado pelo humano**, com a mensagem pronta (header e linhas do corpo ≤ 100
  caracteres, sem `Co-Authored-By`).
- IDs com sufixo (`T021a`, `T061a`) foram inseridos na correção pós-analyze de 2026-10-07,
  sem renumerar as demais tasks.
- Nenhuma task acessa o Neon dev a partir da máquina local (constitution VIII): o que é
  verificado lá, o próprio teste do CI verifica.
- Nenhuma task toca `wrangler.jsonc`, `.dev.vars*`, `src/lib/auth/`, `src/lib/r2/`,
  `src/lib/ai/`. Nenhuma task roda lock advisory novo nem `db.transaction()` (ADR-008).

## Ordem entre SFs

`SF1 → SF2` · `SF1 → SF3` (SF2 e SF3 independentes entre si) · `SF1 → SF4 → SF5 → SF6` ·
`SF3 + SF6 → SF7` · `SF1 → SF8a` (primitivos não dependem das actions) ·
`SF7 + SF8a → SF8b → SF9`. SF3 e SF8a podem rodar em paralelo a SF2/SF4, mas cada SF tem
commit próprio, então na prática o humano as commita em série.

---

## SF1 — Tabelas `produtos`/`produto_fotos`, FK `restrict` e troca na 002

**Usa**: DM: Diagrama; DM: Tabela `produtos`; DM: Tabela `produto_fotos`; DM: Invariantes;
DM: Mudanças em código existente (feature 002); DM: Migration `0001`. C§2 (só o parágrafo
final: `contarProdutosDaCategoria`). Contrato da 002 (`specs/002-categorias/contracts/
categorias.md`): §4 (`remover` ⇒ `tem_produtos` com a contagem; `23001` ⇒
`contarProdutosDaCategoria`) e §5 (checklist da primeira task). Research F17 (arquivos de
integração em série). Plan: linha SF1.
**Arquivos**: `src/lib/db/schema.ts`, `src/lib/db/migrations/0001_*.sql`,
`src/lib/db/categorias.ts`, `src/test/db/categorias-fixtures.ts`,
`src/test/db/produtos-fixtures.ts`, `src/lib/db/categorias.produtos-fixture.int.test.ts`
(renomear para `categorias.produtos.int.test.ts`), `src/lib/db/produtos.schema.int.test.ts`.
**Fecha**: US7-AC1–3 (FK ⇒ `23001`), SC-005 (órfão), invariantes de banco.

- [ ] T001 [US7] **Teste primeiro** — `src/lib/db/produtos.schema.int.test.ts`, uma prova
  por linha de "Invariantes": `DELETE` de categoria com produto ⇒ `23001`; `UPDATE` de `id` recusado (identity
  `ALWAYS`); `UNIQUE(chave)` para nomes equivalentes ⇒ `23505`; cada `CHECK` de nome,
  descrição, preço (0 e 10000000 falham) e `a_partir_de` sem preço ⇒ `23514`; vaga 9 ⇒
  `23514`, vaga repetida ⇒ `23505`; esgotado com vaga ⇒ `23514`; foto na posição 4 ⇒
  `23514`, posição repetida no mesmo produto ⇒ `23505`; remover produto apaga as fotos
  (CASCADE). Vermelho até a T002 criar as tabelas — **test-writer**
- [ ] T002 [US7] **Primeira task de implementação** (checklist do §5 da 002) — troca do SQL
  cru pelo schema, tudo no mesmo passo: (a) em `src/lib/db/schema.ts` declarar `produtos` e `produtoFotos` exatamente como o DM:
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
  `WHERE` do índice parcial, sem editar à mão; T001 fica verde — **principal**
- [ ] T003 [US7] Criar `src/test/db/produtos-fixtures.ts` (inserção real de produtos com
  nome, categoria, autoria; limpeza) e renomear/reescrever
  `categorias.produtos-fixture.int.test.ts` → `categorias.produtos.int.test.ts` para inserir
  produtos reais (US7-AC2/AC3: `remover` categoria ⇒ `tem_produtos` com N; cadastro
  simultâneo à remoção nunca deixa produto órfão). Exceção ao Red → Green registrada:
  depende da T002, que remove a fixture antiga no mesmo passo (contrato §5 da 002) —
  **test-writer**
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
próprio `23001`). Research D9 e emenda de 2026-10-07 ao ADR-008 (marcador único, limpeza
pelo marcador, sem `TRUNCATE`, só no CI do PR). Contrato da 002 §5, item 4. Sem seções do
contrato da 003.
**Arquivos**: `src/lib/db/fk-produtos.int.test.ts` (novo; mesmo padrão de nome do probe
`src/lib/db/batch-transacao.int.test.ts` da 002), `vitest.probe.config.mts`. Por ser
`*.int.test.ts`, o arquivo também roda no `npm run test:int` local (desejado).
**Fecha**: US7 no Neon dev, sem resíduo (verificado pelo próprio teste).

- [ ] T007 [US7] `src/lib/db/fk-produtos.int.test.ts`: gerar um marcador único por execução
  e usá-lo **no nome** da categoria e do produto (ex.: `probe fk <8 hex>`, compatível com as
  regras de nome da 002 e da 003); num único `db.batch` no driver HTTP do Neon, inserir a
  categoria, inserir o produto nela e `DELETE` da categoria; o batch deve falhar com `23001`
  (via `codigoSqlstate` de `src/lib/db/erros-pg.ts`). Depois do batch, no próprio teste,
  contar as linhas com o marcador em `categorias` e em `produtos` e exigir **0 em ambas**
  (prova de que tudo foi revertido). Limpeza no `finally`/`afterAll` **só quando sobrar linha
  com o marcador** (caso de FK inexistente, em que o teste já falhou): apagar o produto e
  depois a categoria pelo marcador; nunca `TRUNCATE`, nunca apagar sem o marcador. Seguir o
  padrão do `batch-transacao.int.test.ts` — **test-writer**
- [ ] T008 Incluir `src/lib/db/fk-produtos.int.test.ts`, **por caminho literal**, no
  `include` de `vitest.probe.config.mts` (ao lado do `batch-transacao`) — **principal**
- [ ] T009 Rodar o probe contra o banco local (`vitest run --config vitest.probe.config.mts`
  com o proxy Neon do `db:up`) e `npm run check`; output real. No Neon dev, a prova é o log
  do CI do PR (teste verde, inclusive a contagem de 0 linhas pelo marcador); nenhuma
  consulta ao Neon dev sai da máquina local (registrar o link do log na T058) —
  **principal**
- [ ] T010 Revisão do diff pelo tech-lead (opus) — **tech-lead**
- [ ] T011 Commit (humano), mensagem:
  ```text
  test(db): prova a FK restrict de produtos no Neon dev

  Probe do CI do PR: batch que tenta apagar categoria com produto falha com 23001
  e reverte tudo; o teste confere 0 linhas pelo marcador no Neon dev.
  ```
  — **humano**

---

## SF3 — Domínio: validação, preço, código, mensagens e `normalizarNome`

**Usa**: C§1 (parágrafo "Mudança no contrato da 002 (D5)"); C§3 (parágrafo
`validarCamposProduto`, tipo `Falha`, `Motivo`); C§4 (formato do preço e do código em
`ItemLista`/`DetalheProduto`; regra de busca por código); C§6 (tabela de motivos/mensagens
e avisos de sucesso). DM: Tabela `produtos` (colunas `nome`, `descricao`, `preco_centavos`,
`a_partir_de`). Plan: linha SF3. **Research §3: D5** (`idProduto`/`versaoProduto`),
**D8** (regra completa de entrada do preço) e **D10** (regras de nome e descrição) — as
linhas do plan são só resumo. Contrato da 002 §1 (forma canônica do `idCategoria`, que
`idProduto`/`versaoProduto` repetem; e o próprio §1, editado na T017).
**Arquivos**: `src/lib/categorias/index.ts`, `src/test/conformance/categorias-acesso.test.ts`,
`specs/002-categorias/contracts/categorias.md` (§1), `src/lib/produtos/{validacao,preco,
codigo,erros,mensagens}.ts` + `*.test.ts`.
**Fecha**: FR-003/006/009/010, D8, D10, edge cases de entrada; US1-AC2/3/5/6.

- [ ] T012 [P] [US1] Testes unitários `src/lib/produtos/preco.test.ts` (D8): aceitos "12",
  "12,90", "12.90", "12,9", "R$ 12,90", "R$12,90", " 12,90 ", "1.290,00", "1.290,5" (⇒
  centavos inteiros exatos, sem float: "12,9" ⇒ 1290, "1.290,5" ⇒ 129050); recusados como
  ambíguos "1.290", "1,290", "12,345" e espaço entre dígitos "12 90" (`preco_ambiguo`); recusados como inválidos (`preco_invalido`)
  "0", "0,00", negativo, texto, "12,3456", "1.2.3", "1,290.00", "12,90,1", sinais, e acima
  de 99.999,99 ("100.000,00"); limite exato "99.999,99" aceito; formatação `R$ 12,90` e
  "a partir de R$ 12,90" — **test-writer**
- [ ] T013 [P] [US1] Testes unitários `src/lib/produtos/codigo.test.ts`: `#0042` a partir
  de 42 (`lpad(id, 4, '0')`, acima de 9999 sem truncar); interpretação da busca por código
  "42", "0042", "#0042" (`^#?\d{1,9}$`), nome comum não é código — **test-writer**
- [ ] T014 [P] [US1] Testes unitários `src/lib/produtos/validacao.test.ts`
  (`validarCamposProduto(entrada, modo)`): nome vazio / 3 a 80 **code points** após
  normalizar (emoji e acentos contam 1) / só símbolos ou sem letra nem dígito /
  caracteres de controle (`nome_vazio`, `nome_tamanho`, `nome_invalido`), espaços das
  pontas e duplos normalizados via `normalizarNome`; `categoria_obrigatoria`; descrição
  com `\r\n` ⇒ `\n`, trim nas pontas, vazia ou só espaços ⇒ `null`, até 1000 code points
  (`descricao_tamanho`); "a partir de" nos dois modos: `cadastro` com caixa marcada e preço
  vazio ⇒ `a_partir_de_sem_preco` (US1-AC6); `edicao` com caixa marcada e preço vazio ⇒
  `ok` com `aPartirDe = false` (US4-AC2); com preço, os dois modos aceitam; `id`/`versao`
  (D5: inteiro positivo ≤ 2147483647 ou string decimal canônica; `" 3"`, `"03"`, `"1e2"`,
  `"0"`, negativo, `"99999999999"` ⇒ `falha_geral`); várias falhas juntas em `falhas[]`
  com `campo`, **na ordem do C§3** (`id`/`versao` → nome → categoria → descrição → preço →
  a partir de) — **test-writer**
- [ ] T015 [P] Testes unitários `src/lib/produtos/mensagens.test.ts` (uma entrada por motivo
  de C§6, texto simples, sem jargão; `nome_repetido` com `codigoExistente` traz o código e,
  sem ele, a variante sem código) e `src/lib/produtos/erros.test.ts` (tradução dos
  resultados de C§2 para `Falha`: `ausente` ⇒ `nao_existe`, `versao_diferente` ⇒
  `alterado`, `limite` ⇒ `limite_destaques`, `vaga_disputada`, `esgotado` ⇒
  `esgotado_nao_destaca`, `ja_em_destaque`, `categoria_ausente` ⇒ `categoria_invalida`,
  `nome_repetido` com e sem `codigoExistente`) — **test-writer**
- [ ] T016 Atualizar `src/test/conformance/categorias-acesso.test.ts` (allowlist
  `EXPORTS_PERMITIDOS` inclui `normalizarNome`) — teste vermelho até o barrel mudar —
  **test-writer**
- [ ] T017 Exportar `normalizarNome(nome: string): string` (NFC + trim + colapso de
  espaços) em `src/lib/categorias/index.ts` (nada movido de arquivo) e atualizar o §1 de
  `specs/002-categorias/contracts/categorias.md` (única edição de `specs/` desta tarefa,
  prevista no plano; o diff é revisado pelo tech-lead na T021a) — **principal**
- [ ] T018 [P] Implementar `src/lib/produtos/preco.ts` e `src/lib/produtos/codigo.ts` até
  T012/T013 ficarem verdes — **principal**
- [ ] T019 [P] Implementar `src/lib/produtos/mensagens.ts` e `src/lib/produtos/erros.ts` até
  T015 ficar verde (tipos `Motivo`, `Falha` de C§3) — **principal**
- [ ] T020 Implementar `src/lib/produtos/validacao.ts` (server-only por importar o
  barrel; Zod 4; `validarCamposProduto(entrada, modo: "cadastro" | "edicao")` ⇒ `{ ok:
  true; campos: CamposProduto } | { ok: false; falhas: Falha[] }`; schemas de
  `idProduto`/`versaoProduto`) até T014 ficar verde — **principal**
- [ ] T021 `npm run check` com output real; `categorias-acesso` e testes da 002 verdes —
  **principal**
- [ ] T021a Revisão do diff da SF3 pelo tech-lead (opus): barrel `@/lib/categorias` (só
  `normalizarNome` a mais), allowlist da conformidade, **edição do §1 do contrato da 002**
  (coerente com o C§1 da 003 e sem mudar outra regra da 002), regras de D8/D10 e modos de
  `validarCamposProduto` — **tech-lead**
- [ ] T022 Commit (humano), mensagem:
  ```text
  feat(produtos): valida campos, preço e código de referência

  Exporta normalizarNome no barrel de categorias e cria o domínio de produtos:
  validação de nome, descrição, categoria e "a partir de", entrada de preço em
  centavos, código #0042, motivos de falha e mensagens em português simples.
  Atualiza o §1 do contrato da 002 com o novo export do barrel.
  ```
  — **humano**

---

## SF4 — SQL de escrita: `inserir`, `editar`, `remover`

**Usa**: C§2 (tipos `ProdutoDb`, `CamposProduto`, resultados; funções `inserir`, `editar`,
`remover`; tabela de garantias; regra "leitura depois de 0 linhas só escolhe a mensagem");
DM: Tabela `produtos` (todas as colunas e regras); DM: Invariantes; DM: Transições de estado
(remover). C§3 (só o parágrafo dos modos de `validarCamposProduto`: em `edicao` o domínio
já entrega `aPartirDe = false` sem preço; o SQL repete como defesa). Contrato da 002 §4
(`remover` de categoria, usado na corrida da T024). Plan: linha SF4.
**Arquivos**: `src/lib/db/produtos.ts` (novo), `src/lib/db/produtos.escrita.int.test.ts`,
`src/lib/db/produtos.concorrencia.int.test.ts`, `src/lib/db/produtos.test.ts` (unitário,
`db` simulado, só para o fallback do lookup).
**Fecha**: US1-AC1/4/7/8, US4-AC1–5, US6-AC3–6, SC-005 (nome e código).

- [ ] T023 [US1] [US4] [US6] `src/lib/db/produtos.escrita.int.test.ts`: `inserir` ⇒ `{ tipo:
  "ok", id }` com `versao = 1`, `criado_por = atualizado_por = sessao.email`; nome
  equivalente ⇒ `nome_repetido` com `codigoExistente`; categoria inexistente ⇒
  `categoria_ausente` (`23503`); `editar` incrementa `versao`, grava `atualizado_por` e
  `atualizado_em`, troca de categoria mantém o `id` (US4-AC1), `a_partir_de` forçado a
  `false` com preço `NULL` mesmo se `campos.aPartirDe` vier `true` (defesa do SQL),
  `versao_diferente`, `ausente`, `nome_repetido`, `categoria_ausente`; `remover` ⇒
  `removido`, `ausente`, `versao_diferente`, fotos em cascata, `remover` não grava autoria.
  E `src/lib/db/produtos.test.ts` (unitário): `23505` seguido de lookup vazio (linha
  conflitante removida ou renomeada no meio) ⇒ `nome_repetido` **sem** `codigoExistente`,
  em `inserir` e `editar` — **test-writer**
- [ ] T024 [US1] `src/lib/db/produtos.concorrencia.int.test.ts` (rodando em série como o
  resto): duas inserções simultâneas de nome equivalente ⇒ 1 `ok` + 1 `nome_repetido` com o
  código do outro; N cadastros simultâneos ⇒ códigos distintos; código de produto removido
  não volta; dois `editar` com a mesma `versao` ⇒ 1 aceito, 1 `versao_diferente`, nada
  sobrescrito; dois `remover` com a mesma `versao` ⇒ 1 `removido`, 1 `ausente` (a linha já
  sumiu; US6-AC6); **`inserir` × `remover` da categoria (002) simultâneos** e **`editar`
  trocando para a categoria × `remover` dela simultâneos** ⇒ só dois desfechos aceitos
  (produto gravado + `tem_produtos`, ou categoria removida + `categoria_ausente`) e nunca
  produto órfão (US7-AC3 com as funções reais) — **test-writer**
- [ ] T025 Implementar em `src/lib/db/produtos.ts` os tipos `ProdutoDb`, `CamposProduto`,
  `NomeRepetido`, `CategoriaAusente`, `Ausente`, `VersaoDiferente` e as funções `inserir`,
  `editar`, `remover` de C§2: cada uma **um único statement** (`INSERT ... RETURNING id` com
  `23505` ⇒ busca do `id` por `chave = categoria_chave($nome)`, sem linha ⇒ `nome_repetido`
  sem `codigoExistente`; `UPDATE ... SET campos,
  versao+1, atualizado_por, atualizado_em WHERE id AND versao`; `DELETE ... WHERE id AND
  versao RETURNING id`); 0 linhas ⇒ leitura só para escolher `ausente` × `versao_diferente`;
  SQLSTATE só por `codigoSqlstate`; erro inesperado propaga; sem lock advisory nem
  `db.transaction()` — **principal**
- [ ] T026 `npm run check` e `npm run test:int` com output real; testes de SF1 seguem
  verdes — **principal**
- [ ] T027 Revisão do diff pelo tech-lead (opus): SQL de `produtos.ts`, ausência de "lê e
  depois grava", tradução de `23505`/`23503`, fallback sem `codigoExistente`, defesa do
  `a_partir_de` no `editar`, corrida com a remoção de categoria — **tech-lead**
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
  em destaque ⇒ `limite`; já em destaque com a `versao` correta ⇒ `ja_em_destaque`, sem
  alterar nada (nem `versao`); **precedência** da leitura após 0 linhas, um caso por par
  de condições simultâneas: inexistente → `versao_diferente` → `esgotado` →
  `ja_em_destaque` → `limite`; `tirarDoDestaque` zera a vaga;
  todas incrementam `versao`/`atualizado_por`/`atualizado_em`; `ausente` e
  `versao_diferente`; **7 destaques + 2 `destacar` simultâneos ⇒ exatamente 1 `ok`, o outro
  `vaga_disputada`, total 8**; **`esgotar` × `destacar` simultâneos no mesmo produto com a
  mesma `versao`** ⇒ 1 aceita, a outra `versao_diferente`, e nunca `esgotado = true` com
  vaga (esgotado × vaga); duas ações com a mesma `versao` ⇒ 1 aceita — **test-writer**
- [ ] T030 [US2] [US5] Implementar em `src/lib/db/produtos.ts`: `esgotar` (CTE `antes` +
  `UPDATE ... SET esgotado = true, destaque_vaga = NULL, versao+1 ... RETURNING (SELECT
  estava FROM antes)`), `disponibilizar` (não toca `destaque_vaga`), `destacar` (`UPDATE ...
  SET destaque_vaga = livre.vaga ... FROM (menor vaga livre de 1..8) livre WHERE id AND
  versao AND NOT esgotado AND destaque_vaga IS NULL AND livre.vaga IS NOT NULL`; `23505` ⇒
  `vaga_disputada`, **sem retry**; 0 linhas ⇒ leitura escolhe, nesta ordem, `ausente` →
  `versao_diferente` → `esgotado` → `ja_em_destaque` → `limite`), `tirarDoDestaque` — todas
  statement único, sem lock — **principal**
- [ ] T031 `npm run check` e `npm run test:int` com output real — **principal**
- [ ] T032 Revisão do diff pelo tech-lead (opus): corretude do `UPDATE ... FROM` da vaga
  livre e do `vaga_disputada` sob concorrência; CTE `antes` do `esgotar` no mesmo statement
  (e `saiuDoDestaque` coerente com a `versao`); `CHECK produtos_destaque_disponivel` como
  garantia do esgotado × vaga; precedência da leitura após 0 linhas — **tech-lead**
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

**Usa**: C§2 (tipos `ProdutoDb` e `FiltroDb`, funções `obterPorId`, `listar`, linha
`listar` da tabela de garantias); C§4 inteiro (inclusive `aviso`) (`FiltroLista`, `listarProdutosDoPainel`, `obterProdutoDoPainel`,
`ItemLista`, `DetalheProduto`, regras de URL/cursor/busca); C§1 (fronteiras: `painel.ts` é
server-only, SQL só em `db/produtos.ts`); DM: Tabela `produtos` (índices, `chave`). Plan:
linha SF6, D3. Quickstart §4 (SC-007).
**Arquivos**: `src/lib/db/produtos.ts`, `src/lib/produtos/painel.ts`,
`src/lib/db/produtos.leitura.int.test.ts`, `src/lib/produtos/painel.test.ts`.
**Fecha**: US3-AC1–6, SC-007 (nível de banco), FR de `voltar` sem redirecionamento aberto.

- [X] T034 [US3] `src/lib/db/produtos.leitura.int.test.ts`: `obterPorId` com `categoriaNome`
  (JOIN) e `null` para inexistente; `listar` ordena por `id DESC`, devolve 20 + `haMais`
  (consulta `LIMIT 21`); keyset `antes` não repete nem pula item **com cadastro e remoção no
  meio da paginação**; filtro por categoria e por situação (disponível/esgotado); busca por
  nome via `strpos(chave, categoria_chave($busca)) > 0` ("meia-soquete" encontra "Meia
  soquete"), busca por código "42"/"0042"/"#0042", busca normalizada vazia ⇒ sem filtro;
  combinação de filtros — **test-writer**
- [X] T035 [US3] `src/lib/produtos/painel.test.ts` (unitário, `db` mockado): schema Zod
  único `filtroLista` — valor inválido ignorado (lista sem aquele filtro), nunca erro;
  `verMais` mantém os mesmos filtros com `antes` = último id; `voltarAoComeco` só quando há
  `antes`; `ItemLista.href` carrega `?voltar=` com a query atual; `aviso=removido` ⇒
  `aviso` = `{ tipo: "sucesso", texto: "Produto removido." }` e `aviso=nao_existe` ⇒
  `{ tipo: "erro", texto: "Este produto não existe mais." }`, **nunca** propagados em
  `verMais`, `voltarAoComeco` nem `href`; outro valor de `aviso` ignorado; montagem do `FiltroDb` (situação ⇒ `esgotado`,
  busca vazia após normalizar ⇒ sem `busca`, `busca.codigo` só quando casa
  `^#?\d{1,9}$`); `obterProdutoDoPainel`:
  id inválido/inexistente ⇒ `null`, `fotos: []`, `podeDestacar` (= não esgotado e fora do
  destaque), `criadoPor`/`atualizadoPor` presentes (US4-AC6), `voltarHref` = `/painel/produtos` + `voltar` revalidado (caminho fixo; `voltar`
  com URL absoluta, `//host` ou outro caminho ⇒ lista sem filtro) — **test-writer**
- [X] T036 [US3] Implementar `obterPorId` e `listar` (tipo `FiltroDb` do C§2) em
  `src/lib/db/produtos.ts` até T034 ficar verde — **principal**
- [X] T037 [US3] Implementar `src/lib/produtos/painel.ts` (server-only;
  `listarProdutosDoPainel`, `obterProdutoDoPainel`, `filtroLista`; usa `preco.ts`/`codigo.ts`
  da SF3 e `listarCategorias` pelo barrel) até T035 ficar verde — **principal**
- [X] T038 [US3] Medição local com 500 produtos: script de teste em `src/test/db/` (não vai
  para produção, só stack local, ADR-006) que popula 500 produtos; medir `listar` (página,
  próxima página, filtro, busca) e registrar tempos (meta < 2 s; a medição no `preview` fica
  na SF9). Fora do `test:int`: roda com `npm run test:perf` (`vitest.perf.config.mts`) —
  **principal**
- [X] T039 `npm run check` e `npm run test:int` com output real — **principal**
- [X] T040 Revisão do diff pelo tech-lead (opus): SQL de `listar`/`obterPorId`, índices
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

**Usa**: C§3 inteiro (ordem fixa, `ResultadoAction`, `Falha` com `valores`,
`ValoresFormulario`, assinaturas `(anterior, formData)` das 7 actions, tabela de entradas,
tradução de `CategoriaInvalidaError`, modos de `validarCamposProduto`, "a action nunca
redireciona em erro"); C§1 (regras 1–5 de conformidade); C§6 (motivos e avisos de
sucesso); C§2 (assinaturas e resultados consumidos). Contrato da 001
(`specs/001-auth-admins/contracts/auth.md`: `requireAdminAction`, `UnauthorizedError`,
`AdminSession`). Plan: linha SF7.
**Arquivos**: `src/lib/produtos/actions.ts` (`"use server"`),
`src/lib/produtos/actions.test.ts`, `src/test/conformance/produtos-acesso.test.ts`.
**Fecha**: US1 (action), US2-AC4 (acesso negado), US2-AC5 (`saiuDoDestaque`), sessão
expirada (quickstart §3 passo 10).

- [x] T042 [P] [US1] [US2] `src/lib/produtos/actions.test.ts` (`db`, guard, `revalidatePath`
  e barrel mockados): para cada uma das 7 actions (`criarProduto`, `editarProduto`,
  `marcarEsgotado`, `marcarDisponivel`, `destacarProduto`, `tirarProdutoDoDestaque`,
  `removerProduto`), chamadas como `action(null, formData)`: `requireAdminAction()` é
  chamado **antes de tudo** e sem sessão `UnauthorizedError` propaga sem tocar no banco
  (US2-AC4); Zod sobre o `FormData` antes de qualquer SQL (entrada inválida ⇒ uma única
  `Falha`, sem chamar `db`: com várias falhas, devolve **só a primeira na ordem do C§3**
  com o `campo` dela — ex.: nome vazio + preço inválido ⇒ só `nome_vazio`; `id`/`versao`
  inválidos ⇒ `falha_geral` antes de tudo); `criarProduto` valida em modo
  `cadastro` e `editarProduto` em modo `edicao` (preço vazio com caixa marcada ⇒ chega ao
  `editar` com `aPartirDe = false`); `exigirCategoriaValida` antes de `inserir`/`editar`, e
  `CategoriaInvalidaError` ⇒ `categoria_invalida` com `campo: "categoria"`, sem chamar
  `db`; tradução de cada resultado de C§2 para `ResultadoAction` (inclusive
  `ja_em_destaque` e `nome_repetido` com e sem `codigoExistente`); `marcarEsgotado` devolve
  `saiuDoDestaque` (US2-AC5: aviso "...e saiu do destaque"); sucesso chama `revalidatePath`
  da lista e do detalhe e **não** chama `redirect`; **toda** falha de `criarProduto`/
  `editarProduto` traz `valores` iguais ao que veio no `FormData` (textos crus, caixa
  marcada ⇒ `aPartirDe: true`), e falha nunca redireciona — **test-writer**
- [x] T043 [P] `src/test/conformance/produtos-acesso.test.ts` (AST, nega por padrão, mesmo
  estilo de `categorias-acesso.test.ts`): regra 1 `@/lib/db/produtos` só em `src/lib/produtos/`
  e `src/lib/db/`; regra 2 bindings `produtos`/`produtoFotos` do schema só nesses dois
  diretórios; regra 3 `@/lib/produtos/actions` só em `src/app/painel/` (exceção para os
  testes unitários ao lado); regra 4 `@/lib/produtos/painel` só em `src/app/painel/` e
  `src/lib/produtos/`; regra 5 `src/lib/produtos/` acessa categorias só por `@/lib/categorias`
  — **test-writer**
- [x] T044 [US1] [US2] Implementar `src/lib/produtos/actions.ts` (`"use server"`) até T042 e
  T043 ficarem verdes, com as assinaturas `(anterior, formData)` do C§3, usando
  `validacao.ts`, `erros.ts`, `mensagens.ts`, `db/produtos.ts` e `requireAdminAction`
  (barrel de auth) — **principal**
- [x] T045 `npm run check` com output real (inclui `categorias-acesso`, `painel-guard`,
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

- [x] T047 Testes de componente (Testing Library/jsdom) para os 6 primitivos, um arquivo
  cada, cada um com o docblock `// @vitest-environment jsdom` na primeira linha (o
  `vitest.config.mts` usa `environment: "node"`; se o projeto já tiver outro padrão para
  `*.test.tsx`, seguir o existente): rótulo visível ligado ao controle (`htmlFor`/`id`); com `erro`, `aria-invalid` e
  `aria-describedby` apontando para `MensagemCampo`; `defaultValue`/`defaultChecked`
  preservados; `Selecao` nativa (`<select>`) com `vazio?` como opção inicial; `CaixaMarcacao`
  com a área de toque incluindo o rótulo; `Aviso` com `role="status"` (sucesso) e
  `role="alert"` (erro); classes de alvo ≥ 48 px e texto ≥ 16 px — **test-writer**
- [x] T048 Implementar os 6 primitivos em `src/components/ui/` até T047 ficar verde, com as
  props de C§5 (`CampoTexto`: `name`, `rotulo`, `defaultValue`, `erro?`, `inputMode?`,
  `maxLength?`; `AreaTexto`: igual + `linhas?`; `Selecao`: `name`, `rotulo`, `opcoes`,
  `defaultValue`, `erro?`, `vazio?`; `CaixaMarcacao`: `name`, `rotulo`, `defaultChecked`,
  `erro?`; `MensagemCampo`: `id`, `children`; `Aviso`: `tipo`, `children`), seguindo o estilo
  do `button.tsx` existente — **ui-dev**
- [x] T049 `npm run check` com output real — **principal**
- [ ] T050 Commit (humano), mensagem:
  ```text
  feat(ui): primitivos de formulário

  Cria CampoTexto, AreaTexto, Selecao, CaixaMarcacao, MensagemCampo e Aviso em
  src/components/ui com rótulo ligado, erro acessível e alvos de 48 px.
  ```
  — **humano**

---

## SF8b — Telas de produtos no painel

**Usa**: C§5 inteiro (tabela de rotas, ações e textos de cada tela; **"Navegação e
avisos"**; primitivos); C§4 (`ItemLista`, `DetalheProduto` com autoria, `verMais`,
`voltarAoComeco`, `voltarHref`, `podeDestacar`, `aviso`); C§3 (assinaturas
`(anterior, formData)` das actions, `ResultadoAction`/`Falha` com `valores` e
`codigoExistente?`); C§6 (mensagens e avisos de
sucesso); DM: Transições de estado (quais botões em cada estado). Plan: linha SF8b.
Quickstart §3 (roteiro). A UI só consome o contrato: não cria action, não importa Drizzle,
não toca `src/lib/` (se faltar campo ou action: parar e reportar).
**Arquivos**: `src/app/painel/(protegido)/produtos/{page.tsx, novo/page.tsx,
form-produto.tsx, [id]/page.tsx, [id]/editar/page.tsx, [id]/remover/page.tsx}`, entrada do
painel apontando para produtos (home de `src/app/painel/(protegido)/page.tsx`), testes ao
lado, `src/test/conformance/produtos-paginas-guard.test.ts`. Contrato da 001
(`requireAdminPage`) também é usado.
**Fecha**: US1, US2, US3, US4, US5, US6 na UI; SC-008.

- [x] T051 [US1] [US2] [US3] [US4] [US5] [US6] Testes de componente das telas (docblock
  jsdom como na T047), a partir de C§5: lista (itens com código, nome, categoria,
  "Esgotado", "Em destaque", preço ou "Sem preço"; marcador "sem foto"; "Ver mais
  produtos" e "Voltar ao começo" só quando os hrefs existem; vazio com convite "Novo
  produto"; "nada encontrado" com "Limpar filtros"; `aviso` "Produto removido." num `Aviso`
  de sucesso e "Este produto não existe mais." num `Aviso` de erro); detalhe ("Produto não encontrado" com volta à lista para
  inexistente; "Voltar à lista" usa `voltarHref`; botão "Marcar como esgotado" para
  disponível e "Marcar como disponível" para esgotado, e após sucesso o `Aviso` "Produto
  marcado como esgotado." / "Produto disponível de novo." (US2-AC1/AC2); aviso "...e saiu
  do destaque" (US2-AC5); **"Destacar" oculto para esgotado** (`podeDestacar`); "Tirar do
  destaque" quando em destaque; avisos `vaga_disputada` e `ja_em_destaque`; e-mails de
  quem criou e de quem alterou por último (US4-AC6); descrição com quebras de linha
  preservadas e marcação HTML exibida como texto); formulário novo/editar (**reidratação
  a partir de `valores`** em qualquer falha: cada campo e a caixa "a partir de" voltam com
  o que foi enviado; **uma só mensagem**, junto do `campo` da falha (ou num `Aviso` de
  erro sem `campo`), e nenhum outro campo marcado com erro; `nome_repetido` com `codigoExistente` ⇒ link
  para `/painel/produtos/{codigo}`, sem ele ⇒ mensagem sem link; campos ocultos
  `id`/`versao` na edição; mensagem de `alterado`; sucesso ⇒ `router.push` para o
  detalhe); remover (confirmação exata "O produto #0042 Meia soquete listrada será apagado
  de vez e não poderá ser recuperado"; **"Cancelar" volta ao detalhe sem chamar a action**
  (US6-AC2); sucesso ⇒ `router.push("/painel/produtos?aviso=removido")`; `nao_existe` ⇒
  `router.push("/painel/produtos?aviso=nao_existe")`, sem redirecionamento pela action
  (US6-AC6)) — **test-writer**
- [x] T052 [US1] [US4] Implementar `form-produto.tsx` (client; `useActionState(criarProduto,
  null)`/`useActionState(editarProduto, null)` com as assinaturas `(anterior, formData)` do
  C§3, sem wrapper; campos remontados por `key` derivada do estado com `defaultValue`/
  `defaultChecked` = `valores` na falha e só a mensagem da falha devolvida; `router.push`
  para o detalhe no sucesso; usando os primitivos da SF8a), `novo/page.tsx` e
  `[id]/editar/page.tsx`, cada `page.tsx` chamando `requireAdminPage(<rota>)` antes de
  ler (C§5). **Campo de preço**: máscara que preenche da direita (padrão de app de banco:
  teclado numérico, só dígitos; "1290" aparece como "12,90"; apagar tudo = sem preço); envia
  "12,90" ao servidor, que segue validando com `parsePreco`; na edição abre preenchido com o
  preço atual formatado (C§5) — **ui-dev**
- [x] T053 [US3] Implementar `page.tsx` da lista (Server Component; `requireAdminPage(
  "/painel/produtos")` antes de ler; filtros de categoria e situação, busca,
  `listarProdutosDoPainel(searchParams)`, "Ver mais produtos", "Voltar ao começo", estados
  vazio/nada encontrado, `aviso` no `Aviso` do `tipo` dele) — **ui-dev**
- [x] T054 [US2] [US4] [US5] [US6] Implementar `[id]/page.tsx` (detalhe "como a cliente
  veria", descrição em `white-space: pre-line` como texto puro + ações de esgotar/
  disponibilizar/destacar/tirar do destaque com `useActionState` e `Aviso` de sucesso ou
  erro, autoria, "Voltar à lista") e `[id]/remover/page.tsx` (confirmação com código e
  nome, "Cancelar", `nao_existe` ⇒ `router.push` para a lista com `aviso=nao_existe`),
  ambas chamando `requireAdminPage` com o caminho incluindo o `id`, conforme C§5 —
  **ui-dev**
- [x] T055 Apontar a entrada do painel para `/painel/produtos` em
  `src/app/painel/(protegido)/page.tsx` (ao lado do link de categorias) — **ui-dev**
- [x] T056 (a) **test-writer**: criar `src/test/conformance/produtos-paginas-guard.test.ts`
  (AST, nega por padrão, mesmo estilo dos testes de `src/test/conformance/`): percorre
  **toda** `page.tsx` em `src/app/painel/(protegido)/produtos/` (inclusive as que vierem a
  existir) e falha se alguma não chamar `requireAdminPage(...)` importado do barrel de
  auth; o teste também falha se não encontrar nenhuma `page.tsx` (diretório errado não
  passa em branco). (b) **principal**: `npm run check` com output real;
  `produtos-paginas-guard`, `painel-guard` e `produtos-acesso` verdes — **test-writer** ·
  **principal**
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
  drizzle-kit generate` ("No schema changes"); conferir no PR o log do CI com
  `fk-produtos.int.test.ts` passando (`23001` e 0 linhas pelo marcador) e o probe do
  `db.batch` da 002 verde (quickstart §2), registrando o link do log; nenhuma consulta ao
  Neon dev a partir da máquina local. Montar a **tabela de rastreabilidade** de cada
  critério de aceite da spec (US1-AC1 … US7-AC3) para o arquivo e o nome do teste que o
  cobre, e apontar qualquer critério sem teste antes de fechar (SC-004) — **principal**
- [ ] T059 Rodar `npm run preview` e percorrer o roteiro do quickstart §3 (passos 1–10) em
  390 px, registrando o resultado de cada passo (passos de celular real: humano).
  A conferência de que o `23505` de `destacar` chega com o nome da constraint
  (`produtos_destaque_vaga_unique`) no Neon dev é **risco aceito**: não é reproduzível
  manualmente (exige destaque simultâneo); falha segura (nada é gravado errado, só a
  mensagem vira a falha geral); coberta localmente pelo teste determinístico de
  `vaga_disputada` (`produtos.destaque.int.test.ts`) — **principal**
- [ ] T060 Medição SC-007 no `preview` local com 500 produtos (script da T038, comando
  `npm run test:perf` para a massa/medição de banco): abrir a
  lista, "Ver mais produtos", filtrar e buscar, cada resposta < 2 s excluída a primeira após
  banco ocioso, com o throttling do DevTools em "Fast 4G" (quickstart §4); registrar tempos
  e o perfil de rede usado. Roda **depois** da T059 (o roteiro espera banco recém-resetado).
  A conferência da constraint do `23505` no Neon dev fica na T059 (ver acima) — **principal**
- [ ] T061 Revisão das mensagens de C§6 e dos avisos de sucesso (SC-008: sem jargão,
  texto simples); ajustes de texto vão em `src/lib/produtos/mensagens.ts` e nos testes
  correspondentes, `npm run check` de novo — **redator**
- [ ] T061a Commit (humano), **só se a T061 alterou arquivos**, mensagem:
  ```text
  fix(produtos): revisa mensagens do painel de produtos

  Ajusta textos de erro e avisos de sucesso para linguagem simples, sem jargão
  (revisão do SC-008).
  ```
  — **humano**
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
| US2 status | SF5, SF7 (AC4, AC5), SF8b (AC1, AC2, AC5) |
| US3 lista | SF6, SF8b |
| US4 editar | SF3 (AC2, modo `edicao`), SF4, SF6 (AC6), SF7, SF8b (AC6) |
| US5 destaque | SF5, SF8b |
| US6 remover | SF4, SF8b (AC1–3, AC6) |
| US7 categoria com produtos | SF1, SF2, SF4 (AC3 com as funções reais) |
| SC-004 rastreabilidade | SF9 (T058) |
| SC-005 concorrência | SF1, SF4, SF5 |
| SC-007 desempenho | SF6, SF9 |
| SC-001–003, SC-008 | SF9 |
