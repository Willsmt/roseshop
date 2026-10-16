# Rastreabilidade — critérios de sucesso (feature 005, SF12)

Gerada na SF12 (2026-10-15), no formato de `specs/004-fotos-produto/rastreabilidade.md`. Só a
seção de critérios de sucesso; o mapeamento critério de aceite → teste está na tabela de
cobertura do `plan.md` e do `tasks.md`. Ramo **FALLBACK** (páginas dinâmicas, `max-age=60`).
Legenda: **INT** = `npm run test:int` (banco local), **UNI** = `npm run check`.

## Critérios de sucesso

| SC | Situação | Onde |
|---|---|---|
| SC-001 | **Pendente da entrega**: observação com uma cliente real, junto da T143 da 004. | quickstart §5 |
| SC-002 | Medido no dev (PageSpeed Insights, Moto G Power, 4G lento, 41 produtos): `/` com FCP 0,8 s e LCP 2,0 s. **Pendente da entrega**: os tempos do detalhe `/p/<código>` (FCP e LCP não informados) e a medição com fotos reais da Rose. | quickstart, "Resultado do roteiro no dev" |
| SC-003 | Coberto (UNI): `precoPublico` ("R$", "a partir de", "Consulte o valor"), `mostrarWhatsapp` (esgotado ⇒ sem botão), detalhe esgotado sem link do WhatsApp e "Esgotado" no cartão. A amostra de produtos reais é manual (item 10 do `preview`). | `src/lib/catalogo/exibicao.test.ts`, `src/app/(public)/p/[codigo]/page.test.tsx`, `src/app/(public)/_catalogo/cartao-produto.test.tsx` |
| SC-004 | Coberto (UNI + INT): rota de fotos com 404 byte a byte igual para malformada, pendente, removida e objeto ausente; `fotoPublica` só para chave em `produto_fotos`; `obterPublico` nulo para produto removido; chaves exatas do envelope e das visões, sem e-mail nem campo interno. | `src/test/conformance/catalogo-acesso.test.ts`, `src/lib/catalogo/leitura.test.ts`, `src/lib/db/catalogo.int.test.ts` |
| SC-005 | Parcial. Coberto (UNI): o `max-age` de páginas (60), lista (20) e fotos (60) e a ausência de cache de servidor (soma ≤ 60 s). **Manual**: a alteração do painel aparecer em ≤ 60 s, com cronômetro (item 15 do `preview`, aprovado). | `src/test/conformance/catalogo-orcamento.test.ts`, `cloudflare/publico.test.ts`, quickstart §4 |
| SC-006 | Coberto no dev: prévia no WhatsApp (Android) com nome e capa em `/p/0059`; `/` com "Roseshop"; `/p/9999` sem dados. | quickstart, "Resultado do roteiro no dev" |
| SC-007 | Parcial. Coberto (UNI): `axe-core` no detalhe, cartão, destaques, filtro, lista, página inicial, erro e 404. **Manual**: Lighthouse de acessibilidade 100 no dev e navegação só por teclado (itens E1–E5 e 16 do `preview`). | `src/test/axe.ts`, `src/app/(public)/**/*.test.tsx` |
| SC-008 | **Manual**: nenhum teste cobre "sem recurso pago". Evidência: ramo FALLBACK sem bucket, Durable Object nem plano novo; CPU medida no dev (`/` 14–18 ms, 1º pedido 337 ms) é risco aceito da T139 (alerta = Erro 1102; contingência = ADR-010). | `docs/operacao.md`, quickstart, "Resultado do roteiro no dev" |
| SC-009 | Coberto (UNI + `preview`): `X-Robots-Tag: noindex, nofollow` nas respostas públicas (inclui 304 de fotos); `metadata.robots` do layout público; `/robots.txt` sem `Disallow`. Em produção, conferido na T097. | `cloudflare/publico.test.ts`, `src/test/conformance/catalogo-acesso.test.ts`, `src/app/robots.test.ts`, quickstart §4 (item 13) |

## Pendências de entrega

| Pendência | Situação |
|---|---|
| `WHATSAPP_NUMBER` de produção | Recebe o número de teste do mantenedor até a entrega (decisão do humano, 2026-10-15). **O número da Rose entra só na entrega final**: `npx wrangler secret put WHATSAPP_NUMBER --env production`. |
| SC-001 | Observação com uma cliente real, na mesma sessão da T143 da 004. |
| SC-002 (detalhe) | Tempos do detalhe com capa de foto real (FCP e LCP não vieram no PageSpeed) e lista com fotos reais. |
| Speed Index de `/` (5,5 s) | Vem das fotos; insumo para a futura versão reduzida das fotos (Assumptions da spec). Não é falha do SC-002. |
| Seed dev | A trava do `seed:dev` deve aceitar `sslmode=verify-full` (manutenção, fora da 005). |
