# Research — Feature 004 (fotos de produto com sugestão por IA)

**Data**: 2026-10-08 | Spec: [spec.md](./spec.md) | Decisões tomadas pelo humano em 2026-10-08
(respostas à etapa 1 do `/speckit-plan`). Itens marcados **[spike]** só valem depois da prova da
SF0 (plan.md); se a prova falhar, vale a reserva indicada e a decisão volta ao humano.

## 1. Fatos verificados (2026-10-08)

| # | Fato | Fonte |
|---|---|---|
| F1 | URL pré-assinada do R2 aceita GET, HEAD, PUT e DELETE; **POST (policy, `content-length-range`) não é suportado**. Assinatura SigV4 local, com Access Key/Secret de token S3 do R2; validade de 1 s a 7 dias. `Content-Type` assinado é imposto (diferente ⇒ 403). CORS no bucket é obrigatório para uso pelo navegador | developers.cloudflare.com/r2/api/s3/presigned-urls |
| F2 | Tokens S3 do R2 têm 4 níveis (Admin R/W, Admin Read, Object R/W, Object Read), com escopo por bucket. Não há "só PUT" | idem + painel R2 |
| F3 | **Não há documentação** de que o R2 imponha um `Content-Length` assinado | busca sem resultado ⇒ **[spike] R1** |
| F4 | O wrangler instalado (4.147.0) tem `r2_buckets[].local_dev.experimental_s3_credentials` (`accessKeyId`, `secretAccessKey`): o bucket local passa a ser servido em `/cdn-cgi/local/r2/s3/<bucket>` com SigV4. Marcado **EXPERIMENTAL**; ignorado quando o bucket é remoto | `node_modules/wrangler/config-schema.json` ⇒ **[spike] R2** |
| F5 | O OpenNext aceita um worker próprio que importa o `default` de `.open-next/worker.js`, reexporta `fetch` e acrescenta `scheduled`; o `main` do `wrangler.jsonc` passa a apontar para ele | opennext.js.org/cloudflare/howtos/custom-worker ⇒ **[spike] R3** |
| F6 | O Safari (iOS até 26.5) **não gera WebP** pelo `canvas.toBlob`; pedido não suportado devolve **PNG** sem erro (WebKit 226950, WONTFIX) | caniuse `toblob_type_parameter_webp`, bugs.webkit.org |
| F7 | `gpt-6-luna`: entrada texto+imagem, `structured_outputs`, Responses API, esforço `none`…`max` (padrão `medium`), US$ 0,10 / 0,50 por 1M tokens. `gpt-5.4-mini`: texto+imagem, `structured_outputs`, Responses API, esforço `none` (padrão)…`xhigh`, US$ 0,75 / 4,50 | developers.openai.com/api/docs/models/{gpt-6-luna,gpt-5.4-mini}, /pricing |
| F8 | Tokens de imagem são por "patches" de 32 px × multiplicador (1,2 para `gpt-5.6-luna` e `gpt-5.4-mini`); `detail: low` no Luna cabe em 512×512; no `gpt-5.4-mini` o `low` tem orçamento de 6.144 patches. O guia **não cita `gpt-6-luna`** (estimativa abaixo usa a regra do 5.6-luna). Base64 em `input_image` é aceito na Responses API | developers.openai.com/api/docs/guides/images-vision |
| F9 | A concorrência da 003 compara **`versao`**, não `atualizado_em` (`src/lib/db/produtos.ts:153,171,194,199,221`). `atualizado_em` é só gravado | código |
| F10 | `produto_fotos` existe vazia (nenhum writer na 003): `posicao` 1..3, `UNIQUE(produto_id, posicao)` **não adiável**, `CHECK 1..3`, FK `ON DELETE CASCADE` | `src/lib/db/schema.ts:95-110` |
| F11 | `locks.ts` usa 2_001 e 2_002; regra: bigint único, nunca reaproveitar | `src/lib/db/locks.ts` |
| F12 | Binding `PRODUCT_IMAGES` já declarado nos 3 ambientes (`roseshop-local`, `roseshop-dev`, `roseshop-prod`); binding `IMAGES` existe e **não será usado** (VII) | `wrangler.jsonc` |

## 2. Decisões (humano, 2026-10-08)

### D1 — Credencial e CORS: **token Object R/W por bucket e por ambiente; `aws4fetch`; CORS versionado**
- Um token S3 por ambiente (`roseshop-dev`, `roseshop-prod`), nível Object Read & Write, escopo
  só no bucket do ambiente (III.6). Local: credenciais falsas fixas (D11), sem token real.
- Segredos `R2_ACCESS_KEY_ID`/`R2_SECRET_ACCESS_KEY` via `wrangler secret` por env; local em
  `.dev.vars`. `R2_S3_ENDPOINT` (endpoint + bucket, não secreto) em `vars` por env.
- Assinatura com **`aws4fetch`** (dependência de runtime nova, sem dependências transitivas;
  justificada no commit, II). Descartados: SigV4 próprio (cripto nossa), `@aws-sdk/*` (peso e
  superfície de audit, ADR-007).
- CORS em `infra/r2/cors.dev.json` e `infra/r2/cors.production.json`: origem exata do ambiente,
  `PUT`, headers `content-type` e `if-none-match`, `MaxAgeSeconds` 600. Aplicado pelo humano com
  `wrangler r2 bucket cors set`. Local não precisa (mesma origem, D11).

### D2 — Teto, URL e chaves: **`Content-Length` assinado [spike R1]; 1 MB; 1200 px; 5 min; chave única sem mover + `fotos_envio`**
- O aparelho informa `formato` (`webp`|`jpeg`) e `tamanho` (bytes do blob). O servidor recusa
  `tamanho > 1_048_576` (mensagem "grande demais") e assina `PUT` com `content-type`,
  `content-length` exatos **e `if-none-match: *`** (revisão TL-1: a URL só cria o objeto, nunca
  o sobrescreve depois da confirmação), `X-Amz-Expires=300` posto na URL **antes** de assinar
  (o padrão do `aws4fetch` é 86400). O CORS libera `if-none-match`.
- Reservas, decididas pelo resultado do R1: (a) se o R2 não impuser o `content-length`, assinar
  sem ele e manter a checagem de tamanho da confirmação (que existe em qualquer caso); (b) se não
  impuser o `if-none-match`, gravar o `etag` em `fotos_envio.etag` na confirmação e exigir
  `onlyIf: { etagMatches }` em toda leitura posterior (rota de exibição, IA) e um `head` com o
  mesmo `etag` antes da adoção.
- Lado do quadrado: **1200 px** (menor, se o recorte tiver menos; nunca amplia). Qualidade
  inicial WebP 0,82 / JPEG 0,85; se passar de 1 MB, recodifica em 0,72 e 0,62; depois disso recusa.
- Chave **`fotos/<uuid>.<webp|jpg>`**, criada na emissão e nunca movida. O estado vive no banco
  (`fotos_envio`, data-model). A adoção apaga a linha de `fotos_envio` e insere em
  `produto_fotos` com a mesma chave, no mesmo batch. Descartado: `tmp/` → `produtos/` (cópia
  fora da transação, dobra operações classe A).

### D3 — Verificação: **parser próprio, lista de permitidos, arquivo inteiro**
- Em `src/lib/r2/verificacao/` (zona protegida; revisão do tech-lead). Sem dependência.
- Lê o **arquivo inteiro**: recusa bloco proibido em qualquer posição (inclusive depois do SOS),
  **qualquer byte depois do EOI / fim declarado do RIFF**, segmento ou chunk truncado,
  comprimento inconsistente e assinatura desconhecida.
- Lista exata por formato e motivos: [contracts/fotos.md §4](./contracts/fotos.md#4-verificação-do-arquivo--srclibr2verificacao).
- Só **JPEG e WebP** passam; PNG é recusado pela assinatura (decisão B da revisão; FR-012).
- Foto **quadrada, lado de 400 a 1200 px** (decisão B; FR-016).
- APP0 JFIF só com 16 bytes e miniatura 0×0 (TL-7). JPEG progressivo: vários SOS, com DHT/DQT
  entre eles (TL-18).
- Perfil ICC (JPEG APP2 em um ou mais pedaços, WebP ICCP): só tags de cor (`wtpt`, `bkpt`,
  `rXYZ`/`gXYZ`/`bXYZ`, `rTRC`/`gTRC`/`bTRC`, `chad`, `chrm`, `lumi`) mais `desc` e `cprt`, com
  limite de tamanho; `dmnd`, `dmdd`, `meta`, tags privadas e qualquer outra ⇒ `metadado`
  (decisão C, TL-8). Lista final e limite fechados com as fixtures reais da SF10.
- Laço dos dados entrópicos do JPEG com `indexOf(0xFF)`, sem varrer byte a byte em JS (TL-9).
- O formato detectado pelo conteúdo deve ser igual ao `formato` declarado na emissão (a
  extensão da chave e o `content-type` assinado); divergência ⇒ recusa por formato.
- Testes: fixtures **sintéticas geradas no teste** (blocos montados byte a byte, inclusive EXIF
  com GPS falso), variantes corrompidas de propósito e arquivos reais dos aparelhos (D4).
  **Nenhuma foto com GPS real entra no repositório.**

### D4 — WebP no Safari e prova com aparelhos: **teste 1×1 na carga + conferência do `blob.type`; modo registro só no dev**
- Na carga da tela, `toBlob` de um canvas 1×1 com `image/webp`; o resultado (WebP sim/não) vale
  para a sessão. Em cada foto, o `blob.type` é conferido de novo; se não for o pedido, recodifica
  em JPEG; PNG nunca é enviado (falha ⇒ "Não enviada").
- **Modo registro**: `FOTOS_VERIFICACAO=registro` existe **só nas `vars` do `env.dev` no
  `wrangler.jsonc`**, e só durante a SF10. Nele, a recusa
  por **bloco fora da lista** (`metadado`) é registrada em log (nome dos blocos, formato, tamanho;
  nunca bytes) e o envio é aceito. Formato, tamanho, dimensões, animação e truncamento continuam
  recusando. Qualquer valor diferente de exatamente `registro`, ou ausência, ⇒ recusa ligada.
  Teste de conformidade lê o `wrangler.jsonc` **e o `.dev.vars.example`** e falha se a variável
  existir no nível de cima (local), em `env.production` ou no exemplo; **depois da SF10, falha se
  existir em qualquer lugar** (TL-17). Toda confirmação aceita em modo registro grava log de aviso.
- Prova (SF10): o humano envia pelo Chrome Android e pelo Safari iOS no dev, baixa os objetos com
  `wrangler r2 object get --remote`, roda `exiftool -a -G1` e entrega o output; os arquivos
  confirmados sem metadado viram fixtures em `src/test/fixtures/fotos/aparelho/`. Só depois disso
  a lista de permitidos é fechada e o modo registro é removido do `env.dev`.

### D5 — Concorrência das fotos: **`fotos_versao` em `produtos`, lock global 4_001, token de operação, apagar e reinserir**
- Pré-condição verificada (F9): a otimista da 003 usa `versao`; nada muda nela.
- `produtos.fotos_versao integer NOT NULL DEFAULT 1` e `produtos.fotos_operacao uuid NULL`.
- **Toda** escrita em `produto_fotos` ou que consome `fotos_envio` (cadastro com fotos, ações de
  fotos, remoção de produto, limpeza) é um `db.batch` que começa com
  `pg_advisory_xact_lock(LOCK_FOTOS = 4_001)` (global; ver contracts/fotos.md §2).
- Forma: depois do lock, **um** `UPDATE produtos` grava `fotos_versao + 1`, `fotos_operacao =
  $token` (uuid novo por chamada), `atualizado_por`, `atualizado_em`, condicionado a
  `fotos_versao = $v` e a todas as pré-condições (conjunto atual igual ao lido, envio válido,
  limites). Os statements seguintes só agem `WHERE EXISTS (… fotos_operacao = $token)`. O token
  evita o falso positivo de guardar por `fotos_versao = $v + 1` quando outra pessoa já tinha
  chegado a `v + 1` antes do lock.
- Mudança de conjunto = **apagar todas as linhas do produto e reinserir a lista nova** (as
  constraints de posição não mudam; o `id` da foto muda, nada o referencia).
- Com o lock global, nenhum writer de fotos intercala com outro nem com a limpeza; a pré-condição
  avaliada no primeiro `UPDATE` continua verdadeira até o fim do batch.
- **Emenda de convenção da 003**: "todo writer de `produtos` incrementa `versao`" passa a ser
  "todo writer que altera **campos, status ou destaque** incrementa `versao`; o writer de fotos
  altera só `fotos_versao`, `fotos_operacao`, `atualizado_por` e `atualizado_em`". Seguro porque
  `saiuDoDestaque` (CTE `antes`) e a precedência após 0 linhas leem só `versao`, `esgotado` e
  `destaque_vaga`, que o writer de fotos não toca; um `UPDATE` da 003 que espera o lock de linha
  de um writer de fotos reavalia `versao = $v` (inalterada) e segue. O comentário de
  `src/lib/db/produtos.ts:177-179` e o data-model da 003 são atualizados na SF5.

### D6 — Limpeza: **Cron Trigger diário, `scheduled` chama o handler do Next em processo**
- Worker próprio `cloudflare/worker.ts`: `fetch` reexportado; `scheduled` chama
  `handler.fetch(new Request("https://interno.invalid/api/interno/limpeza", { method: "POST",
  headers: { authorization: "Bearer " + env.CRON_SECRET } }), env, ctx)` com `await` direto
  (sem `ctx.waitUntil`) e `throw` se o status não for 200, como no contracts/fotos.md §6 —
  **em processo, sem rede** [spike R3: **confirmado**, local e online; a reserva `fetch` pelo
  `WORKER_SELF_REFERENCE` foi descartada. Corrigido em 2026-10-09: o texto anterior dizia
  "dentro de `ctx.waitUntil`"; o R3 mostrou o cron `Ok` mesmo com 503 quando o `scheduled` não
  lança, por isso vale o `await` com `throw`].
- Rota `POST /api/interno/limpeza`: compara SHA-256 do segredo recebido com SHA-256 do
  `CRON_SECRET` (mesmo comprimento sempre; mesmo código no Node e no workerd); ausente, errado ou
  outro método ⇒ **404 sem corpo**, igual em todos os casos (TL-16).
- O `scheduled` aguarda a resposta, registra o status e lança erro se não for 200, para a
  execução do cron aparecer como falha (TL-16).
- `cloudflare/worker.ts` importa `.open-next/worker.js` por um `.d.ts` próprio, sem
  `@ts-expect-error`, e `.open-next` entra no `exclude` do `tsconfig`, para o `typecheck` não
  depender de haver build local (TL-6).
- Cron `0 6 * * *` (03:00 em Brasília) em `env.dev`, `env.production` e no nível de cima (para o
  `--test-scheduled` local).
- Algoritmo e corrida com o FR-038: [contracts/fotos.md §6](./contracts/fotos.md#6-limpeza).

### D7 — IA: **modelo por medição; base64; `fetch` direto; `store: false`; contador no Postgres**
- Candidatos (F7): **`gpt-6-luna`** e **`gpt-5.4-mini`** — ambos com imagem e structured output
  confirmados na doc. Escolha na SF13 pela medição do SC-003 (≥ 10 produtos reais, categoria
  certa em ≥ 8 de 10, 100% existente ou vazia) e do SC-004 (≤ 15 s no p90): fica o **mais barato
  que passar**. O modelo e o esforço de raciocínio escolhidos viram constantes em
  `src/lib/ai/config.ts` e são registrados no ADR-010.
- Chamada: `POST https://api.openai.com/v1/responses` por `fetch`, **`store: false`**,
  `text.format` `json_schema` estrito, imagens como `input_image` base64 lidas do binding,
  `detail: "low"`, `AbortSignal.timeout(20_000)`. Sem SDK.
- Contador: tabela `ia_uso(dia, email, n)`; limites **30 por administradora por dia** e **100 no
  total por dia** (dia de Brasília). Consumo em `db.batch` com `LOCK_IA_USO = 4_002` (exato com
  3 pessoas). Cada pedido conta, inclusive "Tentar sugestão de novo". Os limites entram no SQL
  como parâmetros vindos de `config.ts` e o dia é calculado uma vez numa CTE (TL-15).
- Base64 com rotina nativa (`Buffer.from(bytes).toString("base64")` ou
  `Uint8Array.prototype.toBase64`, o que existir no workerd), nunca laço com
  `String.fromCharCode`; CPU de `sugerirProduto` com 3 fotos de 1 MB medida no dev (TL-9).
- Teto de gasto no painel da OpenAI: passo manual do humano (quickstart §1), dev e produção.
- **Custo estimado por cadastro** (3 fotos de 1200 px, ~400 tokens de texto, ~650 de saída):

  | Modelo | Imagem | Entrada | Saída | Por cadastro | 100/dia (teto) |
  |---|---|---|---|---|---|
  | `gpt-6-luna` (low ⇒ 512 px ⇒ 256 patches × 1,2 ≈ 308 tokens) | ~920 | ~1.320 ⇒ US$ 0,00013 | ⇒ US$ 0,00033 | **≈ US$ 0,0005** | ≈ US$ 0,05 |
  | `gpt-5.4-mini` (1200 px ⇒ 38×38 = 1.444 patches × 1,2 ≈ 1.733) | ~5.200 | ~5.600 ⇒ US$ 0,0042 | ⇒ US$ 0,0029 | **≈ US$ 0,007** | ≈ US$ 0,70 |

  Estimativa: o multiplicador do `gpt-6-luna` não está no guia (F8); a SF13 registra o `usage`
  real de cada chamada da medição.

### D8 — Arrasto e recorte: **arrasto próprio (pointer events); `react-easy-crop` no recorte**
- Arrasto horizontal de 3 posições com pointer events; botões do FR-022 sempre visíveis.
- `react-easy-crop` com versão **exata** fixada no `package.json` e justificada no commit (II).
  Não antecipa o ADR-005 (não é biblioteca de componentes).

### D9 — ADRs: **ADR-009 (fotos no R2), ADR-010 (IA), emenda do ADR-008**
- Escritos pelo tech-lead **depois da SF0** (com as provas) e aprovados pelo humano antes da SF1.
  Conteúdo previsto no plan.md, "ADRs".

### D10 — Produtos da 003 sem foto: **procedimento manual do humano, com backup em branch do Neon**
- Roteiro no [quickstart.md §2](./quickstart.md#2-apagar-os-produtos-da-003-sem-foto-humano).

### D11 — R2 local: **`experimental_s3_credentials` [spike R2]; reserva: rota de PUT só local**
- Nível de cima do `wrangler.jsonc`: `local_dev.experimental_s3_credentials` com credenciais
  **falsas e fixas** (`roseshop-local` / `roseshop-local-nao-secreto`), repetidas no
  `.dev.vars.example`; `R2_S3_ENDPOINT=http://localhost:8787/cdn-cgi/local/r2/s3/roseshop-local`.
- O ADR-009 registra que a opção é **experimental** e depende da versão **fixada** do wrangler;
  todo bump do wrangler repete o teste de envio local do quickstart.
- Reserva (se R2 falhar): rota `PUT` que só existe quando `R2_S3_ENDPOINT` aponta para
  `localhost`, validando um token HMAC do app e gravando pelo binding — com teste de conformidade
  provando que ela recusa em dev/produção. Volta ao humano antes de adotar.

### D12 — Exibição: **rota `/painel/fotos/[arquivo]` com sessão, lendo do binding**
- Valida `arquivo` como `uuid v4 + .webp|.jpg` **antes** de tocar no binding (a emissão só
  declara `webp` ou `jpeg`; PNG é recusado na confirmação, D3) e só serve
  chaves que existem em `produto_fotos` ou em `fotos_envio` com estado `confirmado`.
- Ver [contracts/fotos.md §5](./contracts/fotos.md#5-rota-de-exibição--srcapppainelfotosarquivoroutets).

### D13 — Abuso na emissão: **teto de 20 envios pendentes por administradora (24 h); confirmação idempotente**

### D14 — Remoção do produto: **chaves capturadas no mesmo batch, R2 em melhor esforço**
- `remover` (003) vira `db.batch([lock 4_001, WITH f AS (SELECT chave …), d AS (DELETE …) SELECT …])`;
  depois `bucket.delete(chaves)`; falha no R2 é registrada e a remoção vale (FR-035).

### D15 — HEIC: **sem biblioteca**; o navegador abre ou vale a mensagem do US2-AC7

### D16 — Constraints novas em `produto_fotos`: **mantidas** (decisão A da revisão)
- `UNIQUE(chave_objeto)` e `CHECK` do formato da chave não tratam da regra de 1 a 3 sem buracos;
  registrado nas Clarifications da spec e no ADR-009.

### D17 — Peso das capas na lista: **`loading="lazy"` nas miniaturas**; avaliar no SC-001 (decisão D)
- Miniatura gerada no aparelho fica fora do escopo; a observação do SC-001 diz se é preciso.

### D18 — Execução: **mantida a exceção da 003** (decisão F)
- A sessão principal (sonnet) implementa todas as sub-fases, com `test-writer` para testes e
  `ui-dev` para telas; o tech-lead (opus) **só revisa o diff** de tudo que toca zona protegida
  (`src/lib/db/`, `src/lib/r2/`, `src/lib/ai/`, `wrangler.jsonc`, `.dev.vars.example`,
  `cloudflare/`, `tsconfig.json`) antes do commit da sub-fase. Substitui a correção proposta
  em TL-5.

## 3. Riscos e provas (SF0 e SF10)

| # | Risco | Prova | Se falhar |
|---|---|---|---|
| R1 | R2 não impõe `Content-Length` nem `If-None-Match` assinados | No bucket dev: URL assinada para N bytes com `if-none-match: *`; `PUT` com N+1 e com N−1 ⇒ esperado 403; `PUT` com N ⇒ 200; **segundo `PUT` com N na mesma URL ⇒ 412**; `PUT` sem o header ⇒ 403. `X-Amz-SignedHeaders` = `content-length;content-type;host;if-none-match` | Reservas (a)/(b) do D2; registrar no ADR-009 |
| R2 | `experimental_s3_credentials` não funciona no `preview` | `npm run preview`; `PUT` assinado em `http://localhost:8787/cdn-cgi/local/r2/s3/roseshop-local/…` ⇒ 200 e objeto lido pelo binding; assinatura errada ⇒ 403 | Reserva do D11, decisão do humano |
| R3 | Cron no worker próprio do OpenNext não roda (local ou dev) | Local: `preview` com `--test-scheduled` e `curl /cdn-cgi/handler/scheduled`; dev: cron temporário `*/5 * * * *` + `wrangler tail --env dev` mostrando a rota executada; depois volta a `0 6 * * *` | Reserva do D6 (`WORKER_SELF_REFERENCE`); se nem isso, volta ao humano |
| R4 | JPEG/WebP de canvas do Safari ou do Chrome traz bloco fora da lista | SF10 (D4) | Ajuste do pipeline no aparelho ou da lista, com aprovação do humano |
| R5 | Modelos candidatos não aceitam imagem + structured output na Responses API | Doc confirmou ambos (F7); SF0 faz uma chamada real com a chave dev (imagem sintética, `store: false`) e registra o `usage` | Trocar candidato, decisão do humano |

### Resultados das provas (SF0, T008)

#### R1 — **aprovado** (2026-10-09, 00:32, bucket `roseshop-dev`, humano executou)

Script `.spike/r1.mjs` (fora do repo): `aws4fetch` 1.0.20, `signQuery: true`,
`allHeaders: true`, `X-Amz-Expires=300` posto antes de assinar, URL para N = 1000 bytes com
`content-type: image/webp`, `content-length: 1000` e `if-none-match: *`; recusas testadas
**antes** do PUT válido (se alguma criasse o objeto, o válido viria 412). Output real:

```text
chave: spike-r1/1791516739786-104cbb18.webp
X-Amz-SignedHeaders: content-length;content-type;host;if-none-match
X-Amz-Expires: 300
Authorization na URL: não

OK   PUT com N+1 bytes (1001)                     esperado 403, veio 403 SignatureDoesNotMatch
OK   PUT com N-1 bytes (999)                      esperado 403, veio 403 SignatureDoesNotMatch
OK   PUT sem if-none-match                        esperado 403, veio 403 SignatureDoesNotMatch
OK   PUT com content-type image/jpeg              esperado 403, veio 403 SignatureDoesNotMatch
OK   PUT válido com N bytes (1000)                esperado 200, veio 200
OK   2º PUT válido na mesma URL                   esperado 412, veio 412 PreconditionFailed

HEAD: 200, content-length 1000, content-type image/webp
DELETE (limpeza): 204
```

Decisões destravadas:
- O R2 impõe o `content-length` **exato** assinado (N+1 e N−1 recusados) e o `content-type`
  assinado: o teto de 1 MB do D2 vale na própria URL.
- O R2 impõe o `if-none-match: *` assinado: header ausente ⇒ 403; segundo PUT ⇒ **412**.
  A URL não sobrescreve objeto existente.
- **Reserva do `etag` descartada**: a SF1 **não** cria a coluna `etag`; as reservas (a)/(b) do
  D2 não se aplicam. O ADR-009 registra a forma assinada como definitiva.
- `X-Amz-SignedHeaders` confere com o teste previsto para `assinatura.ts` (F§7).

#### R2 — **aprovado** (2026-10-09, ~00:38, local, humano executou)

Worker mínimo em `.spike/r2-local/` (fora do repo; o `wrangler.jsonc` do projeto não foi
tocado), wrangler **4.147.0** (o do `node_modules`), binding `PRODUCT_IMAGES` no bucket
`roseshop-local` com as credenciais falsas do F§7. Script `.spike/r2.mjs`: mesma assinatura do
R1 contra `http://localhost:8787/cdn-cgi/local/r2/s3/roseshop-local/…`, mais uma URL assinada
com segredo errado; leitura e limpeza pelo binding. Output real:

```text
Terminal 1 (wrangler dev):
 ⛅️ wrangler 4.147.0
▲ [WARNING] Processing .spike/r2-local/wrangler.jsonc configuration:
    - "local_dev.experimental_s3_credentials" fields are experimental and may change or break at any
  time.
Your Worker has access to the following bindings:
env.PRODUCT_IMAGES (roseshop-local)      R2 Bucket      local
[wrangler:info] Ready on http://localhost:8787
[wrangler:info] GET /ler 200 OK (5ms)
[wrangler:info] GET /apagar 200 OK (22ms)
⎔ Shutting down local server...

Terminal 2 (node .spike/r2.mjs):
wrangler (node_modules): 4.147.0
chave: spike-r2/1791517090789-23a2ce1f.webp
X-Amz-SignedHeaders: content-length;content-type;host;if-none-match

OK   PUT com assinatura errada (outro segredo)    esperado 403, veio 403 SignatureDoesNotMatch
OK   PUT com N+1 bytes (1001)                     esperado 403, veio 403 SignatureDoesNotMatch
OK   PUT com N-1 bytes (999)                      esperado 403, veio 403 SignatureDoesNotMatch
OK   PUT sem if-none-match                        esperado 403, veio 403 SignatureDoesNotMatch
OK   PUT com content-type image/jpeg              esperado 403, veio 403 SignatureDoesNotMatch
OK   PUT válido com N bytes (1000)                esperado 200, veio 200
OK   2º PUT válido na mesma URL                   esperado 412, veio 412 PreconditionFailed

leitura pelo binding: 200 {"existe":true,"tamanho":1000,"bytesLidos":1000,"tipo":"image/webp"}
limpeza pelo binding: 200 {"apagado":true}
```

Decisões destravadas:
- `experimental_s3_credentials` funciona na versão fixada: a URL assinada grava no bucket local
  e o objeto é lido pelo binding; assinatura errada ⇒ 403. O endpoint local reproduz as mesmas
  recusas do R2 real (tamanho, tipo, `if-none-match`, 412).
- **Reserva do D11 descartada** (sem rota de PUT só local).
- **Correção do D11 (lugar da chave)**: no wrangler 4.147.0, `local_dev.experimental_s3_credentials`
  fica **dentro do item de `r2_buckets`** do ambiente de cima (local), com `accessKeyId` e
  `secretAccessKey` — não é chave na raiz do `wrangler.jsonc`. O caminho da URL usa o
  `bucket_name` (`roseshop-local`). O wrangler emite o aviso "experimental" a cada carga
  (esperado; o ADR-009 registra a dependência da versão fixada).
- **Limite da prova**: rodou num worker mínimo, não no app completo do `preview`. O endpoint
  `/cdn-cgi/local/r2/s3/` é servido pelo miniflare, o mesmo do `preview` na mesma versão; a
  prova no app completo fica para o **quickstart §4, na SF3**.

#### R3 — **aprovado, local e online** (2026-10-09, humano executou)

Worker próprio `.spike/r3/worker.mjs` (fora do repo) na forma do F§6: `fetch` reexportado do
`.open-next/worker.js`; `scheduled` chama `handler.fetch(new Request("https://interno.invalid/
api/health", …), env, ctx)` com GET e POST (a rota da limpeza ainda não existe; `interno.invalid`
não resolve, então status vindo do Next prova chamada sem rede). Config `.spike/r3/wrangler.jsonc`
= nível de cima do `wrangler.jsonc` do projeto com `main` trocado e cron `0 6 * * *`; `.dev.vars`
do projeto por `--env-file` (com config fora da raiz, o wrangler procura o `.dev.vars` ao lado do
config).

Build (`npx opennextjs-cloudflare build`), **resumo entregue pelo humano**: Next.js 16.3.8,
`@opennextjs/cloudflare` 1.20.8, `compatibility_date` 2026-10-01; "Compiled successfully"; rota
`ƒ /api/health` presente; "Worker saved in `.open-next/worker.js`"; "OpenNext build complete."

Output real (`npx wrangler dev -c .spike/r3/wrangler.jsonc --env-file "$PWD/.dev.vars"
--port 8787 --test-scheduled` e os dois `curl`):

```text
Terminal 1:
 ⛅️ wrangler 4.147.0 (update available 4.149.0)
Using secrets defined in .dev.vars
env.PRODUCT_IMAGES (roseshop-local)            R2 Bucket     local
env.WORKER_SELF_REFERENCE (roseshop-local)     Worker        local [connected]
env.IMAGES                                     Images        local
env.ASSETS                                     Assets        local
[wrangler:info] ✨ Parsed 1 valid header rule.
[wrangler:info] Ready on http://localhost:8787
[wrangler:info] GET /api/health 200 OK (435ms)
{"evento":"spike-r3","cron":"0 6 * * *","method":"GET","status":200,"ms":119,"corpo":"{\"db\":\"ok\"}"}
{"evento":"spike-r3","cron":"0 6 * * *","method":"POST","status":405,"ms":3,"corpo":""}
⎔ Shutting down local server...

Terminal 2:
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8787/api/health  → 200
curl -s "http://localhost:8787/cdn-cgi/handler/scheduled?cron=0+6+*+*+*"   → ok
```

(`ok` é a resposta desta versão do wrangler ao `/cdn-cgi/handler/scheduled`, no lugar de "Ran
scheduled event".)

Decisões destravadas (parte local):
- O `fetch` reexportado serve o app (`/api/health` ⇒ 200) e o `scheduled` chama o handler do
  Next **em processo, sem rede**: GET ⇒ 200 com `{"db":"ok"}` (119 ms), POST ⇒ 405 do Next.
  O método chega à rota, como a limpeza (`POST`) vai precisar. A forma do F§6 vale localmente.
- **Crons e deploy (para o ADR-009 e a SF12)**: o `wrangler deploy` só regrava os crons quando
  o config declara `triggers.crons` (conferido no wrangler 4.147.0, `cli.js:160319`, `if (crons)`
  antes do `PUT …/schedules`). Um deploy sem a chave **não remove** crons existentes. Por isso o
  `wrangler.jsonc` da SF12 declara `triggers.crons` **em cada ambiente** (nível de cima,
  `env.dev`, `env.production`), inclusive `"crons": []` onde não houver cron.

Parte online (opção B do humano): worker descartável `roseshop-spike-r3` (config
`.spike/r3/wrangler.dev-spike.jsonc`: mesmo `worker.mjs` e mesmo build, cron `*/5 * * * *`, sem
secrets, sem banco, sem bucket, `workers_dev`/`preview_urls` falsos, sem
`WORKER_SELF_REFERENCE`); `roseshop-dev` e `roseshop` não foram tocados. Output entregue pelo
humano (checagem do bundle e deploy **resumidos** pelo humano; tail literal):

```text
Checagem do bundle antes do deploy (valores do .dev.vars dentro de .open-next/):
OPENAI_API_KEY: 0 · AUTH_SECRET: 0 · AUTH_GOOGLE_SECRET: 0 · DATABASE_URL: 0

Deploy: Uploaded roseshop-spike-r3; bindings só IMAGES e ASSETS;
"Deployed roseshop-spike-r3 triggers — schedule: */5 * * * *";
Version 505d2a2f-4c18-4f41-80e3-129a20a60fa4.

Tail:
"*/5 * * * *" @ 10/9/2026, 1:00:16 AM - Ok
  (error) [health] configuração do banco ausente ou inválida
  (log) {"evento":"spike-r3","cron":"*/5 * * * *","method":"GET","status":503,"ms":0,"corpo":"{\"db\":\"error\"}"}
  (log) {"evento":"spike-r3","cron":"*/5 * * * *","method":"POST","status":405,"ms":0,"corpo":""}
"*/5 * * * *" @ 10/9/2026, 1:05:16 AM - Ok
  (error) [health] configuração do banco ausente ou inválida
  (log) {"evento":"spike-r3","cron":"*/5 * * * *","method":"GET","status":503,"ms":0,"corpo":"{\"db\":\"error\"}"}
  (log) {"evento":"spike-r3","cron":"*/5 * * * *","method":"POST","status":405,"ms":0,"corpo":""}
```

Decisões destravadas (parte online):
- O Cron Trigger dispara o `scheduled` do worker próprio no Cloudflare (dois disparos, 01:00 e
  01:05) e a chamada em processo chega ao Next: GET ⇒ 503 da própria rota (log `[health]` do
  app, banco ausente por desenho do spike), POST ⇒ 405. **Reserva do D6
  (`WORKER_SELF_REFERENCE`) descartada.**
- O cron aparece como `Ok` mesmo com 503, porque o `scheduled` do spike não lança erro. Confirma
  a necessidade do TL-16: o `scheduled` da SF12 **lança** quando o status não é 200, para o cron
  aparecer como falha.
- `ms: 0` é esperado no Workers: o relógio não avança durante execução sem I/O externo
  (mitigação de timing). A duração da limpeza não pode ser medida por `Date.now()` no próprio
  worker; o painel/tail é a fonte.
- **Checagem do bundle**: nenhum valor de `OPENAI_API_KEY`, `AUTH_SECRET`, `AUTH_GOOGLE_SECRET`
  ou `DATABASE_URL` do `.dev.vars` aparece em `.open-next/` (0 ocorrências de cada).
- **Remoção do worker descartável**: feita pelo humano (`npx wrangler delete roseshop-spike-r3`).
  Conferência, output real:

  ```text
  $ npx wrangler versions list --name roseshop-spike-r3 2>&1 | grep -iE "does not exist|10007|version id"
    This Worker does not exist on your account. [code: 10007]
  ```

#### R4 — **adiado para a SF10** (T007)

R4 (aparelhos reais, Chrome Android e Safari iOS) **adiado para a SF10**. Ponteiro: SF10,
Q§5.4. **Critério de saída**: fixtures reais commitadas, lista de blocos e do ICC fechadas (tags
e limite), `FOTOS_VERIFICACAO` fora do `env.dev` e `exiftool` sem EXIF/GPS/XMP/IPTC nos objetos
baixados. Nenhum spike de R4 foi feito na SF0.

#### R5 — `gpt-6-luna` **aprovado** na prova técnica; `gpt-5.4-mini` **acesso pendente** (2026-10-09)

Script `.spike/r5.mjs` (fora do repo): pedido na forma do I§4 (`store: false`,
`max_output_tokens: 800`, `json_schema` estrito com `enum` de `categoria_id` incluindo `null`,
imagem WebP 512×512 sintética em base64 com `detail: low`, timeout de 20 s), categorias
fictícias 1–4, esforços `none` e `low`; lê só `OPENAI_API_KEY` do `.dev.vars`, sem imprimi-la.

Output real da **segunda rodada** (01:15), depois de liberar o `gpt-5.4-mini` no projeto da
chave (`proj_bp4hqCbXxHCDzgscCQ7opNpr`, Project ID conferido pelo humano). A primeira rodada
não foi entregue; segundo o humano, o `gpt-5.4-mini` também deu 403 nela.

```text
imagem sintética: webp 512x512, 3842 bytes

gpt-6-luna / none: HTTP 200 · 1891 ms
  model=gpt-6-luna · status=completed
  usage={"input_tokens":524,"input_tokens_details":{"cache_write_tokens":0,"cached_tokens":0},"output_tokens":47,"output_tokens_details":{"reasoning_tokens":0},"total_tokens":571}
  saída: CONFORME ao schema · chaves [categoria_id,descricao,nome] · categoria_id=1 · nome="Guarda-chuva vermelho" · descricao(78 car.)="Guarda-chuva de tamanho não especificado, com cobertura vermelha e cabo preto."

gpt-6-luna / low: HTTP 200 · 2173 ms
  model=gpt-6-luna · status=completed
  usage={"input_tokens":524,"input_tokens_details":{"cache_write_tokens":0,"cached_tokens":0},"output_tokens":55,"output_tokens_details":{"reasoning_tokens":0},"total_tokens":579}
  saída: CONFORME ao schema · chaves [categoria_id,descricao,nome] · categoria_id=1 · nome="Guarda-chuva vermelho" · descricao(102 car.)="Guarda-chuva vermelho com haste e cabo curvo pretos. Tamanho não informado; não há variações visíveis."

gpt-5.4-mini / none: HTTP 403 · 858 ms
  erro: type=invalid_request_error code=model_not_found param=
  mensagem: Project `proj_bp4hqCbXxHCDzgscCQ7opNpr` does not have access to model `gpt-5.4-mini`

gpt-5.4-mini / low: HTTP 403 · 598 ms
  erro: type=invalid_request_error code=model_not_found param=
  mensagem: Project `proj_bp4hqCbXxHCDzgscCQ7opNpr` does not have access to model `gpt-5.4-mini`
```

Observações: `reasoning_tokens` = 0 também com `low` (nesta imagem simples); 524 tokens de
entrada para instruções + 4 categorias + 1 imagem 512 px em `detail: low`.

Decisões (humano, 2026-10-09):
- **`gpt-6-luna` aprovado na prova técnica** (imagem + structured output estrito, `store: false`).
- **`gpt-5.4-mini`: acesso pendente** (provável restrição da organização ou do nível da conta).
  A prova técnica dele vira a **primeira task da SF13 (T120a)**, antes da medição; sem acesso
  até lá, a medição roda só com o `gpt-6-luna` ou o humano escolhe outro candidato.
- **Limite de gasto do projeto OpenAI**: **configurado (US$ 5, alerta em 100%) mas NÃO
  aplicado**; até aplicar, a constitution III.5 não está atendida no dev. **Aplicar o teto
  (T014b) é condição de entrada da SF13** (decisão do humano, 2026-10-09). Se a conta não
  permitir aplicar, o ADR-010 registra a limitação do provedor e o contador do app como
  controle principal.

#### Resumo do que as provas destravam (T008)

| Item | Resultado | Onde pesa |
|---|---|---|
| Coluna `etag` em `fotos_envio` | **não** (R1: `if-none-match` imposto, 2º PUT ⇒ 412) | SF1, ADR-009 |
| Teto de tamanho na URL | `content-length` exato imposto (R1) | SF3, ADR-009 |
| R2 local | `experimental_s3_credentials` **dentro do item de `r2_buckets`**; reserva do D11 descartada (R2) | SF3, ADR-009 |
| Cron | `scheduled` → handler em processo, local e online; reserva do D6 descartada (R3) | SF12, ADR-009 |
| Crons em cada ambiente | `triggers.crons` declarado em todos (inclusive `[]`), pois deploy sem a chave não remove cron (R3) | SF12, ADR-009 |
| `scheduled` lança erro se ≠ 200 | confirmado necessário: o cron aparece `Ok` com 503 se não lançar (R3) | SF12 |
| Modelos da SF13 | `gpt-6-luna` aprovado; `gpt-5.4-mini` com acesso pendente (T120a) (R5) | SF13, ADR-010 |
| Teto de gasto OpenAI | configurado, **não aplicado**; aplicar (T014b) é condição de entrada da SF13 | SF13, ADR-010 |
| R4 | adiado para a SF10 | SF10 |

## 4. Consequências registradas

- O probe do Neon dev **não** ganha teste novo: o mecanismo (`db.batch` na mesma transação, lock
  mantido até o fim, READ COMMITTED) já está provado; as formas novas (token, `unnest … WITH
  ORDINALITY`, apagar e reinserir) são semântica comum do Postgres, provadas nos testes de
  integração locais com concorrência real. Um probe com escrita no dev exigiria escrita que
  persiste, o que a emenda da 003 ao ADR-008 proíbe.
- `jsdom` não tem canvas: o pipeline do aparelho é testado em partes puras (detecção de tipo
  por assinatura, matemática do recorte, laço de qualidade com codificador injetado); o
  comportamento real é provado nos aparelhos (SF10) e no roteiro do quickstart.
- A remoção de produto passa a tomar o lock 4_001: serializa com as ações de fotos (desprezível
  com 3 administradoras) e garante que a lista de chaves a apagar no R2 é exata.
