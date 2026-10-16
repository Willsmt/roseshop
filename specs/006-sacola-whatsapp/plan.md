# Implementation Plan: Sacola e pedido pelo WhatsApp

**Branch**: `feature/006-sacola-whatsapp` | **Date**: 2026-10-16 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/006-sacola-whatsapp/spec.md`

**Status**: rascunho para revisão humana. Restrições H1–H8 do humano registradas em
[research.md §1](./research.md#1-restrições-do-humano-entrada-do-plan-não-reabrir); decisões D1–D15
em [research.md §2](./research.md#2-decisões-técnicas). ADR-013 proposto (desvio da constitution
IV; GATE antes da SF1, T004) e ADR-012 proposto (GATE no início da SF3, T023). Ajustes do humano
nas tasks (A1 envio bloqueado, A2 medidor da observação) e correções do analyze refletidos aqui
em 2026-10-16.

## Summary

A cliente adiciona produtos pelo detalhe, revisa a sacola em `/sacola` e envia **um** pedido pelo
WhatsApp. A sacola fica só no `localStorage`; o servidor só confere códigos contra o catálogo atual
e nunca grava nada do pedido.

Abordagem técnica:

- **Núcleo puro** em `src/lib/sacola/` (cliente e testes, sem servidor): normalização única da
  observação, operações puras da sacola, total, construtor da mensagem e da URL `wa.me` com
  orçamento de 1800 sobre a URL codificada, e camada de armazenamento que relê, aplica, valida e
  grava cada operação dentro de `try/catch`.
- **Conferência**: `POST /api/catalogo/conferencia` (JSON, ≤ 1 KB checado antes do parse, uma
  consulta com `IN`, `no-store`, sem sessão, sem log nem eco), lendo pelo barrel `@/lib/catalogo`.
  ADR-012.
- **Telas**: ilhas cliente que só aparecem depois de hidratar, em espaços reservados no layout
  público e no detalhe (o HTML do servidor da 005 muda só por esses dois `div`); página `/sacola`
  com `<noscript>` e os estados da spec; envio por botão que reconfere e navega na mesma aba.
- **Sem** migration, dependência, variável, binding ou secret novos.

## Technical Context

**Language/Version**: TypeScript strict, Node 24 (dev/CI), runtime workerd (Cloudflare Workers via OpenNext)

**Primary Dependencies**: as da 005. Sem dependência nova. `zod/mini` (subpacote do `zod` 4 já
instalado) no cliente; React 19 `useSyncExternalStore` para o estado da sacola.

**Storage**:
- Aparelho: `localStorage["roseshop.sacola"]` (data-model §1); `history.state.sacolaEnviada`.
- Postgres: só leitura de `produtos` e `produto_fotos` (consulta nova `conferirProdutos`).

**Testing**: Vitest (unitários com jsdom e axe-core já instalados; integração no banco local, em
série; conformidade). Detalhe em [research D14](./research.md#d14-estratégia-de-testes).

**Target Platform**: Cloudflare Workers Free em `*.workers.dev`; clientes no Chrome Android.

**Project Type**: aplicação web única (Next.js 16 App Router).

**Performance Goals**: SC-001 (≤ 6 toques da sacola); SC-004 (conferência com 15 códigos sem Erro
1102, ADR-010).

**Constraints**:
- URL do `wa.me` ≤ 1800 caracteres codificados em qualquer combinação válida (FR-016).
- Nada do pedido no servidor nem nos logs (SC-007).
- HTML do servidor do detalhe e do cabeçalho igual ao da 005, exceto o espaço reservado (SC-005).
- Free tier; páginas públicas continuam dinâmicas (ADR-011).

**Scale/Scope**: 1 rota `POST`, 1 página (`/sacola`), 3 ilhas cliente (contador, botão do detalhe,
tela da sacola), 1 módulo puro com 7 arquivos, 1 consulta SQL.

Sem `NEEDS CLARIFICATION`.

## Constitution Check

*GATE: antes da Phase 0 e de novo após a Phase 1.*

| Princípio | Verificação | Pré | Pós-design |
|---|---|---|---|
| I. Fonte de verdade | Spec com Given/When/Then e 8 clarificações; cada critério mapeado a teste ([Cobertura](#cobertura)); **ADR-013** (desvio da IV) aprovado pelo humano antes da SF1 e **ADR-012** (POST público de conferência) aprovado antes da SF3 | ✅ | ✅ |
| II. Stack fechada | Nada substituído nem acrescentado; Zod (`zod/mini`) na fronteira do `localStorage` e da resposta da conferência, Zod na rota | ✅ | ✅ |
| III.1 Segredos | Nenhum segredo novo; o número E.164 já sai no `href` público da 005 e é passado à ilha da `/sacola`; logs sem número, códigos ou corpo | ✅ | ✅ |
| III.2 Allowlist | Painel inalterado; a rota nova não importa `@/lib/auth` nem lê cookie (conformidade) | ✅ | ✅ |
| III.3 Zod | Corpo da conferência (servidor), `localStorage` e resposta da conferência (cliente) | ✅ | ✅ |
| III.4/III.5 Upload, IA | Não se aplicam | ✅ | ✅ |
| III.6 Ambientes | Sem recurso novo; mesma separação da 005 | ✅ | ✅ |
| III.7 Zonas protegidas | `src/lib/db/catalogo.ts` e `cloudflare/publico.ts` ⇒ tech-lead + revisão humana; `wrangler.jsonc` e `.dev.vars*` não mudam | ✅ | ✅ |
| IV. Arquitetura | Server Components por padrão; cliente só nas três ilhas; SQL só em `src/lib/db/`; preço em centavos inteiros até a formatação. **Desvio**: regras de negócio da sacola (limites, total, mensagem) rodam no cliente e não há Server Action ([Complexity Tracking](#complexity-tracking)); a IV não prevê exceção, então o desvio vira o **ADR-013**, com GATE humano antes da SF1 | ⚠️ | ⚠️ ADR-013 (GATE) |
| V. UX | 16 px, 48 px, linguagem simples, confirmação do "Limpar sacola" com texto claro, mobile-first | ✅ | ✅ |
| VI. Qualidade | Testes antes da implementação por SF; `check` + `test:int` (série) como gate; commit por SF; README atualizado (rota nova) | ✅ | ✅ |
| VII. Free tier | Uma consulta por conferência, sem cache, sem DO/KV; CPU medida (SC-004, ADR-010) | ✅ | ✅ |
| VIII. Ambientes | Local só com recursos locais; dev antes de produção; produção só pelo CI | ✅ | ✅ |

## Project Structure

### Documentation (this feature)

```text
specs/006-sacola-whatsapp/
├── spec.md
├── plan.md              # este arquivo
├── research.md          # H1–H8, D1–D15, medição do orçamento, riscos R1–R6
├── data-model.md        # sacola no aparelho, conferência, total, mensagem
├── quickstart.md        # automático, rota, roteiro de telas, dev (Android, pior caso, CPU)
├── contracts/
│   ├── conferencia.md   # POST /api/catalogo/conferencia
│   ├── sacola.md        # módulo puro src/lib/sacola/
│   └── telas.md         # espaços reservados, botão do detalhe, /sacola, foco e anúncios
├── checklists/
└── tasks.md             # /speckit-tasks
specs/adr/012-conferencia-sacola.md   # NOVO, proposto (GATE no início da SF3)
specs/adr/013-desvio-constitution-iv.md  # NOVO, proposto (GATE antes da SF1)
```

### Source Code (repository root)

```text
cloudflare/
└── publico.ts                         # classificar: "/sacola" como "pagina" (D15) [protegido]
eslint.config.mjs                      # fronteira de src/lib/sacola (sem db, auth, r2, barrel do catálogo, server-only)
src/lib/
├── sacola/                            # NOVO, puro, importável pelo cliente (D1)
│   ├── observacao.ts                  # normalizarObservacao, contarCaracteres (D2)
│   ├── sacola.ts                      # tipos, limites, adicionar/mudarQuantidade/remover/limpar/aplicarConferencia (D4)
│   ├── total.ts                       # valorLinha, resumo
│   ├── mensagem.ts                    # montarPedido, restanteObservacao, ORCAMENTO_URL (D3)
│   ├── conferencia.ts                 # conferir (fetch POST, 4 s), lerRespostaConferencia, juntar, houveMudanca
│   ├── armazenamento.ts               # lerSacola, alterarSacola, assinarSacola (D5)
│   ├── textos.ts
│   └── fronteira.test.ts              # imports permitidos
├── catalogo/
│   ├── leitura.ts                     # + lerConferencia; ProdutoPublico.sacola
│   ├── index.ts                       # + lerConferencia, tipos
│   └── falha.ts                       # RotaFalha + "/api/catalogo/conferencia"
└── db/catalogo.ts                     # + conferirProdutos (IN) (D8) [protegido]
src/app/
├── api/catalogo/conferencia/route.ts  # NOVO: POST (D7)
└── (public)/
    ├── layout.tsx                     # + div[data-sacola="cabecalho"] com AcessoSacola
    ├── p/[codigo]/page.tsx            # + div[data-sacola="detalhe"] com BotaoSacola (só disponível)
    ├── sacola/page.tsx                # NOVO: <noscript> + TelaSacola (D10)
    └── _sacola/                       # NOVO: usar-sacola (useSyncExternalStore), acesso-sacola, botao-sacola, tela-sacola, item-sacola, observacao, confirmar-limpar
src/test/
├── conformance/conferencia-acesso.test.ts  # NOVO: sem auth/cookies, chaves públicas, no-store, erros {} sem eco, console sem códigos
├── fixtures/catalogo/detalhe-005.html, inicio-005.html  # NOVO: HTML do servidor da 005 (SF0), base da SC-005
└── db/catalogo-fixtures.ts            # reuso (+ casos de conferência)
```

**Structure Decision**: mesma aplicação Next.js. Domínio novo `src/lib/sacola/` (puro), irmão de
`catalogo/` (server-only); a consulta entra no SQL público já existente. O `CLAUDE.md` "Estrutura"
é atualizado pelo `doc-sync-onboarding` ao fechar a feature.

## Decisões (resumo)

Detalhe e alternativas em [research.md §2](./research.md#2-decisões-técnicas).

| # | Decisão |
|---|---|
| D1 | `src/lib/sacola/` puro, sem servidor; fronteira por teste e lint |
| D2 | `normalizarObservacao` única (CRLF, NFC, controle, invisíveis exceto ZWJ/VS, pontas, 3+ quebras); campo guarda o bruto; tudo conta pelo normalizado em code points; sem `maxLength` |
| D3 | `montarPedido`: URL inteira medida com `encodeURIComponent`, ≤ 1800; nomes cortados a 40 e, se preciso, a um `L` comum por busca binária até 0; observação nunca cortada (`excede`); `restanteObservacao = min(200 − cp, 1800 − URL com nomes em 0)` (só nos testes); a tela usa `medidorObservacao`: "N de 200" enquanto o teto de 200 manda, "Espaço da mensagem quase cheio" com barra quando o orçamento da URL manda, sem expor a conta codificada, troca de modo anunciada uma vez (A2) |
| D4 | Operações puras `(relida, agora) => Resultado`, limites conferidos no resultado; conferência toca só os códigos cobertos |
| D5 | `alterarSacola`: reler → validar (`zod/mini`) → aplicar → gravar, tudo em `try/catch`; evento `storage`/local só relê; sem `navigator.locks` |
| D6 | Código como string canônica sem "#" (`"0042"`), no aparelho, no corpo e na resposta |
| D7 | `POST /api/catalogo/conferencia`: 415 → 413 (header e stream) → 400 → 1 consulta → 200; erros `{}`; `no-store`; log só do 503, fechado |
| D8 | `conferirProdutos(db, ids)` com `IN` e o subselect de capa da 005 |
| D9 | Ilhas com `useSyncExternalStore` e `getServerSnapshot = null`; espaço reservado `h-12`/`min-h-12` |
| D10 | `/sacola`: `<noscript>` + `TelaSacola`; estados da spec, incluindo armazenamento bloqueado |
| D11 | Envio por `<button>`: reconfere; se mudou, avisa; se a conferência falhar (4 s, rede, 400, 5xx, fora do esquema), **bloqueia** com "Não consegui conferir agora, tente de novo." (`role="alert"`), lista conferida mantida, sacola intacta e o botão de envio é a nova tentativa (A1); senão `history.replaceState` + `location.assign(url)`; confirmação pela marca no histórico; número inválido ⇒ `aria-disabled` + `aria-describedby`, sem `href`, sem montar |
| D12 | Foco no título da lista ou do estado vazio depois de Remover/Limpar; `aria-live="polite"`; `<dialog>` nativo no Limpar |
| D13 | Aba que recebe mudança só re-renderiza; na `/sacola` confere só códigos novos |
| D14 | Testes: pior caso + propriedade, injeção, intercalação, SC-005 por fixture, conformidade de log |
| D15 | Worker trata `/sacola` como página pública (noindex, `max-age=60`, 503) |

## Subfeatures

Cada SF começa pelos testes (test-writer, vermelhos), segue com a implementação mínima e fecha com
`npm run check` verde (e `npm run test:int` **em série** quando houver integração), output real
colado pelo júnior, revisão do tech-lead e **um commit** (mensagem do redator, commit do humano).

| SF | Conteúdo | Testes (test-writer) | Implementação | Commit |
|---|---|---|---|---|
| SF0 | Housekeeping da 005 (já feito em `d71b6ae`); fixtures do HTML do servidor da 005 (detalhe disponível, detalhe esgotado, `/`) gravados **antes** de qualquer mudança de tela; ADR-012 e ADR-013 commitados como "proposto". Depois do commit, **GATE do ADR-013** (T004) antes da SF1 | fixtures + teste SC-005 que já passa contra o código atual | test-writer (fixtures) + tech-lead (ADRs) | `test(catalogo): …` |
| SF1 | **Após GATE do ADR-013.** `observacao.ts`, `sacola.ts`, `total.ts`, `textos.ts`, fronteira (teste + lint) | normalização (tabela, idempotência, code points), operações e limites, total (US2.5/2.6), fronteira | tech-lead | `feat(sacola): …` |
| SF2 | `mensagem.ts` | pior caso ≤ 1800 + propriedade (~2000 combinações, semente fixa), corte por code point, injeção pela observação, ida e volta, `&#?+`, excede/restante, sem `wa.me` com número inválido (a função não é chamada: teste na SF5) | tech-lead | `feat(sacola): …` |
| SF3 | **Após GATE do ADR-012** (primeiro passo da T023). `conferirProdutos` [protegido], `lerConferencia`, `falha.ts`, rota `POST`, `/sacola` no worker [protegido] | I: consulta (ok, esgotado, removido, capa, uma chamada); U: rota (415, 413 com e sem `Content-Length`, 400, 503, 200 em ordem, `no-store`); C: `conferencia-acesso` (sem auth/cookies, chaves, erros `{}`, console sem códigos/corpo); U: `publico.ts` com `/sacola` | tech-lead | `feat(catalogo): …` |
| SF4 | `conferencia.ts` (cliente) e `armazenamento.ts` | resposta fora do esquema ⇒ falha; tempo-limite; `aplicarConferencia` só nos cobertos; armazenamento (vencida, corrompida, versão, limites, acesso que lança, gravação que lança); intercalação de duas abas; evento `storage` sem `setItem` | tech-lead | `feat(sacola): …` |
| SF5 | Ilhas do cabeçalho e do detalhe; `ProdutoPublico.sacola` (tech-lead, antes); espaços reservados | componentes (US1.1–1.7, FR-002a: nada antes de hidratar e com armazenamento que lança; limite de 15 com `aria-disabled`), SC-005 continua verde, axe | ui-dev (+ tech-lead em `leitura.ts`) | `feat(catalogo): …` |
| SF6 | `/sacola` e `_sacola/` | estados (sem JS, bloqueado, vazia, conferindo, falha ao abrir, conferida, falha no envio com lista mantida, confirmação), quantidade com anúncio do subtotal, Remover/Limpar com foco e anúncio, observação (medidor "N de 200" / "Espaço da mensagem quase cheio" com barra, `#obs-conta` anunciado uma vez por transição, bloqueio, excesso), envio (reconfere, barra com mudança; **teste dedicado do A1**: 4 s, rede, 400 e 5xx bloqueiam, sacola intacta, foco no botão), número inválido (sem `href`, sem `wa.me` no DOM, `aria-describedby`), axe, teclado | ui-dev | `feat(sacola): …` |
| SF7 | Roteiro no `preview` (quickstart §2–§4) | — | júnior + humano | — (registro em `tasks.md`) |
| SF8 | Dev: Android real, pior caso no aparelho, CPU (SC-004), logs (quickstart §5) | — | humano + tech-lead | `docs(specs): …` |
| SF9 | README (rota nova), `rastreabilidade.md`, doc-sync, PR; merge pelo humano | — | redator + doc-sync + humano | `docs(readme)`, `docs(specs)`, `docs(onboarding)` |

Dono por papel (CLAUDE.md): **test-writer** só testes; **ui-dev** só `src/app/(public)/` e
`_sacola/`, consumindo `@/lib/sacola/*` e o barrel; **tech-lead** tudo de `src/lib/`, zonas
protegidas, lint, ADR e revisão; **júnior** roda `check`/`test:int`/`preview` e devolve o output.

## Cobertura

Critério da spec → onde é provado. U = unitário, I = integração (banco local), C = conformidade,
M = manual (quickstart).

| Critério | Prova |
|---|---|
| US1.1, FR-001 | U (detalhe: botão principal + WhatsApp secundário) |
| US1.2, US1.3, FR-002 | U (`adicionar`, repetido sem mudança; ilha "Na sacola" com link) |
| US1.4 | U (esgotado sem espaço reservado nem botões) + SC-005 |
| US1.5, FR-003 | U (limite sobre o resultado; `aria-disabled` + texto) |
| US1.6, FR-008 | U (`assinarSacola` re-renderiza a outra "aba") + M §3.4 |
| US1.7, FR-004 | U (texto "Sacola, 2 produtos", `aria-live`) + axe |
| US2.1–2.4, FR-005, FR-009 | U (tela conferida, limites 1/10, Remover, `<dialog>` do Limpar) |
| US2.5, US2.6, FR-012 | U (`resumo`: "a partir de R$ 22,00", "+ 1 item"/"+ 2 itens", "Consulte o valor") |
| US2.7, FR-014 | U (`montarPedido`: formato exato, sem link, sem esgotado) + M §5.1 |
| US2.8, FR-015a | U (normalização; mesma saída nos três pontos; injeção não altera linhas anteriores; vazia sem rótulo; campo vazio ao recarregar) |
| US2.9, FR-018 | U (marca no histórico ⇒ confirmação; sacola intacta) + M §5.1 |
| US2.10 | U (ida e volta com acento, `&#?+`, emoji) + M §5.1 |
| US2.11 | U (estado vazio sem envio) |
| US2.12, FR-017 | U (sem `href`, sem `wa.me` no DOM, `aria-disabled`, `aria-describedby`; log uma vez sem o valor, já coberto em `config.test.ts`) + M §3.11 |
| US2.13, FR-015, FR-016, SC-002 | U (pior caso ≤ 1800 com códigos de 10 dígitos, propriedade, nomes encolhem antes, `restanteObservacao` com o número exato, `medidorObservacao` e a tela: "N de 200", "Espaço da mensagem quase cheio" com barra, anúncio uma vez na transição, excesso desabilita) + M §3.10, §5.2 |
| US3.1–3.4, SC-003 | U (`juntar`, `aplicarConferencia`, mensagem sem esgotado/removido/preço antigo) + I (consulta) + M §3.8 |
| US3.5 | U (envio reconfere; `houveMudanca` barra; `location.assign` não chamado) + M §3.9 |
| US3.6 | U (todos esgotados ⇒ envio desabilitado com texto) |
| US3.7 | U (falha ao abrir ⇒ "Tentar de novo"; falha no envio por 4 s, rede, 400 ou 5xx ⇒ "Não consegui conferir agora, tente de novo." com `role="alert"`, lista mantida, botão de envio ativo como nova tentativa, `location.assign` e `setItem` não chamados) + U rota 503 + M §3.9 |
| US3.8, FR-013 | C (`conferencia-acesso`) + U (rota) + M §2 |
| US4.1, US4.2, US4.3, FR-007 | U (`lerSacola`: persistência, vencida, corrompida, versão, limites) + M §3.5 |
| US4.4, FR-002a | U (acesso que lança ⇒ ilhas `null`, sem erro) + M §3.6 |
| US4.5, FR-006 | U (JSON gravado só com `v`, `t`, `c/q/p/a`) + M §3.3 |
| US4.6, FR-009, FR-010 | U (`<noscript>`; SC-005) + U (`publico.ts` com `/sacola`) + M §3.1, §4 |
| FR-008a | U (intercalação de duas abas; mesmo produto = última; 15 + 1 recusado; conferência só nos cobertos) |
| FR-019, SC-006 | U (axe nas telas novas; foco após Remover/Limpar) + M §3.12 |
| SC-001 | M §5.1 (contagem de toques) |
| SC-004 | M §5.3 (CPU no dev) |
| SC-005 | U (fixtures da SF0) + suíte da 005 verde + M §4 |
| SC-007 | C (console sem códigos/corpo) + M §5.4 |

## Riscos

Detalhe em [research §5](./research.md#5-riscos).

| # | Risco | Tratamento |
|---|---|---|
| R1 | Atomicidade do `localStorage` entre abas | **Aceito**, sem `navigator.locks`; reler antes de gravar cobre toques humanos; teste de intercalação |
| R2 | Aviso de preço some se a cliente recarregar antes de ler | **Aceito**, o aviso não é garantia; preço antigo nunca chega ao subtotal nem à mensagem e o envio reconfere |
| R3 | Limite real da URL do `wa.me` nos aparelhos; atalho para o app depois do `await` | Prova do pior caso num Android real no dev (quickstart §5.2); teto é constante ajustável; conferência com tempo-limite de 4 s |
| R4 | CPU da conferência > 10 ms | Risco aceito do ADR-010; medição SC-004 |
| R5 | `zod/mini` no bundle cliente | Subpacote já instalado |
| R6 | Varredura da rota pública | Mesmo nível da `/p/<código>`; ≤ 15 códigos e ≤ 1 KB por pedido; ADR-012 |

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| IV. "Mutações via Server Actions; nenhuma lógica de negócio no client": limites, total, conferência aplicada e mensagem rodam no cliente. Registrado como **ADR-013** (proposto; GATE antes da SF1) | A spec exige a sacola só no aparelho, sem nada gravado no servidor (FR-006, SC-007), e o contador da observação recalcula a cada tecla (FR-016). Não existe mutação no servidor. As regras ficam num módulo puro testado (`src/lib/sacola/`), separado das telas (FR-019), e os dados que valem (preço, disponibilidade) vêm sempre do servidor pela conferência | Montar a mensagem no servidor exigiria enviar a observação (dado do pedido) ao servidor a cada tecla ou no envio, com custo de CPU e risco de log, e ainda precisaria da regra no cliente para o contador; uma Server Action de sacola contraria "nada gravado no servidor" |
