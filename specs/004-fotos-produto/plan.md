# Implementation Plan: Fotos de produto com sugestão por IA

**Branch**: `feature/004-fotos-produto` | **Date**: 2026-10-08 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/004-fotos-produto/spec.md`

**Status**: **fechado** em 2026-10-08. Decisões D1–D18 do humano ([research.md §2](./research.md#2-decisões-humano-2026-10-08));
revisão das zonas protegidas pelo tech-lead com 21 achados, todos aceitos e aplicados (seção
"Revisão do tech-lead"). Sem pendências.
ADR-009, ADR-010 e emenda do ADR-008 são escritos depois da SF0 e aprovados pelo humano antes da SF1.

## Summary

O cadastro de produto passa a começar pelas fotos (1 a 3, quadradas, a primeira é a capa). Cada
foto é tratada no aparelho (orientação, recorte 1:1, redução a 1200 px, recodificação em WebP ou
JPEG, o que descarta metadados) e enviada **direto do navegador ao R2** por URL pré-assinada de
5 minutos, com `content-type`, `content-length` e `if-none-match: *` assinados (a URL só cria
o objeto) e teto de 1 MB. Na confirmação, o
servidor relê o objeto pelo binding e verifica, **sem decodificar**, o arquivo inteiro contra uma
lista de blocos permitidos por formato; o que não passa é apagado. O produto "adota" as fotos
confirmadas num único `db.batch`. Fotos de produto existente são editadas por ação imediata, com
controle de concorrência próprio (`fotos_versao`) independente da otimista da 003. A IA
(OpenAI, Responses API, `store: false`) sugere nome, categoria da lista e descrição, com limite
diário no Postgres; uma limpeza diária por Cron Trigger apaga envios abandonados e objetos órfãos.

Abordagem técnica (ADR-008): toda escrita em fotos é um `db.batch` sob o lock advisory global
`4_001`, com um `UPDATE produtos` que valida versão e pré-condições e grava um token de operação;
os statements seguintes só agem com aquele token. Mudar o conjunto = apagar e reinserir as linhas
(as constraints de posição da 003 não mudam).

## Technical Context

**Language/Version**: TypeScript strict, Node 24 (dev/CI), runtime workerd (Cloudflare Workers via OpenNext)

**Primary Dependencies**: as da 003 + **`aws4fetch`** (runtime, assinatura SigV4; D1) +
**`react-easy-crop`** (client, recorte; D8), ambas com versão exata e justificativa no commit.
Sem SDK da OpenAI (fetch direto).

**Storage**: Postgres 18 (local Docker, Neon dev, Neon production) — migration `0002`
(`fotos_envio`, `ia_uso`, colunas novas em `produtos` e `produto_fotos`). R2: `roseshop-local`
(simulado, endpoint S3 experimental), `roseshop-dev`, `roseshop-prod`.

**Testing**: Vitest — unitários (parser com fixtures sintéticas e corrompidas, assinatura,
domínio do conjunto, actions com mocks, pipeline do aparelho em partes puras, componentes);
integração no banco local (envios, adoção, conjunto, concorrência SC-007, limpeza com bucket
falso); conformidade (fronteiras, guards, modo de verificação no `wrangler.jsonc`); medição da IA
manual (`npm run test:ia`). Sem probe novo no Neon dev (research §4).

**Target Platform**: Cloudflare Workers (free tier); painel mobile-first (Chrome Android, Safari iOS).

**Project Type**: aplicação web única (Next.js).

**Performance Goals**: SC-004 sugestão ≤ 15 s no p90; SC-005 ≤ 1 MB por foto; confirmação dentro
do limite de CPU do free tier (medida no dev).

**Constraints**: servidor não processa imagem (VII); sem `db.transaction()` (ADR-008); local não
acessa recursos online (VIII); segredos só em `wrangler secret`/`.dev.vars` (III.1).

**Scale/Scope**: 3 administradoras, ~500 produtos, ≤ 1.500 fotos; 1 rota nova de página, 2 route
handlers, 7 Server Actions novas + 2 alteradas, 2 tabelas novas, 1 Cron Trigger.

Sem `NEEDS CLARIFICATION` (riscos R1–R5 tratados como provas da SF0/SF10, research §3).

## Constitution Check

*GATE: antes da Phase 0 e de novo após a Phase 1.*

| Princípio | Verificação | Pré | Pós-design |
|---|---|---|---|
| I. Fonte de verdade | Spec com Given/When/Then e 9 clarificações (7 da sessão e 2 do plan); cada critério mapeado a teste ("Cobertura"); ADR-009 (fotos/R2) e ADR-010 (IA) registram provedor e decisões antes da implementação; emenda do ADR-008; nota na spec da 003 (FR-013/FR-014) | ✅ | ✅ |
| II. Stack fechada | R2 e OpenAI já estão na tabela; `aws4fetch` e `react-easy-crop` não substituem nada (justificativa no commit); Zod em toda fronteira (entrada das actions, resposta da IA, config do R2) | ✅ | ✅ |
| III.1 Segredos | `R2_*`, `CRON_SECRET`, `OPENAI_API_KEY` só em `wrangler secret`/`.dev.vars`; credenciais locais falsas por desenho; nada no log (ia.md §4) | ✅ | ✅ |
| III.2 Allowlist | `requireAdminAction` em toda action; sessão na rota de imagem; segredo em tempo constante na rota interna | ✅ | ✅ |
| III.3 Zod | entrada das actions, `FormData` de `criarProduto`, resposta da IA (forma + validadores da 003), config | ✅ | ✅ |
| III.4 Upload | só `image/webp`/`image/jpeg` guardados (subconjunto da lista da III.4; PNG recusado, FR-012); teto 1 MB (1.048.576 bytes, FR-014 da spec); envio direto por URL pré-assinada de 5 min que só cria objeto (`if-none-match`) | ✅ | ✅ |
| III.5 IA | auth + limite 30/pessoa e 100/dia; teto de gasto no provedor (quickstart §1) | ✅ | ✅ |
| III.6 Ambientes | token R2 por bucket e por ambiente; chave OpenAI dev ≠ produção; `FOTOS_VERIFICACAO` nunca em produção (teste) | ✅ | ✅ |
| III.7 Zonas protegidas | `src/lib/db/`, `src/lib/r2/`, `src/lib/ai/`, `wrangler.jsonc`, `.dev.vars.example` ⇒ tech-lead implementa ou revisa + humano | ✅ | ✅ |
| IV. Arquitetura | Server Components por padrão; client só em escolha/recorte/lista/formulário; mutações por Server Actions; SQL só em `src/lib/db/`; regra do conjunto no servidor (`conjunto.ts`); UTC em `timestamptz` (`ia_uso.dia` é data de calendário de Brasília, justificado no data-model) | ✅ | ✅ |
| V. UX | uma tarefa por passo; alvos ≥ 48 px; mensagens da spec; botões alternativos ao arrasto; confirmação só onde algo salvo é apagado | ✅ | ✅ |
| VI. Qualidade | uma sub-fase = um commit, testes antes; Conventional Commits sem trailer | ✅ | ✅ |
| VII. Plataforma | servidor **não decodifica nem converte**: só percorre a estrutura (1 passada linear, CPU medido no dev); binding `IMAGES`/`next/image` não usados; compressão no aparelho | ✅ | ✅ |
| VIII. Ambientes | local usa só o R2 simulado (endpoint S3 experimental do wrangler) e o Postgres Docker; nada de produção acessado pelo local; deploy de produção só pelo CI. **Interpretação registrada (analyze, 2026-10-08)**: a VIII rege o runtime local do app; comandos operacionais do **humano** por `wrangler` sobre R2 (bucket, CORS, objetos), secrets e logs (`tail`) do dev e de produção são permitidos a partir da máquina local (precedente: `deploy:dev`; a III.1 prescreve `wrangler secret`). **Banco** (Neon dev e produção) continua só pelo CI ou pelo console do Neon, como na 003. Emenda da VIII pendente (ver "Pendências fora da 004") | ✅ | ✅ |

## Project Structure

### Documentation (this feature)

```text
specs/004-fotos-produto/
├── spec.md
├── plan.md              # este arquivo
├── research.md          # fatos F1–F12, decisões D1–D18, riscos R1–R5
├── data-model.md        # fotos_envio, ia_uso, colunas novas, invariantes, locks
├── quickstart.md        # configuração manual, limpeza da 003, roteiro de validação
├── contracts/
│   ├── fotos.md         # camadas, SQL, actions, verificação, rota de imagem, limpeza, R2, mensagens
│   ├── ia.md            # action, contador, pedido à OpenAI, medição, mensagens
│   └── telas.md         # rotas, componentes, pipeline do aparelho
├── checklists/
└── tasks.md             # /speckit-tasks (não criado aqui)
specs/adr/009-fotos-r2.md, 010-ia-openai.md, emenda em 008   # SF0, aprovação humana
```

### Source Code (repository root)

```text
cloudflare/worker.ts                    # worker próprio: fetch + scheduled (SF12)        [revisão tech-lead]
cloudflare/open-next-worker.d.ts        # tipo do handler gerado (sem @ts-expect-error)
tsconfig.json                           # + exclude ".open-next"
wrangler.jsonc                          # main, vars, crons, local_dev S3                 [protegido]
.dev.vars.example                       # R2_*, CRON_SECRET                               [protegido]
infra/r2/cors.dev.json, cors.production.json
src/lib/db/
├── schema.ts, migrations/0002_*.sql    # fotos_envio, ia_uso, colunas novas              [protegido]
├── locks.ts                            # + LOCK_FOTOS 4_001, LOCK_IA_USO 4_002           [protegido]
├── fotos.ts                            # envios, conjunto, limpeza (contrato fotos §2)   [protegido]
├── ia-uso.ts                           # consumirSugestao                                [protegido]
├── produtos.ts                         # inserirComFotos, remover com chaves, capa/fotos [protegido]
└── fotos.*.int.test.ts, ia-uso.int.test.ts
src/lib/r2/                             # config, chaves, assinatura, bucket, verificacao/ [protegido]
src/lib/ai/                             # config, sugestao, medicao.ia.test.ts             [protegido]
src/lib/fotos/
├── actions.ts                          # pedirEnvio, confirmarEnvio, adicionar/trocar/remover/moverFoto
├── conjunto.ts  mensagens.ts  erros.ts  tipos.ts  limpeza.ts
└── aparelho/                           # pipeline no navegador
src/lib/produtos/actions.ts             # criarProduto (fotos), removerProduto (R2)
src/lib/produtos/sugestao.ts            # sugerirProduto
src/app/painel/fotos/[arquivo]/route.ts # exibição com sessão
src/app/api/interno/limpeza/route.ts    # limpeza (404 sem segredo)
src/app/painel/(protegido)/produtos/
├── novo/page.tsx                       # passos Fotos → Dados
├── _fotos/                             # escolher-foto, recorte-foto, lista-fotos, usar-envio
├── [id]/page.tsx                       # fotos no detalhe
├── [id]/fotos/page.tsx                 # nova
├── [id]/remover/                       # texto das fotos
└── page.tsx                            # capa na lista
src/test/conformance/fotos-acesso.test.ts, fotos-rota-guard.test.ts, verificacao-modo.test.ts
src/test/fixtures/fotos/aparelho/       # arquivos reais (SF10)
src/test/db/produtos-fixtures.ts        # produtos com 1 foto
vitest.ia.config.mts                    # medição da IA (manual)
```

**Structure Decision**: aplicação Next.js única; domínio de fotos em `src/lib/fotos/` (espelha
`src/lib/produtos/`), infraestrutura de armazenamento em `src/lib/r2/` e de IA em `src/lib/ai/`
(zonas protegidas), SQL em `src/lib/db/`, telas no grupo `(protegido)`.

## Sub-fases

Cada sub-fase fecha com testes passando (output real) e **um commit próprio** (o humano commita).
Testes antes da implementação (Red → Green). **Execução (D18, mantida a exceção da 003)**: a
**sessão principal (sonnet)** implementa todas as sub-fases, com `test-writer` para os testes e
`ui-dev` para as telas; o **tech-lead (opus) só revisa** o diff de tudo que toca zona protegida
(`src/lib/db/`, `src/lib/r2/`, `src/lib/ai/`, `wrangler.jsonc`, `.dev.vars.example`,
`cloudflare/`, `tsconfig.json`) antes do commit da sub-fase. Coluna "Revisão TL": ✅ = revisão
obrigatória.

| SF | Escopo | Testes que fecham | Commit sugerido | Dono | Revisão TL |
|---|---|---|---|---|---|
| **SF0** | **Spike** dos riscos R1, R2, R3, R5 (research §3): URL assinada com `content-length` e `if-none-match` contra o bucket dev (inclui o 412 do segundo `PUT`); `experimental_s3_credentials` no `preview`; worker próprio + cron chamando o handler em processo (local e dev); chamada real aos 2 modelos com imagem sintética. Scripts de spike fora do commit; outputs em research §3. Depois: rascunho do ADR-009 (com a decisão D16), ADR-010 e emenda do ADR-008 | outputs reais dos 4 riscos, executados pelo humano | `docs(adr): registra fotos no R2, IA e emenda do ADR-008` | sessão principal · humano executa | ✅ (ADRs) |
| **SF1** | Schema + migration `0002` + `locks.ts` (data-model; coluna `etag` só se o R1 exigir) | int: checks, `UNIQUE`s, coluna gerada `chave` (STORED, `textcat`), `uuid_extract_version`, regex da chave, `confirmado_em` × `estado`, `ia_uso`; "No schema changes" | `feat(db): cria envios de fotos, uso da IA e versão do conjunto` | sessão principal (testes: `test-writer`) | ✅ |
| **SF2** | Verificação (`src/lib/r2/verificacao/`, contrato fotos §4) + `modo.ts` | unitários: cada bloco permitido/proibido; **JFIF com miniatura (TL-7)**; **ICC com `dmnd`/`dmdd`/`meta`/tag privada/acima do limite e fora de sequência (TL-8)**; progressivo com vários SOS; PNG/SVG/GIF/HEIC/PDF ⇒ `formato`; não quadrada e lado > 1200 ⇒ `dimensao`; < 400 ⇒ `pequena`; truncados, bytes após o fim, bloco proibido após SOS; modo registro só com valor exato; conformidade do `wrangler.jsonc` e do `.dev.vars.example` (TL-17) | `feat(r2): verifica JPEG e WebP por lista de blocos permitidos` | sessão principal (testes: `test-writer`) | ✅ |
| **SF3** | R2: `config`, `chaves`, `assinatura` (`aws4fetch`), `bucket`, barrel; `wrangler.jsonc` (vars, `local_dev`), `.dev.vars.example`, `infra/r2/cors.*.json` (com `if-none-match`); exceção do gitleaks pelo valor; **`npm run cf-typegen`** | unitários: `X-Amz-SignedHeaders` = `content-length;content-type;host;if-none-match`, `X-Amz-Expires=300`, URL sem segredo, regex de arquivo; envio local real no `preview` (quickstart §4.2) | `feat(r2): assina o envio direto ao R2 e acessa o bucket` | sessão principal | ✅ |
| **SF4** | SQL de envios (`enviosValidos` incluída) + `inserirComFotos` + `remover` com chaves + leitura (`capa`, `fotos`, `fotosVersao`); arrays por `sql.param` | int: emissão com teto de 20; confirmação idempotente; adoção só pela dona, uma vez, < 24 h; duplo "Salvar" ⇒ `nome_repetido`; **`23505` de `produtos_chave_unique` no batch ⇒ `nome_repetido`, `23505` de outra constraint propaga, `23503` ⇒ `categoria_ausente` (TL-4)**; `foto_expirada` com ids; `uuid[]`/`timestamptz[]` de `Date[]` (TL-3); remoção devolve chaves | `feat(db): emite, confirma e adota envios no cadastro de produto` | sessão principal (testes: `test-writer`) | ✅ |
| **SF5** | `substituirConjunto` + emenda da convenção da 003 (comentário + data-model da 003) + fixtures da 003 com foto (chave v4) + SC-005 da 003 estendido | int: US4-AC1–5 no SQL; US5-AC1–5; SC-007 (concorrência real: adicionar×adicionar, remover×remover, mover×trocar, fotos×editar campos, fotos×remover produto); testes da 003 verdes | `feat(db): altera o conjunto de fotos com lock e versão própria` | sessão principal (testes: `test-writer`) | ✅ |
| **SF6** | Actions `pedirEnvio`, `confirmarEnvio` (recusa apaga a linha antes do objeto, TL-2); `criarProduto`/`removerProduto` alterados; rota `/painel/fotos/[arquivo]`; conformidade `fotos-acesso`, `fotos-rota-guard` | unitários: guard primeiro, Zod antes de SQL, cada motivo de recusa apaga linha e objeto (SC-006 pela action), confirmação concorrente não apaga objeto confirmado, modo registro com log de aviso, `sem_foto`, R2 em melhor esforço; rota: 404 sem sessão/regex/chave desconhecida, **304 por objeto sem `body` (TL-19)**, headers | `feat(fotos): envio, confirmação e cadastro de produto com fotos` | sessão principal (testes: `test-writer`) | ✅ (usa `src/lib/r2`) |
| **SF7** | `conjunto.ts` + actions `adicionarFoto`, `trocarFoto`, `removerFoto`, `moverFoto` | unitários: tabela de regras (limite, última, posições), `atual` em toda falha, versão nova no `ok`, apagar objeto antigo | `feat(fotos): adiciona, troca, remove e reordena fotos do produto` | sessão principal (testes: `test-writer`) | ✅ (usa `src/lib/r2`) |
| **SF8** | Pipeline do aparelho (`src/lib/fotos/aparelho/`, telas.md §3) | unitários: `detectarTipo`, recorte (mín 400, máx 1200, quadrado), laço de qualidade e fallback JPEG com codificador injetado | `feat(fotos): trata a foto no aparelho antes do envio` | sessão principal (testes: `test-writer`) | — |
| **SF9** | Telas do cadastro: passos Fotos → Dados, `escolher-foto`, `recorte-foto` (`react-easy-crop`), `lista-fotos` (arrasto + botões), `usar-envio` | componentes: US1-AC1–9, US2-AC3/7/8/10, edge cases de envio durante "Salvar" e expiração; `produtos-paginas-guard` verde | `feat(painel): cadastro de produto começando pelas fotos` | `ui-dev` (testes: `test-writer`) | — |
| **SF10** | Liga `FOTOS_VERIFICACAO=registro` no `env.dev` (só nesta SF); **prova com aparelhos** (R4) no dev em modo registro; fixtures reais; fechar a lista de blocos e a do ICC (tags e limite); tirar `FOTOS_VERIFICACAO` do `env.dev`; conformidade passa a negar a variável em qualquer lugar | unitários com as fixtures reais; output do `exiftool` entregue pelo humano | `test(r2): fixtures reais de Chrome Android e Safari iOS` + `chore(wrangler): desliga o modo registro no dev` | humano + sessão principal | ✅ |
| **SF11** | Tela `[id]/fotos`, fotos no detalhe, capa na lista (`loading="lazy"`), texto da remoção | componentes: US4-AC1–7, US5-AC1 (tela atualiza com `atual`), US6-AC2, FR-039/040 | `feat(painel): gerencia as fotos de um produto` | `ui-dev` (testes: `test-writer`) | — |
| **SF12** | Limpeza: `limpeza.ts`, `expirarEnvios`/`chavesConhecidas` (statement único), rota interna (SHA-256, 404 sem corpo), `cloudflare/worker.ts` + `.d.ts` + `exclude` no `tsconfig` (TL-6), crons; **`npm run cf-typegen`** | int: US6-AC1/3–6 e SC-008 com bucket falso (inclusive limpeza concorrente com adoção); rota 404 sem corpo para segredo errado/ausente/método; `scheduled` lança em status ≠ 200; `typecheck` igual com e sem `.open-next/`; prova no dev (quickstart §5.2) | `feat(fotos): limpeza diária de fotos sem uso` | sessão principal (testes: `test-writer`) | ✅ |
| **SF13** | IA: linha `ia-medicao/` no `.gitignore` (antes da pasta); `src/lib/ai/`, `consumirSugestao` (limites como parâmetro, CTE do dia), `sugerirProduto` (base64 nativo, TL-9), medição e escolha do modelo | unitários (fetch simulado): `store: false`, schema estrito, 20 s, HTTP≠200, recusa, JSON inválido, categoria fora da lista, campos inválidos ⇒ `null`, chave fora do log, base64 sem laço de `fromCharCode`; int: limites 30/100 sob concorrência; SC-009 (IA fora ⇒ cadastro manual); medição real e CPU no dev (humano) | `feat(ia): sugere nome, categoria e descrição a partir das fotos` | sessão principal (testes: `test-writer`) | ✅ |
| **SF14** | UI da sugestão no passo Dados | componentes: US3-AC1–8 (só campos vazios, marcador, categoria inexistente ⇒ vazio, falha e pausa com cadastro manual) | `feat(painel): sugestão da IA no cadastro de produto` | `ui-dev` (testes: `test-writer`) | — |
| **SF15** | Fechamento: quickstart completo no `preview` e no dev (CPU da confirmação e da sugestão), revisão das mensagens (SC-011), observação SC-001/002 (inclui peso das capas, D17), nota na spec da 003, README, `doc-sync-onboarding` (inclui `docs/operacao.md`: segredos, CORS, cron, modo registro) | output real do `check`, `test:int`, `preview`; registro da observação | `docs(specs): aponta a 003 para a 004` + `docs(readme): …` + sync em `docs(...)` | sessão principal · humano | — |

**Ordem e dependências**: SF0 → aprovação dos ADRs → SF1. SF2 e SF3 só dependem da SF1 (podem
alternar). SF4 → SF5. SF6 depende de SF2–SF4; SF7 de SF5. SF8 → SF9 (depende de SF6). SF10 exige
SF6+SF8+SF9 no dev. SF11 depende de SF7 e SF10. SF12 depende de SF3 e SF4. SF13 (depende de SF3
e SF4) → SF14 (depende de SF9).
Entre a SF6 e a SF9 o cadastro fica sem tela funcional **no branch** (a criação já exige foto);
nada vai a `main` antes da SF15. A limpeza dos produtos sem foto (quickstart §2) acontece antes
do primeiro push que leva a SF6 ao deploy do dev (o dev é publicado a cada push no PR).

### Cobertura dos critérios de aceite

| Critério | Teste (SF) |
|---|---|
| US1-AC1–9 | componentes SF9; AC7/AC8/AC9 também nas actions (SF6) e no SQL (SF4) |
| US2-AC1, AC2 | pipeline (SF8) + verificação com fixtures reais (SF10) |
| US2-AC3, AC7 | `detectarTipo`/`abrirImagem` (SF8) + componentes (SF9) |
| US2-AC4, AC5, AC9 | verificação (SF2) + `confirmarEnvio` (SF6) + assinatura com tamanho e `if-none-match` (SF3, prova R1) |
| US2-AC6 | guard nas actions (SF6) + conformidade |
| US2-AC8, AC10 | componentes (SF9) |
| US3-AC1–8 | action e cliente IA (SF13) + componentes (SF14) |
| US4-AC1–7 | SQL (SF5) + actions (SF7) + componentes (SF11) |
| US5-AC1–5 | concorrência int (SF5) + actions (SF7) + componentes (SF11) |
| US6-AC1–2 | `remover` (SF4) + `removerProduto` (SF6) + componente (SF11) |
| US6-AC3–6 | limpeza int (SF12) |
| Edge cases | adoção alheia/não confirmada/expirada e duplo "Salvar" (SF4); envio durante "Salvar" e foto pequena (SF8/SF9); animada (SF2); destaque sem foto (SF5) |
| SC-005 | `codificar` (SF8) + medição no `preview` (quickstart §4.2) |
| SC-006 | SF2 + SF6 (inclui sobrescrita recusada pela URL, R1) |
| SC-007 | SF5 |
| SC-008 | SF12 |
| SC-009 | SF13 |
| SC-001–004, SC-011 | observação e medição (SF13, SF15) |

## ADRs (escritos na SF0, depois das provas)

- **ADR-009 — Fotos no R2**: envio direto por URL pré-assinada (`aws4fetch`, token Object R/W
  por bucket, 5 min, `content-type` + `content-length` + `if-none-match: *` assinados ou as
  reservas, conforme R1), CORS versionado; constraints novas em `produto_fotos` aprovadas (D16);
  só JPEG/WebP quadrados de 400 a 1200 px; regra do ICC; chave única sem mover + `fotos_envio`; verificação por lista de permitidos
  sem decodificar (parser próprio, arquivo inteiro); modo registro só no dev; exibição pela rota
  com sessão; worker próprio + Cron Trigger diário chamando o handler em processo (ou a reserva,
  conforme R3); **R2 local por `experimental_s3_credentials`, opção experimental dependente da
  versão fixada do wrangler** (ou a reserva, conforme R2).
- **ADR-010 — IA (OpenAI)**: Responses API por `fetch`, `store: false`, structured output
  estrito, base64 com `detail: low`, 20 s, modelo e esforço escolhidos pela medição, contador
  no Postgres (30/pessoa, 100/dia), resposta tratada como entrada não confiável, teto de gasto no
  provedor.
- **Emenda do ADR-008**: chaves `4_001`/`4_002`; forma "lock global + `UPDATE` com
  pré-condições e token + statements guardados pelo token"; adoção por `DELETE … RETURNING` em
  CTE; reordenação por apagar e reinserir; convenção "writer de campos/status/destaque
  incrementa `versao`".

## Complexity Tracking

| Ponto | Por quê | Alternativa mais simples descartada porque |
|---|---|---|
| Opção **experimental** do wrangler para o R2 local | a URL pré-assinada precisa de endpoint S3; VIII proíbe o local de usar o R2 online | rota de PUT só local diverge do fluxo real (é a reserva) |
| Worker próprio (`cloudflare/worker.ts`) como `main` | o worker do OpenNext só exporta `fetch` | GitHub Actions agendado depende do CI e espalha o segredo |
| Rota interna exposta (`/api/interno/limpeza`) | reaproveita o bundle do Next (db, binding) sem duplicar código no worker | lógica no `scheduled` esbarra no `server-only` fora do Next |
| Token de operação (`fotos_operacao`) | com `neon-http` não há decisão entre statements; guardar por `fotos_versao = v+1` dá falso positivo | statement único com CTE não reordena posições únicas não adiáveis |
| Duas dependências novas | assinatura SigV4 e recorte com pinça são as partes com mais risco de erro próprio | cripto e gesto de pinça próprios |

## Pendências fora da 004

Registradas no analyze (2026-10-08); resolvidas por humano via `/speckit-constitution`, em
mudança própria, sem bloquear a 004:

- **Emenda da VIII**: escrever na constitution a interpretação registrada no Constitution Check
  (operação do humano por `wrangler` sobre R2, secrets e logs; banco só pelo CI/console).
- **III.1 × `.dev.vars.example`**: a III.1 diz "lista as chaves sem valores"; a prática (desde
  antes da 004, documentada no CLAUDE.md) põe valores locais não secretos. Alinhar o texto.

## Revisão do tech-lead

Revisão **somente leitura** (opus) do desenho das zonas protegidas, em 2026-10-08, conferida
contra os pacotes instalados (aws4fetch 1.0.20, drizzle-orm 0.45.3, drizzle-kit 0.31.11,
@neondatabase/serverless 1.2.0, wrangler 4.147.0). **21 achados, todos aceitos pelo humano**;
o achado 5 foi substituído pela decisão F (D18). Veredito do tech-lead: pode fechar com 1, 2, 3,
5 e 6 nos artefatos e 4, 7, 8 e 9 como testes explícitos — feito.

| # | Sev. | Achado | Onde foi aplicado |
|---|---|---|---|
| 1 | BLOQ. | URL de 5 min aceita sobrescrita depois da confirmação (fere FR-015/SC-006) | `if-none-match: *` assinado + CORS + 412 no R1; reserva com `etag` (research D2, data-model, fotos §3/§7) |
| 2 | IMP. | Recusa apagava o objeto antes da linha (corrida entre confirmações) | linha primeiro, objeto só se ela voltar (fotos §3) |
| 3 | IMP. | Array JS no `sql` do Drizzle vira lista `($1,$2)` | `sql.param(...)::tipo[]` + teste com `Date[]` (fotos §2, SF4) |
| 4 | IMP. | `23505` do batch sem teste | 3 testes na SF4 (fotos §2.2) |
| 5 | IMP. | SQL protegido com sonnet como dono | **decisão F**: sessão principal implementa, tech-lead revisa o diff (D18, coluna "Revisão TL") |
| 6 | IMP. | `@ts-expect-error` no worker quebra o `typecheck` depois de build local | `.d.ts` próprio + `exclude` de `.open-next` (fotos §6, SF12) |
| 7 | IMP. | APP0 JFIF pode carregar miniatura | só comprimento 16 e 0×0 (fotos §4, SF2) |
| 8 | IMP. | ICC pode carregar fabricante/modelo e texto | regra do ICC (decisão C; fotos §4, SF2, SF10) |
| 9 | IMP. | base64 de até 3 MB e laço do parser no limite de CPU | base64 nativo, `indexOf(0xFF)`, CPU da sugestão medida (ia §2, fotos §4, quickstart §5.3) |
| 10 | MEN. | Faltava `enviosValidos` | fotos §2.1 |
| 11 | MEN. | `DELETE` da adoção sem repetir `VALIDO` | fotos §2.2 |
| 12 | MEN. | `chavesConhecidas` precisa de um snapshot só | statement único obrigatório (fotos §2.6) |
| 13 | MEN. | Detalhes da coluna gerada e da regex no `schema.ts` | data-model "Migration 0002"; `uuid_extract_version`; fixtures v4 |
| 14 | MEN. | Constraints novas × clarificação | **decisão A**: mantidas; Clarifications da spec + ADR-009 (D16) |
| 15 | MEN. | Limites e dia repetidos no SQL da IA | parâmetros + CTE (ia §3) |
| 16 | MEN. | Comparação do segredo, corpo do 404, cron que "passa" com erro | SHA-256 + laço fixo, 404 sem corpo, `scheduled` lança (fotos §6) |
| 17 | MEN. | Modo registro fora do `wrangler.jsonc` não detectado | conformidade lê `.dev.vars.example`; após SF10 nega em qualquer lugar; log de aviso (fotos §4) |
| 18 | MEN. | Progressivo, PNG, dimensões | vários SOS; **decisão B**: PNG recusado, quadrado ≤ 1200 (spec FR-012/FR-016, fotos §4) |
| 19 | MEN. | 304 do R2 é objeto sem `body`; peso das capas | teste do 304 (fotos §5); **decisão D**: `loading="lazy"` + avaliar no SC-001 (D17) |
| 20 | MEN. | Momento da limpeza dos produtos sem foto divergia | "antes do primeiro push que leva a SF6 ao dev" (quickstart §2, Ordem) |
| 21 | MEN. | `cf-typegen`, `.gitignore` de `ia-medicao/`, `docs/operacao.md`, gitleaks | SF3/SF12, SF13, SF15, fotos §7 |

**Verificado sem defeito** pelo tech-lead: correção de `inserirComFotos` e `substituirConjunto`
sob READ COMMITTED com lock e token; interação com os `UPDATE`s da 003 (EvalPlanQual) e a
emenda de convenção D5; `remover` com CTE antes do cascade; margem de 25 h da limpeza; exatidão
do contador de IA com lock 4_002 e `dia` como data de Brasília; `aws4fetch` assina de fato os
headers com `signQuery` + `allHeaders`.

**Decisão E**: texto de `muitos_pendentes` aprovado pelo humano ("Você enviou muitas fotos sem
salvar. Salve o produto que está cadastrando ou tente de novo amanhã."). Spec alinhada a "WebP ou
JPEG" também em FR-011 (PNG segue aceito como entrada no aparelho), Key Entities e SC-006.

## Decisões

Ver [research.md §2](./research.md#2-decisões-humano-2026-10-08) (D1–D18, humano, 2026-10-08).
