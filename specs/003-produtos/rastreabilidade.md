# Rastreabilidade — critério de aceite → teste (feature 003, T058 / SC-004)

Gerada na SF9 a partir de `spec.md` (42 critérios, US1-AC1 … US7-AC3) e dos arquivos
`*.test.ts(x)` / `*.int.test.ts`. Legenda: **INT** = `npm run test:int` (banco local),
**UNI** = `npm run check`. "Tag" = o `it()` cita o id do critério no nome; "sem tag" = a
cobertura foi mapeada pelo conteúdo do teste (o id não aparece no nome).

Arquivos de integração: `src/lib/db/produtos.escrita.int.test.ts` (**esc**),
`produtos.destaque.int.test.ts` (**dest**), `produtos.leitura.int.test.ts` (**leit**),
`produtos.concorrencia.int.test.ts` (**conc**), `categorias.produtos.int.test.ts` (**cat**).
Arquivos de unidade: `src/lib/produtos/{validacao,actions,painel,preco}.test.ts`;
telas em `src/app/painel/(protegido)/produtos/**`.

| Critério | Cobertura | Tag |
|---|---|---|
| US1-AC1 cadastro feliz | esc (INT) | sim |
| US1-AC2 "a partir de R$ 12,90" | `preco.test.ts` ("a partir de", formatação) + `validacao.test.ts` (preço e flag) | não |
| US1-AC3 sem nome/categoria, digitado preservado | `actions.test.ts` (FormData vazio ⇒ `nome_vazio`; categoria ausente) + `form-produto.test.tsx` (valores reidratados, uma só mensagem) | não |
| US1-AC4 nome repetido (equivalências) | esc (INT) | sim |
| US1-AC5 preço inválido | `validacao.test.ts` (`preco_invalido`/`preco_ambiguo`) + `actions.test.ts` | não |
| US1-AC6 "a partir de" sem preço | `validacao.test.ts` | sim |
| US1-AC7 cadastros simultâneos | esc (INT) | sim |
| US1-AC8 categoria removida no meio | esc (INT) | sim |
| US2-AC1 esgotar | dest (INT) + `acoes-produto.test.tsx` | sim |
| US2-AC2 disponibilizar | dest (INT) + `acoes-produto.test.tsx` | sim |
| US2-AC3 versão desatualizada na troca de status | dest (INT): `versao_diferente: nada alterado` (esgotar e disponibilizar) | não |
| US2-AC4 sem login | `actions.test.ts` | sim |
| US2-AC5 esgotar produto em destaque | dest (INT) + `actions.test.ts` + `acoes-produto.test.tsx` | sim |
| US2-AC6 disponibilizar não volta ao destaque | dest (INT): "esgotar em destaque e disponibilizar NÃO recoloca" (tag do teste: FR-017 / US5-AC3) | não |
| US3-AC1 ordem e dados da lista | leit (INT) + `painel.test.ts` | sim |
| US3-AC2 paginação | `painel.test.ts` (+ leit para o keyset) | sim |
| US3-AC3 filtro categoria + esgotado | leit (INT) + `painel.test.ts` | sim |
| US3-AC4 busca por código | leit (INT) | sim |
| US3-AC5 busca por nome (acento/hífen) | leit (INT) | sim |
| US3-AC6 sem resultado | leit (INT); tela em `produtos/page.test.tsx` ("nada encontrado" + "Limpar filtros") | sim |
| US3-AC7 lista vazia | `produtos/page.test.tsx` ("vazio sem filtro ⇒ convite 'Novo produto'") | não |
| US4-AC1 editar | esc (INT) | sim |
| US4-AC2 editar preço/"a partir de" | esc (INT) + `validacao.test.ts` | sim |
| US4-AC3 edição com versão velha | esc (INT) | sim |
| US4-AC4 nome repetido ao editar | esc (INT) | sim |
| US4-AC5 categoria inexistente ao editar | esc (INT) | sim |
| US4-AC6 detalhe de produto removido | `[id]/page.test.tsx` + leit (INT) + `painel.test.ts` | sim |
| US5-AC1 primeiro destaque | dest (INT) | sim |
| US5-AC2 tirar do destaque | dest (INT) | sim |
| US5-AC3 esgotado/disponível não recoloca | dest (INT) | sim |
| US5-AC4 esgotado não destaca | dest (INT) | sim |
| US5-AC5 teto de 8 | dest (INT) + conc (INT, 7 + 2 simultâneos) | sim |
| US5-AC6 já em destaque | dest (INT) | sim |
| US6-AC1 confirmação com código e nome | `remover/confirmar-remocao.test.tsx` ("confirmação nomeia código e nome") + `remover/page.test.tsx` | não |
| US6-AC2 cancelar | `remover/confirmar-remocao.test.tsx` ("Cancelar volta ao detalhe sem chamar a action (AC2)") | não |
| US6-AC3 remover | esc (INT) | sim |
| US6-AC4 já removido/inexistente | esc (INT) | sim |
| US6-AC5 remoção com versão velha | esc (INT) | sim |
| US6-AC6 remoção não afeta outros | esc (INT) | sim |
| US7-AC1 categoria com produtos recusada | cat (INT) | sim |
| US7-AC2 mensagem com a contagem | cat (INT) | sim |
| US7-AC3 categoria × cadastro simultâneos | cat (INT) + conc (INT) | sim |

Resultado: 42/42 critérios com ao menos um teste. 34 têm o id no nome do teste; 8 estão
cobertos por conteúdo, sem tag (US1-AC2, US1-AC3, US1-AC5, US2-AC3, US2-AC6, US3-AC7,
US6-AC1, US6-AC2) — marcar o id nesses `it()` é opcional e cabe ao escritor de testes.

## Critérios de sucesso

| SC | Situação | Onde |
|---|---|---|
| SC-004 | Esta tabela. | este arquivo |
| SC-005 | Coberto (INT). | conc, dest, esc |
| SC-006 | Coberto (INT). | cat |
| SC-007 | Banco local medido (`npm run test:perf`, 500 produtos): média 120–126 ms, máx 143 ms por consulta, meta < 2 s. **Pendente (humano):** medição no `preview` com "Fast 4G" (T060). | `src/test/db/produtos-medicao.int.test.ts` |
| SC-008 | Mensagens revisadas na T061, sem jargão e sem alteração de texto. | `src/lib/produtos/mensagens.ts`, `acoes-produto.tsx` |
| SC-001 a SC-003 | **Pendente da entrega**: dependem da observação com a administradora no dev online (T062) e do SC-005 da 001. | quickstart §5 |

## Pendências de PR (CI / Neon dev)

| Prova | Situação |
|---|---|
| FK `ON DELETE RESTRICT` no Neon dev (`fk-produtos.int.test.ts`, `23001` e 0 linhas pelo marcador) | **Pendente de PR**: conferir o log do CI e registrar o link. |
| Constraint `produtos_destaque_vaga_unique` no `23505` de `destacar` (T059, no dev) | **Pendente de PR**: conferir no Neon dev/preview do dev que o erro chega com o nome da constraint e vira `vaga_disputada`. |
