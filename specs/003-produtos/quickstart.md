# Quickstart — validar a feature 003 (produtos)

Guia de verificação. Contratos em [contracts/produtos.md](./contracts/produtos.md);
modelo em [data-model.md](./data-model.md).

## Pré-requisitos

- Node 24 (`.nvmrc`), Docker, `.dev.vars` local com as chaves de `.dev.vars.example`.
- E-mail Google na `ADMIN_EMAILS` local.

```bash
npm run db:up
npm run db:migrate          # aplica 0000 e 0001 (produtos, produto_fotos)
```

Se o banco local tiver sobra da fixture `produtos` da 002 (tabela criada pelo teste),
`db:migrate` falha ao criar `produtos`: rode `npm run db:reset && npm run db:migrate`.

## 1. Gate automatizado

```bash
npm run check               # lint + typecheck + unitários (inclui conformidade)
npm run test:int            # integração em série, banco local
npx drizzle-kit generate    # deve responder "No schema changes"
```

Esperado: tudo verde, com output real. Arquivos de integração que precisam passar
(nomes finais definidos no tasks.md):

| Cenário | Prova |
|---|---|
| FK `ON DELETE RESTRICT` | `DELETE` de categoria com produto ⇒ `23001`; `remover` da 002 ⇒ `tem_produtos` com N |
| Categoria × cadastro simultâneos (US7-AC3) | nunca produto órfão |
| Nome equivalente simultâneo | 1 sucesso, 1 `nome_repetido` com o código do outro |
| Cadastros simultâneos | códigos distintos; código de removido não volta |
| Otimista (edição, status, destaque, remoção) | segunda ação ⇒ `versao_diferente`, nada sobrescrito |
| Esgotar em destaque | `destaque_vaga = NULL` na mesma linha, `saiuDoDestaque = true` |
| 7 destaques + 2 simultâneos | exatamente 1 aceito, a outra recebe `vaga_disputada`; total 8 |
| Teto pelo banco | `UPDATE` manual com vaga 9 ou vaga repetida falha (`23514`/`23505`) |
| `CHECK` esgotado × destaque | `UPDATE` manual com esgotado e vaga falha (`23514`) |
| Fotos | posição 4 ou repetida falha |

## 2. Neon dev (CI do PR)

No PR, o job do `pull-request.yml` roda `db:migrate` no Neon dev e depois
`vitest run --config vitest.probe.config.mts`. Esperado no log: o teste da FK passando
com `23001` (batch revertido pelo próprio erro) e o probe do `db.batch` da 002
continuando verde. Conferir no Neon dev que nenhuma linha de teste sobrou (`SELECT count(*) FROM produtos` igual ao de antes).

## 3. Runtime real (preview)

```bash
npm run preview             # http://localhost:8787
```

Roteiro manual pelo celular (ou DevTools em 390 px):

1. `/painel/produtos` vazio ⇒ convite com "Novo produto".
2. Cadastrar "Meia soquete listrada" em Meias, sem preço ⇒ topo da lista, `#0001`,
   "Disponível", "Sem preço".
3. Cadastrar de novo "meia soquete listrada" (simula duplo toque) ⇒ recusa com link
   para `#0001`; nada duplicado.
4. Preço "12,90" + "a partir de" ⇒ "a partir de R$ 12,90". Testar a regra de entrada:
   aceitos "12.90", "R$ 12,90", "1.290,00"; recusados "1.290" (ambíguo) e "0".
5. Detalhe ⇒ "Destacar" ⇒ "Marcar como esgotado" ⇒ aviso de saída do destaque;
   "Marcar como disponível" ⇒ continua fora do destaque.
6. Duas abas no mesmo produto: alterar na aba A, agir na aba B ⇒ "Outra pessoa mudou...".
7. Buscar "1", "#0001", "soquete", "Meia-soquete"; filtrar Meias + Esgotado; limpar.
   Com mais de 20 produtos: "Ver mais produtos" ⇒ abrir um detalhe ⇒ "Voltar à lista"
   (e o botão voltar do navegador) ⇒ mesma página e filtros (cursor `antes` na URL).
8. Tentar remover a categoria Meias em `/painel/categorias` ⇒ "Esta categoria tem 1 produto...".
9. Remover o produto (confirmação com código e nome) ⇒ some da lista, da busca e do
   endereço do detalhe ("Produto não encontrado"); próximo cadastro recebe
   um código maior que todos os anteriores (buracos são esperados: o envio recusado no
   passo 3 também consumiu um número).
10. Sessão expirada (apagar o cookie) e salvar ⇒ volta ao login, nada salvo.

## 4. Desempenho (SC-007)

Somente na stack local (ADR-006: nunca contra workers deployados): popular 500
produtos com script de teste e medir, no `preview`, abrir a lista, "Ver mais produtos",
filtrar e buscar — cada resposta < 2 s, excluída a primeira após o banco ocioso.

## 5. Observação com a administradora (SC-001 a SC-003)

No ambiente dev online, pelo celular dela, mesmo protocolo do SC-005 da 001 / SC-007 da
002: "cadastre este produto" (≤ 3 min), esgotar e voltar (≤ 30 s), achar o "42" (≤ 15 s).
Registrar tempos e travas no fechamento da feature.
