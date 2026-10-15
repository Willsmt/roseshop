# Quickstart — validar a feature 005 (catálogo público)

Roteiro de validação. Contratos em [contracts/](./contracts/), modelo em
[data-model.md](./data-model.md), decisões em [research.md](./research.md). Passos marcados
**(humano)** são executados pelo mantenedor; o agente pede o comando e recebe o output real.

## Pré-requisitos

- Stack local: `npm run db:up` e `npm run db:migrate` (sem migration nova na 005).
- `.dev.vars` com a chave nova `WHATSAPP_NUMBER` (local: um número de teste em E.164, ex.
  `+5511999999999`; não precisa ser real).
- `wrangler.jsonc` com `SITE_URL`, o bucket de cache e o DO da fila nos três ambientes (contrato
  §1, research D1/D3/D12).

## 1. Configuração por ambiente online (humano)

Para `dev` e depois `production`:

1. Criar o bucket de cache (privado, sem CORS, sem token S3):
   ```bash
   npx wrangler r2 bucket create roseshop-cache-dev
   ```
2. Gravar o número do WhatsApp (dev: número de teste do mantenedor; produção: número da Rose):
   ```bash
   npx wrangler secret put WHATSAPP_NUMBER --env dev
   ```
3. Conferir: `npx wrangler secret list --env dev` com `WHATSAPP_NUMBER` e
   `npx wrangler r2 bucket list` com `roseshop-cache-dev`.

Produção é configurada antes do merge, no mesmo modelo da T148 (inclui
`roseshop-cache-prod`).

## 2. Spike SF0 — prova do prazo de 1 minuto com ISR (bloqueia o resto)

Rodar no `preview` (`npm run preview`, banco local com produtos) e repetir no dev
(`npm run deploy:dev` + `wrangler tail --env dev`). Cada cenário tem um resultado esperado;
**qualquer falha aciona o fallback para páginas dinâmicas** (research D2), registrado em
research.md §5, sem reabrir o plan.

| # | Cenário | Passos | Esperado |
|---|---|---|---|
| a | Primeiro pedido após o deploy | Com produtos no banco, fazer o build/deploy e abrir `/` assim que o worker responder | A página mostra os produtos. **Nunca** o estado "indisponível" gerado no build (D13) |
| b | Página velha sem visitas, com produto removido no meio tempo | Abrir `/` e `/p/<código de B>`; remover o produto B no painel; esperar **mais de 1 minuto** sem abrir nada (no `preview`, reiniciar também para ter um isolate novo); abrir `/` e `/p/<código de B>` | O **primeiro** pedido já não mostra B na lista e o detalhe responde "Produto não encontrado" (404). Não pode haver versão antiga servida nesse primeiro pedido |
| c | Esgotar e recarregar o detalhe | Abrir `/p/<código de C>` (disponível, com botão); esgotar C no painel; esperar 60 s; recarregar o detalhe | O botão "Perguntar no WhatsApp" sumiu e aparece "Esgotado" |

Conferências que o spike também registra (sem acionar o fallback por si sós):

- P9: com `/p/<código>` já em cache, `npm run db:down`, esperar mais de 40 s e abrir ⇒ a
  versão anterior com 200 e `Cache-Control: no-store`, e o log `catalogo.banco_indisponivel`
  com `resultado: "versao_anterior"`; abrir um código nunca visitado ⇒ 503 e o mesmo evento com
  `resultado: "503"`.
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
| 4 | Abrir um item, voltar | mesmos itens e posição; filtro mantido |
| 5 | Copiar o endereço filtrado, abrir noutra aba | 1º bloco, filtro mantido |
| 6 | `/?categoria=nao-existe` | lista "Todas", filtro em "Todas" |
| 7 | `/p/42`, `/p/00042` | 308 para `/p/0042` |
| 8 | `/p/abc`, `/p/0`, `/p/-1`, `/p/9999` | "Produto não encontrado", 404 |
| 9 | Detalhe esgotado | "Esgotado" e sem botão |
| 10 | Detalhe disponível com nome especial | link `wa.me/<dígitos>?text=` decodifica para o nome exato |
| 11 | `npm run db:down` → abrir `/p/0001` (já visitado) e `/p/<nunca visitado>` | o primeiro mostra a versão anterior (200, `no-store`); o segundo, 503 "Não foi possível carregar agora" (`no-store`); fotos 503; logs `catalogo.banco_indisponivel`; `db:up` + "Tentar de novo" ⇒ página normal |
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
