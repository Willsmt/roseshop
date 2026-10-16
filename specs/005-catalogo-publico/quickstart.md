# Quickstart — validar a feature 005 (catálogo público)

Roteiro de validação. Contratos em [contracts/](./contracts/), modelo em
[data-model.md](./data-model.md), decisões em [research.md](./research.md). Passos marcados
**(humano)** são executados pelo mantenedor; o agente pede o comando e recebe o output real.

## Pré-requisitos

- Stack local: `npm run db:up` e `npm run db:migrate` (sem migration nova na 005).
- `.dev.vars` com a chave nova `WHATSAPP_NUMBER` (local: um número de teste em E.164, ex.
  `+5511999999999`; não precisa ser real).
- `wrangler.jsonc` com `SITE_URL` nos três ambientes e, só no ramo **[ISR]**, o bucket de cache e
  o DO da fila (contrato §1, research D1/D3/D12).

## 1. Configuração por ambiente online (humano)

Para `dev` e depois `production`:

1. Só no ramo ISR e só depois do GATE do ADR-011 (tasks T015): criar o bucket de cache
   definitivo (privado, sem CORS, sem token S3). Os dois são criados juntos:
   ```bash
   npx wrangler r2 bucket create roseshop-cache-dev
   npx wrangler r2 bucket create roseshop-cache-prod
   ```
2. Gravar o número do WhatsApp (dev: número de teste do mantenedor; produção: número da Rose):
   ```bash
   npx wrangler secret put WHATSAPP_NUMBER --env dev
   ```
3. Conferir: `npx wrangler secret list --env dev` com `WHATSAPP_NUMBER` e, no ramo ISR,
   `npx wrangler r2 bucket list` com `roseshop-cache-dev`.
4. Só no ramo ISR, depois do GATE (tasks T015a–T015b, research D16): o token do CI
   (`CLOUDFLARE_API_TOKEN`) ganha *Workers R2 Storage: Edit*, para o deploy popular o cache; o
   valor do secret não muda. Prova feita antes, no spike, com token de mesmo escopo (T006).
5. Bucket de fotos continua privado (US6.5): `npx wrangler r2 bucket dev-url get roseshop-dev`
   mostra o acesso público desligado e `npx wrangler r2 bucket domain list roseshop-dev` não
   lista domínio (o mesmo para `roseshop-prod`; tasks T085 e T090).

Produção é configurada antes do merge, no mesmo modelo da T148 da 004.

## 2. Spike SF0 — prova do prazo de 1 minuto com ISR (bloqueia o resto)

Rodar no `preview` (`npm run preview`, banco local com produtos) e repetir num worker
**descartável** `roseshop-spike` (`*.workers.dev`). O spike **nunca** roda no `roseshop-dev` nem
no `roseshop`. Cada cenário tem um resultado esperado; **qualquer falha aciona o fallback para
páginas dinâmicas** (research D2), registrado em research.md §5, sem reabrir o plan.

Worker do spike (humano; detalhes nas tasks T001, T002, T006 e T009):

1. Bucket de cache próprio: `npx wrangler r2 bucket create roseshop-cache-spike`.
2. `env.spike` temporário no `wrangler.jsonc` (nunca commitado): `name: "roseshop-spike"`,
   `triggers: { crons: [] }` (sem a limpeza da 004), `WORKER_SELF_REFERENCE` → `roseshop-spike`,
   `NEXT_INC_CACHE_R2_BUCKET` → `roseshop-cache-spike`, DO `NEXT_CACHE_DO_QUEUE` com a migration
   `new_sqlite_classes`. `env.dev` e `env.production` não mudam.
3. Deploy e banco: com um token temporário de mesmo escopo que o token do CI terá no ramo ISR
   (*Workers Scripts: Edit* + *Workers R2 Storage: Edit* + leituras, research D16), nunca o
   login OAuth, `npx opennextjs-cloudflare build && npx opennextjs-cloudflare deploy --env
   spike`, com o populate do cache bem-sucedido no log; `npx wrangler secret put DATABASE_URL --env spike` com a mesma branch dev do Neon
   (secret próprio do spike); logs por `npx wrangler tail --env spike`. Os produtos são mudados
   pelo painel do `roseshop-dev`, que usa a mesma branch.
4. Ao fim, antes de limpar o tree: `npx wrangler delete --env spike`, esvaziar e apagar o bucket
   (`npx wrangler r2 bucket delete roseshop-cache-spike`) e apagar o token temporário.

| # | Cenário | Passos | Esperado |
|---|---|---|---|
| a | Primeiro pedido após o deploy | Com produtos no banco, fazer o build/deploy e abrir `/` assim que o worker responder | A página mostra os produtos. **Nunca** o estado "indisponível" gerado no build (D13) |
| b | Página velha sem visitas, com produto removido no meio tempo | Abrir `/` e `/p/<código de B>`; remover o produto B no painel; esperar **mais de 1 minuto** sem abrir nada (no `preview`, reiniciar também para ter um isolate novo); abrir `/` e `/p/<código de B>` | O **primeiro** pedido já não mostra B na lista e o detalhe responde "Produto não encontrado" (404). Não pode haver versão antiga servida nesse primeiro pedido |
| c | Esgotar e recarregar o detalhe | Abrir `/p/<código de C>` (disponível, com botão); esgotar C no painel; esperar 60 s; recarregar o detalhe | O botão "Perguntar no WhatsApp" sumiu e aparece "Esgotado" |

Conferências que o spike também registra (sem acionar o fallback por si sós):

- P9: com `/p/<código>` já em cache, `npm run db:down`, esperar mais de 35 s e abrir ⇒ a
  versão anterior com 200 e `Cache-Control: no-store`, e o log `catalogo.banco_indisponivel`
  com `resultado: "versao_anterior"`; abrir um código nunca visitado ⇒ 503 e o mesmo evento com
  `resultado: "503"`. **Só a resposta repetida sai `no-store`**: pedidos seguintes ao mesmo
  detalhe, com o banco ainda fora, recebem a mesma versão com 200 e `max-age=20` (esperado,
  research D5/A1, não é falha do P9). Depois do `db:up`, o estado atual aparece em até 1 minuto.
- Revalidação da fila (C1): com o banco fora e a entrada entre 15 e 35 s, o log mostra o evento
  com `resultado: "revalidacao"`, e o `HEAD` da fila não recebe 503 nem `Cache-Control` novo.
- D11: o `ctx` do pedido chega a `getCloudflareContext().ctx` (senão, usar o plano B do D11).

## 3. Verificação automática

```bash
npm run check        # lint + typecheck + unitários + conformidade + axe-core
npm run test:int     # consultas do catálogo no banco local (em série)
```

Esperado: tudo verde. Destaques da cobertura no [plan.md](./plan.md#cobertura).

## 4. Roteiro no `preview` (local)

Com produtos cadastrados pelo painel (≥ 30, alguns em destaque, alguns esgotados, uma categoria
só com esgotados, uma categoria vazia, um nome com `&`, `#`, `?`, acento e emoji):

| # | Ação | Esperado |
|---|---|---|
| 1 | Aba anônima → `/` | destaques na ordem das vagas; lista do mais recente; 24 itens + "Carregar mais"; nenhuma ação do painel |
| 2 | "Carregar mais" ×1 | +24 sem repetir; o botão some no fim |
| 3 | Filtro "Meias" | só Meias; destaques iguais; categoria vazia ausente; categoria só com esgotados presente; anúncio do leitor de tela |
| 4 | Abrir um item, voltar | mesmos itens e posição; filtro mantido; a URL não ganhou parâmetro de bloco |
| 5 | Copiar o endereço filtrado, abrir noutra aba | 1º bloco, filtro mantido |
| 6 | `/?categoria=nao-existe` | lista "Todas", filtro em "Todas" |
| 7 | `/p/42`, `/p/00042` | 308 para `/p/0042` |
| 8 | `/p/abc`, `/p/0`, `/p/-1`, `/p/9999` | "Produto não encontrado", 404 |
| 9 | Detalhe esgotado | "Esgotado" e sem botão |
| 10 | Detalhe disponível com nome especial | link `wa.me/<dígitos>?text=` decodifica para o nome exato |
| 11 | `npm run db:down` → abrir `/p/0001` (já visitado) e `/p/<nunca visitado>` | **[ISR]** o primeiro mostra a versão anterior (200; `no-store` só na primeira resposta, depois `max-age=20`); o segundo, 503 "Não foi possível carregar agora" (`no-store`). **[FALLBACK]** 503 nos dois. Fotos 503; logs `catalogo.banco_indisponivel`; `db:up` + "Tentar de novo" ⇒ estado atual em até 1 minuto |
| 12 | `/fotos/<chave de envio pendente>` e de foto removida há > 60 s | 404 vazio, cabeçalhos iguais aos de um uuid inventado |
| 13 | `curl -sI` em `/`, `/p/0001`, `/fotos/<válida>` | `X-Robots-Tag: noindex, nofollow`; HTML com `<meta name="robots" content="noindex, nofollow">`; `/robots.txt` sem `Disallow` |
| 14 | Remover `WHATSAPP_NUMBER` do `.dev.vars`, reiniciar | sem botão; log `catalogo.whatsapp_invalido`; resto funciona |
| 15 | Alterar preço, esgotar, trocar capa, remover produto no painel | refletido em `/`, no detalhe e nas fotos em ≤ 60 s (SC-005), com cronômetro |
| 16 | Chrome DevTools, 360 px, Lighthouse Acessibilidade | sem rolagem horizontal; texto ≥ 16 px; alvos ≥ 48 px; contraste |

## 5. Roteiro no dev (humano, celular Android)

1. US3: tocar em "Perguntar no WhatsApp" ⇒ conversa com o número de teste, mensagem com nome,
   "#código" e link.
2. US5: colar `https://roseshop-dev.willsmt.workers.dev/p/<código>` numa conversa ⇒ prévia com
   nome e capa; colar `/` ⇒ "Roseshop"; colar `/p/9999` ⇒ sem dados de produto.
3. SC-002: Chrome DevTools remoto com throttling "4G", ≥ 24 produtos com fotos reais ⇒ conteúdo
   útil ≤ 3 s em `/` e no detalhe (excluindo o primeiro acesso após o banco ocioso).
4. CPU (R2 do research): `wrangler tail --env dev` em `/`, `/p/<código>`, GET da lista e
   `/fotos/<arquivo>`; anotar `cpuTime`; alerta = Erro 1102.
5. SC-001 (observação com pessoa real) fica como pendência de entrega, como a T143 da 004.

## Resultado do roteiro

Roteiro do `preview` (Q§4, SF10, T080–T083), ramo FALLBACK, banco local com o seed
(`npm run seed:local`, T080a, 41 produtos). Resultados relatados pelo mantenedor, que executou os
passos; os eventos de log abaixo foram conferidos nos arquivos de stderr capturados.

| Item | Resultado |
|---|---|
| 7 | `/p/42` e `/p/00042` ⇒ 308 para `/p/0042`. Passou |
| 8 | `/p/abc`, `/p/0`, `/p/-1`, `/p/9999` ⇒ 404, sem `Location` em `abc`, `0`, `-1` e `9999`. Passou |
| 12 | `/fotos/*` de uuid inventado, de envio pendente e de objeto órfão ⇒ 404 com cabeçalhos idênticos. Passou |
| 13 | `X-Robots-Tag: noindex, nofollow` em `/`, no detalhe, na foto e no GET da lista; meta robots no HTML; `/robots.txt` sem `Disallow`. Passou |
| 11 | Banco fora (`npm run db:down`) ⇒ 503 `Service Unavailable` com `no-store` nas páginas, na foto e no GET da lista; depois do `db:up`, volta a 200; eventos `catalogo.banco_indisponivel` no stderr. Passou |
| 14 | Sem `WHATSAPP_NUMBER`: o botão some e a página segue 200; `catalogo.whatsapp_invalido` registrado uma vez (`/tmp/pv14.err`). Passou |
| 1–6, 9, 10 | Navegador. O item 10 decodificou a mensagem do WhatsApp com o nome exato (`&`, `#`, `?`, acento e emoji). Passou |
| 15 | Mudanças do painel refletidas em até 60 s (SC-005). Passou |
| 16 | 360 px e Lighthouse de acessibilidade. Passou |
| E1–E5 | Restauração por `router.back` e bfcache, e "Ver o catálogo" limpando a restauração. Passou |

Notas operacionais:

- O `wrangler dev` escreve `console.error` e `console.warn` no **stderr**; para guardar os
  registros do worker, capture com `npm run preview > arquivo.log 2>&1`.
- Ao encerrar, o `wrangler dev` repete o stderr inteiro depois de "ERROR Wrangler dev command
  failed:". Um evento aparece então duas vezes no arquivo (uma ao vivo, outra na repetição); o
  worker registra uma vez por pedido (T082b).

Desvios do roteiro:

- T057a (SF6): o 503 das páginas saía sem reason phrase; agora é `Service Unavailable`.
- T082a: botão do WhatsApp ausente porque o preview foi reiniciado sem a variável; registros
  ausentes porque o log capturava só o stdout. Ambos de ambiente, sem mudança de código.
- T082b: o registro de FR-019 estava correto e os "eventos duplicados" são a repetição do stderr
  pelo wrangler. Sem mudança de código.

## Resultado do roteiro no dev (SF11)

CPU medida pelo `wrangler tail --env dev` no `roseshop-dev`, versão b842bfbf, seed de 41
produtos (`npm run seed:dev`, T085a). Resultados relatados pelo mantenedor. Todos `outcome: ok`,
sem `exceededCpu` e sem Erro 1102.

| Rota | CPU | Wall |
|---|---|---|
| `/` | 1º pedido 337 ms (isolate novo após o deploy); demais 14–18 ms | 32–37 ms |
| `/p/0059` | 13–19 ms (um pico de 43 ms) | 20–45 ms |
| GET da lista (2º bloco) | 5–8 ms | 21–41 ms |
| `/fotos/*` (fotos de seed, ~4 KB) | 4–7 ms | 162–325 ms |

Conclusão: a CPU de `/` com 41 produtos é igual à da T072a, que usou 1 produto. Veredito mantido:
aprovado com o risco aceito da T139 (passa dos 10 ms do Workers Free sem falha; alerta = Erro
1102; contingência = Workers Paid, ADR-010). Ressalva: as fotos do seed pesam ~4 KB, então o
tempo de `/fotos/*` e o SC-002 com fotos reais seguem dependendo do celular.

Celular Android (Chrome), dev, 41 produtos. Resultados relatados pelo mantenedor.

| Item | Resultado |
|---|---|
| 1 (US3) | "Perguntar no WhatsApp" em `/p/0059` abriu a conversa com o número de teste, com nome, "#0059" e link. Passou |
| 2 (US5, SC-006) | Prévia no WhatsApp: `/p/0059` com nome e capa; `/` com "Roseshop"; `/p/9999` sem dados de produto. Passou |
| 3 (SC-002) | PageSpeed Insights, Moto G Power, 4G lento. `/`: FCP 0,8 s, LCP 2,0 s, TBT 20 ms, CLS 0, Desempenho 95, Acessibilidade 100, Speed Index 5,5 s (fotos abaixo da dobra; medido com as fotos do seed no topo). Detalhe `/p/<código>` (capa com foto real): **FCP e LCP não informados**. Passou, segundo o mantenedor |
| SEO | 58, esperado pelo `noindex` (FR-004) |

Sinal para depois: o Speed Index de 5,5 s em `/` vem das fotos; registrar para a futura versão
reduzida das fotos (Assumptions da spec). Não é falha do SC-002 (conteúdo útil ≤ 3 s).

Pendente de entrega, como a T143 da 004: SC-001 (observação com pessoa real).

Manutenção (fora da 005): a trava do seed dev deve aceitar `sslmode=verify-full` (aviso do `pg`
sobre o `require`).
