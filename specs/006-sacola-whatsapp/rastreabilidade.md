# Rastreabilidade — critérios de sucesso (feature 006)

Criada na SF7 (T066, 2026-10-16), no formato de `specs/005-catalogo-publico/rastreabilidade.md`.
Só a seção de critérios de sucesso; o mapeamento critério de aceite → teste está na tabela de
cobertura do `plan.md` e do `tasks.md`. A SF8 (T071) acrescenta as provas do dev e a T074 fecha
os pendentes de entrega.

## Critérios de sucesso

| SC | Situação | Onde |
|---|---|---|
| SC-001 | Local aprovado: **5 toques** da sacola num pedido de 3 produtos (3 "Adicionar à sacola", abrir a sacola, enviar), ≤ 6. **Pendente**: Android real no dev (T068). | T065 (Q§3 item 2) |
| SC-002 | **Pendente**: pior caso no aparelho (T069). | T069 |
| SC-003 | Local aprovado: marcação de esgotado, aviso de removido e de preço, envio barrado com preço mudado. | T065 (Q§3 itens 8 e 9) |
| SC-004 | **Pendente**: CPU da conferência no dev com 15 produtos (T070). | T070 |
| SC-005 | Local aprovado: roteiro de telas e `curl -sI /sacola` com `X-Robots-Tag: noindex, nofollow`. | T065 (Q§3 item 1, Q§4) |
| SC-006 | Local aprovado: navegação só por teclado em `/sacola`, incluindo o diálogo. A verificação automática está nos testes das SF5 e SF6. | T065 (Q§3 item 12) |
| SC-007 | Local aprovado: nenhum código nem corpo nos logs do `preview` (terminal e observabilidade local); no 503, um único registro `catalogo.banco_indisponivel`, sem dados do pedido. **Pendente**: `wrangler tail` no dev (T070). | T064 |

## Provas locais da SF7

| Prova | Resultado | Onde |
|---|---|---|
| Rota de conferência (Q§2) | 200 na ordem pedida (ok, esgotado, inexistente), 415, 413 com e sem `Content-Length`, 400, 405; `no-store` e `nosniff` em todas as respostas, menos no 405 (ver pendência). | T064 |
| Falha no envio (US3.7, ajuste A1) | Com o `preview` parado: "Não consegui conferir agora, tente de novo.", sacola intacta, WhatsApp não abre. | T065 (Q§3 item 9) |
| Banco fora (US3.8, FR-013) | 503 `{}` e um único registro fechado. | T064 |
| Número inválido (US2.12, FR-017) | Aprovado (humano editou o `.dev.vars`). | T065 (Q§3 item 11) |
| Medidor da observação (US2.13, A2) | "N de 200" passa para "Espaço da mensagem quase cheio". | T065 (Q§3 item 10) |

## Pendências

| Pendência | Situação |
|---|---|
| 405 da conferência | O `GET` recebe o 405 padrão do Next, sem `Cache-Control: no-store` e sem `X-Content-Type-Options: nosniff`, ao contrário do §3 de `contracts/conferencia.md` ("todas as respostas"). Decidir: emendar o §3 ou responder o 405 pela rota. |
| Dev (SF8) | SC-001 no aparelho, SC-002, SC-004 e SC-007 no `wrangler tail` (T068 a T071). |
