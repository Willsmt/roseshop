# Tasks: Fotos de produto com sugestão por IA (feature 004)

**Branch**: `feature/004-fotos-produto` | **Fontes**: [plan.md](./plan.md),
[data-model.md](./data-model.md), [contracts/fotos.md](./contracts/fotos.md) (aqui "F§n"),
[contracts/ia.md](./contracts/ia.md) ("I§n"), [contracts/telas.md](./contracts/telas.md) ("T§n"),
[quickstart.md](./quickstart.md) ("Q§n"). Da spec: Clarifications e critérios de aceite.

## Como ler

- Cada sub-fase (SF) é **autossuficiente**: a implementação lê só a sua seção e os trechos dos
  contratos citados em **Usa**. Cada seção traz **Usa**, **Arquivos**, **Fecha** (critérios de
  aceite), **Revisão TL** (da coluna do plan), as tasks e a mensagem de commit.
- Formato: `- [ ] Txxx [P?] [USn…] Descrição com caminho — **dono**`. `[P]` = pode rodar em
  paralelo com a task vizinha, sem arquivo em comum. Sem `[P]` = em série. Nomes de arquivo
  que o plan não fixa são **sugeridos** (marcados "sugerido").
- **Donos**: `principal` = sessão principal (sonnet) · `test-writer` (sonnet) · `ui-dev`
  (sonnet) · `tech-lead` (opus, só revisa o diff) · `redator` (haiku) · `doc-sync`
  (`doc-sync-onboarding`) · `humano` (executa, aprova, commita).
- Testes antes da implementação (Red → Green) em cada SF. "Pronto" de cada SF = `npm run
  check` (+ `npm run test:int` quando há `*.int.test.ts`) com **output real**, nunca simulado.
- **Revisão TL ✅** (coluna do plan): a SF toca zona protegida (`src/lib/db/`, `src/lib/r2/`,
  `src/lib/ai/`, `wrangler.jsonc`, `.dev.vars.example`, `cloudflare/`, `tsconfig.json`). A
  penúltima task dessas SFs é a revisão do diff pelo tech-lead (opus). Tasks de implementação
  que tocam zona protegida levam o marcador **[TL✅]**; testes escritos dentro de zona
  protegida não levam o marcador e entram na revisão do diff da SF. D18: a sessão principal
  implementa; o tech-lead só revisa.
- **A última task de cada SF é o commit, executado pelo humano**, com a mensagem pronta
  (Conventional Commits, linhas ≤ 100 caracteres, **sem** `Co-Authored-By` e sem `Claude-Session`).
  Nas SFs com Revisão TL ✅, o humano revisa o diff (já revisado pelo tech-lead) antes de
  commitar: é a revisão humana da constitution III.7.
- Agentes nunca leem, imprimem nem editam `.dev.vars*` reais (só `.dev.vars.example`); o humano
  cria e edita o `.dev.vars`. Nenhuma task acessa o **banco** (Neon dev ou produção) a partir
  da máquina local (constitution VIII); o que é verificado lá, o humano verifica pelo
  console/CI. Exceção registrada no Constitution Check do plan (linha VIII): o **humano** opera
  por `wrangler` sobre R2, secrets e logs do dev e de produção a partir da máquina local.
- Nenhuma task usa `db.transaction()` (ADR-008): escritas de fotos são `db.batch` sob lock.
- Nenhum `git push` sem confirmação do humano (comando e corpo do PR mostrados antes).

## Ordem entre SFs

`SF0 → aprovação dos ADRs → SF1` · `SF1 → SF2` · `SF1 → SF3` (SF2 e SF3 só dependem da SF1) ·
`SF1 → SF4 → SF5` · `SF2 + SF3 + SF4 → SF6` · `SF5 → SF7` · `SF8` (sem dependência de banco) →
`SF9` (depende também de SF6) · `SF6 + SF8 + SF9 → SF10` · `SF7 + SF10 → SF11` ·
`SF3 + SF4 → SF12` · `SF3 + SF4 → SF13 → SF14` (SF14 depende também de SF9) ·
`todas → SF15`.
Entre a SF6 e a SF9 o cadastro fica sem tela funcional **no branch**; nada vai a `main` antes
da SF15.

---

## SF0 — Spikes R1–R5 e ADRs (humano executa os spikes e aprova os ADRs)

**Usa**: plan: linha SF0, seção "ADRs"; Q§1 (itens 1, 2 e 5, só para dev); Q§5.1–5.2; F§7
(`assinatura.ts`, configuração por ambiente); I§4 e I§5; research §3 (R1–R5, onde os outputs
são registrados) e research D2/D6. Nenhum código de produção é escrito nesta SF.
**Arquivos**: scripts de spike **fora do repositório** (nunca commitados); `research.md` §3
(outputs); `specs/adr/009-fotos-r2.md`, `specs/adr/010-ia-openai.md`, emenda em
`specs/adr/008-*.md`.
**Fecha**: provas de R1, R2, R3 e R5; R4 registrado como adiado. Habilita SF1.
**Revisão TL**: ✅ (ADRs).

- [X] T001 (feito em 2026-10-09; o limite de gasto OpenAI ficou configurado mas **não
  aplicado**, ver T014b) **Humano executa** — pré-requisitos dos spikes (Q§1 itens 1 e 5, só dev): criar o
  token R2 **Object Read & Write** com escopo só no bucket `roseshop-dev`; criar/conferir a
  chave OpenAI **dev** com **limite de gasto mensal** (sugestão US$ 5) e alerta por e-mail;
  guardar os valores só em variáveis do shell da sessão do spike, nunca em arquivo versionado —
  **humano**
- [X] T002 (feito em 2026-10-09; por decisão do humano, os scripts ficaram em `.spike/`, excluído
  pelo `.git/info/exclude`, e leem credenciais só do `.dev.vars`) Escrever os scripts de spike
  **fora do repo** (no diretório de rascunho da sessão),
  sem credenciais embutidas, lendo tudo de variáveis de ambiente: (a) R1 — assina com `aws4fetch`
  (`signQuery: true`, `allHeaders: true`, `X-Amz-Expires=300`) um `PUT` com `content-type`,
  `content-length` e `if-none-match: *`; (b) R2 — mesmo `PUT` contra o endpoint S3 simulado do
  `wrangler dev`/`preview` com `local_dev.experimental_s3_credentials`; (c) R3 — worker mínimo
  com `fetch` + `scheduled` que chama o handler gerado em processo; (d) R5 — chamada à Responses
  API com imagem sintética (I§4: `store: false`, `json_schema` estrito, `detail: low`) para
  `gpt-6-luna` e `gpt-5.4-mini` — **principal**
- [X] T003 **Humano executa R1** (bucket dev): `PUT` com exatamente N bytes ⇒ 200; com N±1
  bytes ⇒ 403; **segundo `PUT` na mesma URL ⇒ 412**; `PUT` sem `if-none-match` ⇒ 403;
  `PUT` com `content-type` diferente ⇒ 403. Entregar o output real. Se o R2 **não** impuser
  `if-none-match`, registrar que vale a reserva do research D2 (coluna `etag` na SF1) — **humano**
- [X] T004 **Humano executa R2**: no `preview` (wrangler fixado no `package.json`), `PUT` pela
  URL assinada contra `http://localhost:8787/cdn-cgi/local/r2/s3/roseshop-local/...` e leitura do
  objeto pelo binding; confirmar `experimental_s3_credentials` aceita na versão fixada. Entregar
  o output real; se falhar, registrar a reserva do research D2/ADR-009 — **humano**
- [X] T005 **Humano executa R3**: (local) `npx opennextjs-cloudflare build && npx wrangler dev
  --test-scheduled` e `curl "http://localhost:8787/cdn-cgi/handler/scheduled?cron=0+6+*+*+*"`
  ⇒ o `scheduled` chama o handler em processo e a rota responde; (dev) cron temporário
  `*/5 * * * *` e `npx wrangler tail --env dev` mostrando a chamada. Entregar os outputs;
  se a chamada em processo falhar, registrar a reserva do research D6 — **humano**
- [X] T006 **Humano executa R5**: rodar o script de T002(d) para os dois modelos, `none` e
  `low` de esforço; entregar status HTTP, duração, `usage` e a forma da saída (JSON do
  schema estrito). Sem imprimir a chave — **humano**
- [X] T007 **R4 (adiado)** — registrar em `research.md` §3, junto com os outputs de R1/R2/R3/R5:
  "R4 (aparelhos reais, Chrome Android e Safari iOS) **adiado para a SF10**". Ponteiro: SF10,
  Q§5.4. **Critério de saída**: fixtures reais commitadas, lista de blocos e do ICC fechadas
  (tags e limite), `FOTOS_VERIFICACAO` fora do `env.dev` e `exiftool` sem EXIF/GPS/XMP/IPTC nos
  objetos baixados. Nenhum spike deve ser feito agora para R4 — **principal**
- [X] T008 Registrar em `research.md` §3 os outputs reais de R1, R2, R3 e R5 (entregues pelo
  humano) e as decisões que eles destravam: coluna `etag` sim/não (SF1), reserva do R2 local,
  reserva do cron, modelos candidatos da SF13 — **principal**
- [X] T009 Rascunhar `specs/adr/009-fotos-r2.md` com o conteúdo da seção "ADRs" do plan
  (envio direto por URL pré-assinada, `aws4fetch`, token por bucket, 5 min, `content-type` +
  `content-length` + `if-none-match: *` ou as reservas conforme R1, CORS versionado,
  constraints novas em `produto_fotos` (D16), só JPEG/WebP quadrados de 400 a 1200 px, regra do
  ICC, chave única sem mover + `fotos_envio`, verificação por lista de permitidos sem decodificar,
  modo registro só no dev, rota com sessão, worker próprio + Cron Trigger, R2 local por
  `experimental_s3_credentials` ou reserva conforme R2/R3) **[TL✅]** — **principal**
- [X] T010 [P] Rascunhar `specs/adr/010-ia-openai.md` (Responses API por `fetch`, `store: false`,
  structured output estrito, base64 com `detail: low`, 20 s, modelo/esforço **a definir pela
  medição da SF13**, contador no Postgres 30/pessoa e 100/dia, resposta tratada como entrada
  não confiável, teto de gasto no provedor) **[TL✅]** — **principal**
- [X] T011 [P] Rascunhar a emenda do ADR-008 em `specs/adr/008-*.md`: chaves de lock `4_001` e
  `4_002`; forma "lock global + `UPDATE` com pré-condições e token + statements guardados pelo
  token"; adoção por `DELETE … RETURNING` em CTE; reordenação por apagar e reinserir; convenção
  "writer de campos/status/destaque incrementa `versao`" **[TL✅]** — **principal**
- [X] T012 Revisão dos três rascunhos pelo tech-lead (opus): coerência com a constitution,
  com os outputs de T008 e com o plan; reservas escritas onde algum risco falhou —
  **tech-lead**
- [X] T013 (aprovado em 2026-10-09, com ajustes) **GATE — aprovação do humano**: ler e aprovar ADR-009, ADR-010 e a emenda do ADR-008.
  **A SF1 não começa sem esta aprovação.** (Os campos "modelo/esforço" do ADR-010 ficam
  provisórios até a SF13.) — **humano**
- [ ] T014 Commit (humano), mensagem:
  ```text
  docs(adr): registra fotos no R2, IA e emenda do ADR-008

  ADR-009 (fotos no R2), ADR-010 (sugestão por IA) e emenda do ADR-008
  (locks 4_001/4_002 e batch guardado por token), com os outputs dos
  spikes R1, R2, R3 e R5. R4 segue para a SF10.
  ```
  — **humano**
- [X] T014a **Humano executa** — depois do R1, remover do `.dev.vars` as três linhas
  `SPIKE_R2_DEV_ENDPOINT`, `SPIKE_R2_DEV_ACCESS_KEY_ID` e `SPIKE_R2_DEV_SECRET_ACCESS_KEY`; o
  token do bucket dev passa a viver só no `wrangler secret --env dev` (SF3) — **humano**
- [ ] T014b **Humano executa — condição de entrada da SF13**: aplicar o limite de gasto do
  projeto OpenAI dev (configurado em US$ 5 com alerta em 100%, ainda **não aplicado**; research
  §3, R5; constitution III.5). Se a conta não permitir aplicar, emendar o ADR-010 registrando a
  limitação do provedor e o contador do app como controle principal. **A SF13 não começa sem
  esta task fechada** — **humano**

---

## SF1 — Schema, migration `0002` e locks

**Usa**: DM: tudo (Diagrama, tabelas `fotos_envio`, `produtos`, `produto_fotos`, `ia_uso`,
Registro de locks, Invariantes, Migration `0002`). Plan: linha SF1.
**Arquivos**: `src/lib/db/schema.ts`, `src/lib/db/migrations/0002_*.sql`,
`src/lib/db/locks.ts`, testes `src/lib/db/fotos.schema.int.test.ts` (sugerido).
**Fecha**: invariantes de banco (FR-003 só a parte de banco, FR-015, FR-016, D12, D16).
**Revisão TL**: ✅.

- [X] T015 **Teste primeiro** — `src/lib/db/fotos.schema.int.test.ts`, uma prova por linha:
  `fotos_envio`: `id` v4 (`uuid_extract_version(id) = 4`, `fotos_envio_id_v4`; v7 ⇒ `23514`);
  `formato IN ('webp','jpeg')` (`fotos_envio_formato`); `tamanho BETWEEN 1 AND 1048576`
  (`fotos_envio_tamanho`; 0 e 1048577 ⇒ `23514`); `estado IN ('emitido','confirmado')`;
  `CHECK ((estado = 'confirmado') = (confirmado_em IS NOT NULL))` (`fotos_envio_confirmacao`);
  coluna gerada `chave` = `'fotos/' || id::text || '.webp'` ou `'.jpg'` (`STORED`), `UNIQUE`
  (`fotos_envio_chave_unique`), nenhum writer a informa (insert com `chave` ⇒ erro);
  `produto_fotos`: `UNIQUE (chave_objeto)` (`produto_fotos_objeto_unique`) e `CHECK` da regex
  `^fotos/[0-9a-f]{8}-…-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(webp|jpg)$`
  (`produto_fotos_objeto_formato`; chave fora do padrão ⇒ `23514`); `enviado_por` e `enviado_em`
  `NOT NULL`; `produtos.fotos_versao` `NOT NULL DEFAULT 1`; `produtos.fotos_operacao` `NULL`;
  `ia_uso`: PK `(dia, email)` e `CHECK (n >= 1)`. Vermelho até a T017 — **test-writer**
- [X] T016 **Não se aplica (R1 provou que o R2 impõe if-none-match)**; sem coluna `etag`
  (research §3, ADR-009). Texto original: Se o R1 provou que o R2 **não** impõe `if-none-match` (T008), a coluna `etag` entra:
  `fotos_envio.etag text NULL` e a mesma coluna em `produto_fotos`, copiada na adoção. Caso
  contrário, **nenhuma** coluna `etag` (decisão registrada no ADR-009). Anotar a decisão no topo
  da T017 antes de gerar a migration — **principal**
- [X] T017 **[TL✅]** `src/lib/db/schema.ts` e `npm run db:generate` (migration `0002`):
  `generatedAlwaysAs` da `chave` com **nomes de coluna crus** no `sql` (sem `${t.formato}`) e
  mantendo o `id::text` (para o `||` resolver para `textcat`, IMMUTABLE); coluna **`STORED`**;
  `\\.` na regex do `CHECK`; nomes das constraints como na T015; `produtos.fotos_versao`,
  `produtos.fotos_operacao`; `produto_fotos.chave_objeto` com `UNIQUE` e `CHECK`,
  `enviado_por` e `enviado_em` `NOT NULL` **sem default**; `ia_uso`. Conferir no SQL gerado
  (sem editar à mão): expressão da `chave`, regex, nomes das constraints. Segunda geração
  ⇒ "No schema changes" — **principal**
- [X] T018 **[TL✅]** `src/lib/db/locks.ts`: acrescentar `LOCK_FOTOS = 4_001` e
  `LOCK_IA_USO = 4_002` ao registro existente, com comentário de uso (DM: Registro de locks) —
  **principal**
- [X] T019 Rodar `npm run db:up`, `npm run db:migrate`, `npm run check` e `npm run test:int`;
  colar o output real; conferir "No schema changes". **Se algum teste da 003 que insere em
  `produto_fotos` quebrar pelas colunas `NOT NULL` novas, parar e reportar ao humano** (as
  fixtures da 003 só são ajustadas na SF5; ver "Pontos de atenção") — **principal**
- [X] T020 Revisão do diff pelo tech-lead (opus): `schema.ts`, migration `0002`, `locks.ts`;
  checar `STORED`, `textcat`, regex, ausência de default nas colunas novas e de
  `db.transaction()` — **tech-lead**
- [ ] T021 Commit (humano), mensagem:
  ```text
  feat(db): cria envios de fotos, uso da IA e versão do conjunto

  Migration 0002: fotos_envio (chave gerada), ia_uso, produtos.fotos_versao
  e fotos_operacao, UNIQUE e CHECK da chave em produto_fotos. Locks 4_001
  e 4_002 no registro.
  ```
  — **humano**

---

## SF2 — Verificação do arquivo (JPEG/WebP por lista de permitidos)

**Usa**: F§4 inteira; F§3 (só o mapeamento motivo → action); plan: linha SF2 e achados TL-7,
TL-8, TL-9, TL-17, TL-18. Spec: US2-AC3/AC4/AC9, SC-006, edge case de animada e de foto pequena.
**Arquivos**: `src/lib/r2/verificacao/` (`index.ts` com `verificarImagem`, módulos de JPEG, WebP
e ICC — nomes sugeridos —, `modo.ts`), testes ao lado; `src/test/conformance/verificacao-modo.test.ts`.
**Fecha**: US2-AC3, US2-AC4, US2-AC9 (lado do servidor), SC-006 (lado da verificação).
**Revisão TL**: ✅.

- [ ] T022 [P] **Teste primeiro** — fixtures sintéticas montadas em código, no teste (helper
  sugerido `src/lib/r2/verificacao/fixtures.ts`), cada bloco da tabela de F§4: JPEG válido
  quadrado com SOI/DQT/SOF0/DHT/SOS/EOI; JFIF **com comprimento 16 e miniatura 0×0** aceito e
  **JFIF com miniatura (TL-7) ⇒ `metadado`**; JFXX ⇒ `metadado`; APP1 Exif com GPS **falso**,
  XMP, IPTC (APP13), COM, APP3–APP15 (inclui APP14 "Adobe") e DNL ⇒ `metadado`; APP2 `MPF\0` ⇒
  `animada`; APP2 `ICC_PROFILE\0` em um ou mais pedaços válidos aceito; SOF1 e SOF2 aceitos
  (exatamente 1 SOF); demais SOFn ⇒ `formato`; **progressivo com vários SOS e DHT/DQT entre
  eles aceito (TL-18)**; RST0–7 e `FF 00` nos dados entrópicos. `src/lib/r2/verificacao/
  jpeg.test.ts` (sugerido) — **test-writer**
- [ ] T023 [P] **Teste primeiro** — ICC (TL-8), `icc.test.ts` (sugerido): perfil completo de
  até 8 KB com cabeçalho de 128 bytes e tabela de tags consistente aceito com as tags
  `wtpt, bkpt, rXYZ, gXYZ, bXYZ, rTRC, gTRC, bTRC, chad, chrm, lumi, desc, cprt`; perfil com
  `dmnd`, `dmdd`, `meta`, tag privada, tag fora do perfil, acima de 8 KB e pedaços fora de
  sequência ⇒ `metadado`/`corrompida` conforme F§4 — **test-writer**
- [ ] T024 [P] **Teste primeiro** — WebP, `webp.test.ts` (sugerido): VP8, VP8L e VP8X (flags só
  ICC e/ou alpha) + ICCP + ALPH aceitos; flag de animação, ANIM e ANMF ⇒ `animada`; flags
  EXIF/XMP, EXIF, XMP e qualquer outro chunk ⇒ `metadado`; tamanho do RIFF + 8 ≠ tamanho do
  arquivo (bytes além do RIFF ou truncado), chunk além do fim, dimensões do VP8X ≠ do bitstream
  ⇒ `corrompida` — **test-writer**
- [ ] T025 **Teste primeiro** — `verificarImagem` no todo, `verificacao.test.ts` (sugerido):
  ordem assinatura → estrutura → blocos → dimensões; **PNG, SVG, GIF, HEIC (`ftypheic`), PDF
  renomeado e qualquer outra assinatura ⇒ `formato`**; não quadrada ou lado > 1200 (inclui 1201)
  ⇒ `dimensao`; lado < 400 ⇒ `pequena`; truncado em cada segmento, comprimento inflado, `FF FF`,
  marcador inválido, ausência de SOF/SOS/EOI, **bytes depois do EOI**, **bloco proibido depois
  do SOS**, largura/altura 0 ⇒ `corrompida`; dimensões lidas do SOF / VP8 (14 bits após
  `9D 01 2A`) / VP8L (14+14 bits após `0x2F`) / VP8X (24 bits + 1); `blocos` lista nomes e
  nunca bytes — **test-writer**
- [ ] T026 [P] **Teste primeiro** — `src/lib/r2/verificacao/modo.test.ts` (sugerido):
  `modoVerificacao()` devolve `"registro"` **só** para `FOTOS_VERIFICACAO === "registro"`
  exato; `undefined`, `""`, `"Registro"`, `"registro "`, `"true"`, `"1"` ⇒ `"recusar"`.
  `src/test/conformance/verificacao-modo.test.ts`: lê `wrangler.jsonc` (parser JSONC do
  `typescript`) e `.dev.vars.example` (se existir) e **falha** se `FOTOS_VERIFICACAO` existir no
  nível de cima, em `env.production` ou no exemplo (TL-17); em `env.dev` é permitido **até a
  SF10** — **test-writer**
- [ ] T027 **[TL✅]** Implementar `src/lib/r2/verificacao/` até as T022–T026 ficarem verdes:
  uma passada linear; nos dados entrópicos do JPEG, o próximo `0xFF` achado com `indexOf`
  (TL-9), sem laço byte a byte em JS; sem decodificar a imagem (VII); `modo.ts` com a
  comparação exata. Não criar `index.ts` do barrel de `src/lib/r2/` (é da SF3) — **principal**
- [ ] T028 Rodar `npm run check` e colar o output real — **principal**
- [ ] T029 Revisão do diff pelo tech-lead (opus): cobertura da tabela de F§4, ausência de
  decodificação, uso de `indexOf`, conformidade do modo registro — **tech-lead**
- [ ] T030 Commit (humano), mensagem:
  ```text
  feat(r2): verifica JPEG e WebP por lista de blocos permitidos

  Percorre o arquivo inteiro sem decodificar: recusa PNG, GIF, SVG, HEIC,
  metadados (Exif, XMP, IPTC, JFIF com miniatura, ICC fora da regra),
  animação, corrompidos e dimensões fora de 400-1200 quadrado. Modo
  registro só com FOTOS_VERIFICACAO exato e conformidade no wrangler.
  ```
  — **humano**

---

## SF3 — R2: configuração, assinatura, bucket e `wrangler.jsonc`

**Usa**: F§7 inteira; F§1 (tabela de módulos); Q§1 (itens 2–4); plan: linha SF3 e TL-1,
TL-21. Dependência nova: `aws4fetch` (versão exata, justificativa no commit).
**Arquivos**: `package.json`/`package-lock.json`, `src/lib/r2/config.ts`, `chaves.ts`,
`assinatura.ts`, `bucket.ts`, `index.ts`, testes ao lado; `wrangler.jsonc`;
`.dev.vars.example`; `infra/r2/cors.dev.json`, `infra/r2/cors.production.json`; configuração
do gitleaks (exceção por valor); `cloudflare-env.d.ts` (gerado).
**Fecha**: US2-AC4/AC5/AC9 (lado da assinatura: tamanho e `if-none-match`), SC-006 (sobrescrita
recusada pela URL, R1).
**Revisão TL**: ✅.

- [ ] T031 [P] **Teste primeiro** — `src/lib/r2/assinatura.test.ts` (sugerido):
  `assinarEnvio({ chave, formato, tamanho })` ⇒ URL com `X-Amz-SignedHeaders` =
  `content-length;content-type;host;if-none-match`, `X-Amz-Expires=300` (não o padrão 86400 do
  `aws4fetch`), nenhuma credencial na URL além do Access Key ID; `headers` devolvidos
  contêm `content-type` e `if-none-match: *`; `content-type` = `image/webp` ou `image/jpeg` pelo
  formato. Se T008 registrou a reserva do research D2 (sem `if-none-match`), ajustar o teste à
  reserva — **test-writer**
- [ ] T032 [P] **Teste primeiro** — `src/lib/r2/chaves.test.ts` e `config.test.ts` (sugeridos):
  `chaveDoEnvio(id, formato)` ⇒ `fotos/<id>.webp|jpg`; `ARQUIVO_VALIDO` é a regex de F§5 (aceita
  uuid v4 + `.webp`/`.jpg`; recusa v1, `.png`, `..`, barras, maiúsculas); `chaveDoArquivo`/
  `arquivoDaChave` são inversas; `config.ts` (Zod sobre `process.env`): `R2_S3_ENDPOINT` URL sem
  barra final, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` obrigatórios; ausente ⇒ lança —
  **test-writer**
- [ ] T033 `npm install --save-exact aws4fetch` (versão registrada no plan: 1.0.20) e anotar a
  justificativa para o commit (assinatura SigV4 é a parte com mais risco de erro próprio; não
  substitui nada da stack fechada) — **principal**
- [ ] T034 **[TL✅]** `src/lib/r2/config.ts`, `chaves.ts`, `assinatura.ts` (`AwsClient({ service:
  "s3", region: "auto" })`, `method: "PUT"`, `aws: { signQuery: true, allHeaders: true }`,
  `X-Amz-Expires=300` posto na URL **antes** de assinar), `bucket.ts` (via
  `getCloudflareContext().env.PRODUCT_IMAGES`: `lerObjeto(chave)` ⇒ `{ tamanho, bytes() } | null`
  com `tamanho` antes de ler o corpo, `apagarObjetos(chaves)` em lotes de 1000 sem erro para
  inexistente, `listarObjetos(prefixo)` assíncrono iterável com `chave` e `uploaded`),
  `index.ts` (barrel `server-only`, reexporta também `verificacao/`) — **principal**
- [ ] T035 **[TL✅]** `wrangler.jsonc` (**sem** alterar `main` nem `triggers`, que são da SF12):
  `vars` `R2_S3_ENDPOINT` no nível de cima (`http://localhost:8787/cdn-cgi/local/r2/s3/
  roseshop-local`), `env.dev` e `env.production` com `https://<account>.r2.cloudflarestorage.com/
  roseshop-dev|prod` (`<account>` preenchido pelo humano na T038); `local_dev.
  experimental_s3_credentials` com os valores falsos; **sem `FOTOS_VERIFICACAO`** em nenhum
  ambiente (entra no `env.dev` só na T094a, SF10);
  `.dev.vars.example` com `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` (valores locais falsos) e
  `CRON_SECRET` (placeholder), **sem** `FOTOS_VERIFICACAO` — **principal**
- [ ] T036 [P] **[TL✅]** `infra/r2/cors.dev.json` e `infra/r2/cors.production.json`: `PUT`,
  origem exata do ambiente (preenchida pelo humano), headers `content-type` e `if-none-match`
  — **principal**
- [ ] T037 **[TL✅]** Exceção do gitleaks **pelo valor exato** dos dois valores locais falsos
  (regex dos valores), nunca pelo arquivo `wrangler.jsonc` inteiro (TL-21); depois
  `npm run cf-typegen` para o `CloudflareEnv` tipar `R2_S3_ENDPOINT` e demais — **principal**
- [ ] T038 **Humano executa** (dev; Q§1 itens 2–4): `npx wrangler secret put R2_ACCESS_KEY_ID
  --env dev` e `R2_SECRET_ACCESS_KEY --env dev` (token do T001; **já gravados em 2026-10-09
  na T014a**, não recriar); preencher o Account ID em
  `R2_S3_ENDPOINT` de `env.dev`/`env.production` e a origem exata do dev em
  `infra/r2/cors.dev.json`; aplicar `npx wrangler r2 bucket cors set roseshop-dev --file
  infra/r2/cors.dev.json` e conferir com `npx wrangler r2 bucket cors list roseshop-dev`;
  criar/atualizar o `.dev.vars` local com as chaves de `.dev.vars.example`. Produção fica na SF15
  — **humano**
- [ ] T039 **Verificação local por `curl`/script** (a prova pela tela fica na SF9): com
  `npm run preview` no ar, o humano roda um script em `curl` (ou `node`, fora do repo) que
  assina uma URL com `assinarEnvio` (via script de apoio fora do repo), faz o `PUT` no endpoint
  S3 local com um arquivo de N bytes e verifica por `npx wrangler r2 object get roseshop-local/
  fotos/<arquivo> --local`: N ⇒ ok; N±1 ⇒ 403; segundo `PUT` ⇒ 412. Entregar o output real —
  **humano**
- [ ] T040 Rodar `npm run check` e colar o output real — **principal**
- [ ] T041 Revisão do diff pelo tech-lead (opus): `assinatura.ts` (headers assinados, expiração),
  `bucket.ts`, `wrangler.jsonc`, `.dev.vars.example`, CORS, exceção do gitleaks, ausência de
  `FOTOS_VERIFICACAO` em todos os ambientes — **tech-lead**
- [ ] T042 Commit (humano), mensagem:
  ```text
  feat(r2): assina o envio direto ao R2 e acessa o bucket

  Adiciona aws4fetch (assinatura SigV4, versão exata) para URL pré-assinada
  de 5 min com content-length, content-type e if-none-match assinados.
  Bucket pelo binding, config por ambiente no wrangler.jsonc e CORS
  versionado em infra/r2.
  ```
  — **humano**

---

## SF4 — SQL de envios e cadastro com fotos

**Usa**: F§2.1, F§2.2, F§2.4, F§2.5; DM: Invariantes (linhas de envio e adoção), Transições de
`fotos_envio`, Mudanças em código existente; plan: linha SF4, TL-3, TL-4, TL-10, TL-11.
**Arquivos**: `src/lib/db/fotos.ts` (novo), `src/lib/db/produtos.ts` (`inserirComFotos`,
`remover`, `listar`, `obterPorId`), testes `src/lib/db/fotos.envios.int.test.ts` e
`src/lib/db/produtos.com-fotos.int.test.ts` (sugeridos), `src/test/db/produtos-fixtures.ts` só se
um helper de envio for necessário.
**Fecha**: US1-AC7/AC8/AC9 (no SQL), US6-AC1 (`remover` devolve chaves), edge cases de adoção
alheia/não confirmada/expirada e duplo "Salvar".
**Revisão TL**: ✅.

- [ ] T043 **Teste primeiro** — `fotos.envios.int.test.ts`: `emitirEnvio` insere e devolve a
  `chave`; com 20 envios nas últimas 24 h da mesma pessoa o 21º ⇒ `muitos_pendentes` (teto
  aproximado, D13); outra pessoa não é afetada; `obterEnvio` filtra por `enviado_por`;
  `marcarConfirmado` só de `emitido` para `confirmado` e preenche `confirmado_em`;
  `descartarEnvio` só apaga `emitido` e devolve a chave; `enviosValidos` devolve só os ids da
  pessoa, confirmados e com < 24 h — **test-writer**
- [ ] T044 **Teste primeiro** — `produtos.com-fotos.int.test.ts`: `inserirComFotos` cria
  produto com 1, 2 e 3 fotos nas posições 1..N na ordem dos `envioIds`, consome os envios e
  grava `enviado_por`/`enviado_em`; adoção só pela dona, só `confirmado`, só `< 24 h`, uma vez
  (segunda tentativa não adota); `foto_expirada` com os ids exatos que não são válidos (precedência
  depois de "nome repetido"); **duplo "Salvar" ⇒ `nome_repetido`** (segundo pega o lock depois
  do primeiro); **TL-4**: mesmo nome com envios válidos diferentes ⇒ `nome_repetido` vindo do
  `23505` de `produtos_chave_unique`; `23505` de **outra** constraint propaga, **inclusive
  `produto_fotos_objeto_unique`** (só `produtos_chave_unique`, por comparação exata do nome,
  vira `nome_repetido`); categoria
  removida ⇒ `categoria_ausente` vindo do `23503`; **TL-3**: `uuid[]`, `text[]` e
  `timestamptz[]` de `Date[]` passam como **um** parâmetro (`sql.param`); nenhum produto fica
  sem foto nem com fotos órfãs quando o `INSERT produtos` não ocorre — **test-writer**
- [ ] T045 **Teste primeiro** — remoção e leitura: `remover` (batch com lock 4_001) devolve as
  chaves das fotos e apaga o produto (e as linhas por CASCADE); versão errada ou inexistente ⇒
  `ausenteOuVersaoDiferente` (003) e **não** devolve chaves; `listar` devolve `capa` (chave da
  posição 1); `obterPorId` devolve `fotosVersao` e `fotos` em ordem. Em
  `src/lib/db/produtos.com-fotos.int.test.ts` ou arquivo próprio — **test-writer**
- [ ] T046 **[TL✅]** `src/lib/db/fotos.ts`: `emitirEnvio`, `obterEnvio`, `marcarConfirmado`,
  `descartarEnvio`, `enviosValidos` (F§2.1). Todo array como **um** parâmetro
  `${sql.param(...)}::tipo[]`; `pg_advisory_xact_lock(${LOCK_FOTOS}::bigint)` no padrão atual —
  **principal**
- [ ] T047 **[TL✅]** `src/lib/db/produtos.ts`: `inserirComFotos(db, sessao, campos, envioIds)`
  conforme F§2.2 (batch: lock → `INSERT produtos … WHERE count = n` com `fotos_operacao`=token →
  CTE `DELETE fotos_envio … VALIDO` **repetindo o VALIDO (TL-11)** → `INSERT produto_fotos`);
  mapeamento de erros (`produtos_chave_unique`, comparação exata do nome, ⇒ `nome_repetido`;
  outra `23505`, inclusive de `produto_fotos`, propaga; `23503` ⇒
  `categoria_ausente`) via `nomeConstraint` de `erros-pg.ts`; 0 linhas ⇒ leitura posterior com
  a precedência de F§2.2. **O `inserir` da 003 permanece exportado até a SF6** (a action
  `criarProduto` ainda o usa; a remoção é a T067) — **principal**
- [ ] T048 **[TL✅]** `src/lib/db/produtos.ts`: `remover` vira batch com lock 4_001 e CTE
  devolvendo `chaves` (F§2.5); `listar` com `LEFT JOIN produto_fotos f ON … f.posicao = 1` ⇒
  `capa: string | null`; `obterPorId` com `fotosVersao` e `fotos` (F§2.4). Atualizar os chamadores
  da 003 só no que o tipo exigir para o `typecheck` (a action usa `chaves` na SF6) — **principal**
- [ ] T049 Rodar `npm run db:up`, `npm run db:migrate`, `npm run check` e `npm run test:int`;
  colar o output real — **principal**
- [ ] T050 Revisão do diff pelo tech-lead (opus): SQL de `fotos.ts` e `produtos.ts`,
  repetição do VALIDO, `sql.param`, mapeamento de `23505`/`23503`, ausência de
  `db.transaction()` — **tech-lead**
- [ ] T051 Commit (humano), mensagem:
  ```text
  feat(db): emite, confirma e adota envios no cadastro de produto

  Envios de fotos (emitir, confirmar, descartar) e inserirComFotos em
  db.batch sob lock 4_001, com adoção por DELETE ... RETURNING. remover
  devolve as chaves das fotos; listar devolve a capa; obterPorId, as fotos.
  ```
  — **humano**

---

## SF5 — Conjunto de fotos de produto existente (`substituirConjunto`)

**Usa**: F§2.3; DM: Invariantes (linhas de concorrência e destaque), Mudanças em código existente
(comentário `produtos.ts:177-179`, invariante da 003, fixtures); plan: linha SF5 e a decisão D5.
**Arquivos**: `src/lib/db/fotos.ts` (`lerConjunto`, `substituirConjunto`), `src/lib/db/produtos.ts`
(comentário da convenção), `src/test/db/produtos-fixtures.ts`, `specs/003-produtos/data-model.md`
(emenda), testes `src/lib/db/fotos.conjunto.int.test.ts` e `fotos.concorrencia.int.test.ts`
(sugeridos) e o teste de SC-005 da 003.
**Fecha**: US4-AC1–5 (SQL), US5-AC1–5, SC-007, destaque sem foto, SC-005 da 003 estendido.
**Revisão TL**: ✅.

- [ ] T052 **Teste primeiro** — `fotos.conjunto.int.test.ts`: `lerConjunto` devolve `fotosVersao`
  e fotos em ordem; `substituirConjunto` ⇒ `ok` com `fotosVersao + 1` e **sem tocar `versao`**
  (003) mas com `atualizado_por`/`atualizado_em`; adicionar (envio consumido, entra na última
  posição), trocar (mesma posição, envio consumido), remover (as seguintes sobem; nunca zerar),
  mover (reordena por apagar e reinserir); `fotosVersao` diferente ⇒ `alterado`; `atuais`
  diferente das chaves do banco ⇒ `alterado`; produto inexistente ⇒ `ausente`; envio inválido
  ⇒ `foto_expirada`; resultado nunca deixa 0 ou > 3 fotos (US4-AC1–5, US5-AC1/AC5) —
  **test-writer**
- [ ] T053 **Teste primeiro** — `fotos.concorrencia.int.test.ts` (concorrência real, SC-007):
  adicionar × adicionar (2 fotos ⇒ só uma entra, a outra ⇒ `alterado`; a foto da segunda não fica
  no produto, US5-AC2); remover × remover de fotos diferentes (só uma acontece, ≥ 1 foto, US5-AC3);
  mover × trocar; fotos × editar campos (as duas são aceitas, US5-AC4, pois `fotos_versao` e
  `versao` são independentes); fotos × remover produto (remoção antes ⇒ `ausente`, US5-AC5).
  Invariantes ao final: 0 produtos com 0 ou > 3 fotos, posições repetidas ou com buraco, destaque
  sem foto — **test-writer**
- [ ] T054 **[TL✅]** Fixtures da 003: `src/test/db/produtos-fixtures.ts` passa a criar produtos
  **com 1 foto** (linha em `produto_fotos` com chave sintética que **case com a regex v4**, mais
  `enviado_por` e `enviado_em`), **sem depender do `inserir` da 003** (removido na T067);
  estender o teste do SC-005 da 003 (destaque sempre com foto) e
  conferir que os testes da 003 seguem verdes — **principal**
  *Já feito na SF1 (T019, decisão do humano em 2026-10-09)*: só os **dados** dos INSERTs em
  `produto_fotos` de `src/lib/db/produtos.schema.int.test.ts` e
  `src/lib/db/produtos.escrita.int.test.ts` (`enviado_por`, `enviado_em` e chaves
  `fotos/<uuid v4>.jpg`), sem mudar o que cada teste verifica. As fixtures continuam para cá.
- [ ] T055 **[TL✅]** `src/lib/db/fotos.ts`: `lerConjunto` e `substituirConjunto` conforme F§2.3
  (batch: lock → `UPDATE produtos` com `fotos_versao`, igualdade de `atuais` por `array_agg` e
  `VALIDO($envio)` → `DELETE fotos_envio` guardado por token → `DELETE produto_fotos` guardado →
  `INSERT … unnest(...) WITH ORDINALITY` guardado); leitura posterior com a precedência
  `ausente` → `alterado` → `foto_expirada`; `versao` não é tocada — **principal**
- [ ] T056 **[TL✅]** Emenda da convenção da 003 (D5): atualizar o comentário em
  `src/lib/db/produtos.ts` (~linhas 177–179) e o invariante "Todo writer de `produtos`
  incrementa `versao`" em `specs/003-produtos/data-model.md` para "writers de **campos, status e
  destaque**; o writer de fotos altera só `fotos_versao`, `fotos_operacao`, `atualizado_por`,
  `atualizado_em`" (texto do data-model da 004, "Emenda de convenção da 003") — **principal**
- [ ] T057 Rodar `npm run check` e `npm run test:int` (inclui toda a 003); colar o output
  real — **principal**
- [ ] T058 Revisão do diff pelo tech-lead (opus): `substituirConjunto` sob READ COMMITTED com
  lock e token, interação com os `UPDATE`s da 003, emenda de convenção, fixtures —
  **tech-lead**
- [ ] T059 Commit (humano), mensagem:
  ```text
  feat(db): altera o conjunto de fotos com lock e versão própria

  substituirConjunto em db.batch sob lock 4_001 com fotos_versao e token de
  operação, sem tocar versao. Emenda da convenção de versao da 003 e
  fixtures da 003 com foto. Testes de concorrência (SC-007).
  ```
  — **humano**

---

## SF6 — Actions de envio e cadastro com fotos, rota de imagem

**Usa**: F§1 (tabela de módulos e conformidade), F§3 (`pedirEnvio`, `confirmarEnvio`,
`criarProduto`, `removerProduto`), F§5, F§8; Q§2 (limpeza dos produtos da 003); plan: linha SF6,
TL-2, TL-19. Spec: US1-AC7/AC8/AC9, US2-AC4/AC5/AC6/AC8/AC9, US6-AC1/AC2 (lado da action),
SC-006.
**Arquivos**: `src/lib/fotos/actions.ts` (`pedirEnvio`, `confirmarEnvio`), `mensagens.ts`,
`erros.ts`, `tipos.ts`; `src/lib/produtos/actions.ts` (`criarProduto`, `removerProduto`);
`src/app/painel/fotos/[arquivo]/route.ts`; `src/lib/db/produtos.ts` (remove `inserir`);
`src/test/conformance/fotos-acesso.test.ts`, `fotos-rota-guard.test.ts`.
**Fecha**: US2-AC4/AC5/AC6/AC9, SC-006 (pela action), US1-AC7–9, US6-AC1.
**Revisão TL**: ✅ (usa `src/lib/r2`).

- [ ] T060 **Humano executa — limpeza dos produtos da 003 sem foto, ANTES de rodar a SF6 no
  `preview` e ANTES do primeiro `git push` que leve a SF6 ao deploy do dev** (Q§2). **Local**:
  `npm run db:psql` e o bloco `BEGIN; SELECT … ; DELETE … RETURNING id, nome;` conferindo N
  antes do `COMMIT`. **Dev online (Neon)**: criar branch de backup
  `backup-antes-004-AAAA-MM-DD` a partir da branch dev; no SQL Editor da branch dev rodar o
  mesmo bloco com `BEGIN` explícito, conferir N, `COMMIT`; manter a branch de backup até a
  validação da feature no dev. Entregar o N de cada ambiente — **humano**
- [ ] T061 **Humano executa — conferência de produção (somente leitura)** no console do Neon:
  `SELECT count(*) FROM produtos;` ⇒ esperado `0`. A máquina local nunca acessa produção — **humano**
- [ ] T062 [P] **Teste primeiro** — `src/lib/fotos/actions.test.ts` (sugerido), `pedirEnvio` e
  `confirmarEnvio` com mocks de db e r2: guard (`requireAdminAction`) **primeiro**, sem sessão
  nada é emitido/lido (US2-AC6); Zod antes de SQL; `tamanho > 1_048_576` ⇒ `grande` sem SQL;
  `muitos_pendentes`; `confirmarEnvio`: inexistente ⇒ `falha_geral`, já `confirmado` ⇒ `ok`
  idempotente sem reverificar, objeto ausente ⇒ `nao_enviada` (linha fica), tamanho do objeto
  ≠ assinado ⇒ `grande` **sem ler o corpo**, formato detectado ≠ declarado ⇒ `formato`; **cada
  motivo de recusa apaga a linha primeiro e o objeto só se a linha voltar (TL-2)**; confirmação
  concorrente que já marcou `confirmado` **não** apaga o objeto; mapeamento `formato` ⇒ `formato`,
  `metadado`/`animada`/`corrompida`/`dimensao` ⇒ `nao_passou`, `pequena` ⇒ `pequena`; modo
  registro + `metadado` ⇒ log de aviso e segue; SC-006 pela action (cada arquivo forjado é
  apagado e recusado); R2 em melhor esforço — **test-writer**
- [ ] T063 [P] **Teste primeiro** — `src/lib/produtos/actions.test.ts` (ajuste dos testes da
  003, sugerido): `criarProduto` aceita `fotos` repetido (1..3 uuids únicos); 0 fotos ⇒ falha
  `sem_foto` (mensagem do US1-AC8, sem `campo`); ordem guard → campos → fotos →
  `exigirCategoriaValida` → `inserirComFotos`; `foto_expirada` traz `envioIds`; `valores`
  continua em toda falha (US1-AC9); `removerProduto` chama `apagarObjetos(chaves)` em melhor
  esforço depois do sucesso e a falha do R2 não desfaz a remoção (US6-AC1) — **test-writer**
- [ ] T064 [P] **Teste primeiro** — rota `src/app/painel/fotos/[arquivo]/route.test.ts`
  (sugerido): sem sessão ⇒ 404; `arquivo` fora da regex ⇒ 404 **sem tocar o binding**; chave
  que não está em `produto_fotos` nem em `fotos_envio` `confirmado` ⇒ 404; `bucket.get` `null` ⇒
  404; **objeto sem `body` (condição `If-None-Match` falhou) ⇒ 304 (TL-19)**; com `body` ⇒ 200;
  headers `Content-Type` pela extensão, `Cache-Control: private, max-age=31536000, immutable`,
  `ETag`, `X-Content-Type-Options: nosniff`, `Content-Security-Policy: default-src 'none'`;
  só `GET` — **test-writer**
- [ ] T065 [P] **Teste primeiro** — conformidade (nega por padrão), `src/test/conformance/
  fotos-acesso.test.ts` (mesmo escopo de arquivos de `produtos-acesso`): fronteiras de F§1
  (`src/lib/r2/` só importado por `src/lib/fotos/`,
  `src/lib/produtos/`, `src/app/painel/fotos/`, `src/app/api/interno/`; `src/lib/db/fotos.ts` só
  por `src/lib/fotos/` e `src/lib/produtos/`; `src/lib/fotos/aparelho/` sem `server-only`, db, r2
  ou auth); **`insert(produtos)` só em `inserirComFotos`**; nenhum import de `aws4fetch` fora de
  `src/lib/r2/`. `fotos-rota-guard.test.ts`: `getAdminSession` antes de qualquer uso do barrel
  r2 na rota. Atualizar `produtos-acesso` se necessário — **test-writer**
- [ ] T066 **[TL✅]** `src/lib/fotos/mensagens.ts` (todas as mensagens de F§8, incluindo
  `muitos_pendentes` da decisão E), `tipos.ts` (`FotoVista`, `Conjunto`, `FalhaFoto`,
  `ResultadoFotos`, `MotivoFoto`), `erros.ts`; seguros para o client — **principal**
- [ ] T067 **[TL✅]** `src/lib/fotos/actions.ts` (`"use server"`): `pedirEnvio` e
  `confirmarEnvio` conforme F§3 (ordem `requireAdminAction` → Zod → SQL → R2; recusa apaga a
  linha antes do objeto, TL-2; modo registro com log de aviso); alterar `criarProduto` (campo
  `fotos`, `sem_foto`, `inserirComFotos`, `foto_expirada`) e `removerProduto` (`apagarObjetos`)
  em `src/lib/produtos/actions.ts`; **remover o `inserir` da 003** de `src/lib/db/produtos.ts`
  (agora sem uso) — **principal**
- [ ] T068 **[TL✅]** `src/app/painel/fotos/[arquivo]/route.ts` conforme F§5 (404 sem sessão
  antes de qualquer acesso ao r2; regex; consulta às tabelas; `bucket.get` com `onlyIf`) —
  **principal**
- [ ] T069 Rodar `npm run check` e `npm run test:int`; colar o output real. Atenção: a página de
  cadastro ainda não envia `fotos` (SF9); testes de página da 003 que criam produto pela UI
  podem precisar do ajuste mínimo registrado aqui — **principal**
- [ ] T070 Revisão do diff pelo tech-lead (opus): actions (ordem, TL-2), rota (TL-19, headers,
  ordem do guard), conformidade, uso do barrel r2, remoção do `inserir` — **tech-lead**
- [ ] T071 Commit (humano), mensagem:
  ```text
  feat(fotos): envio, confirmação e cadastro de produto com fotos

  Actions pedirEnvio e confirmarEnvio (recusa apaga a linha antes do
  objeto), criarProduto com fotos, removerProduto apagando os objetos e
  rota /painel/fotos/[arquivo] com sessão. Conformidade de fronteiras.
  ```
  — **humano**

---

## SF7 — Actions do conjunto (adicionar, trocar, remover, mover)

**Usa**: F§3 (tabela de regras e "Ações do conjunto"); F§8; plan: linha SF7. Spec: US4-AC1–5,
US5-AC1–5.
**Arquivos**: `src/lib/fotos/conjunto.ts` (regra pura), `src/lib/fotos/actions.ts`
(`adicionarFoto`, `trocarFoto`, `removerFoto`, `moverFoto`), testes ao lado.
**Fecha**: US4-AC1–5 (actions), US5-AC1–5 (mensagens e `atual`).
**Revisão TL**: ✅ (usa `src/lib/r2`).

- [ ] T072 [P] **Teste primeiro** — `src/lib/fotos/conjunto.test.ts` (tabela de regras de
  F§3): adicionar `[...atuais, nova]`, 3 fotos ⇒ `limite`; trocar nova na `posicao`, posição
  inexistente ⇒ `falha_geral`; remover sem a `posicao` e as demais sobem, 1 foto ⇒ `ultima`;
  mover tira de `de` e insere em `para`, posição inexistente ou `de = para` ⇒ `falha_geral`;
  posições finais sempre 1..N — **test-writer**
- [ ] T073 [P] **Teste primeiro** — `src/lib/fotos/actions.conjunto.test.ts` (sugerido), mocks:
  guard primeiro; Zod antes de SQL; produto inexistente ⇒ `nao_existe`; `fotosVersao` ≠ ⇒
  `alterado` com `atual`; **`atual` (lido de novo) em toda falha** `alterado`/`limite`/
  `foto_expirada`; `ok` devolve a versão nova (US4-AC7: ações seguidas da mesma pessoa não
  conflitam); `ok` ⇒ `revalidatePath` da lista e do detalhe; troca e remoção apagam a chave
  antiga com `apagarObjetos` em melhor esforço (falha só registrada, FR-036); mensagens de
  sucesso ("Foto adicionada", "Foto trocada", "Foto removida", "Ordem salva") — **test-writer**
- [ ] T074 **[TL✅]** `src/lib/fotos/conjunto.ts` e as quatro actions em
  `src/lib/fotos/actions.ts`, na ordem fixa `requireAdminAction` → Zod → `lerConjunto` → regra →
  `substituirConjunto` → R2 (melhor esforço) — **principal**
- [ ] T075 Rodar `npm run check` e `npm run test:int`; colar o output real — **principal**
- [ ] T076 Revisão do diff pelo tech-lead (opus): ordem das chamadas, `atual` nas falhas,
  apagamento do objeto antigo só após `ok` — **tech-lead**
- [ ] T077 Commit (humano), mensagem:
  ```text
  feat(fotos): adiciona, troca, remove e reordena fotos do produto

  Regra pura do conjunto (limite, última foto, posições) e as actions
  adicionarFoto, trocarFoto, removerFoto e moverFoto, com a versão nova
  e o conjunto atual devolvidos em sucesso e em falha.
  ```
  — **humano**

---

## SF8 — Pipeline de tratamento da foto no aparelho

**Usa**: T§3 inteira; F§8 (mensagens `formato`, `nao_abre`, `pequena`, `grande`); plan: linha SF8.
Spec: US2-AC1/AC2 (lado do aparelho), US2-AC3, US2-AC7, SC-005.
**Arquivos**: `src/lib/fotos/aparelho/` (`detectar-tipo.ts`, `recortar.ts`, `codificar.ts`,
`preparar-foto.ts`, `suporta-webp.ts` — nomes sugeridos) e testes ao lado.
**Fecha**: US2-AC1/AC2, US2-AC3/AC7 (parte pura), SC-005 (laço de qualidade).
**Revisão TL**: — (sem zona protegida).

- [ ] T078 [P] **Teste primeiro** — `detectarTipo(cabecalho)`: reconhece `jpeg`, `png`, `webp`,
  `heic` pelos bytes (não pela extensão); SVG, GIF, PDF e qualquer outro ⇒ `"outro"`;
  cabeçalho curto/vazio ⇒ `"outro"`. PNG é aceito como **entrada** — **test-writer**
- [ ] T079 [P] **Teste primeiro** — `recortar(img, area)`: lado final = `min(area.lado, 1200)`;
  `area.lado < 400` ⇒ `"pequena"`; saída sempre quadrada (FR-016, FR-018) — **test-writer**
- [ ] T080 [P] **Teste primeiro** — `codificar(canvas, formato, qualidades)` com **codificador
  injetado** (jsdom não tem canvas): qualidades `[0.82, 0.72, 0.62]` (webp) e `[0.85, 0.72, 0.62]`
  (jpeg); confere `blob.type === pedido`, senão recodifica em JPEG; PNG nunca sai; fica na
  primeira qualidade que couber em 1 MB (1.048.576 bytes); estourou na última ⇒ `"grande"`.
  `prepararFoto` devolve `{ blob, formato }` ou `{ motivo: "formato" | "nao_abre" | "pequena" |
  "grande" }` com as dependências injetadas; `abrirImagem` chama `createImageBitmap` com
  `{ imageOrientation: "from-image" }` (espião injetado, FR-017); `abrirImagem` falha ⇒
  `"nao_abre"`; `outro`/`heic`
  não abrível ⇒ mensagem correta (US2-AC3, AC7); o arquivo original nunca é devolvido (FR-013)
  — **test-writer**
- [ ] T081 Implementar `src/lib/fotos/aparelho/` até as T078–T080 ficarem verdes: `detectarTipo`,
  `suportaWebp()` (canvas 1×1, uma vez por sessão), `abrirImagem` (`createImageBitmap(arquivo,
  { imageOrientation: "from-image" })`, FR-017), `recortar`, `codificar`, `prepararFoto`. Só APIs
  do navegador e `src/lib/fotos/mensagens.ts`; nada de `server-only`, db, r2 ou auth — **principal**
- [ ] T082 Rodar `npm run check` e colar o output real; o comportamento real (canvas, HEIC,
  orientação) é provado na SF10 e no Q§4 — **principal**
- [ ] T083 Commit (humano), mensagem:
  ```text
  feat(fotos): trata a foto no aparelho antes do envio

  Detecta o tipo pelos bytes, aplica a orientação, recorta 1:1 (400 a
  1200 px) e recodifica em WebP ou JPEG com qualidade decrescente até
  caber em 1 MB, descartando metadados.
  ```
  — **humano**

---

## SF9 — Telas do cadastro: passos Fotos → Dados

**Usa**: T§1 (linha `/painel/produtos/novo`), T§2 (componentes e passo Dados), F§8; plan: linha
SF9. Dependência nova: `react-easy-crop` (versão exata). Q§4 (roteiro pela tela).
**Arquivos**: `package.json`/`package-lock.json`; `src/app/painel/(protegido)/produtos/novo/page.tsx`;
`src/app/painel/(protegido)/produtos/_fotos/` (`escolher-foto.tsx`, `recorte-foto.tsx`,
`lista-fotos.tsx`, `usar-envio.ts`); `form-produto.tsx` da 003 (modo cadastro); testes de
componente ao lado; `src/test/conformance/produtos-paginas-guard.test.ts`.
**Fecha**: US1-AC1–9, US2-AC3/AC7/AC8/AC10, edge cases de envio durante "Salvar" e de expiração.
**Revisão TL**: —.

- [ ] T084 `npm install --save-exact react-easy-crop` e anotar a justificativa para o commit
  (gesto de pinça com risco de erro próprio; não substitui nada da stack) — **principal**
- [ ] T085 [P] **Teste primeiro** — `escolher-foto.test.tsx`: celular (`(pointer: coarse)`) mostra
  "Tirar foto" (`capture="environment"`) e "Escolher da galeria" (sem `capture`), ambos ≥ 48 px;
  desktop mostra "Escolher arquivo"; com 3 fotos os botões ficam indisponíveis e aparece "Máximo
  de 3 fotos" (US1-AC4); "Tirar" só em "Tirar foto" — **test-writer**
- [ ] T086 [P] **Teste primeiro** — `recorte-foto.test.tsx`: moldura 1:1, mover e aproximar
  (pinça e controle deslizante), "Usar esta foto" e "Cancelar"; **nada é enviado antes de "Usar
  esta foto"** (US1-AC2, FR-007) — **test-writer**
- [ ] T087 [P] **Teste primeiro** — `lista-fotos.test.tsx`: miniaturas em ordem, selo "Capa" na 1ª
  (US1-AC3, AC5), estados *enviando* e *Não enviada* + "Tentar de novo" (US2-AC8), "Remover"
  (lixeira **com o texto**) sem confirmação no cadastro e as demais sobem (US1-AC6), "Mover para
  a esquerda/direita" e "Usar como capa" ≥ 48 px, arrasto horizontal por pointer events muda a
  ordem (US1-AC5) — **test-writer**
- [ ] T088 [P] **Teste primeiro** — `usar-envio.test.ts`: fluxo `prepararFoto` → `pedirEnvio` →
  `PUT` com **exatamente** os `headers` devolvidos (inclui `if-none-match`) → `confirmarEnvio`;
  falha de rede ⇒ *Não enviada* (US2-AC8); `formato` e `nao_abre` mostram as mensagens de
  F§8 (US2-AC3, AC7); 1ª recusa `nao_passou` ⇒ "Não deu para usar essa foto…" e **2ª seguida,
  mesma tela, ⇒ "Essa foto não está passando…"** (US2-AC10); `muitos_pendentes` no lugar da
  miniatura, sem "Tentar de novo"; blob URLs revogadas ao sair — **test-writer**
- [ ] T089 [P] **Teste primeiro** — página `novo` e passo Dados: "Continuar" só com ≥ 1 foto
  confirmada e **nenhum envio em curso** (US1-AC1, AC3); "Voltar às fotos" mantém o digitado;
  "Salvar" indisponível enquanto houver envio em curso; `fotos` enviadas como campos ocultos em
  ordem (US1-AC7); `sem_foto` mostra a mensagem do US1-AC8; nome repetido mantém as fotos já
  enviadas (US1-AC9); `foto_expirada` volta ao passo Fotos com as miniaturas expiradas em *Não
  enviada*; recarregar começa vazio. `produtos-paginas-guard` continua verde — **test-writer**
- [ ] T090 `ui-dev` implementa `escolher-foto.tsx`, `recorte-foto.tsx`, `lista-fotos.tsx` e
  `usar-envio.ts` em `src/app/painel/(protegido)/produtos/_fotos/`, consumindo só o contrato
  existente (`pedirEnvio`, `confirmarEnvio`, `prepararFoto`, mensagens e primitivos de
  `src/components/ui/`). `<img>` simples com `width`/`height` (sem `next/image`); sem tocar
  `src/lib/`. Faltou campo ou action: parar e reportar — **ui-dev**
- [ ] T091 `ui-dev` implementa a página `novo/page.tsx` com os dois passos (estado do client) e
  adapta `form-produto.tsx` ao modo cadastro (recebe `envioIds`, campos ocultos `fotos`, "Salvar"
  condicionado a envios concluídos) — **ui-dev**
- [ ] T092 Rodar `npm run check` e colar o output real — **principal**
- [ ] T093 **Humano executa — roteiro pela tela no `preview`** (Q§4 itens 1–4, 5 sem IA, 7 e 9):
  tela de fotos com "Continuar" indisponível; JPEG grande ⇒ recorte ⇒ miniatura "Capa" e, no
  DevTools, `PUT` para `/cdn-cgi/local/r2/s3/roseshop-local/fotos/<uuid>.webp` com ≤ 1 MB (SC-005);
  GIF ⇒ mensagem de formato e nada enviado; imagem 300×300 ⇒ "muito pequena"; 3 fotos ⇒ "Máximo
  de 3 fotos", arrastar e botões de mover, remover sem confirmação; preencher à mão e "Salvar"
  ⇒ detalhe; lista com miniatura da capa depois da SF11; remover produto e conferir o objeto com
  `npx wrangler r2 object get roseshop-local/fotos/<arquivo> --local --file /dev/null`;
  `/painel/fotos/<arquivo>` em janela anônima ⇒ 404. Entregar o resultado — **humano**
- [ ] T094 Commit (humano), mensagem:
  ```text
  feat(painel): cadastro de produto começando pelas fotos

  Passos Fotos e Dados em /painel/produtos/novo: escolher ou tirar foto,
  recorte 1:1 (react-easy-crop, versão exata), envio direto ao R2, lista com
  capa, reordenação por arrasto e botões, remoção e estados de falha.
  ```
  — **humano**

---

## SF10 — Prova com aparelhos reais (R4) e fechamento da lista de permitidos (humano executa)

**Usa**: F§4 (regra do ICC, modo registro), F§7 (`FOTOS_VERIFICACAO` por ambiente); Q§5.4;
research R4 e D4; plan: linha SF10. Pré-requisito: SF6, SF8 e SF9 publicadas no dev (push
confirmado pelo humano), segredos do dev da T038 e a limpeza da T060 já feitas.
**Arquivos**: `src/test/fixtures/fotos/aparelho/` (arquivos reais), testes de verificação com as
fixtures, `src/lib/r2/verificacao/` (ajustes da lista), `wrangler.jsonc`,
`src/test/conformance/verificacao-modo.test.ts`.
**Fecha**: US2-AC1, US2-AC2 (arquivos reais, sem EXIF/GPS/XMP/IPTC), fecho do critério de saída
do R4 registrado na T007.
**Revisão TL**: ✅.

- [ ] T094a **[TL✅]** Ligar o modo registro **só para esta SF**: `FOTOS_VERIFICACAO: "registro"`
  nas `vars` de `env.dev` em `wrangler.jsonc` (nunca no nível de cima nem em `env.production`;
  a conformidade da T026 já permite o `env.dev`); `npm run check` com output real; revisão do
  diff pelo tech-lead; commit pelo humano (`chore(wrangler): liga o modo registro no dev para a
  prova com aparelhos`) e push confirmado para o deploy do dev, antes da T095 — **principal**
- [ ] T095 **Humano executa — captura com aparelhos** (dev, `FOTOS_VERIFICACAO=registro`):
  em **Chrome Android** e **Safari iOS**, 1 foto tirada na hora e 1 da galeria com localização
  ativa; no iPhone, 1 HEIC; cadastrar um produto com elas. Em paralelo, `npx wrangler tail --env
  dev` mostrando os blocos de cada confirmação. Entregar o output do `tail` — **humano**
- [ ] T096 **Humano executa — inspeção**: baixar cada objeto (`npx wrangler r2 object get
  roseshop-dev/fotos/<arquivo> --remote --file /tmp/<arquivo>`) e rodar `exiftool -a -G1
  /tmp/<arquivo>`. Esperado: nenhum grupo EXIF/GPS/XMP/IPTC. Entregar os outputs e os arquivos
  confirmados — **humano**
- [ ] T097 Copiar os arquivos confirmados para `src/test/fixtures/fotos/aparelho/` (somente os
  que o humano autorizar; sem localização real) e escrever os testes de verificação com as
  fixtures reais: todos aceitos por `verificarImagem`; confirmar `blocos` contra o `tail` —
  **test-writer**
- [ ] T098 **[TL✅]** Com os outputs reais: fechar a lista de blocos permitidos e a regra do
  ICC (tags e limite de 8 KB provisório), reavaliar APP14 "Adobe" e qualquer bloco novo; ajustar
  `src/lib/r2/verificacao/` e os testes da SF2 de acordo. Se algum aparelho produzir bloco fora
  da lista e a decisão mudar o desenho, **parar e trazer ao humano** — **principal**
- [ ] T099 **[TL✅]** Tirar `FOTOS_VERIFICACAO` de `env.dev` em `wrangler.jsonc` e atualizar a
  conformidade `verificacao-modo.test.ts` para **negar a variável em qualquer lugar** (inclusive
  `env.dev`). O modo registro permanece implementado no código e coberto pelo teste unitário —
  **principal**
- [ ] T100 Rodar `npm run check`; colar o output real; o humano confirma no dev (após novo
  deploy) que a recusa está ligada — **principal**
- [ ] T101 Revisão do diff pelo tech-lead (opus): lista final, regra do ICC, `wrangler.jsonc`,
  conformidade — **tech-lead**
- [ ] T102 Commits (humano), mensagens, em dois commits:
  ```text
  test(r2): fixtures reais de Chrome Android e Safari iOS

  Arquivos confirmados no dev em modo registro e inspecionados com exiftool;
  lista de blocos permitidos e regra do ICC fechadas com eles.
  ```
  ```text
  chore(wrangler): desliga o modo registro no dev

  Remove FOTOS_VERIFICACAO do env.dev; a conformidade passa a negar a
  variável em qualquer lugar do wrangler.jsonc.
  ```
  — **humano**

---

## SF11 — Gerenciar as fotos de um produto existente (telas)

**Usa**: T§1 (linhas `[id]`, `[id]/fotos`, lista, `[id]/remover`), T§2 (tela Fotos); F§8; plan:
linha SF11. Spec: US4-AC1–7, US5-AC1, US6-AC2, FR-035, FR-039, FR-040.
**Arquivos**: `src/app/painel/(protegido)/produtos/[id]/fotos/page.tsx` (nova),
`[id]/page.tsx`, `page.tsx` (lista), `[id]/remover/`, componentes de `_fotos/` reaproveitados,
`src/test/conformance/produtos-paginas-guard.test.ts`.
**Fecha**: US4-AC1–7, US5-AC1 (tela atualiza com `atual`), US6-AC2, FR-039/040.
**Revisão TL**: —.

- [ ] T103 [P] **Teste primeiro** — tela `[id]/fotos`: fotos em ordem com "Capa"; adicionar
  (mesmos passos de recorte e envio), arrastar/mover, **"Remover" com confirmação** ("Remover
  esta foto do produto? Ela será apagada."), "Trocar foto"; produto com 1 foto: **sem "Remover"**,
  com "Trocar foto" e "O produto precisa de pelo menos 1 foto." (US4-AC4); cada ação chama a
  action e **substitui o estado local pelo `Conjunto` devolvido, no `ok` e nas falhas com
  `atual`** (US4-AC7, US5-AC1); aviso curto com o primitivo `aviso`; sem botão "Salvar" —
  **test-writer**
- [ ] T104 [P] **Teste primeiro** — detalhe `[id]`: fotos em ordem, capa primeiro, botão
  "Fotos" (FR-040); lista `produtos`: miniatura da capa no lugar de "sem foto" com
  `loading="lazy"` (FR-039, D17); `[id]/remover`: texto "As fotos do produto também serão
  apagadas." (US6-AC2); `requireAdminPage("/painel/produtos/<id>/fotos")` e
  `produtos-paginas-guard` verde — **test-writer**
- [ ] T105 `ui-dev` implementa `[id]/fotos/page.tsx` e o componente da tela (reaproveitando
  `escolher-foto`, `recorte-foto`, `lista-fotos`, `usar-envio` com `trocarFoto`/`adicionarFoto`),
  detalhe com fotos, capa na lista e texto da remoção — **ui-dev**
- [ ] T106 Rodar `npm run check` e colar o output real — **principal**
- [ ] T107 **Humano executa — roteiro pela tela no `preview`** (Q§4 itens 6 e 7): adicionar,
  trocar, mover para a capa, remover (com confirmação); em outra janela mudar as fotos e voltar
  à primeira ⇒ mensagem de "mudadas por outra pessoa" e tela atualizada; lista com miniatura
  da capa; remoção do produto com o texto das fotos. Entregar o resultado — **humano**
- [ ] T108 Commit (humano), mensagem:
  ```text
  feat(painel): gerencia as fotos de um produto

  Tela /painel/produtos/[id]/fotos (adicionar, trocar, mover, remover com
  confirmação), fotos no detalhe, capa na lista com carregamento tardio e
  aviso sobre as fotos na remoção do produto.
  ```
  — **humano**

---

## SF12 — Limpeza diária (Cron Trigger) e worker próprio

**Usa**: F§6 inteira; F§2.6; F§7 (`CRON_SECRET`); Q§5.2; plan: linha SF12, TL-6, TL-12, TL-16.
Spec: US6-AC1/AC3–6, SC-008.
**Arquivos**: `src/lib/db/fotos.ts` (`expirarEnvios`, `chavesConhecidas`),
`src/lib/fotos/limpeza.ts`, `src/app/api/interno/limpeza/route.ts`, `cloudflare/worker.ts`,
`cloudflare/open-next-worker.d.ts`, `tsconfig.json`, `wrangler.jsonc`, `cloudflare-env.d.ts`
(gerado), testes ao lado.
**Fecha**: US6-AC1/AC3–6, SC-008.
**Revisão TL**: ✅.

- [ ] T109 [P] **Teste primeiro** — `src/lib/db/fotos.limpeza.int.test.ts` (sugerido):
  `expirarEnvios` (lock 4_001) apaga só `criado_em <= now() - 24 h` e devolve as chaves;
  `chavesConhecidas` devolve a união de `produto_fotos` e `fotos_envio` em **um único
  statement** (TL-12; teste que falha se houver duas consultas); limpeza concorrente com adoção
  não apaga foto de produto existente nem envio < 24 h — **test-writer**
- [ ] T110 [P] **Teste primeiro** — `src/lib/fotos/limpeza.int.test.ts` (sugerido), bucket
  falso: `executarLimpeza(agora)` apaga objetos de envios expirados (lotes de 1000; inexistente
  não é erro); lista `fotos/` e apaga órfãos **só se** `uploaded < agora − 25 h` **e** ausentes
  das duas tabelas (lidas **depois** de listar); mantém objetos recentes (US6-AC4), de produtos
  existentes (US6-AC6), de envios < 24 h; falha num `delete` só é registrada; devolve
  `{ enviosExpirados, orfaosApagados, falhas }` (SC-008, US6-AC3/AC5) — **test-writer**
- [ ] T111 [P] **Teste primeiro** — rota `src/app/api/interno/limpeza/route.test.ts` (sugerido):
  só `POST`; `authorization: Bearer <CRON_SECRET>` comparado por SHA-256 e laço de tempo fixo
  sobre os 32 bytes (TL-16); `CRON_SECRET` ausente, header ausente/errado ou outro método ⇒
  **404 sem corpo**, igual em todos os casos; sucesso ⇒ 200 com as contagens. Testes do
  `cloudflare/worker.ts`: `scheduled` chama o handler em processo com `POST` e Bearer e **lança**
  em status ≠ 200 — **test-writer**
- [ ] T112 [P] **Teste primeiro** — `typecheck` igual com e sem `.open-next/` (TL-6): teste ou
  verificação que roda `npm run typecheck` com e sem o diretório e compara o resultado (sem
  `@ts-expect-error`) — **test-writer**
- [ ] T113 **[TL✅]** `src/lib/db/fotos.ts`: `expirarEnvios(db)` (batch com lock 4_001 +
  `DELETE … RETURNING chave`) e `chavesConhecidas(db)` (statement único) — **principal**
- [ ] T114 **[TL✅]** `src/lib/fotos/limpeza.ts` (`server-only`) e a rota
  `src/app/api/interno/limpeza/route.ts` conforme F§6; registrar `{ evento, contagens }` no log
  — **principal**
- [ ] T115 **[TL✅]** `cloudflare/worker.ts` (fetch + `scheduled` que aguarda a resposta e lança se
  ≠ 200, sem `@ts-expect-error`), `cloudflare/open-next-worker.d.ts` com
  `ExportedHandler<CloudflareEnv>`, `tsconfig.json` com `exclude` de `.open-next`; `wrangler.jsonc`
  com `"main": "cloudflare/worker.ts"` e `"triggers": { "crons": ["0 6 * * *"] }` no nível de
  cima, em `env.dev` e em `env.production` (se o R3 usou a reserva do research D6, seguir a
  reserva); `npm run cf-typegen` — **principal**
- [ ] T116 **Humano executa — `CRON_SECRET` do dev**: `npx wrangler secret put CRON_SECRET --env
  dev` (valor de `openssl rand -base64 32`); `CRON_SECRET` local no `.dev.vars`. Produção na
  SF15 — **humano**
- [ ] T117 Rodar `npm run db:up`, `npm run db:migrate`, `npm run check` e `npm run test:int`;
  colar o output real — **principal**
- [ ] T118 **Humano executa — prova local e no dev** (Q§4.8 e Q§5.2): local,
  `npx opennextjs-cloudflare build && npx wrangler dev --test-scheduled` e
  `curl "http://localhost:8787/cdn-cgi/handler/scheduled?cron=0+6+*+*+*"`; `curl -i -X POST
  http://localhost:8787/api/interno/limpeza` sem header ⇒ **404**. Dev: cron temporário
  `*/5 * * * *` no `env.dev`, `npx wrangler tail --env dev` mostra o `POST /api/interno/limpeza`
  e as contagens; **voltar o cron para `0 6 * * *`** e conferir no diff. Entregar os outputs —
  **humano**
- [ ] T119 Revisão do diff pelo tech-lead (opus): rota (404 uniforme, comparação em tempo
  fixo), worker, `tsconfig`, `wrangler.jsonc` (cron restaurado), lock e snapshot da limpeza —
  **tech-lead**
- [ ] T120 Commit (humano), mensagem:
  ```text
  feat(fotos): limpeza diária de fotos sem uso

  Cron Trigger diário via worker próprio chama /api/interno/limpeza em
  processo: expira envios com mais de 24 h e apaga objetos órfãos com mais
  de 25 h. Rota com segredo comparado em tempo fixo e 404 sem corpo.
  ```
  — **humano**

---

## SF13 — IA: cliente OpenAI, contador de uso e action `sugerirProduto`

**Usa**: I§1–I§5 inteiras; F§2.1 (`enviosValidos`); Q§1 (item 5), Q§5.3 e Q§5.5; plan: linha SF13,
TL-9, TL-15. Spec: US3-AC1–8 (lado do servidor), SC-003, SC-004, SC-009.
**Arquivos**: `.gitignore` (linha `ia-medicao/`), `src/lib/ai/` (`config.ts`, `sugestao.ts`,
`index.ts`, `medicao.ia.test.ts`), `src/lib/db/ia-uso.ts`, `src/lib/produtos/sugestao.ts`,
`vitest.ia.config.mts`, `package.json` (script `test:ia`), conformidade de acesso à IA,
`specs/adr/010-ia-openai.md` (modelo/esforço definidos).
**Fecha**: US3-AC1–8 (servidor), SC-003, SC-004, SC-009.
**Revisão TL**: ✅.

- [ ] T120a **Primeira task da SF13 — humano executa**: prova técnica do `gpt-5.4-mini` com o
  script do R5 (`.spike/r5.mjs`, imagem + structured output estrito, `store: false`, esforços
  `none` e `low`), depois de resolver o acesso (403 `model_not_found` na SF0; research §3, R5).
  Sem acesso, a medição (T132) roda só com o `gpt-6-luna` ou o humano escolhe outro candidato —
  **humano**
- [ ] T121 **Primeiro de tudo** (antes de criar a pasta): linha `ia-medicao/` no `.gitignore`
  (TL-21) — **principal**
- [ ] T122 **Humano executa — chave dev**: `npx wrangler secret put OPENAI_API_KEY --env dev`
  (se ainda não existir) e `OPENAI_API_KEY` (chave **dev**, com teto de gasto) no `.dev.vars`
  local — **humano**
- [ ] T123 [P] **Teste primeiro** — `src/lib/ai/sugestao.test.ts` (fetch simulado): pedido com
  `store: false`, `max_output_tokens: 800`, `reasoning.effort`, `text.format` `json_schema`
  estrito com `categoria_id` limitado aos ids atuais (+ `null`), imagens `detail: low`, uma por
  foto na ordem; `AbortSignal.timeout(20_000)`; HTTP ≠ 200, `status ≠ "completed"`, recusa do
  modelo, JSON inválido e fora do schema ⇒ indisponível; log com modelo, status, duração e
  `usage`, **nunca** chave, imagem, prompt ou texto devolvido; instruções com a defesa contra
  texto nas imagens e sem pedir preço — **test-writer**
- [ ] T124 [P] **Teste primeiro** — `src/lib/produtos/sugestao.test.ts` (action
  `sugerirProduto`, mocks): ordem guard → Zod → `enviosValidos` (nenhuma foto não confirmada vai
  para a IA, FR-033) → `consumirSugestao` (consome antes de chamar; sem vaga ⇒ `ia_pausada`) →
  `listarCategorias` → bytes pelo binding → `pedirSugestao` → validação campo a campo
  (`nome`/`descricao` pelos validadores da 003; `categoriaId` só se estiver na lista; campo
  inválido ⇒ `null`; todos `null` ⇒ `ia_indisponivel`); **base64 nativo (TL-9), sem laço de
  `String.fromCharCode`** (teste que inspeciona o fonte ou o spy); sugestão não é gravada;
  **SC-009**: IA fora/erro ⇒ cadastro manual segue possível (`ia_indisponivel`) — **test-writer**
- [ ] T125 [P] **Teste primeiro** — `src/lib/db/ia-uso.int.test.ts`: `consumirSugestao` com
  limites como **parâmetros** (TL-15) e CTE do dia de Brasília; 1 linha ⇒ pode chamar, 0 ⇒
  pausada; 30/pessoa e 100/dia **exatos sob concorrência real** (lock 4_002); outro dia zera —
  **test-writer**
- [ ] T126 [P] **Teste primeiro** — conformidade de acesso à IA (em `fotos-acesso` ou
  `ia-acesso`): `api.openai.com` e `OPENAI_API_KEY` só em `src/lib/ai/`; nada de `src/lib/ai/`
  importado por código de client; `consumirSugestao` e `src/lib/ai/` só importados por
  `src/lib/produtos/sugestao.ts`; `sugerirProduto` só importado pelo passo Dados de
  `/painel/produtos/novo` (FR-034) — **test-writer**
- [ ] T127 **[TL✅]** `src/lib/ai/config.ts` (`MODELO`, `ESFORCO` provisórios,
  `TEMPO_LIMITE_MS = 20_000`, `MAX_SAIDA = 800`, `LIMITE_POR_PESSOA = 30`, `LIMITE_TOTAL = 100`),
  `sugestao.ts` (`pedirSugestao({ imagens, categorias })`), `index.ts` (barrel `server-only`) —
  **principal**
- [ ] T128 **[TL✅]** `src/lib/db/ia-uso.ts`: `consumirSugestao(db, sessao)` conforme I§3 (batch
  com `pg_advisory_xact_lock(${LOCK_IA_USO}::bigint)`, CTE do dia, `ON CONFLICT … WHERE`) —
  **principal**
- [ ] T129 **[TL✅]** `src/lib/produtos/sugestao.ts` (`"use server"`): `sugerirProduto` conforme
  I§2, com base64 por rotina nativa (`Buffer.from(bytes).toString("base64")` ou
  `Uint8Array.prototype.toBase64`) — **principal**
- [ ] T130 `vitest.ia.config.mts` (um único arquivo `src/lib/ai/medicao.ia.test.ts`, fora de
  `check`, `test:int` e CI), script `npm run test:ia` no `package.json`; a medição roda cada
  candidato × esforço (`none`, `low`) e imprime acertos de categoria (SC-003: ≥ 8/10; 100%
  existente ou vazia), p50/p90 de duração (SC-004: p90 ≤ 15 s) e `usage` médio ⇒ custo por
  cadastro; lê `ia-medicao/` e `gabarito.json` — **principal**
- [ ] T131 Rodar `npm run db:up`, `npm run db:migrate`, `npm run check` e `npm run test:int`;
  colar o output real — **principal**
- [ ] T132 **Humano executa — medição real**: criar `ia-medicao/` (≥ 10 produtos reais, 1 a 3
  fotos já tratadas pelo pipeline do aparelho, sem metadado) com `gabarito.json`
  (`{ produto, categoria }`, categorias do seed); rodar `npm run test:ia` com a chave dev;
  entregar o output real. Medir também o **CPU de `sugerirProduto` com 3 fotos de 1 MB e o da
  confirmação com foto de 1 MB** no dev (Q§5.3: painel Workers → `roseshop-dev` → Métricas) —
  **humano**
- [ ] T133 **[TL✅]** Com a medição: escolher o **modelo mais barato que passar** (SC-003 e
  SC-004), fixar `MODELO` e `ESFORCO` em `src/lib/ai/config.ts` e atualizar o ADR-010 (modelo,
  esforço, custo real por cadastro). **Alteração de ADR com aprovação do humano.** Se nenhum
  candidato passar, parar e trazer ao humano — **principal** + **humano** (aprovação)
- [ ] T134 Revisão do diff pelo tech-lead (opus): `src/lib/ai/`, `ia-uso.ts`, action, base64,
  log sem dados sensíveis, `.gitignore`, limites como parâmetro — **tech-lead**
- [ ] T135 Commit (humano), mensagem:
  ```text
  feat(ia): sugere nome, categoria e descrição a partir das fotos

  Responses API por fetch (store false, saída estrita, 20 s), contador de
  uso no Postgres (30 por pessoa e 100 por dia, lock 4_002) e a action
  sugerirProduto. Medição manual em npm run test:ia; modelo fixado pela
  medição e registrado no ADR-010.
  ```
  — **humano**

---

## SF14 — UI da sugestão no passo Dados

**Usa**: T§2 (passo Dados, sugestão), I§2 e I§6; plan: linha SF14. Spec: US3-AC1–8.
**Arquivos**: `src/app/painel/(protegido)/produtos/novo/page.tsx` e `form-produto.tsx` (modo
cadastro), componentes de sugestão em `_fotos/` ou ao lado (sugerido), testes ao lado.
**Fecha**: US3-AC1–8 (tela).
**Revisão TL**: —.

- [ ] T136 **Teste primeiro** — componentes do passo Dados: ao entrar **pela 1ª vez com aquele
  conjunto**, chama `sugerirProduto` **uma única vez** e o formulário abre editável com
  "Preenchendo a partir das fotos…" (US3-AC1); ao chegar, preenche **só campos ainda vazios**
  com o marcador "Sugestão — confira" que **some quando a pessoa edita o campo** (US3-AC2,
  AC3); preço, "a partir de" e status nunca sugeridos; categoria só se o id existir nas opções,
  senão vazio (US3-AC4); "Salvar" passa pelas regras da 003, inclusive nome repetido (US3-AC5);
  `ia_indisponivel` ⇒ "Não deu para sugerir agora. Preencha você mesma." + botão "Tentar
  sugestão de novo" (US3-AC6); `ia_pausada` ⇒ "As sugestões estão pausadas por agora. Preencha
  você mesma." sem botão de repetir (US3-AC7); sair sem salvar não cria produto (US3-AC8);
  campos editáveis o tempo todo (FR-027) — **test-writer**
- [ ] T137 `ui-dev` implementa a UI da sugestão no passo Dados consumindo `sugerirProduto` e as
  mensagens de I§6; sem tocar `src/lib/` — **ui-dev**
- [ ] T138 Rodar `npm run check` e colar o output real — **principal**
- [ ] T139 **Humano executa — roteiro pela tela no `preview`** (Q§4 item 5, com IA): "Continuar"
  ⇒ "Preenchendo a partir das fotos…" ⇒ campos sugeridos com "Sugestão — confira" (chave dev);
  completar o preço e "Salvar" ⇒ detalhe com as fotos na ordem. Entregar o resultado — **humano**
- [ ] T140 Commit (humano), mensagem:
  ```text
  feat(painel): sugestão da IA no cadastro de produto

  Passo Dados pede a sugestão uma vez por conjunto de fotos, preenche só
  campos vazios com o marcador "Sugestão — confira" e mantém o cadastro
  manual quando a IA falha ou está pausada.
  ```
  — **humano**

---

## SF15 — Fechamento: quickstart completo, produção, docs e observação

**Usa**: Q§1 (produção), Q§3, Q§4, Q§5, Q§6; plan: linha SF15 e "Cobertura dos critérios de
aceite"; CLAUDE.md "Documentação". Spec: SC-001, SC-002, SC-011 (observação), nota na spec da 003.
**Arquivos**: `specs/003-produtos/spec.md` (nota FR-013/FR-014), `README.md`, `docs/` e seções
do `CLAUDE.md` (via `doc-sync`, incl. `docs/operacao.md`), `specs/004-fotos-produto/` (registro
da observação).
**Fecha**: SC-001–004 e SC-011 (observação/medição), checklist de produção antes do merge.
**Revisão TL**: —.

- [ ] T141 Rodar `npm run check` e `npm run test:int` e colar os outputs reais completos —
  **principal**
- [ ] T142 **Humano executa — quickstart completo no `preview`** (Q§3 e Q§4, itens 1–9) e **no
  dev** (Q§5.1 a Q§5.3 já registrados nas SFs; repetir R1 (N, N±1, segundo `PUT` 412, sem
  `if-none-match` 403), cron e CPU da confirmação e da sugestão no free tier). Entregar os
  outputs reais — **humano**
- [ ] T143 **Humano executa — observação com a administradora** (Q§6), no dev, pelo celular
  dela: cadastrar um produto a partir de foto tirada na hora (≤ 4 min, sem ajuda — SC-001) e
  trocar a capa de um produto existente (≤ 1 min — SC-002). Registrar tempo, onde hesitou,
  mensagens que não entendeu (SC-011) e o **peso das capas na lista** (D17). Registrar em
  `specs/004-fotos-produto/` — **humano**
- [ ] T144 Revisão das mensagens (SC-011) contra `src/lib/fotos/mensagens.ts` e I§6: nenhuma
  palavra técnica, "Tirar" só em "Tirar foto"; ajustes de texto vão para o `redator` com
  aprovação do humano — **principal**
- [ ] T145 [P] Nota na spec da 003 (`specs/003-produtos/spec.md`) apontando FR-013/FR-014 para
  a 004 (produto passa a exigir 1 a 3 fotos), sem alterar critérios da 003 — **redator**
- [ ] T146 [P] Atualizar `README.md` (fotos no R2, sugestão por IA, `npm run test:ia`,
  requisitos de configuração) — **redator**
- [ ] T147 Acionar o `doc-sync-onboarding` (critérios do CLAUDE.md: schema/migration, rotas e
  actions novas, binding/vars, dependências de runtime, zona protegida, módulos novos em `src/`,
  Cron Trigger, hooks/CI): sincronizar `docs/` (incluindo `docs/operacao.md`: segredos, CORS,
  cron, modo registro) e as seções "Comandos"/"Estrutura"/"Estado atual" do `CLAUDE.md`; o agente
  só propõe a mensagem — **doc-sync**
- [ ] T148 **Humano executa — configuração de produção ANTES do merge no `main`** (Q§1 para
  `production`), com **checagem item a item** e o output real de cada uma entregue:
  (1) token R2 **Object Read & Write** com escopo só em `roseshop-prod`;
  (2) segredos: `npx wrangler secret put R2_ACCESS_KEY_ID --env production`,
  `R2_SECRET_ACCESS_KEY`, `CRON_SECRET`, `OPENAI_API_KEY` (chave de **produção**, diferente da
  dev) e **`npx wrangler secret list --env production`** listando os quatro nomes;
  (3) Account ID e origem final preenchidos em `R2_S3_ENDPOINT` de `env.production` e em
  `infra/r2/cors.production.json`;
  (4) CORS: `npx wrangler r2 bucket cors set roseshop-prod --file infra/r2/cors.production.json`
  e **`npx wrangler r2 bucket cors list roseshop-prod`** conferindo origem, `PUT`, `content-type`
  e `if-none-match`;
  (5) OpenAI → projeto de produção → **limite de gasto mensal** (sugestão US$ 10) e alerta por
  e-mail, com print ou confirmação do valor;
  (6) `SELECT count(*) FROM produtos;` em produção ⇒ `0` (somente leitura, console do Neon);
  (7) `FOTOS_VERIFICACAO` ausente de `wrangler.jsonc` (conferido pela conformidade verde) —
  **humano**
- [ ] T149 Commits (humano), mensagens:
  ```text
  docs(specs): aponta a 003 para a 004

  Nota em FR-013/FR-014 da 003: o produto passa a exigir 1 a 3 fotos.
  ```
  ```text
  docs(readme): documenta fotos no R2 e sugestão por IA
  ```
  ```text
  docs(onboarding): sincroniza docs com a feature 004 de fotos

  Atualiza docs/ (incluindo operacao.md) e as seções Comandos, Estrutura e
  Estado atual do CLAUDE.md com fotos, R2, IA e limpeza diária.
  ```
  — **humano**
- [ ] T150 **Merge no `main` — humano**, só depois de T141–T149 concluídos, do PR aprovado e
  do deploy de produção validado pelo `/api/health` e pelo smoke do CI. Nenhum agente faz
  push ou merge sem confirmação — **humano**

---

## Cobertura (spec → SF)

| Critério | SFs |
|---|---|
| US1-AC1–6 | SF9 (componentes) |
| US1-AC7, AC8, AC9 | SF9 (tela), SF6 (actions), SF4 (SQL) |
| US2-AC1, AC2 | SF8 (pipeline), SF10 (arquivos reais) |
| US2-AC3, AC7 | SF8 (`detectarTipo`/`abrirImagem`), SF9 (componentes) |
| US2-AC4, AC5, AC9 | SF2 (verificação), SF3 (assinatura: tamanho e `if-none-match`, R1), SF6 (`confirmarEnvio`) |
| US2-AC6 | SF6 (guard nas actions + conformidade) |
| US2-AC8, AC10 | SF9 |
| US3-AC1–8 | SF13 (action e cliente), SF14 (componentes) |
| US4-AC1–5 | SF5 (SQL), SF7 (actions), SF11 (componentes) |
| US4-AC6 | SF5 (`atualizado_por`/`atualizado_em`, `versao` intacta) |
| US4-AC7 | SF7 (versão nova no `ok`), SF11 |
| US5-AC1–5 | SF5 (concorrência int), SF7 (actions), SF11 (AC1, tela) |
| US6-AC1 | SF4 (`remover`), SF6 (`removerProduto`) |
| US6-AC2 | SF11 |
| US6-AC3–6 | SF12 |
| Edge cases | adoção alheia/não confirmada/expirada e duplo "Salvar" (SF4); envio durante "Salvar" e foto pequena (SF8, SF9); animada (SF2); destaque sem foto (SF5) |
| SC-001, SC-002, SC-011 | SF15 (observação) |
| SC-003, SC-004 | SF13 (medição) |
| SC-005 | SF8 (`codificar`), SF9 (medição no `preview`) |
| SC-006 | SF2, SF3 (sobrescrita recusada, R1), SF6 |
| SC-007 | SF5 |
| SC-008 | SF12 |
| SC-009 | SF13 |
| Provas R1, R2, R3, R5 | SF0 (T003–T006); R4 → SF10 |
| Produção configurada antes do merge | SF15 (T148) |

## Pontos de atenção (não mapeados pelo plan; ver o resumo da geração)

- Fixtures da 003 que inserem em `produto_fotos` podem quebrar na SF1 (colunas `NOT NULL`)
  — o plan só ajusta as fixtures na SF5 (T019, T054).
- `inserir` da 003 foi mantido até a SF6 para o `check` ficar verde entre SF4 e SF6 (T047, T067).
- `FOTOS_VERIFICACAO=registro` entra no `env.dev` só no início da SF10 (T094a) e sai na T099
  (decisão do analyze, 2026-10-08); da SF6 à SF9 o dev roda com a recusa ligada.
- Nomes de arquivo marcados "sugerido" não estão no plan.
