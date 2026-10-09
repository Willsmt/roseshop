# ADR-009 — Fotos de produto no R2

**Status:** aceito em 2026-10-09 (aprovado pelo humano na T013 da feature 004)
**Data:** 2026-10-09
**Origem:** `specs/004-fotos-produto/` — plan (seção "ADRs", "Complexity Tracking"), research
D1–D6, D11–D16 e §3 (provas R1–R3; R4 adiado para a SF10), data-model, contracts/fotos.md §2,
§4–§7.

## Contexto

A feature 004 dá a cada produto de 1 a 3 fotos, tiradas e tratadas no aparelho da
administradora. O app roda num Worker (ADR-001), com limites de CPU e de corpo de requisição,
e o banco é acessado por `neon-http` sem transação interativa (ADR-008). O bucket R2 já existe
por ambiente (`roseshop-local`, `roseshop-dev`, `roseshop-prod`, ADR-006) com o binding
`PRODUCT_IMAGES`. Fotos não podem carregar metadado (EXIF, GPS, XMP, IPTC), e um arquivo
enviado não pode ser trocado depois de confirmado.

## Decisão

**1. Envio direto do aparelho ao R2 por URL pré-assinada.**
- Assinatura com **`aws4fetch`** (dependência de runtime nova, sem dependências transitivas,
  versão fixada; as provas usaram a 1.0.20): `service: "s3"`, `region: "auto"`,
  `signQuery: true`, `allHeaders: true`; `PUT` com `content-type`, `content-length` exatos e
  `if-none-match: *`; `X-Amz-Expires=300` (5 min) posto na URL **antes** de assinar (o padrão
  do `aws4fetch` é 86400). `X-Amz-SignedHeaders` = `content-length;content-type;host;if-none-match`.
- **Prova R1 (bucket dev, 2026-10-09, output literal em research §3)**: o R2 impõe o
  `content-length` exato (N±1 ⇒ 403), o `content-type` (outro tipo ⇒ 403) e o
  `if-none-match: *` (ausente ⇒ 403; segundo PUT na mesma URL ⇒ **412**). A forma assinada é
  definitiva: **sem** coluna `etag` e sem as reservas (a)/(b) do research D2.
- Credencial: token **Object Read & Write** por bucket e por ambiente, com escopo só no bucket
  do ambiente (III.6), em `wrangler secret` (`R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`);
  endpoint em `R2_S3_ENDPOINT` (`vars`, não secreto). O token é criado **sem expiração** (o do
  dev, em 2026-10-09; padrão também para produção); a revogação é **manual**, no painel do R2,
  em caso de suspeita de vazamento. CORS versionado em
  `infra/r2/cors.dev.json` e `infra/r2/cors.production.json`: origem exata do ambiente, `PUT`,
  headers `content-type` e `if-none-match`, `MaxAgeSeconds` 600.
- Teto de **1 MB** por arquivo: recusado na emissão (`tamanho > 1_048_576` ⇒ "grande demais"),
  imposto pela própria URL e conferido de novo na confirmação (tamanho do objeto, sem ler o
  corpo).

**2. Chave única, nunca movida; estado no banco.**
- Chave `fotos/<uuid v4>.<webp|jpg>`, gerada pelo banco a partir do `id` e do formato na
  emissão. O estado do envio vive em `fotos_envio` (`emitido` → `confirmado`); a adoção apaga a
  linha de `fotos_envio` e insere em `produto_fotos` com a mesma chave, no mesmo `db.batch` sob
  o lock `4_001` (emenda do ADR-008).
- Teto de 20 envios pendentes por administradora em 24 h, **aproximado sob concorrência da
  mesma pessoa** (aceito, D13); confirmação idempotente.
- **Constraints novas em `produto_fotos`** (D16): `UNIQUE (chave_objeto)`
  (`produto_fotos_objeto_unique`) — uma chave pertence a no máximo um produto — e `CHECK` da
  regex `^fotos/<uuid v4>\.(webp|jpg)$` (`produto_fotos_objeto_formato`) — o formato da chave é o
  mesmo que a rota de exibição aceita. Elas **não** tratam da regra de 1 a 3 fotos sem buracos
  (FR-003), que continua com `UNIQUE (produto_id, posicao)`, `CHECK 1..3` e a aplicação.
- Remoção de produto: as chaves das fotos são capturadas no mesmo batch da remoção; o `delete`
  no R2 é em melhor esforço e falha só é registrada (D14, FR-035). Troca e remoção de foto
  apagam a chave que saiu também em melhor esforço (FR-036).

**3. Formato e verificação sem decodificar.**
- Só **JPEG e WebP quadrados, de 400 a 1200 px** de lado (o aparelho nunca amplia). É um
  **subconjunto deliberado** da III.4 da constitution (que admite `image/png`): PNG é recusado
  pela assinatura (FR-012) e, no aparelho, o fallback do Safari para PNG é recodificado em JPEG
  (D4). HEIC não tem biblioteca: o navegador abre ou vale a mensagem de formato (D15).
- Verificação no servidor por **parser próprio com lista de permitidos**, sem dependência e sem
  decodificar pixels, lendo o **arquivo inteiro**: bloco fora da lista em qualquer posição,
  qualquer byte depois do EOI / fim do RIFF, segmento truncado ou comprimento inconsistente
  recusam (contracts/fotos.md §4).
- O formato detectado pelo conteúdo deve ser **igual ao declarado** na emissão (extensão da
  chave e `content-type` assinado); divergência ⇒ recusa por formato.
- **Regra do ICC** (JPEG APP2, WebP ICCP): só tags de cor (`wtpt`, `bkpt`, `rXYZ`/`gXYZ`/`bXYZ`,
  `rTRC`/`gTRC`/`bTRC`, `chad`, `chrm`, `lumi`) mais `desc` e `cprt`, perfil de até **8 KB**
  (valor provisório); qualquer outra tag ⇒ `metadado`. A lista de blocos e a do ICC fecham na
  SF10 (R4, aparelhos reais).
- Modo `registro` (`FOTOS_VERIFICACAO=registro`, valor exato) existe **só nas `vars` do
  `env.dev` e só durante a SF10**; nunca em produção. Ele relaxa **só** a recusa por `metadado`
  (com log de aviso, nunca bytes); formato, tamanho, dimensões, animação e truncamento continuam
  recusando. Teste de conformidade falha se a variável existir no nível de cima, em
  `env.production` ou no `.dev.vars.example`, e em qualquer lugar depois da SF10.

**4. Exibição só com sessão.** Rota `GET /painel/fotos/[arquivo]` (D12): sem sessão de
administradora ⇒ 404; valida `arquivo` como `uuid v4 + .webp|.jpg` **antes** de tocar no
binding; só serve chaves que existem em `produto_fotos` ou em `fotos_envio` com estado
`confirmado`; lê pelo binding. O bucket não é público.

**5. Limpeza diária por Cron Trigger no worker próprio.**
- `cloudflare/worker.ts` reexporta o `fetch` do OpenNext; o `scheduled` chama
  `handler.fetch(new Request("https://interno.invalid/api/interno/limpeza", { method: "POST",
  … }), env, ctx)` **em processo, sem rede**, aguarda a resposta (`await`) e **lança erro se o
  status não for 200**.
- Rota `POST /api/interno/limpeza` autenticada por `CRON_SECRET` (SHA-256 dos dois valores
  comparados em tempo fixo); ausente, errado ou outro método ⇒ 404 sem corpo, igual em todos os
  casos.
- Algoritmo (contracts/fotos.md §6): expira envios com 24 h ou mais (sob o lock `4_001`) e
  apaga os objetos; depois apaga objetos de `fotos/` com mais de 25 h ausentes das duas tabelas
  (lidas num único statement).
- Cron `0 6 * * *` (03:00 em Brasília) no nível de cima, em `env.dev` e em `env.production`.
  **`triggers.crons` é declarado em todo ambiente** do `wrangler.jsonc`; um ambiente futuro sem
  cron declara `"crons": []`. Motivo, conferido pela **leitura do código** do wrangler 4.147.0
  (não por deploy observado): o `wrangler deploy` só regrava os crons quando a chave existe, e
  um deploy sem ela **não remove** cron já publicado.
- **Prova R3 (2026-10-09, research §3)**: local (`--test-scheduled`, output literal) e online
  (worker descartável `roseshop-spike-r3` com `*/5`; tail literal), o `scheduled` chegou ao
  Next em processo pelo host `interno.invalid` (GET ⇒ status da própria rota; POST ⇒ 405).
  Reserva `WORKER_SELF_REFERENCE` descartada. O cron aparece `Ok` mesmo com status de erro se o
  `scheduled` não lançar; por isso o lançamento é obrigatório. A checagem do bundle e o deploy
  online foram entregues **resumidos** pelo humano; o worker descartável foi apagado
  (`versions list` ⇒ "This Worker does not exist on your account. [code: 10007]").

**6. R2 local pelo endpoint S3 do wrangler.**
- `local_dev.experimental_s3_credentials` **dentro do item de `r2_buckets`** do nível de cima
  (local), com credenciais **falsas e fixas** (`roseshop-local` / `roseshop-local-nao-secreto`),
  repetidas no `.dev.vars.example`; `R2_S3_ENDPOINT =
  http://localhost:8787/cdn-cgi/local/r2/s3/roseshop-local` (o caminho usa o `bucket_name`).
  Valores locais no exemplo seguem a prática já registrada na pendência "III.1 ×
  `.dev.vars.example`" (plan, "Pendências fora da 004").
- **Prova R2 (wrangler 4.147.0, 2026-10-09, output literal em research §3)**: URL assinada
  grava no bucket local e o objeto é lido pelo binding; assinatura errada ⇒ 403; as mesmas
  recusas do R2 real. Reserva do D11 (rota de PUT só local) descartada. A prova rodou num
  worker mínimo; a prova no app completo foi a T039 da SF3 (research §3, "R2 no app
  completo"; ver emenda abaixo).
- A opção é **experimental** (o wrangler avisa a cada carga) e depende da versão **fixada**
  do wrangler: a partir da SF9, todo bump repete o quickstart §4 (envio pela tela no
  `preview`); até a SF9, o wrangler não é atualizado (ver emenda abaixo). Se o gitleaks acusar
  as credenciais falsas, a exceção é pelo valor exato, nunca pelo arquivo.
- **Emenda (2026-10-09, SF3 da feature 004, aprovada pelo humano):** o texto anterior dizia
  "a prova no app completo é o quickstart §4, na SF3" e "todo bump repete o teste de envio
  local do quickstart". O quickstart §4 é o roteiro pela tela e só existe a partir da SF9; a
  prova no app completo foi feita por script na T039 (research §3, "R2 no app completo": PUT
  assinado aceito, N±1 ⇒ 403, segundo PUT ⇒ 412, objeto íntegro), e o script não é
  versionado. Por isso: até a SF9, sem bump do wrangler (fixado em 4.147.0, commit
  `cb62190`); a partir da SF9, todo bump repete o quickstart §4.

## Alternativas descartadas

- **Upload pelo Worker (corpo passando pela Server Action)**: consome CPU e corpo de requisição
  do Worker; a URL pré-assinada tira o arquivo do caminho do app (III.4 pede envio direto).
- **SigV4 próprio**: criptografia escrita por nós.
- **`@aws-sdk/*`**: peso de bundle e superfície de audit (ADR-007).
- **Prefixo `tmp/` movido para `produtos/` na adoção**: cópia fora da transação, dobra operações
  classe A e cria estado intermediário entre R2 e banco.
- **Coluna `etag` + `onlyIf` nas leituras** (reserva (b) do D2): desnecessária, o R2 impõe o
  `if-none-match` assinado (R1).
- **Bucket público ou domínio `r2.dev`**: fotos de envios pendentes ficariam acessíveis; a
  exibição exige sessão.
- **Decodificar a imagem no servidor** (biblioteca de imagem no Worker): peso de bundle e CPU;
  a lista de permitidos verifica a estrutura sem pixels.
- **Cron chamando a rota por `fetch` pela internet ou por `WORKER_SELF_REFERENCE`**: a chamada
  em processo funciona (R3) e não expõe a rota a tráfego externo.
- **Rota de PUT só local** (reserva do D11): diverge do fluxo real; desnecessária (R2).

## Consequências

- (+) O arquivo não passa pelo Worker; o R2 recusa sozinho tamanho, tipo e sobrescrita.
- (+) Nenhum objeto confirmado pode ser trocado pela mesma URL.
- (+) Uma só forma de envio do local à produção, com o mesmo código de assinatura.
- (−) Dependência de runtime nova (`aws4fetch`), sujeita à auditoria do ADR-007
  (`npm audit --omit=dev`) e justificada no commit (II).
- (−) O token **Object Read & Write** não só grava: também **lê e apaga** objetos do bucket.
  Vazamento de `R2_ACCESS_KEY_ID`/`R2_SECRET_ACCESS_KEY` expõe (leitura e remoção) as fotos
  daquele ambiente; o escopo por bucket limita o dano a um ambiente.
- (−) Três segredos por ambiente online (`R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`,
  `CRON_SECRET`) e um CORS por bucket para manter.
- (−) O R2 local depende de opção experimental do wrangler; cada bump do wrangler repete o teste.
- (−) Objeto órfão (linha removida ou `delete` que falhou) pode durar até **~49 h**: 25 h de
  carência mais até 24 h até a próxima execução diária. Envio expirado também pode levar até
  ~48 h para ser expirado e apagado. Falha de `delete` na limpeza repete no dia seguinte.
- (−) A lista de permitidos só fecha com aparelhos reais (SF10); até lá, a verificação pode
  recusar arquivo legítimo.
- (−) `triggers.crons` precisa ser declarado em todo ambiente, para um deploy não deixar cron
  antigo publicado.
