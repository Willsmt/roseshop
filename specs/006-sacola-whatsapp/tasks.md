# Tasks: Sacola e pedido pelo WhatsApp (feature 006)

**Branch**: `feature/006-sacola-whatsapp` | **Fontes**: [plan.md](./plan.md) (SF0–SF9, Cobertura),
[research.md](./research.md) ("D<n>", "R<n>"), [data-model.md](./data-model.md) ("DM§n"),
[contracts/conferencia.md](./contracts/conferencia.md) ("CC§n"),
[contracts/sacola.md](./contracts/sacola.md) ("CS§n"), [contracts/telas.md](./contracts/telas.md)
("CT§n"), [quickstart.md](./quickstart.md) ("Q§n"), [ADR-012](../adr/012-conferencia-sacola.md),
[ADR-013](../adr/013-desvio-constitution-iv.md).
Da spec: Clarifications e critérios de aceite (USn.m, FR, SC).

## Como ler

- Cada sub-fase (SF) é **pequena e autossuficiente**: a implementação lê só a sua seção e os
  trechos citados em **Usa**. Cada seção traz **Usa**, **Arquivos**, **Fecha**, **Revisão**, as
  tasks e a mensagem de commit.
- Formato: `- [ ] Txxx [P?] [USn…] Descrição com caminho — **dono**`. Os IDs seguem a ordem de
  execução, **exceto a T004** (GATE do ADR-013), que roda depois da T006 e antes da SF1; o número
  foi mantido porque a análise de 2026-10-16 a cita.
- **`[P]`** = pode rodar em paralelo com as outras `[P]` **vizinhas da mesma SF**, porque **não há
  arquivo em comum** entre elas nem dependência de task aberta. Sem `[P]` = em série. Nenhuma task
  que roda `test:int` leva `[P]`.
- **Donos** (agentes do `.claude/agents/` e papéis do CLAUDE.md):
  `test-writer` (sonnet, só testes, nunca código de produção) · `ui-dev` (sonnet, só
  `src/app/(public)/`, consumindo `@/lib/sacola/*` e o barrel `@/lib/catalogo`) · `tech-lead`
  (opus, `src/lib/`, zonas protegidas, lint, ADR, revisão) · `júnior` (haiku, roda verificação e
  devolve o output real) · `redator` (haiku, README) · `doc-sync` (`doc-sync-onboarding`) ·
  `humano` (aprova, executa no dev/produção, commita).
- **Testes antes da implementação** (Red → Green) em cada SF. As tasks do test-writer terminam com
  os testes **vermelhos pelo motivo certo** (módulo ou comportamento ausente, não erro de sintaxe).
- **"Pronto" de cada SF** = `npm run check` verde **e** `npm run test:int` verde, os dois com
  **output real** colado pelo júnior, nunca simulado.
- **`test:int` sempre em série**: nunca duas execuções ao mesmo tempo no banco local (nem por
  agentes em paralelo, nem junto do `test:perf`). Antes de rodar, conferir que nenhum outro
  `vitest` com `vitest.int.config.mts` está ativo. Exige `npm run db:up` e `npm run db:migrate`.
- **[TL✅]** = task em zona protegida (`src/lib/db/`, `cloudflare/`): implementada pelo
  tech-lead e com o diff revisado pelo **humano** antes do commit (constitution III.7).
- **A última task de cada SF é o commit, feito pelo humano**, com a mensagem pronta
  (Conventional Commits, linhas ≤ 100 caracteres, **sem** trailer de co-autoria). **Um commit por
  SF.** Depois de mexer em código, `graphify update .` (AST, sem custo).
- Agentes nunca leem, imprimem nem editam `.dev.vars`. Nenhuma task acessa o Neon (dev ou
  produção) da máquina local; `wrangler` no dev é operado pelo **humano**.
- Nenhum `git push` sem confirmação do humano (comando e corpo do PR mostrados antes).

## Ajustes do humano ao plan (2026-10-16, entrada desta lista)

| # | Ajuste | Onde |
|---|---|---|
| A1 | Envio: se a conferência passar de 4 s, falhar por rede ou responder 400/5xx (ou fora do esquema), o envio é **BLOQUEADO** com "Não consegui conferir agora, tente de novo." e a sacola fica intacta. Nunca enviar com dados não conferidos (SC-003) | CT§3 (atualizado), CS§5 (atualizado), research D11 (nota); T012, T035, **T053** (teste dedicado), T059, T065 |
| A2 | Contador da observação: "N de 200" enquanto o teto de 200 manda; quando o orçamento da URL manda, "Espaço da mensagem quase cheio" com barra de progresso, sem expor a conta codificada; o número exato fica nos testes | CT§3 e CS§4 (`medidorObservacao`, atualizados), research D3 (nota); T012, T018, T020, T055, T058 |
| A3 | SF3 só começa depois da aprovação do ADR-012 pelo humano | primeiro passo da **T023** |
| A6 | Correções do `/speckit-analyze` (2026-10-16): ADR-013 do desvio da constitution IV com GATE antes da SF1 (C1/O1); spec com a regra do A2 e com o botão de envio como nova tentativa (I1/I2); `sacola.codigo` sem "#" (I3); HTML da 005 com `await` (T1); testes de anúncio, foco e esgotado que volta (A1/L4); contagem de toques (S1); códigos até 10 dígitos (L3) | **GATE T004** (ADR-013), T001, T002, T008, T018, T019, T023, T026, T031, T036, T042, T043, T053–T055, T058–T060, T065, T068 |
| A4 | `[P]` só sem conflito de arquivo; `test:int` sempre em série | todas as SFs |
| A5 | Cada task com dono; a primeira task da SF0 grava os HTMLs de referência da 005 (SC-005) | T001 |

## Ordem entre SFs

`SF0 (commit T006, ADR-012 e ADR-013 "proposto") → [GATE T004: ADR-013 aprovado] → SF1 → SF2 →
[GATE T023: ADR-012 aprovado] → SF3 → SF4 → SF5 → SF6 → SF7 → SF8 → SF9`

- O GATE do ADR-013 (T004) bloqueia a SF1 em diante: as regras da sacola no cliente (SF1, SF2,
  SF4) são o desvio da constitution IV que esse ADR registra.
- O GATE do ADR-012 é o primeiro passo da T023 e bloqueia só a SF3 em diante; SF1 e SF2 (núcleo
  puro, sem servidor) não dependem da rota e podem andar enquanto o humano lê o ADR-012.
- A T001 roda **antes de qualquer mudança** em `src/app/(public)/`; a SF5 é a primeira que mexe
  nessas telas.
- Nada vai a `main` antes da SF9. Merge só pelo humano.

## Mapa de user stories

| Story | Prioridade | SFs |
|---|---|---|
| US1 Adicionar pelo detalhe | P1 | SF1 (operações), SF4 (armazenamento, abas), SF5 (ilhas) |
| US2 Revisar e enviar | P1 | SF1 (total), SF2 (mensagem), SF6 (tela) |
| US3 Conferência | P1 | SF3 (rota), SF4 (cliente), SF6 (avisos, envio) |
| US4 Guardada no aparelho | P2 | SF4 (armazenamento), SF5 (FR-002a), SF3/SF6 (`/sacola` noindex, sem JS) |

---

## SF0 — Referência da 005 (SC-005) e ADRs propostos

**Usa**: plan, linha SF0; research D9, D14 (linha SC-005), §3; CT§1; spec SC-005, Clarifications
(HTML do servidor sem JS); ADR-012; ADR-013.
**Arquivos**: `src/test/fixtures/catalogo/{detalhe-005,detalhe-esgotado-005,inicio-005}.html`
(novos), `src/test/catalogo-html.tsx` (helper, sugerido), `src/test/conformance/catalogo-html-005.test.tsx`
(novo), `specs/adr/012-conferencia-sacola.md` e `specs/adr/013-desvio-constitution-iv.md` (os dois
commitados como "proposto").
**Fecha**: base da SC-005. Depois do commit, o GATE do ADR-013 (T004) libera a SF1.
**Revisão**: tech-lead (ADRs).

Housekeeping da 005 (Clarifications): T091–T097 marcadas e T090/T098 abertas com "adiada para a
entrega final" **já estão** em `specs/005-catalogo-publico/tasks.md` (commit `d71b6ae`); nada a
fazer nesta SF.

- [X] T001 **Primeira task da 006, antes de qualquer mudança de tela.** Conferir que
  `git diff --stat main -- 'src/app/(public)'` está vazio (o tree das telas é o da 005). Criar o
  helper `src/test/catalogo-html.tsx` (sugerido) que gera o **HTML do servidor** da 005 com dados
  fixos, sem rede e sem banco. As páginas são componentes `async`, que o `renderToStaticMarkup`
  não renderiza: o helper faz `const pagina = await Pagina({ params, searchParams })` e depois
  `renderToStaticMarkup(<LayoutPublico>{pagina}</LayoutPublico>)`, com `LayoutPublico` de
  `src/app/(public)/layout.tsx` e `Pagina` de `src/app/(public)/p/[codigo]/page.tsx` e de
  `src/app/(public)/page.tsx`, mockando `@/lib/catalogo` e `next/navigation` como em
  `src/app/(public)/p/[codigo]/page.test.tsx` (produto fixo com 2 fotos, preço "R$ 6,00",
  categoria, descrição; `whatsapp` válido de teste). Três casos: **detalhe disponível**,
  **detalhe esgotado** e **`/`** (destaques, filtro e primeiro bloco fixos). Gravar a saída,
  quando `GRAVAR_HTML_005=1`, em `src/test/fixtures/catalogo/detalhe-005.html`,
  `detalhe-esgotado-005.html` e `inicio-005.html`. Os fixtures são gravados **uma vez**, nesta
  task, e nunca regravados depois — **test-writer**
- [X] T002 [US4] Teste da SC-005 em `src/test/conformance/catalogo-html-005.test.tsx`: para cada
  um dos três casos, gera o HTML com o helper da T001 e passa **o fixture e a saída pelo mesmo
  parser** (`DOMParser` do jsdom, `text/html`), **remove os elementos `[data-sacola]` só da
  saída** (nenhum outro elemento é tocado) e compara a serialização dos dois (`body.innerHTML`),
  para que diferenças de serialização não virem falso alarme. Passa **verde** contra o código atual (nenhum `[data-sacola]` ainda) e vai continuar
  verde depois da SF5 — **test-writer**
- [X] T003 Revisão do ADR-012 (`specs/adr/012-conferencia-sacola.md`: coerência com CC§1–§6,
  research D7/D8, FR-013, SC-004, SC-007 e o ajuste A1) e do ADR-013
  (`specs/adr/013-desvio-constitution-iv.md`: coerência com o Complexity Tracking do plan, research
  D1–D5 e constitution IV); registrar achados em cada ADR como "Notas da revisão". **Os dois
  ficam "proposto"** — **tech-lead**
- [X] T005 `npm run check` e `npm run test:int` (em série); colar o output real — **júnior**
- [X] T006 Commit (humano), com o ADR-012 e o ADR-013 ainda "proposto":
  ```text
  test(catalogo): fixa o HTML do servidor da 005 como referência da SC-005

  Detalhe disponível, detalhe esgotado e página inicial gravados antes de
  qualquer mudança de tela da 006; o teste compara sem os [data-sacola].
  ADR-012 (conferência da sacola por POST) e ADR-013 (regras da sacola no
  cliente, desvio da constitution IV) entram como propostos.
  ```
  — **humano**

### GATE antes da SF1 — ADR-013

- [X] T004 **GATE — o humano aprova o ADR-013** (roda **depois da T006**). Ler e aprovar
  `specs/adr/013-desvio-constitution-iv.md`; depois da aprovação, o tech-lead troca
  `**Status:** proposto` por `**Status:** aceito (AAAA-MM-DD, humano)`, e a mudança entra no
  commit da SF1 (T017). **Nenhuma task da SF1 em diante começa sem esta aprovação registrada no
  arquivo.** Sem aprovação, o caminho é emendar a constitution IV por `/speckit-constitution`
  antes de seguir — **humano**

---

## SF1 — Núcleo puro: observação, operações, total e fronteira

**Começa só depois do GATE T004** (ADR-013 aceito no arquivo).
**Usa**: CS§1, CS§2, CS§3, CS§7; DM§1, DM§3, DM§4; research D1, D2, D4, D6; ADR-013; spec FR-003,
FR-005, FR-012, FR-015a, FR-008a, US1.2, US1.3, US2.5, US2.6, US3.2.
**Arquivos**: `src/lib/sacola/{observacao,sacola,total,textos}.ts` e testes,
`src/lib/sacola/fronteira.test.ts`, `eslint.config.mjs`.
**Fecha**: FR-015a (regra), FR-012, limites de FR-003/FR-005 sobre o resultado, US1.3 (puro).
**Revisão**: humano revisa o diff (código do tech-lead).

- [X] T007 [P] [US2] Teste primeiro — `src/lib/sacola/observacao.test.ts` (FR-015a, D2): tabela
  com CRLF e CR → LF; NFD → NFC (`"é"` → `"é"`); controle removido (U+0000–U+0009,
  U+000B–U+001F, U+007F–U+009F) e LF preservado; U+200B, U+200C, U+200E, U+200F, U+202A–U+202E,
  U+2060, U+2066–U+2069 e U+FEFF removidos; **U+200D, U+FE0E e U+FE0F preservados** (emoji com
  ZWJ intacto); espaços das pontas removidos; `\n\n\n\n` → `\n\n`; só espaços/invisíveis ⇒ `""`.
  Idempotência `n(n(x)) === n(x)` sobre toda a tabela. `contarCaracteres` conta **code points**
  (`"👩‍👩‍👧"` = 5, `"á"` NFC = 1), não UTF-16. `OBSERVACAO_MAX === 200` — **test-writer**
- [X] T008 [P] [US1] [US3] Teste primeiro — `src/lib/sacola/sacola.test.ts` (D4, DM§1 transições,
  FR-008a): constantes `MAX_PRODUTOS = 15`, `QTD_MIN = 1`, `QTD_MAX = 10`,
  `VALIDADE_MS = 7 dias`; `adicionar` entra com `quantidade 1`, `precoVisto` e `aPartirDe`,
  `mudou: true`; código já presente ⇒ `ok: true, mudou: false`, quantidade intacta (US1.3); 16º
  código diferente ⇒ `{ ok: false, motivo: "limite_produtos" }` (conferido **sobre a sacola
  recebida**, que é a relida); `mudarQuantidade` 0 e 11 ⇒ `quantidade_fora`, ausente ⇒
  `nao_esta`; `remover` ausente ⇒ `mudou: false`; `limpar` ⇒ `itens: []`; toda operação com
  `mudou: true` grava `alteradaEm = agora`; `aplicarConferencia`: `inexistente` remove; `ok`/
  `esgotado` com preço, `a` ou ausência de preço diferente atualiza `precoVisto`/`aPartirDe`;
  **códigos não cobertos pela resposta ficam como estão**; nada diferente ⇒ `mudou: false`;
  **esgotado que volta** (US3.2): item com quantidade 3 conferido como `esgotado` continua na
  sacola com quantidade 3 e, numa conferência seguinte como `ok`, segue com quantidade 3.
  `estaNaSacola`, `cheia` (15). Operações não mutam a entrada (`Object.freeze` na entrada) —
  **test-writer**
- [X] T009 [P] [US2] Teste primeiro — `src/lib/sacola/total.test.ts` (DM§4, FR-012): US2.5
  (2 × R$ 6,00 + 1 × "a partir de R$ 10,00" ⇒ subtotal "a partir de R$ 22,00"); US2.6 (2 com preço
  + 1 sem ⇒ "Consulte o valor" na linha, soma só dos 2, "+ 1 item a consultar"; 2 sem preço ⇒
  "+ 2 itens a consultar"); nenhum com preço ⇒ subtotal "Consulte o valor" e
  `aConsultar` conforme a contagem; `valorLinha` = quantidade × preço ("2x" de R$ 6,00 ⇒
  "R$ 12,00"); formato brasileiro "R$ 1.234,56"; teto 15 × 10 × 9.999.999 = 1.499.999.850
  centavos sem perda (inteiro) — **test-writer**
- [X] T010 [P] Teste primeiro — `src/lib/sacola/fronteira.test.ts` (D1, no molde de
  `src/lib/fotos/aparelho/fronteira.test.ts`): lê os imports de todo `src/lib/sacola/*.ts` que
  não é teste e falha em qualquer import fora de `@/lib/produtos/preco`, `@/lib/catalogo/exibicao`,
  `zod/mini` e `./<arquivo do módulo>` (proíbe `server-only`, `next/*`, `@/lib/db*`,
  `@/lib/auth*`, `@/lib/r2*`, o barrel `@/lib/catalogo` e `zod` cheio) — **test-writer**
- [X] T011 `eslint.config.mjs`: bloco para `src/lib/sacola/**/*.{ts,tsx}` que proíbe
  `server-only`, `next/*`, `@/lib/db*`, `@/lib/auth*`, `@/lib/r2*`, o barrel `@/lib/catalogo` e
  os submódulos do catálogo exceto `exibicao` (reusar `proibirSubmoduloCatalogo` e acrescentar o
  barrel); mensagem citando CS (introdução) — **tech-lead**
- [X] T012 `src/lib/sacola/textos.ts` (CS§7, sem dependências): textos da mensagem
  ("Olá! Quero fazer este pedido:", "Subtotal:", "Observação:", "a partir de", "Consulte o valor",
  "+ 1 item a consultar" / "+ N itens a consultar") e das telas de CT§1–§3, incluindo os novos
  dos ajustes: "Não consegui conferir agora, tente de novo." (A1), "N de 200",
  "Espaço da mensagem quase cheio", "Espaço da mensagem usado" e "A observação não cabe mais na
  mensagem. Encurte para enviar." (A2) — **tech-lead**
- [X] T013 [P] `src/lib/sacola/observacao.ts`: `OBSERVACAO_MAX`, `normalizarObservacao`,
  `contarCaracteres` (D2, ordem exata da regra) — **tech-lead**
- [X] T014 [P] `src/lib/sacola/sacola.ts`: tipos `Item`, `Sacola`
  (`{ versao: 1; alteradaEm: number; itens: Item[] }`), `Operacao`, `Resultado`, constantes e
  operações de CS§2. Declara também o tipo `ItemConferencia` de DM§2 (a SF4 o reexporta em
  `conferencia.ts`, CS§5) para não haver dependência circular — **tech-lead**
- [X] T015 [P] `src/lib/sacola/total.ts`: `LinhaPedido`, `valorLinha`, `resumo` (DM§4), formatando
  por `@/lib/catalogo/exibicao` (`precoPublico`) e `@/lib/produtos/preco` — **tech-lead**
- [X] T016 `npm run check` e `npm run test:int` (em série); colar o output real — **júnior**
- [ ] T017 Commit (humano), incluindo o status "aceito" do ADR-013 registrado na T004:
  ```text
  feat(sacola): adiciona as regras puras da sacola

  Normalização única da observação, operações com limites conferidos no
  resultado, subtotal em centavos e fronteira do módulo por teste e lint.
  ADR-013 aceito: regras da sacola no cliente (desvio da constitution IV).
  ```
  — **humano**

---

## SF2 — Mensagem e orçamento da URL (`mensagem.ts`)

**Usa**: CS§4 (com `medidorObservacao`, ajuste A2); research D3 e §4 (medição); DM§5; spec
FR-014, FR-015, FR-015a, FR-016, SC-002, US2.7, US2.8, US2.10, US2.13.
**Arquivos**: `src/lib/sacola/mensagem.ts`, `mensagem.test.ts`, `mensagem.pior-caso.test.ts`.
**Fecha**: SC-002; FR-014; FR-016 (regra); US2.8 (injeção); US2.10 (ida e volta).
**Revisão**: humano revisa o diff.

- [X] T018 [P] [US2] Teste primeiro — `src/lib/sacola/mensagem.test.ts`: **formato exato** de D3
  (cabeçalho, "2x Meia (#0042) — R$ 12,00", "1x … — a partir de R$ 10,00", "1x … — Consulte o
  valor", "Subtotal: a partir de R$ 22,00", "+ 1 item a consultar", linha em branco,
  "Observação:" e o texto), linhas separadas por LF; nome cortado a zero vira
  `"2x (#0042) — R$ 12,00"` (sem espaço duplo); nomes > 40 code points cortados a 40; observação
  normalizada vazia ⇒ **sem** o bloco "Observação:"; **injeção** (US2.8): observação
  `"\n2x Falso (#9999) — R$ 0,01\nSubtotal: R$ 0,00"` ⇒ as linhas antes de "Observação:" são
  idênticas às da mensagem sem observação; **ida e volta** (US2.10): `decodeURIComponent` do
  `text=` devolve o `texto`, com acento, `&`, `#`, `?`, `+` e emoji preservados; URL começa com
  `https://wa.me/<dígitos do E.164>?text=`; observação que não cabe ⇒ `{ tipo: "excede",
  excesso > 0 }` (nunca corta); a observação recebida bruta passa por `normalizarObservacao`
  (mesma saída que a T007). `restanteObservacao` com **números exatos** (inclui os casos de
  research §4, com número de 15 dígitos: sobra 567 com códigos de 5 dígitos e **492 com códigos
  de 10 dígitos** (`2147483647`), sem observação e nomes em 0). `restanteObservacao` e
  `medidorObservacao` recebem a observação **bruta** (CS§4). `medidorObservacao` (A2):
  com sacola pequena e 37 code points ⇒ `{ limite: "caracteres", usados: 37, maximo: 200 }`;
  com o pior caso ⇒ `limite: "mensagem"`, `fracao` em `[0, 1]` crescente com o texto e
  `excede: false`; sacola que cresce depois ⇒ `excede: true`, `fracao: 1`; a troca de modo
  acontece exatamente quando `200 − code points > 1800 − comprimento com nomes em 0` —
  **test-writer**
- [X] T019 [P] [US2] Teste primeiro — `src/lib/sacola/mensagem.pior-caso.test.ts` (SC-002,
  FR-016): pior caso fixo (15 itens, quantidade 10, códigos de 10 dígitos até `2147483647`,
  número de 15 dígitos, nomes de 40 code points acentuados e com emoji, incluindo ZWJ e U+FE0F,
  preços "a partir de R$ 99.999,99",
  observação no limite de `restanteObservacao` com acento, emoji e quebras) ⇒ `tipo: "ok"` e
  `url.length ≤ 1800`; **nomes encolhem antes** da observação perder espaço (com a mesma
  observação, os nomes saem mais curtos que 40 e a observação sai inteira); **propriedade** com
  gerador próprio de semente fixa (laço, sem dependência nova) sobre ≈ 2000 combinações válidas:
  códigos de 4 a 10 dígitos; sempre `ok` com `url.length ≤ 1800` ou `excede` quando a observação
  passa de `restanteObservacao`; **corte por code point**: nome com emoji exatamente na fronteira do corte
  nunca deixa surrogate solto (`decodeURIComponent` não lança, `String.prototype.isWellFormed()`
  é `true`) — **test-writer**
- [X] T020 `src/lib/sacola/mensagem.ts`: `ORCAMENTO_URL = 1800`, `NOME_MAX = 40`, `montarPedido`
  (busca binária do `L` comum em `[0, 40]`, corte por `Array.from`, sem reticências),
  `restanteObservacao` e `medidorObservacao` (CS§4, A2: devolve modo e fração, nunca o
  comprimento codificado). Só importa `./observacao`, `./total`, `./textos` — **tech-lead**
- [X] T021 `npm run check` e `npm run test:int` (em série); colar o output real — **júnior**
- [ ] T022 Commit (humano):
  ```text
  feat(sacola): monta a mensagem do pedido dentro do limite da URL

  Nomes cortados por code point e encolhidos por igual antes da
  observação; a observação nunca é cortada. Pior caso e propriedade com
  semente fixa provam a URL do wa.me com no máximo 1800 caracteres.
  ```
  — **humano**

---

## SF3 — Conferência no servidor (`POST /api/catalogo/conferencia`) — **depois do GATE do ADR-012 (T023)**

**Usa**: CC§1–§5; ADR-012; research D6, D7, D8, D15; DM§8; spec FR-010, FR-011, FR-013, US3.8,
SC-007.
**Arquivos**: `src/lib/db/catalogo.ts` [TL✅], `src/lib/db/catalogo.int.test.ts`,
`src/test/db/catalogo-fixtures.ts`, `src/lib/catalogo/{falha,leitura,index}.ts` e
`leitura.test.ts`, `src/app/api/catalogo/conferencia/{route,route.test}.ts` (novos),
`src/test/conformance/conferencia-acesso.test.ts` (novo), `cloudflare/publico.ts` [TL✅] e
`publico.test.ts`.
**Fecha**: US3.8, FR-013, FR-010 (worker), SC-007 (rota); parte de US3.1–3.4 (servidor).
**Revisão**: ✅ humano revisa o diff (zonas protegidas).

- [X] T023 **GATE do ADR-012 — primeiro passo da SF3.** (1) O **humano** lê e aprova
  `specs/adr/012-conferencia-sacola.md`; (2) depois da aprovação, o tech-lead troca
  `**Status:** proposto` por `**Status:** aceito (AAAA-MM-DD, humano)` (a mudança entra no commit
  T034); (3) o tech-lead confere o status no arquivo. Sem aprovação, **parar e avisar o humano**;
  nenhuma task abaixo começa — **humano** (aprova) + **tech-lead** (registra e confere)
- [X] T024 [US3] Teste primeiro — ampliar `src/lib/db/catalogo.int.test.ts` (banco local, em
  série) com `conferirProdutos(db, ids)`: produto disponível com capa, esgotado, sem capa, id
  inexistente (fica fora do resultado); colunas `id`, `nome`, `preco_centavos`, `a_partir_de`,
  `esgotado`, `capa_chave` (subselect `CAPA` da 005); **uma única chamada** ao banco (spy em
  `db.execute`) para 15 ids. Fixtures novos em `src/test/db/catalogo-fixtures.ts` — **test-writer**
- [X] T025 [P] [US3] Teste primeiro — ampliar `src/lib/catalogo/leitura.test.ts` com
  `lerConferencia(codigos)`: código canônico → id; resposta **na ordem pedida**, um item por
  código; ausente ⇒ `{ codigo, estado: "inexistente" }` sem `produto`; esgotado ⇒
  `estado: "esgotado"` com `produto`; `produto` = `{ nome, href, precoCentavos, aPartirDe, capa }`
  (capa pela rota pública `/fotos/<arquivo>`); falha do banco marca a causa `"banco"` e propaga —
  **test-writer**
- [X] T026 [P] [US3] Teste primeiro — `src/app/api/catalogo/conferencia/route.test.ts` (CC§1–§4):
  `Content-Type: text/plain` ⇒ **415** `{}`; `application/json; charset=utf-8` aceito (mídia antes
  do `;`, sem diferenciar maiúsculas); `Content-Length: 2000` ⇒ **413** `{}` **sem ler o corpo**
  (spy no `body`); corpo de 2000 bytes **sem** `Content-Length` (stream) ⇒ **413** e leitura
  cancelada depois de 1024 bytes; JSON inválido, chave extra, `codigos` vazio, 16 códigos, `"42"`,
  `"0000"`, `"012345"`, `"2147483648"` (acima do `integer`), `"12345678901"` (11 dígitos),
  repetido ⇒ **400** `{}`; `"2147483647"` (10 dígitos) é aceito; banco fora ⇒ **503** `{}` e `registrarFalha`
  chamado **uma vez** com `{ evento: "catalogo.banco_indisponivel", rota:
  "/api/catalogo/conferencia", causa: "banco" }`; 200 com um item por código na ordem pedida;
  **todas** as respostas com `Cache-Control: no-store` e `X-Content-Type-Options: nosniff`; só
  `POST` exportado — **test-writer**
- [X] T027 [P] [US3] Teste primeiro — `src/test/conformance/conferencia-acesso.test.ts` (no molde
  de `catalogo-acesso.test.ts`): o arquivo da rota não importa `@/lib/auth`, `next/headers`
  (`cookies`, `headers`) nem submódulos do catálogo (só o barrel); exporta `dynamic =
  "force-dynamic"`; a resposta 200 só tem as chaves `itens`, `codigo`, `estado`, `produto`,
  `nome`, `href`, `precoCentavos`, `aPartirDe`, `capa`, `url`, `alt`; erros com corpo exatamente
  `{}`; **`console.log/info/warn/error/debug` espionados em todos os casos** (415, 413, 400, 503,
  200) nunca contêm nenhum código pedido, trecho do corpo nem o `Content-Length` (SC-007) —
  **test-writer**
- [X] T028 [P] [US4] Teste primeiro — ampliar `cloudflare/publico.test.ts` (D15): `/sacola` é
  `"pagina"` (200 ⇒ `X-Robots-Tag: noindex, nofollow` e `Cache-Control: public, max-age=60`;
  500 ⇒ 503 `no-store` com `Retry-After` e `registrarFalha` com `rota: "/sacola"`);
  `POST /api/catalogo/conferencia` passa **sem alteração** de status nem de cabeçalhos;
  `/sacolas` e `/sacola/x` **não** viram página — **test-writer**
- [X] T029 [TL✅] [US3] `src/lib/db/catalogo.ts`: `conferirProdutos(db, ids: number[])` com
  `WHERE p.id IN (${sql.join(ids)})`, reaproveitando o subselect `CAPA`; sem `ORDER BY`; sem
  escrita, sem índice novo, sem migration (CC§5, D8) — **tech-lead**
- [X] T030 [US3] `src/lib/catalogo/falha.ts` (`RotaFalha` += `"/api/catalogo/conferencia"` e
  `"/sacola"`), `src/lib/catalogo/leitura.ts` (`lerConferencia`, único ponto que chama
  `dbDoContexto`) e `src/lib/catalogo/index.ts` (exporta `lerConferencia` e os tipos) —
  **tech-lead**
- [X] T031 [US3] `src/app/api/catalogo/conferencia/route.ts` (D7, ordem exata: 415 → 413 pelo
  cabeçalho → 413 pela leitura com `getReader()` e teto de 1024 bytes → `JSON.parse` + Zod
  (`{ codigos: string[] }` estrito, 1 a 15, regex `^(?:\d{4}|[1-9]\d{4,9})$`, ≠ `"0000"`, valor
  ≤ 2.147.483.647 como o `lerProduto`, sem repetição) ⇒ 400 → `lerConferencia` → 200; 503 só com a causa `"banco"`, demais exceções
  relançadas; nenhum outro `console.*`) — **tech-lead**
- [X] T032 [TL✅] [US4] `cloudflare/publico.ts`: `classificar` trata `caminho === "/sacola"` como
  `"pagina"` e o 503 usa `rota: "/sacola"`; `POST` segue intocado (D15) — **tech-lead**
- [X] T033 `npm run check` e `npm run test:int` (**em série**); colar o output real — **júnior**
- [ ] T034 Revisão do diff pelo humano (zonas protegidas `src/lib/db/` e `cloudflare/`) e commit,
  incluindo o status "aceito" do ADR-012 registrado na T023:
  ```text
  feat(catalogo): adiciona a conferência pública da sacola

  POST /api/catalogo/conferencia com JSON até 1 KB, de 1 a 15 códigos e uma
  única consulta com IN; resposta sem cache, erros com {} e log só do 503,
  sem códigos nem corpo (ADR-012, aceito). /sacola tratada como página
  pública pelo worker (noindex, max-age=60, 503).
  ```
  — **humano**

---

## SF4 — Conferência no cliente e armazenamento

**Usa**: CS§5 (com o ajuste A1), CS§6; CC§6; DM§1–§3; research D4, D5, D13; spec FR-006, FR-007,
FR-008, FR-008a, FR-011, US3.5, US3.7, US4.1–4.5; riscos R1, R2.
**Arquivos**: `src/lib/sacola/{conferencia,armazenamento}.ts` e testes,
`src/lib/sacola/concorrencia.test.ts` (novo).
**Fecha**: US4.1–4.3, US4.5, FR-008a, US3.7 (cliente), US3.5 (`houveMudanca`).
**Revisão**: humano revisa o diff.

- [X] T035 [P] [US3] Teste primeiro — `src/lib/sacola/conferencia.test.ts` (CS§5, A1):
  `conferir` faz `POST /api/catalogo/conferencia` com `Content-Type: application/json` e corpo
  `{"codigos":[…]}`; 200 válido ⇒ lista. Devolve **`"falha"` sem lançar** em cada um destes
  casos, cada um num `it` próprio: **tempo-limite** (`fetch` que nunca resolve, `vi.useFakeTimers`,
  avançar 4000 ms ⇒ `"falha"` e o `AbortSignal` abortado), **erro de rede** (`fetch` rejeita com
  `TypeError`), **resposta 400**, **respostas 5xx** (500 e 503), 413, 415 e **200 fora do
  esquema** (estado desconhecido, item sem `codigo`, `produto` faltando em `ok`, código que não
  foi pedido). `lerRespostaConferencia` valida com `zod/mini`. `juntar` marca `precoAlterado`
  quando valor, `aPartirDe` ou ausência de preço diferem do visto. `houveMudanca` ⇒ `true` com
  inexistente, esgotado novo ou preço alterado; `false` sem mudança (US3.5) — **test-writer**
- [X] T036 [P] [US4] Teste primeiro — `src/lib/sacola/armazenamento.test.ts` (CS§6, DM§1, D5):
  `lerSacola` devolve vazia (sem gravar: spy em `setItem`/`removeItem`) para chave ausente, JSON
  corrompido, `v: 0`, `t` com mais de 7 dias, `t` mais de 1 dia no futuro, quantidade 11, código
  `"42"`, `"0000"`, `"2147483648"` ou `"12345678901"`, código repetido (e aceita `"2147483647"`), 16 itens, `p` 0 ou 10.000.000, chave extra em qualquer
  nível; `storage()` que lança ou `getItem` que lança ⇒ `{ disponivel: false }` (US4.4);
  `alterarSacola` relê **imediatamente antes** de gravar, grava só se `mudou`, limpa com
  `removeItem` quando vazia, dispara `roseshop:sacola`; `setItem` que lança ⇒
  `{ ok: false, motivo: "armazenamento" }`; o JSON gravado tem **só** `v`, `t` e
  `i[].c/q/p/a` (US4.5, FR-006); `assinarSacola` reage a `storage` só com `key ===
  "roseshop.sacola"` ou `key === null` e a `roseshop:sacola`, **nunca grava** (spy) e devolve a
  função de cancelar — **test-writer**
- [X] T037 [P] [US1] [US4] Teste primeiro — `src/lib/sacola/concorrencia.test.ts` (FR-008a, R1):
  `Storage` falso compartilhado por duas "abas" intercaladas: A lê, B lê, A grava `adicionar(X)`,
  B grava `adicionar(Y)` ⇒ **X e Y presentes**; mesmo produto com `mudarQuantidade` em A (3) e
  B (5) ⇒ vale a última (5); sacola com 14, A e B adicionam códigos diferentes ⇒ a segunda é
  recusada com `limite_produtos` sobre a relida; `aplicarConferencia` de A cobrindo só X não
  apaga Y adicionado por B no meio — **test-writer**
- [X] T038 [P] `src/lib/sacola/conferencia.ts`: `conferir` (`AbortController`, 4000 ms padrão,
  `fetch` injetável, **qualquer** não-200, rejeição ou esquema inválido ⇒ `"falha"`, nunca
  lança), `lerRespostaConferencia` (`zod/mini`), `juntar`, `houveMudanca`; reexporta
  `ItemConferencia` de `./sacola` — **tech-lead**
- [X] T039 [P] `src/lib/sacola/armazenamento.ts`: `CHAVE = "roseshop.sacola"`,
  `EVENTO_LOCAL = "roseshop:sacola"`, `lerSacola`, `alterarSacola`, `assinarSacola`; validação
  `zod/mini` do formato fechado de DM§1; todo `getItem`/`setItem`/`removeItem` e o próprio
  `storage()` dentro de `try/catch`; sem `navigator.locks` — **tech-lead**
- [X] T040 `npm run check` e `npm run test:int` (em série); colar o output real — **júnior**
- [ ] T041 Commit (humano):
  ```text
  feat(sacola): guarda a sacola no aparelho e confere pelo catálogo

  Cada alteração relê, valida, aplica e grava dentro de try/catch; outra
  aba só relê. A conferência do cliente devolve falha em tempo-limite de
  4 s, rede fora, 4xx, 5xx ou resposta fora do esquema, sem gravar nada.
  ```
  — **humano**

---

## SF5 — Ilhas do cabeçalho e do detalhe

**Usa**: CT§1, CT§2; research D9, D13; DM§8 (`ProdutoPublico.sacola`); spec FR-001, FR-002,
FR-002a, FR-003, FR-004, FR-008, US1.1–1.7, US4.4, US4.6, SC-005.
**Arquivos**: `src/lib/catalogo/leitura.ts` e `leitura.test.ts`,
`src/test/conformance/catalogo-acesso.test.ts`,
`src/app/(public)/_sacola/{usar-sacola,acesso-sacola,botao-sacola}.tsx` e testes (novos),
`src/app/(public)/layout.tsx` e `layout.test.tsx` (novo), `src/app/(public)/p/[codigo]/page.tsx`
e `page.test.tsx`.
**Fecha**: US1.1–1.7, US4.4, US4.6 (detalhe), FR-002a, SC-005 (continua verde).
**Revisão**: tech-lead revisa o diff do ui-dev.

- [X] T042 [US1] Teste primeiro — ampliar `src/lib/catalogo/leitura.test.ts`: `lerProduto`
  devolve `sacola: { codigo, precoCentavos, aPartirDe }` para disponível e `sacola: null` para
  esgotado (DM§8); para o produto de id 42, **`sacola.codigo === "0042"` (sem "#")**, enquanto
  `codigo === "#0042"` continua como na 005; para id 12345, `sacola.codigo === "12345"`. Ampliar `src/test/conformance/catalogo-acesso.test.ts`: as props do detalhe
  só ganham as chaves `sacola`, `precoCentavos` e `aPartirDe` — **test-writer**
- [X] T043 [US1] `src/lib/catalogo/leitura.ts`: campo `sacola` em `ProdutoPublico` (`null` se
  esgotado), com `codigo: codigoCanonico(id)` de `src/lib/catalogo/exibicao.ts` (**nunca** o
  `codigo` formatado com "#") — **tech-lead**
- [X] T044 [P] [US1] [US4] Teste primeiro — `src/app/(public)/_sacola/usar-sacola.test.tsx`
  (jsdom, D9/D13): `renderToString` devolve o estado do servidor `null`; depois de hidratar,
  lê a sacola; `localStorage` que lança ⇒ continua `null` sem erro nem `console.error`; evento
  `storage` de outra aba re-renderiza **sem** chamar `setItem` — **test-writer**
- [X] T045 [P] [US1] Teste primeiro — `src/app/(public)/_sacola/acesso-sacola.test.tsx` (CT§1,
  US1.7, FR-004): HTML do servidor vazio; hidratado: `<a href="/sacola">` com "Sacola, 2
  produtos", "Sacola, 1 produto", "Sacola, 0 produtos"; número dentro de `aria-live="polite"`;
  armazenamento que lança ⇒ nada; muda quando outra aba adiciona (US1.6); axe sem violações
  graves — **test-writer**
- [X] T046 [P] [US1] Teste primeiro — `src/app/(public)/_sacola/botao-sacola.test.tsx` (CT§2):
  fora da sacola ⇒ `<button>Adicionar à sacola</button>`; tocar chama `alterarSacola` com
  `adicionar({ codigo, precoCentavos, aPartirDe })` e vira `<a href="/sacola">Na sacola</a>`
  sem recarregar (US1.2); já na sacola ao abrir ⇒ "Na sacola" e tocar **não** muda a quantidade
  (US1.3); 15 na sacola ⇒ `aria-disabled="true"` + `aria-describedby` para o texto do limite e
  o clique não grava (US1.5); outra aba adiciona ⇒ vira "Na sacola" (US1.6); `setItem` que
  lança ⇒ "Não foi possível adicionar agora."; armazenamento indisponível ou antes de hidratar
  ⇒ nada; axe — **test-writer**
- [X] T047 [US1] [US4] Teste primeiro — `src/app/(public)/layout.test.tsx` (novo) e ampliar
  `src/app/(public)/p/[codigo]/page.test.tsx`: o layout tem `<div data-sacola="cabecalho"
  class="mx-auto flex h-12 max-w-xl justify-end px-4">` **vazio no HTML do servidor**; o detalhe
  disponível tem `<div data-sacola="detalhe" class="min-h-12">` **antes** do link "Perguntar no
  WhatsApp" (US1.1); esgotado **sem** o espaço e sem os dois botões (US1.4); nenhum texto
  "Adicionar à sacola" nem "Sacola," no HTML do servidor (FR-002a, US4.6) — **test-writer**
- [X] T048 [US1] [US4] `src/app/(public)/_sacola/usar-sacola.ts` (`useSyncExternalStore` com
  `getServerSnapshot = () => null`, `assinarSacola`, `lerSacola`), `acesso-sacola.tsx` e
  `botao-sacola.tsx` (`"use client"`), consumindo só `@/lib/sacola/*` — **ui-dev**
- [X] T049 [US1] `src/app/(public)/layout.tsx` (espaço do cabeçalho com `AcessoSacola`) e
  `src/app/(public)/p/[codigo]/page.tsx` (espaço do detalhe com `BotaoSacola`, só disponível,
  antes de `BotaoWhatsapp`). Nenhuma outra mudança de HTML: a T002 tem de continuar verde —
  **ui-dev**
- [X] T050 Revisão do diff do ui-dev (fronteira, sem lógica de negócio na tela, SC-005) —
  **tech-lead**
- [X] T051 `npm run check` (com a T002 verde no output) e `npm run test:int` (em série); colar
  o output real — **júnior**
- [ ] T052 Commit (humano):
  ```text
  feat(catalogo): adiciona o botão da sacola no detalhe e o contador

  Botão e contador aparecem só depois de hidratar, em espaços reservados;
  sem JavaScript ou sem armazenamento, o detalhe fica igual ao da 005.
  ```
  — **humano**

---

## SF6 — Página `/sacola`

**Usa**: CT§3 (com os ajustes A1 e A2), CT "Foco e anúncios"; CS§3–§6; research D10, D11, D12,
D13; DM§3, DM§6, DM§7; spec US2.1–2.13, US3.1–3.7, US4.6, FR-005, FR-009, FR-011, FR-014–FR-019,
SC-003, SC-006.
**Arquivos**: `src/app/(public)/sacola/{page,page.test}.tsx` (novos),
`src/app/(public)/_sacola/{tela-sacola,item-sacola,observacao,confirmar-limpar,enviar-pedido}.tsx`
e testes (novos; `enviar-pedido` sugerido), `src/test/conformance/catalogo-orcamento.test.ts`.
**Fecha**: US2, US3 (tela), US4.6 (`/sacola` sem JS), SC-003, SC-006.
**Revisão**: tech-lead revisa o diff do ui-dev.

- [X] T053 [P] [US3] **Teste dedicado do ajuste A1** — `src/app/(public)/_sacola/enviar-pedido.test.tsx`
  (jsdom, `fetch` e `location.assign` espionados, `localStorage` falso com spy): sacola conferida e
  pronta; ao tocar em "Enviar pedido pelo WhatsApp", a reconferência:
  1. **passa de 4 s** (fake timers, `fetch` pendente) ⇒
  2. **falha por rede** (`fetch` rejeita) ⇒
  3. **responde 400** ⇒
  4. **responde 5xx** (500 e 503) ⇒

  em **cada** caso, num `it` próprio: a tela entra no estado "Falha no envio (lista conferida
  mantida)" de CT§3, com `role="alert"` e o texto "Não consegui conferir agora, tente de novo.";
  **não** existe botão "Tentar de novo" à parte; `location.assign` **não** é chamado;
  `history.replaceState` não recebe `sacolaEnviada`; `setItem`/`removeItem` **não** são chamados
  (sacola intacta); lista conferida, resumo e observação continuam na tela; **o foco fica no
  botão de envio** (`document.activeElement`); o botão de envio continua ativo (sem
  `aria-disabled`) e é a nova tentativa: um novo toque com 200 sem mudança tira o alerta e abre o
  WhatsApp. Nenhum `wa.me` aparece no DOM em nenhum momento (SC-003) — **test-writer**
- [X] T054 [P] [US2] [US3] Teste primeiro — `src/app/(public)/_sacola/tela-sacola.test.tsx`
  (CT§3): estados um por vez — armazenamento indisponível (texto próprio + link), **vazia**
  (`#sacola-vazia`, link "Ver o catálogo", sem envio, US2.11), **conferindo** ("Conferindo a
  sacola…" com `role="status"`, sem preços), **falha ao abrir** ("Não foi possível conferir a
  sacola agora." + "Tentar de novo", envio `aria-disabled`, nada gravado, US3.7). O estado
  **armazenamento indisponível** tem `<h1>Sacola</h1>` e o texto literal de CT§3: "Não foi
  possível abrir a sacola neste navegador. Você ainda pode perguntar por cada produto no
  WhatsApp." com link ao catálogo. **Conferida**
  (nome com link, "#0042", capa ou "Sem foto", preço unitário, quantidade, valor da linha,
  subtotal, US2.1); esgotado em texto, fora do subtotal, sem quantidade, com "Remover" (US3.1);
  inexistente ⇒ removido e aviso "O produto #0042 não está mais no catálogo." (US3.3); preço
  alterado ⇒ preço atual e "O preço mudou desde que você adicionou." (US3.4); todos esgotados ⇒
  envio desabilitado com texto (US3.6); **esgotado que volta** (US3.2): item conferido como
  `esgotado` e, ao reabrir, como `ok` volta ao subtotal com a quantidade que tinha; quantidade:
  "−" `disabled` em 1, "+" em 10, subtotal atualiza (US2.2) e **o novo subtotal é anunciado** na
  região `aria-live="polite"` do resumo enquanto **o foco fica no botão** tocado; avisos
  (inexistente, preço) dentro de `role="status"`; "Remover" ⇒ foco em `#sacola-titulo` e anúncio "Produto removido.
  Subtotal: …"; remover o último ⇒ foco em `#sacola-vazia` (US2.3); "Limpar sacola" abre
  `<dialog>` "Todos os produtos vão sair da sacola."; "Cancelar" devolve o foco ao botão;
  "Limpar" esvazia e foca `#sacola-vazia` (US2.4); outra aba adiciona um código ⇒ só esse código
  é conferido e o foco não se move (D13); axe sem violações graves em cada estado; percurso só
  com Tab/Enter/Espaço, incluindo o diálogo (SC-006) — **test-writer**
- [X] T055 [P] [US2] Teste primeiro — `src/app/(public)/_sacola/observacao.test.tsx` (ajuste A2,
  CT§3, FR-015a, FR-016): `<label>` ligado ao `<textarea id="obs">` sem `maxLength` e com
  `aria-describedby="obs-medidor obs-conta"`; com sacola pequena, `#obs-medidor` mostra
  **"N de 200"** contando code points do texto **normalizado** (colar `"  oi\r\n\r\n\r\n👍  "`
  mostra "5 de 200"); com 15 produtos de nomes longos, ao digitar até o orçamento da URL mandar,
  troca para **"Espaço da mensagem quase cheio"** com `<progress>` (`aria-label="Espaço da
  mensagem usado"`) e **nenhum número de caracteres codificados no texto do DOM**; **anúncio**:
  `#obs-medidor` **não** tem `aria-live`; `#obs-conta` tem `aria-live="polite"` e o texto dele
  muda **só na transição de modo** (vazio → "Espaço da mensagem quase cheio" → excesso; registrar
  as mutações com `MutationObserver` e conferir exatamente uma mudança por transição e nenhuma
  ao digitar dentro do mesmo modo); entrada que passaria do limite é desfeita (o texto não
  cresce); a sacola cresce em outra aba ⇒ "A observação não cabe mais na mensagem. Encurte para
  enviar.", barra cheia e envio desabilitado, texto **não cortado**; a mesma entrada suja gera a
  mesma string em contador, campo e mensagem (FR-015a, três pontos); recarregar ⇒ campo vazio
  (US2.8) — **test-writer**
- [X] T056 [US2] [US3] [US4] Teste primeiro — `src/app/(public)/sacola/page.test.tsx` e
  ampliar `src/app/(public)/_sacola/enviar-pedido.test.tsx` **depois da T053** (mesmo arquivo,
  por isso em série com ela): página com `<noscript>` "Ative o JavaScript para usar a sacola." e
  link "Ver o catálogo" para `/` (US4.6, FR-009); `dynamic = "force-dynamic"`; passa
  `configCatalogo().whatsapp` à `TelaSacola`. Em `enviar-pedido.test.tsx`: **caminho feliz** ⇒
  reconfere, `history.replaceState` com `sacolaEnviada: true` e `location.assign(url)` com
  `url.length ≤ 1800`, mensagem sem esgotado, sem removido e sem preço antigo (SC-003, US2.7);
  **mudança na reconferência** ⇒ avisos, foco em `#sacola-titulo`, `location.assign` não
  chamado (US3.5); **número inválido** (`whatsapp: null`) ⇒ `aria-disabled="true"`,
  `aria-describedby="envio-indisponivel"`, texto "O envio pelo WhatsApp está indisponível no
  momento. Tente mais tarde.", nenhum `href` e nenhum `wa.me` no DOM, `montarPedido` nunca
  chamado (spy no módulo), resto da sacola funciona (US2.12, FR-017); **volta** (`pageshow` com
  `history.state.sacolaEnviada`) ⇒ "Seu pedido foi aberto no WhatsApp.", "Limpar sacola" e
  "Voltar" para `/`, sacola intacta (US2.9, FR-018). Ampliar
  `src/test/conformance/catalogo-orcamento.test.ts`: `/sacola` exporta `force-dynamic` e nenhum
  `revalidate` — **test-writer**

  > Sem `[P]`: a T056 divide `enviar-pedido.test.tsx` com a T053 e só começa depois dela.

- [X] T057 [P] [US2] [US3] `src/app/(public)/_sacola/item-sacola.tsx` (linha da lista, quantidade
  com `aria-label` "Diminuir/Aumentar quantidade de <nome>", `<output>`, "Remover", "Esgotado",
  aviso de preço) e `src/app/(public)/_sacola/confirmar-limpar.tsx` (`<dialog>` nativo com
  `showModal()`, "Limpar" e "Cancelar") — **ui-dev**
- [X] T058 [P] [US2] `src/app/(public)/_sacola/observacao.tsx` (ajuste A2, CT§3): guarda o texto
  bruto; modo por `medidorObservacao` de `@/lib/sacola/mensagem`; `#obs-medidor` sem `aria-live`
  ("N de 200" ou `<progress>`); `#obs-conta` com `aria-live="polite"` cujo texto só muda na
  transição de modo ("Espaço da mensagem quase cheio"; excesso); desfaz a entrada que deixaria
  `restanteObservacao < 0` só quando o texto cresce; nunca mostra o número codificado — **ui-dev**
- [X] T059 [US2] [US3] `src/app/(public)/_sacola/enviar-pedido.tsx` (D11 + ajuste A1):
  `<button type="button">`, nunca `<a href>`; toque ⇒ `normalizarObservacao` → `conferir` →
  `"falha"` ⇒ **bloqueia**: estado "Falha no envio (lista conferida mantida)" de CT§3, com
  `<p role="alert">Não consegui conferir agora, tente de novo.</p>`, foco no próprio botão, botão
  ativo como nova tentativa (sem botão "Tentar de novo" à parte) e nada gravado;
  senão `alterarSacola(aplicarConferencia(...))`; `houveMudanca` ⇒ avisos e foco no título;
  senão `montarPedido` → `history.replaceState({ ...history.state, sacolaEnviada: true }, "")`
  → `location.assign(url)` (mesma aba, sem `window.open`). Número inválido ⇒ ramo sem
  `montarPedido`, com `aria-disabled` + `aria-describedby` — **ui-dev**
- [X] T060 [US2] [US3] [US4] `src/app/(public)/_sacola/tela-sacola.tsx` (estados de CT§3, com
  "Falha ao abrir" e "Falha no envio (lista conferida mantida)" como estados distintos,
  conferência ao abrir e de códigos novos de outra aba, foco e anúncios de CT "Foco e anúncios",
  confirmação pelo `pageshow`) e `src/app/(public)/sacola/page.tsx` (`force-dynamic`,
  `<noscript>` e `TelaSacola` com `configCatalogo().whatsapp`) — **ui-dev**
- [X] T061 Revisão do diff do ui-dev: regras só por `@/lib/sacola/*`, nenhum `wa.me` montado fora de
  `montarPedido`, nenhuma gravação no caminho de falha (A1), contador sem número codificado (A2)
  — **tech-lead**
- [X] T062 `npm run check` e `npm run test:int` (em série); colar o output real — **júnior**
- [ ] T063 Commit (humano):
  ```text
  feat(sacola): adiciona a página da sacola e o envio pelo WhatsApp

  Lista conferida com avisos de esgotado, removido e preço, quantidades,
  remover e limpar com foco anunciado, observação com medidor do espaço e
  envio que reconfere antes de abrir; sem conferência válida, não envia.
  ```
  — **humano**

---

## SF7 — Roteiro no `preview` (local)

**Usa**: Q§2, Q§3, Q§4.
**Fecha**: provas manuais M da Cobertura do plan (local); SC-005 (roteiro da 005).
**Revisão**: —. Sem commit próprio: o registro entra no commit da SF8.

- [X] T064 Subir `npm run db:up`, `npm run db:migrate`, `npm run preview` e `npm run seed:local`;
  rodar os `curl` de Q§2 e colar o output real (200 na ordem, 415, 413 com e sem
  `Content-Length`, 400, 405, `no-store`; com `npm run db:down`, 503 `{}` e um único log
  fechado; nenhum código nos logs do `preview`) — **júnior**
  > **Resultado (2026-10-16, `preview` local, seed com 41 produtos de `0002` a `0042`; o `0001`
  > não existe no seed):
  > - `{"codigos":["0001","0002","9999"]}` ⇒ 200, `Cache-Control: no-store`,
  >   `x-content-type-options: nosniff`; itens na ordem pedida: `0001` inexistente, `0002` ok,
  >   `9999` inexistente. Extra, para cobrir o esgotado: `["0016","9999","0003","0005"]` ⇒ 200 na
  >   ordem pedida: esgotado, inexistente, ok, esgotado.
  > - `text/plain` ⇒ 415 `{}`; 2000 bytes com `Content-Length: 2000` ⇒ 413 `{}`; 2000 bytes com
  >   `transfer-encoding: chunked` (sem `Content-Length`) ⇒ 413 `{}`; `{"codigos":["42"]}` ⇒ 400
  >   `{}`. Todos com `no-store` e `nosniff` (cabeçalhos do pedido conferidos com `curl -v`).
  > - `GET` ⇒ 405, mas **sem** `Cache-Control: no-store` e sem `nosniff` (vem só
  >   `X-Robots-Tag: noindex, nofollow`): é o 405 padrão do Next (contrato §1), que contradiz o
  >   "todas as respostas" do §3. **Desvio pendente**: emendar o §3 do
  >   `contracts/conferencia.md` ou responder o 405 pela rota (decisão do tech-lead/humano).
  > - `npm run db:down` ⇒ 503 `{}` com `no-store` e `nosniff`; exatamente **um** registro
  >   `{"evento":"catalogo.banco_indisponivel","rota":"/api/catalogo/conferencia","causa":"banco"}`
  >   (nível `error`). Banco de volta com `npm run db:up`, `/api/health` 200, 41 produtos.
  > - Logs: o terminal do `preview` mostrou só as linhas `[wrangler:info] <método> <rota>
  >   <status>`. O wrangler 4.147.0, quando detecta um agente, manda o `console.*` do worker para
  >   a observabilidade local, e não para o terminal; o registro do 503 foi lido de lá, em
  >   `POST /cdn-cgi/local/explorer/api/local/observability/query` (tabela `logs`). Busca por
  >   `0001|0002|9999|0016|0003|0005|codigos|aaaa` no terminal e na tabela `logs` da sessão:
  >   nenhuma ocorrência.
- [X] T065 Roteiro de telas Q§3 (itens 1 a 12; no **item 2**, registrar toque a toque os toques
  da sacola de um pedido de 3 produtos, do primeiro "Adicionar à sacola" até o envio: 5
  esperados (3 "Adicionar à sacola", abrir a sacola, enviar), aprovado se ≤ 6, SC-001; incluindo **a conferência do envio com o
  `preview` parado ou o banco fora ⇒ "Não consegui conferir agora, tente de novo." e sacola
  intacta**, e o medidor da observação passando de "N de 200" para "Espaço da mensagem quase
  cheio") e regressão da 005 em Q§4 (`curl -sI /sacola` com `X-Robots-Tag`). O item 11 exige o
  humano editar o `.dev.vars` — **humano** (com o júnior colando os outputs de terminal)
  > **Resultado (2026-10-16, humano)**: itens 1 a 12 aprovados. Item 2 (SC-001): **5 toques** da
  > sacola (3 "Adicionar à sacola", abrir a sacola, enviar), aprovado por ser ≤ 6. Conferência
  > do envio com o `preview` parado ⇒ "Não consegui conferir agora, tente de novo." e sacola
  > intacta. Medidor da observação passou de "N de 200" para "Espaço da mensagem quase cheio".
  > `X-Robots-Tag` conferido em `/sacola` (Q§4). O passo extra de confirmação de "Limpar sacola"
  > depois do envio não incomodou: **mantido**.
- [X] T066 Registrar o resultado (aprovado ou falhas com o passo) nesta task e em
  `specs/006-sacola-whatsapp/rastreabilidade.md` (novo, critério → prova) — **tech-lead**
  > **Resultado (2026-10-16)**: SF7 aprovada, sem falhas no roteiro de telas. Fica pendente
  > o desvio do 405 sem `no-store`/`nosniff` (T064), uma questão de contrato que não aparece na
  > tela. `rastreabilidade.md` criado com as provas locais; a SF8 (T071) completa com o dev.

---

## SF8 — Prova no dev (Android real, pior caso, CPU, logs)

**Usa**: Q§5; research R3, R4; ADR-010; spec SC-001, SC-004, SC-007, US2 Independent Test.
**Arquivos**: `specs/006-sacola-whatsapp/rastreabilidade.md`.
**Fecha**: SC-001, SC-002 (aparelho), SC-004, SC-007 (logs).
**Revisão**: tech-lead.

- [ ] T067 Deploy do dev pelo PR (`pull-request.yml`) e `npm run seed:dev` — **humano**
- [ ] T068 Q§5.1 mensagem real num Android com Chrome (3 produtos: com preço, "a partir de", sem
  preço; observação com acento, emoji e quebra); conferir a conversa e a confirmação na volta;
  **SC-001**: registrar toque a toque (1º, 2º e 3º "Adicionar à sacola", abrir a sacola, enviar;
  a navegação entre produtos fica fora da contagem), 5 esperados, aprovado se ≤ 6; anotar o total
  e qualquer toque extra com o motivo — **humano**
- [ ] T069 Q§5.2 pior caso no aparelho (R3): 15 produtos de nomes longos, quantidade 10,
  observação até o medidor marcar o limite; a mensagem chega inteira. Registrar modelo, Android,
  Chrome e WhatsApp. Se truncar, parar e levar ao tech-lead (reduzir `ORCAMENTO_URL` sem mudar a
  regra) — **humano**
- [ ] T070 Q§5.3 e Q§5.4: `npx wrangler tail --env dev --format json`, 10 aberturas da sacola com
  15 produtos (5 com isolate novo); `cpuTime`, `outcome` e ausência de Erro 1102 (SC-004,
  ADR-010); nenhum código, quantidade ou observação no `tail` (SC-007) — **humano**
- [ ] T071 Registrar T068–T070 em `specs/006-sacola-whatsapp/rastreabilidade.md` (como a T139 da
  005) e revisar a coerência com SC-001/SC-002/SC-004/SC-007 — **tech-lead**
- [ ] T072 Commit (humano):
  ```text
  docs(specs): registra a prova da sacola no preview e no dev

  Roteiro local, mensagem real e pior caso num Android, CPU da conferência
  com 15 produtos e logs sem dados do pedido.
  ```
  — **humano**

---

## SF9 — Fechamento: README, docs e PR

**Usa**: plan, linha SF9; CLAUDE.md "Documentação" (rota nova e módulo novo em `src/` acionam o
doc-sync).
**Arquivos**: `README.md`, `docs/` e seções "Estrutura"/"Estado atual" do `CLAUDE.md` (pelo
doc-sync), `specs/006-sacola-whatsapp/rastreabilidade.md`.
**Fecha**: entrega da 006 (merge pelo humano).
**Revisão**: tech-lead.

- [ ] T073 [P] `README.md`: rota `POST /api/catalogo/conferencia`, página `/sacola`, nenhuma
  variável nova — **redator**
- [ ] T074 [P] Fechar `specs/006-sacola-whatsapp/rastreabilidade.md` com os pendentes de entrega
  (SC-001 com cliente real, junto da T143 da 004 e da T098 da 005) — **tech-lead**
- [ ] T075 Acionar o `doc-sync-onboarding` (rota nova, módulo `src/lib/sacola/`, zona protegida
  alterada): `docs/` e as seções "Estrutura" e "Estado atual" do `CLAUDE.md` — **doc-sync**
- [ ] T076 `npm run check` e `npm run test:int` (em série); colar o output real — **júnior**
- [ ] T077 Commits (humano): `docs(readme): …` (T073), `docs(specs): …` (T074) e
  `docs(onboarding): …` (T075), mensagens propostas pelo redator — **humano**
- [ ] T078 PR para `main` (comando e corpo mostrados ao humano antes do push), merge pelo humano
  e conferência pós-deploy (Q§6): `/api/health` 200, um `POST` de conferência com código
  existente (200, `no-store`) e `curl -sI /sacola` com `X-Robots-Tag` — **humano**

---

## Dependências e paralelismo

- **Entre SFs**: linear, como em [Ordem entre SFs](#ordem-entre-sfs), com o GATE T004 (ADR-013)
  entre a SF0 e a SF1 e o GATE do ADR-012 no início da T023. Dentro de cada SF: testes
  `[P]` do test-writer → implementação → check/test:int (júnior) → revisão → commit.
- **Paralelos por SF** (arquivos disjuntos):
  - SF1: T007, T008, T009, T010 (testes); depois T013, T014, T015 (implementação, após T011 e T012).
  - SF2: T018, T019.
  - SF3: T025, T026, T027, T028 (a T024 é `test:int` e roda sozinha).
  - SF4: T035, T036, T037; depois T038, T039.
  - SF5: T044, T045, T046 (T042 e T047 tocam arquivos já existentes de outras SFs e vão em série).
  - SF6: T053, T054, T055 (T056 depois da T053); depois T057, T058; T059 e T060 em série.
  - SF9: T073, T074.
- **Nunca em paralelo**: duas execuções de `test:int`; `test:int` junto do `test:perf`.

## Estratégia de implementação

- **MVP** = SF0 → SF6: as três histórias P1 (adicionar, revisar e enviar, conferência) e a P2
  (aparelho) já entram juntas, porque o envio sem conferência violaria a SC-003 e a sacola sem
  armazenamento não existe. Não há corte útil menor que isso.
- Entrega incremental por commit de SF: cada SF deixa o `check` verde e não muda o que a
  cliente vê até a SF5 (a T002 garante o HTML da 005).
- SF7 e SF8 são prova; SF9 é documentação e merge.

## Cobertura (spec → tasks)

| Critério | Tasks |
|---|---|
| US1.1, FR-001 | T047, T049 |
| US1.2, US1.3, FR-002 | T008, T046, T048 |
| US1.4 | T047, T002 |
| US1.5, FR-003 | T008, T046 |
| US1.6, FR-008 | T036, T044, T045, T046, T065 |
| US1.7, FR-004 | T045 |
| US2.1–2.4, FR-005, FR-009 | T054, T057, T060 |
| US2.5, US2.6, FR-012 | T009, T015 |
| US2.7, FR-014 | T018, T056, T068 |
| US2.8, FR-015a | T007, T018, T055 |
| US2.9, FR-018 | T056, T068 |
| US2.10 | T018, T068 |
| US2.11 | T054 |
| US2.12, FR-017 | T056, T065 |
| US2.13, FR-015, FR-016, SC-002 | T018, T019, T055, T058, T069 |
| US3.1–3.4, SC-003 | T008, T024, T025, T035, T054, T056, T065 |
| US3.5 | T035, T056 |
| US3.6 | T054 |
| US3.2 | T008, T054 |
| US3.7 + ajuste A1 | T035, **T053**, T054, T059, T060, T065 |
| US3.8, FR-013 | T026, T027, T064 |
| US4.1–4.3, FR-007 | T036, T065 |
| US4.4, FR-002a | T036, T044, T045, T046, T047 |
| US4.5, FR-006 | T036 |
| US4.6, FR-010 | T028, T032, T047, T056 |
| FR-008a | T008, T036, T037 |
| FR-019, SC-006 | T045, T046, T053 (foco), T054 (foco, anúncio do subtotal), T055 (`#obs-conta`) |
| Constitution IV (desvio) | ADR-013, GATE T004 |
| SC-001 | T065 (item 2, `preview`), T068 (dev) |
| SC-004 | T070 |
| SC-005 | T001, T002, T049, T051, T065 |
| SC-007 | T027, T064, T070 |
