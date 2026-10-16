# Rastreabilidade — critérios de sucesso (feature 006)

Criada na SF7 (T066, 2026-10-16), no formato de `specs/005-catalogo-publico/rastreabilidade.md`.
Só a seção de critérios de sucesso; o mapeamento critério de aceite → teste está na tabela de
cobertura do `plan.md` e do `tasks.md`. A SF8 (T071) acrescenta as provas do dev e a T074 fecha
os pendentes de entrega.

## Critérios de sucesso

| SC | Situação | Onde |
|---|---|---|
| SC-001 | Aprovado: **5 toques** da sacola num pedido de 3 produtos (3 "Adicionar à sacola", abrir a sacola, enviar), ≤ 6, no `preview` e no Android real no dev. | T065 (Q§3 item 2), T068 |
| SC-002 | Aprovado no aparelho: pior caso (15 produtos de nomes longos, quantidade 10) chegou inteiro no WhatsApp; `ORCAMENTO_URL` mantido. | T069 |
| SC-003 | Local aprovado: marcação de esgotado, aviso de removido e de preço, envio barrado com preço mudado. | T065 (Q§3 itens 8 e 9) |
| SC-004 | Passa pelo critério do ADR-010 (sem falha por limite de CPU: sem Erro 1102, `outcome` `ok`): conferência com 4 ms e 12 ms de CPU. **Ressalva**: amostra menor que as 10 aberturas pedidas (total não registrado), e a quantidade de produtos na sacola durante o `tail` não foi registrada. | T070 |
| SC-005 | Local aprovado: roteiro de telas e `curl -sI /sacola` com `X-Robots-Tag: noindex, nofollow`. | T065 (Q§3 item 1, Q§4) |
| SC-006 | Local aprovado: navegação só por teclado em `/sacola`, incluindo o diálogo. A verificação automática está nos testes das SF5 e SF6. | T065 (Q§3 item 12) |
| SC-007 | Local aprovado: nenhum código nem corpo nos logs do `preview` (terminal e observabilidade local); no 503, um único registro `catalogo.banco_indisponivel`, sem dados do pedido. No dev, logs do `wrangler tail` vazios: sem códigos, quantidades nem observação. | T064, T070 |

## Provas locais da SF7

| Prova | Resultado | Onde |
|---|---|---|
| Rota de conferência (Q§2) | 200 na ordem pedida (ok, esgotado, inexistente), 415, 413 com e sem `Content-Length`, 400, 405; `no-store` e `nosniff` em todas as respostas da rota; o 405 padrão do Next fica de fora, pela emenda do §3 do contrato. | T064 |
| Falha no envio (US3.7, ajuste A1) | Com o `preview` parado: "Não consegui conferir agora, tente de novo.", sacola intacta, WhatsApp não abre. | T065 (Q§3 item 9) |
| Banco fora (US3.8, FR-013) | 503 `{}` e um único registro fechado. | T064 |
| Número inválido (US2.12, FR-017) | Aprovado (humano editou o `.dev.vars`). | T065 (Q§3 item 11) |
| Medidor da observação (US2.13, A2) | "N de 200" passa para "Espaço da mensagem quase cheio". | T065 (Q§3 item 10) |

## Provas no dev (SF8)

Deploy pelo PR #22 (4 checks verdes) e `npm run seed:dev` com 41 produtos (T067). A T068 e a T069
são confirmação do humano ("passou tudo, conforme o esperado"), sem números além dos citados.

**Aparelho**: Xiaomi Poco F7 Pro, HyperOS; Android na última versão da data (número não
registrado); Chrome 155 (pelo user-agent); WhatsApp na última versão (número não registrado).

| Prova | Resultado | Onde |
|---|---|---|
| Mensagem real (US2 Independent Test) | 5 toques da sacola (≤ 6). Mensagem conforme o esperado: ordem, preços, "a partir de", "Consulte o valor" e observação com acento, emoji e quebra de linha. Confirmação na volta com "Limpar sacola" e "Voltar". | T068 |
| Pior caso (R3) | 15 produtos de nomes longos, quantidade 10: a mensagem chegou inteira; o medidor passou para "Espaço da mensagem quase cheio". `ORCAMENTO_URL` mantido. | T069 |
| CPU e logs (SC-004, SC-007) | Abaixo. | T070 |

CPU pelo `wrangler tail --env dev` no `roseshop-dev`, script ce32087c. Resultados relatados pelo
mantenedor. Todos com `outcome: ok`, sem exceções e sem Erro 1102.

| Rota | CPU | Wall |
|---|---|---|
| `POST /api/catalogo/conferencia` (200) | 4 ms e 12 ms (o de 12 ms provavelmente de isolate novo) | 39 ms no pedido de 12 ms; o outro não registrado |
| `/fotos/*` | 3–5 ms | não registrado |
| Prefetch da página | 5 ms | não registrado |

Não registrados: o total de aberturas da sacola, quantas foram com isolate novo e quantos
produtos a sacola tinha durante o `tail`.

Veredito (SC-004, ADR-010): **passa**. O critério do ADR-010 é não falhar por limite de CPU
(Erro 1102 ou "exceeded CPU"), não ficar abaixo de 10 ms. Nenhuma falha apareceu. O pedido de
12 ms passa dos 10 ms do Workers Free, dentro do risco aceito da T139, e fica abaixo dos 14 a
18 ms de `/` medidos na 005. **Ressalva**: a amostra é menor que as 10 aberturas pedidas
(5 com isolate novo), então o veredito vale para os pedidos observados, não para a série
completa.

## Pendências

| Pendência | Situação |
|---|---|
| 405 da conferência | **Resolvido por emenda do contrato** (2026-10-16): o `GET` recebe o 405 padrão do Next, sem `no-store` e sem `nosniff`; o §3 de `contracts/conferencia.md` passou a excluí-lo, já que não tem corpo nem dado. |
| Dev (SF8) | Feito (T067 a T071). Ressalva do SC-004: amostra de CPU menor que as 10 aberturas e sem registro de 15 produtos na sacola durante o `tail`. Repetir a série completa só se o humano pedir. |
| Versões do aparelho | Números do Android e do WhatsApp não registrados (só "última versão da data"). |
