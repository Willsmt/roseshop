# Rastreabilidade — critérios de sucesso (feature 004, SF15)

Gerada na SF15 (2026-10-14). Só a seção de critérios de sucesso, no formato da
`specs/003-produtos/rastreabilidade.md`. O mapeamento critério de aceite → teste (US1-AC1 …) fica
na tabela "Cobertura dos critérios de aceite" do `plan.md`, não neste arquivo (decisão do humano
na SF15): cada SF fechou com os testes escritos
a partir dos seus critérios, antes da implementação. Legenda: **INT** = `npm run test:int`
(banco local), **UNI** = `npm run check`.

## Critérios de sucesso

| SC | Situação | Onde |
|---|---|---|
| SC-001 | **Pendente da entrega**: observação com a administradora pelo celular dela (T143), junto com as pendentes da 001 (SC-005), da 002 (SC-007) e da 003 (SC-001 a SC-003). | quickstart §6 |
| SC-002 | **Pendente da entrega**: mesma sessão do SC-001 (T143). | quickstart §6 |
| SC-003 | **Pendente da entrega**: medição com fotos reais (T132) e escolha de modelo e esforço (T133). Produção sobe com o provisório `gpt-6-luna`, esforço `none` (prova técnica T120a; ADR-010). | `npm run test:ia` (`src/lib/ai/medicao.ia.test.ts`) |
| SC-004 | **Pendente da entrega**: mesma medição do SC-003 (T132/T133). | `npm run test:ia` |
| SC-005 | Coberto (UNI): pipeline do aparelho com teto de 1 MiB. Prova com Chrome Android real no dev (SF10); Safari iOS e HEIF ficam como risco aceito, a refazer antes de liberar uma administradora com iPhone. | `src/lib/fotos/aparelho/{preparar-foto,codificar,suporta-webp}.test.ts` |
| SC-006 | Coberto (UNI): verificação por lista de permitidos com arquivos forjados e recusa com remoção na confirmação. | `src/lib/r2/verificacao/*.test.ts`, `src/lib/fotos/actions.test.ts` |
| SC-007 | Coberto (INT): ações simultâneas sobre o conjunto de fotos. | `src/lib/db/fotos.concorrencia.int.test.ts`, `fotos.conjunto.int.test.ts` |
| SC-008 | Coberto (INT). Cron provado no `roseshop-dev` em 2026-10-15 (T118b, abaixo). | `src/lib/db/fotos.limpeza.int.test.ts`, `src/lib/fotos/limpeza.int.test.ts` |
| SC-009 | Coberto (UNI): IA indisponível não impede o cadastro manual. | `src/lib/produtos/sugestao.test.ts` |
| SC-010 | Coberto por SF: testes antes da implementação em cada SF, `npm run check` verde (96 arquivos, 2524 testes em 2026-10-14); `check` e `test:int` do fechamento na T141. Mapeamento critério → teste na tabela "Cobertura dos critérios de aceite" do `plan.md`; o analyze de 2026-10-08 confirmou 100% dos FR e SC com task de teste. | `plan.md` ("Cobertura dos critérios de aceite"), `tasks.md` (Fecha de cada SF) |
| SC-011 | Mensagens revisadas na T144: só `foto_expirada` mudou ("Uma das fotos ficou muito tempo sem ser salva. Envie essa foto de novo."). **Pendente da entrega**: mensagens que a administradora não entender, na observação (T143). | `src/lib/fotos/mensagens.ts`, `src/lib/produtos/sugestao.ts` |

## Pendências de entrega

| Pendência | Situação |
|---|---|
| Observação com a administradora (T143: SC-001, SC-002, SC-011) | Fica para a entrega final do projeto (decisão do humano, 2026-10-14), sem bloquear o merge. Registrar tempo, onde hesitou, mensagens que não entendeu e o peso das capas na lista (D17). |
| Pontos a observar na mesma sessão | "Tirar do destaque" e "Tire um do destaque…" (003) usam "tirar" no sentido de remover, enquanto a 004 reserva "Tirar" para "Tirar foto". Mantidos (opção A do humano na T144); a observação diz se confundem. |
| Medição da IA (T132) e escolha de modelo e esforço (T133) | Fica para a entrega, sem bloquear o merge; produção com o provisório (ADR-010, quickstart §1). O resultado entra em emenda do ADR-010, em commit próprio. |
| E-mail da administradora no `ADMIN_EMAILS` de produção | Pendente da entrega (mesma pendência da 001). |

## Pendências de PR (dev online)

| Prova | Situação |
|---|---|
| Cron da limpeza no `roseshop-dev` (T118b) | **Provado** em 2026-10-15 06:00 UTC, capturado por `wrangler tail --env dev` (o plano gratuito não guarda os logs do cron): `outcome` `ok`, `cpuTime` 225 ms, `wallTime` 2550 ms, medido sem carga (0 envios e 0 órfãos), 0 falhas, status 200. |
| CPU no Workers Free (T139, T118b) | **Risco aceito**: `sugerirProduto` mediu 21 ms de CPU e o cron da limpeza 225 ms medido sem carga (T118b; `/api/health` até 470 ms na mesma captura), acima dos 10 ms, sem falha. Sinal de alerta: Erro 1102 nos logs; contingência (só se falhar por limite de CPU: Erro 1102 ou "exceeded CPU"): Workers Paid com emenda da constitution VII (ADR-010). |
