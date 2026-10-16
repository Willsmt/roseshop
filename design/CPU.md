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

## Depois da Fase 5 (catálogo)

A medir, mesmo método: `cpuTime` de `/` (obrigatório), `/p/<código>` e `/sacola`, comparados
com a linha de base acima.

## Depois da Fase 7 (logo 3D)

A medir. O 3D roda só no navegador; a expectativa é não mudar a CPU do servidor.
