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

## Depois da Fase 7 (logo 3D) — 2026-10-16

### Worker (servidor)

O 3D é só do navegador: o servidor continua entregando o mesmo SVG (o fixture `inicio-005.html`
não mudou). Código da Fase 7 (sem commit) publicado no `roseshop-dev` (versão
`6d47cf5d-f7ca-44bb-935f-41acb661d85e`); 20 pedidos por rota e uma segunda rodada de 25 para
`/p/0015` e `/sacola`.

| Rota | Amostras (ms de CPU, ordenadas) | Mediana | Fase 5 | Linha de base | Outcome |
|---|---|---|---|---|---|
| `/` | 6, 9, 9, 10, 11, 11, 11, 12, 12, 12, 12, 13, 14, 14, 15, 18, 19 | **12** | 12 | 17 | todas `ok` |
| `/p/0015` | 7, 8, 8, 9, 9, 12 | **8,5** | 10 | 12,5 | todas `ok` |
| `/sacola` | 5, 6, 7, 9, 12 | **7** | 7 | 10 | todas `ok` |

- `/` não mudou (12 ms, 17 amostras). Sem bloqueio.
- **Limitação, de novo:** o `wrangler tail` entregou só 6 eventos de `/p/0015` e 5 de `/sacola` em
  45 pedidos de cada; a segunda rodada não trouxe nenhum evento (o tail conectou e ficou mudo). As
  medianas dessas duas rotas seguem indicativas.

### Navegador (o que o 3D custa)

Medido com `design/validacao/medir-logo-3d.mjs` (resultado bruto em
`design/validacao/medicao-logo-3d-fase7.json`): Chrome 155 headless à parte, 360×780, DPR 2, CPU
4x mais lenta, WebGL por **SwiftShader** (desenho na CPU, porque o WSL não tem GPU). Comparação
entre "SVG" (movimento reduzido: o 3D nem baixa) e "3D".

| Medida | SVG | 3D |
|---|---|---|
| Peso a mais (chunk do three, só por `import()`) | 0 | **131,2 KB gzip** (532,3 KB sem compressão) |
| JS inicial da página | 197,9 KB gzip | 197,9 KB gzip (o three não está nele) |
| LCP (uma carga cada, sem cache) | 1032 ms | 824 ms |
| CLS | 0 | 0 |
| Caixa do logo antes/depois do 3D | 56×56 no topo 112 | 56×56 no topo 112 |
| CPU da página com o logo visível | 0 ms/s | **64 ms/s** (cerca de 6% de um núcleo já 4x mais lento) |
| CPU com o logo fora da tela | 0 ms/s | 1 ms/s (pausado) |

- O 3D entra depois do `load` e de um momento ocioso: o LCP é de uma foto e não piora (a diferença
  entre 1032 e 824 ms é variação entre cargas; não a atribuo ao 3D). CLS 0 nos dois.
- A animação desenha a no máximo 30 quadros por segundo. O custo de 64 ms/s é pessimista: no
  SwiftShader a GPU é emulada na CPU; num celular com GPU, a maior parte sai do processador.
- Pausa comprovada: fora da tela cai para 1 ms/s. Com a aba em segundo plano o laço também para
  (`visibilitychange`, coberto por teste).
- 131 KB gzip é muito para um enfeite: por isso o 3D só baixa em aparelho com 5 núcleos ou mais,
  sem economia de dados, sem movimento reduzido, com WebGL e (quando o navegador informa) com 3 GB
  de memória ou mais, e só depois que a página e as fotos da primeira tela apareceram.
- Não medido: celular real (Fase 8) e a aba Performance do DevTools com GPU de verdade.
