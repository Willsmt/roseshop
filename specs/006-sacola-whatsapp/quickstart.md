# Quickstart — validar a feature 006 (sacola e pedido pelo WhatsApp)

Roteiro de validação. Contratos em [contracts/](./contracts/), modelo em
[data-model.md](./data-model.md), decisões em [research.md](./research.md). Passos **(humano)**
são do mantenedor; o agente pede o comando e recebe o output real.

## Pré-requisitos

- Nenhuma variável, binding, secret, bucket ou migration nova. Vale a configuração da 005
  (`WHATSAPP_NUMBER` por ambiente, `SITE_URL`).
- Local: `npm run db:up`, `npm run db:migrate`, `npm run preview` e `npm run seed:local`
  (catálogo de teste).

## 1. Automático (gate de cada SF)

```bash
npm run check          # lint + typecheck + unitários + conformidade
npm run test:int       # integração; NUNCA duas execuções ao mesmo tempo
```

Provas que precisam aparecer no output (nomes dos arquivos em `plan.md` §Cobertura):
pior caso da URL ≤ 1800, injeção pela observação, intercalação de duas abas, SC-005 (HTML do
servidor igual à 005 sem `[data-sacola]`), conformidade de log da conferência.

## 2. Rota de conferência no `preview` (local)

```bash
B=http://localhost:8787/api/catalogo/conferencia
curl -si -X POST $B -H 'content-type: application/json' -d '{"codigos":["0001","0002","9999"]}'
# 200, Cache-Control: no-store; itens na ordem: ok|esgotado, ..., inexistente
curl -si -X POST $B -H 'content-type: text/plain' -d '{"codigos":["0001"]}'        # 415 {}
head -c 2000 /dev/zero | tr '\0' 'a' | curl -si -X POST $B -H 'content-type: application/json' --data-binary @-   # 413 {}
curl -si -X POST $B -H 'content-type: application/json' -H 'transfer-encoding: chunked' --data-binary @<(head -c 2000 /dev/zero | tr '\0' 'a')  # 413 {}
curl -si -X POST $B -H 'content-type: application/json' -d '{"codigos":["42"]}'     # 400 {}
curl -si $B                                                                          # 405
```

Conferir no terminal do `preview` que nenhum código nem corpo apareceu em log. Com
`npm run db:down`, o primeiro `curl` dá 503 `{}` e um único log
`{"evento":"catalogo.banco_indisponivel","rota":"/api/catalogo/conferencia","causa":"banco"}`.

## 3. Roteiro de telas no `preview` (júnior + humano)

Chrome com a emulação de celular; DevTools → Application → Local Storage.

1. **Sem JS** (DevTools → desativar JavaScript): detalhe igual à 005, sem botão nem contador e
   sem salto; `/sacola` mostra "Ative o JavaScript para usar a sacola" com link.
2. **Adicionar** (US1): detalhe de dois produtos disponíveis → "Adicionar à sacola" vira "Na
   sacola", contador "Sacola, 2 produtos"; recarregar mantém; esgotado sem os dois botões.
3. **Armazenamento** (US4.5): o valor de `roseshop.sacola` só tem `v`, `t`, `i[].c/q/p/a`.
4. **Duas abas** (US1.6, FR-008a): mesmo detalhe em duas abas; adicionar numa atualiza a outra;
   adicionar produtos diferentes nas duas, cada uma, e conferir os dois na sacola.
5. **Inválido** (US4.2/4.3): editar o valor para `t` de 8 dias atrás, `q: 11`, `v: 0` e texto
   solto; recarregar ⇒ sacola vazia, sem erro.
6. **Modo privado com armazenamento bloqueado** (DevTools → Application → Storage → bloquear
   ou `chrome://settings/cookies` "Bloquear todos"): detalhe sem botão e sem contador; `/sacola`
   com o texto próprio.
7. **Sacola** (US2): quantidades nos limites 1 e 10; Remover (foco no título, anúncio);
   Limpar com confirmação (foco no estado vazio); subtotal "a partir de" e "+ 1 item a
   consultar".
8. **Conferência** (US3): no painel, esgotar um, remover outro e mudar o preço de um terceiro;
   abrir a sacola ⇒ marcação, aviso de removido com código, aviso de preço; recarregar ⇒ aviso
   de preço some (R2, aceito).
9. **Envio barrado** (US3.5): com a sacola aberta, mudar um preço no painel e tocar em enviar ⇒
   WhatsApp não abre, aviso aparece; tocar de novo ⇒ abre.
10. **Observação** (US2.13): 15 produtos com nomes longos; digitar até o contador zerar; colar
    texto com emoji; adicionar produto em outra aba ⇒ "Passou N" e envio desabilitado.
11. **Número inválido** (US2.12): parar o `preview`, apagar `WHATSAPP_NUMBER` do `.dev.vars`
    (humano), subir de novo ⇒ envio com o texto de indisponível, nenhum `wa.me` no HTML
    (DevTools → Elements → buscar `wa.me`), um log `catalogo.whatsapp_invalido` sem o valor.
    Restaurar o `.dev.vars`.
12. **Teclado**: percorrer `/sacola` só com Tab/Enter/Espaço, incluindo o diálogo.

## 4. Regressão da 005 (SC-005)

Repetir o roteiro de telas da 005 ([quickstart da 005 §4](../005-catalogo-publico/quickstart.md))
no `preview`: lista, "Carregar mais", filtro, detalhe, voltar com restauração, "Perguntar no
WhatsApp", `X-Robots-Tag` e `noindex`. Conferir também `curl -sI http://localhost:8787/sacola`
com `X-Robots-Tag: noindex, nofollow`.

## 5. Dev online (humano)

Deploy pelo PR (`pull-request.yml`) e `npm run seed:dev`.

1. **Mensagem real** (US2 Independent Test): Android com Chrome, sacola com 3 produtos (um com
   preço, um "a partir de", um sem preço) + observação com acento, emoji e quebra de linha;
   enviar; conferir na conversa do número de teste: cabeçalho, linhas, subtotal, "+ 1 item a
   consultar", observação após o rótulo, sem caracteres trocados. Voltar ⇒ confirmação, sacola
   intacta. Contar os toques da sacola (SC-001: ≤ 6).
2. **Pior caso no aparelho** (R3): seed com 15 produtos de nomes de 40 caracteres acentuados e
   emoji e preço "a partir de"; quantidade 10 em todos; observação até o contador zerar; enviar
   e conferir que a mensagem chega inteira (última linha da observação presente). Registrar
   modelo do aparelho, versão do Android, do Chrome e do WhatsApp em `rastreabilidade.md`.
3. **CPU da conferência** (SC-004, ADR-010):
   ```bash
   npx wrangler tail --env dev --format json > tail-conferencia.json   # em outro terminal
   ```
   Abrir a sacola com 15 produtos 10 vezes (5 com isolate novo, depois de ~1 min parado);
   anotar `cpuTime` por pedido de `POST /api/catalogo/conferencia`, `outcome` e ausência de Erro
   1102. Registrar em `rastreabilidade.md` como a T139 da 005.
4. **Logs** (SC-007): no mesmo `tail`, nenhum código, quantidade ou observação.

## 6. Produção

Nada a configurar. Depois do merge (humano): `/api/health` 200, um `POST` de conferência com um
código existente (200, `no-store`) e `/sacola` com `X-Robots-Tag`. Produção continua com o
`WHATSAPP_NUMBER` de teste do mantenedor (número da Rose na entrega final).
