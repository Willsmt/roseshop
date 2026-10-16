# CPU por requisição — catálogo público

Teto documentado do Workers Free: 10 ms de CPU por requisição. O que conta como bloqueio
(adendo §6): piorar além do medido na 005 (`/` entre 14 e 18 ms). O sinal de falha real continua
sendo o Erro 1102 (ver `docs/operacao.md`).

## Método

- Worker `roseshop-dev` (ambiente dev), que já rodava o código da 006: os commits de `main`
  depois do deploy são só de documentação, então não houve deploy novo para esta medição.
- `npx wrangler tail --env dev --format json` aberto enquanto um `curl` pedia cada rota, com
  query string aleatória para não reaproveitar nada. Campo lido: `cpuTime` de cada evento.
- Produto usado no detalhe: `/p/0015` (seed do dev).
- Isolate já aquecido (o 1º pedido de isolate novo não entrou na amostra).

## Linha de base — antes do redesenho (2026-10-16)

| Rota | Amostras (ms de CPU, ordenadas) | Mediana | Outcome |
|---|---|---|---|
| `/` | 13, 14, 14, 16, 17, 17, 18, 21, 22, 26 | **17** | todas `ok` |
| `/p/0015` | 9, 11, 11, 11, 14, 15, 20, 27 | **12,5** | todas `ok` |
| `/sacola` | 7, 7, 10, 10, 10, 13 | **10** | todas `ok` |

Nenhum Erro 1102 nem `exceededCpu`. A mediana de `/` (17 ms) bate com a faixa da 005 (14 a 18 ms).

## Depois da Fase 5 (catálogo) — 2026-10-16

Mesmo método. Código da Fase 5 (ainda sem commit) publicado no `roseshop-dev` com
`npm run deploy:dev` (versão `94440cd0-8d54-4165-af2c-195b197cd820`), um pedido de aquecimento
por rota descartado, depois 10 pedidos por rota com `wrangler tail` aberto.

| Rota | Amostras (ms de CPU, ordenadas) | Mediana | Antes | Outcome |
|---|---|---|---|---|
| `/` | 9, 10, 10, 11, 12, 12, 13, 14, 17, 18 | **12** | 17 | todas `ok` |
| `/p/0015` | 7, 7, 10, 10, 13 | **10** | 12,5 | todas `ok` |
| `/sacola` | 6, 7, 12 | **7** | 10 | todas `ok` |

- `/` ficou dentro da faixa da 005 (14 a 18 ms) ou abaixo dela: **não houve piora**, portanto
  não há bloqueio (adendo §6). A diferença para menos está dentro da variação entre rodadas; não
  a atribuo ao redesenho.
- **Limitação da medição:** o `wrangler tail` entregou só 5 dos 10 eventos de `/p/[codigo]`
  (`/p/0015`) e 3 dos 10 de `/sacola` (o tail do plano gratuito pode descartar eventos). Com
  amostras desse tamanho, as medianas dessas duas rotas são indicativas, não conclusivas; só a de
  `/` (10 amostras) sustenta comparação com a linha de base. A repetição do fim da Fase 7 deve
  pedir mais vezes essas duas rotas, até juntar pelo menos 10 eventos de cada.
- O deploy medido não inclui dois ajustes de apresentação feitos depois dele (padding da moldura
  da galeria e o contêiner de ações vazio no produto esgotado). Nenhum dos dois acrescenta
  trabalho no servidor.
- Nenhum Erro 1102 nem `exceededCpu`.

## Depois da Fase 7 (logo 3D)

A medir. O 3D roda só no navegador; a expectativa é não mudar a CPU do servidor.
