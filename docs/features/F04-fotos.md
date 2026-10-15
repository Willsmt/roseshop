# F04 — Fotos de produto

> Estado: **construída (SF1 a SF14), em fechamento (SF15)** no branch
> `feature/004-fotos-produto`; **ainda não está em produção** (merge pendente, T150).
> Cobre: schema (SF1), verificação do arquivo (SF2), módulo R2 (SF3), SQL de envios e do
> cadastro com fotos (SF4/SF5), actions de envio, rota de exibição e exigência de fotos no
> cadastro (SF6), actions do conjunto (SF7), pipeline da foto no aparelho (SF8), telas do
> cadastro (SF9), prova com Chrome Android (SF10, ver "Prova com aparelho real"), tela
> Fotos do produto (SF11), limpeza diária (SF12, ver "Limpeza diária") e sugestão por IA
> (servidor SF13, tela SF14; ver "Sugestão por IA"). Spec:
> [`specs/004-fotos-produto/spec.md`](../../specs/004-fotos-produto/spec.md);
> contrato em `contracts/fotos.md` e `contracts/telas.md` e decisões no
> [ADR-009](../../specs/adr/009-fotos-r2.md) e no [ADR-010](../../specs/adr/010-ia-openai.md).
> Configuração de produção feita antes do merge (T148): ver
> [operacao.md](../operacao.md#r2-segredos-endpoint-e-cors).

## Visão leiga

Cada produto precisa de 1 a 3 fotos. No cadastro (`/painel/produtos/novo`) a
administradora primeiro coloca as fotos e só depois preenche os dados (ver
"Telas do cadastro" abaixo). Depois de cadastrado, o conjunto pode ser
alterado foto a foto: adicionar (até 3), trocar uma, remover (nunca a última) e
mudar a ordem (a foto da posição 1 é a capa). Isso é feito na tela **Fotos** do
produto (`/painel/produtos/<id>/fotos`, botão "Fotos" no detalhe): cada ação grava na
hora, sem botão "Salvar". A foto não passa pelo servidor do site: a
administradora escolhe a foto, o sistema pede uma **autorização de envio**
(`pedirEnvio`), o aparelho manda o arquivo direto ao armazenamento (R2) e o
sistema **confere** o que chegou (`confirmarEnvio`). Só então a foto fica
"confirmada" e pode ser usada no cadastro do produto. Fotos nunca são públicas: só
quem está logada no painel consegue vê-las.

Antes de enviar, o próprio aparelho **prepara** a foto: confere que é uma imagem de
verdade, endireita a orientação da câmera, recorta em quadrado, reduz se for grande
demais e regrava em WebP ou JPEG abaixo de 1 MB. Isso também descarta os metadados do
original (localização, câmera). Esse tratamento está em
`src/lib/fotos/aparelho/` (SF8) e é chamado pela tela do cadastro (SF9).

> **Observação de UX**: o cadastro pela tela envia de 1 a 3 fotos (SF9). Sem
> nenhuma foto enviada, o "Continuar" fica indisponível; se alguém chamar
> `criarProduto` sem fotos, a resposta é "Coloque pelo menos 1 foto do produto.".
> O detalhe do produto mostra as fotos (capa primeiro) e a lista mostra a capa em
> miniatura; para alterar as fotos de um produto existente, ver "Tela Fotos do produto".

## Aprofundamento técnico

### Fluxo de uma foto

```mermaid
sequenceDiagram
  participant A as Aparelho
  participant S as Server Actions (src/lib/fotos/actions.ts)
  participant D as Banco (fotos_envio)
  participant R as R2
  A->>S: pedirEnvio({ formato, tamanho })
  S->>S: sessão, Zod, configR2()
  S->>D: emitirEnvio (estado emitido, teto de 20 por 24 h)
  S-->>A: envioId + URL assinada (5 min) + headers
  A->>R: PUT direto
  A->>S: confirmarEnvio({ envioId })
  S->>D: obterEnvio
  S->>R: lerObjeto (tamanho nos metadados) + bytes
  S->>S: verificarImagem
  S->>D: marcarConfirmado
  S-->>A: { ok, envioId, arquivo }
  A->>S: criarProduto (campo fotos repetido, 1..3 envioIds)
  S->>D: inserirComFotos (adota os envios)
```

### Pipeline da foto no aparelho (`src/lib/fotos/aparelho/`, SF8)

Código **só de navegador**: sem `server-only`, `@/lib/r2`, `@/lib/db`, auth nem `next`.
O teste `src/lib/fotos/aparelho/fronteira.test.ts` lê os imports dos 5 arquivos e só
admite `./x` do próprio diretório e `mensagens`/`tipos` de `src/lib/fotos/`. As APIs do
navegador (`createImageBitmap`, canvas, teste de WebP) são **injetáveis**, por isso o
pipeline é testável em Node. Contrato: `specs/004-fotos-produto/contracts/telas.md` §3
(bloco "Decisões da SF8").

```mermaid
graph TD
  E["arquivo escolhido + área do recorte"] --> D["detectarTipo (64 primeiros bytes)"]
  D -->|outro| F1["motivo: formato"]
  D --> O["abrirImagem (orientação da câmera)"]
  O -->|erro| F2["motivo: nao_abre"]
  O --> R["recortar (1:1, 400 a 1200 px)"]
  R -->|menor que 400| F3["motivo: pequena"]
  R --> C["desenharRecorte (canvas)"]
  C --> W{"suportaWebp?"}
  W -->|sim| K1["codificar webp"]
  W -->|não| K2["codificar jpeg"]
  K1 -->|blob não é webp| K2
  K1 --> S["blob + formato"]
  K2 --> S
  K1 -->|acima de 1 MiB na última qualidade| F4["motivo: grande"]
  K2 -->|acima de 1 MiB na última qualidade| F4
  K2 -->|nem o JPEG sai| F5["motivo: nao_enviada"]
```

| Arquivo | Papel |
|---|---|
| `detectar-tipo.ts` | `detectarTipo`: JPEG, PNG, WebP ou HEIC pelos bytes (assinatura; HEIC pela caixa `ftyp`, e `mif1`/`msf1` só com marca HEIC compatível, para não aceitar AVIF); o resto é `outro`. Nome, extensão e MIME declarado não entram. `BYTES_CABECALHO = 64`. |
| `suporta-webp.ts` | `suportaWebp`: `toBlob` de um canvas 1×1 em `image/webp`; resultado guardado uma vez por sessão. Safari antigo devolve PNG, e isso conta como "não suporta". |
| `recortar.ts` | `recortar` (limita a área à imagem, lado final = `min(origem.lado, 1200)`, nunca amplia, origem < 400 = `pequena`) e `desenharRecorte` (canvas, suavização alta). `LADO_MINIMO = 400`, `LADO_MAXIMO = 1200`. |
| `codificar.ts` | `codificar`: WebP (0.82, 0.72, 0.62) ou JPEG (0.85, 0.72, 0.62), a primeira qualidade que cabe em `TETO_BYTES = 1_048_576`. |
| `preparar-foto.ts` | `abrirImagem` e `prepararFoto`, a única função que a tela chama. |

- **Saída**: `{ blob, formato: "webp" | "jpeg" }` ou `{ motivo }` com `formato`,
  `nao_abre`, `pequena`, `grande` ou `nao_enviada` (subconjunto de `MotivoFoto`). PNG e
  HEIC são aceitos só como **entrada**; o que sai é sempre WebP ou JPEG.
- **`prepararFoto` nunca rejeita**: falha fora do previsto (leitura do arquivo, contexto
  2d nulo, nem o JPEG sai, `suportaWebp` com erro) vira `{ motivo: "nao_enviada" }`. A
  tela só olha o `motivo`.
- **Conferência do `blob.type`**: o navegador pode devolver outro tipo em silêncio
  (Safari entrega PNG ao pedir WebP). Se o WebP vier errado, `codificar` recodifica em
  JPEG; se nem o JPEG vier certo, lança `FalhaCodificacao`, que `prepararFoto` converte
  em `nao_enviada`.
- **Memória**: a imagem aberta é fechada sempre (`close`) e o canvas é zerado
  (`width`/`height` = 0) ao fim, porque o Safari do iOS limita a memória de canvas.
- **Rastro da falha**: ao cair no `catch`, `prepararFoto` faz
  `console.warn("fotos.aparelho.nao_enviada", { erro: e.name })` (dev e produção). Só o
  `name`: o `message` pode conter o nome do arquivo.
- **Foto de entrada animada**: só o primeiro quadro é desenhado.
- O servidor **não confia** nesse tratamento: `confirmarEnvio` verifica o arquivo
  recebido de novo (`verificarImagem`).

### Actions de envio (`src/lib/fotos/actions.ts`)

Arquivo `"use server"`; chamadas programáticas (objeto, não `FormData`), nunca
redirecionam. Sem sessão, `UnauthorizedError` propaga (`requireAdminAction`). Falha
é `{ ok: false, motivo, mensagem, atual? }`.

| Action | Ordem dos passos | Resultado |
|---|---|---|
| `pedirEnvio` | guard → Zod (`formato` webp/jpeg, `tamanho` inteiro ≥ 1) → tamanho > 1 MiB = `grande` → `configR2()` **antes de gravar** (config ausente = `falha_geral` sem deixar linha contando no teto) → `emitirEnvio` (20 envios/24 h, senão `muitos_pendentes`) → `assinarEnvio`. Se a assinatura falhar, `descartarEnvio` em melhor esforço (log `fotos.envio.linha_nao_descartada`). | `{ ok: true, envioId, url, headers }` |
| `confirmarEnvio` | guard → Zod (`envioId` uuid) → `obterEnvio` (inexistente ou de outra pessoa = `falha_geral`) → já `confirmado` devolve ok (**idempotente**, sem reverificar) → `lerObjeto` (ausente = `nao_enviada`, **a linha fica**) → tamanho dos metadados ≠ declarado ou > 1 MiB = `grande` → `verificarImagem` → `marcarConfirmado`. 0 linhas no `marcarConfirmado`: relê; se outra confirmação ganhou, ok. | `{ ok: true, envioId, arquivo }` |

Pontos de projeto:

- **Recusa apaga a linha antes do objeto (TL-2)**: `recusar` chama `descartarEnvio`
  (só apaga `emitido`) e só então `apagarObjetos([chave])`. Uma confirmação
  concorrente que já marcou `confirmado` não perde o objeto. Falha ao apagar o
  objeto só gera log (`fotos.confirmacao.objeto_nao_apagado`); o órfão sai na
  limpeza diária (SF12).
- **Modo registro** (`modoVerificacao()`): a verificação relaxa só o metadado e a
  action registra um `console.warn("fotos.verificacao.registro", ...)` com
  `envioId`, resultado, motivo, regra e blocos. **Nunca bytes.**
- Mapeamento do motivo da verificação para o da tela: `formato` → `formato`;
  `pequena` → `pequena`; `metadado`, `animada`, `corrompida`, `dimensao` →
  `nao_passou` (`src/lib/fotos/erros.ts`).

### Actions do conjunto (`src/lib/fotos/actions.ts`)

Quatro actions chamadas pela tela Fotos do produto já cadastrado (SF11, ver abaixo). Todas
passam por `alterarConjunto`, que fixa a ordem dos passos.

| Action | Entrada | Regra aplicada (`aplicarAcao`) |
|---|---|---|
| `adicionarFoto` | `produtoId`, `fotosVersao`, `envioId` | acrescenta no fim; com 3 fotos = `limite`; produto sem fotos (herdado da 003) aceita |
| `trocarFoto` | `produtoId`, `fotosVersao`, `posicao` (1..3), `envioId` | substitui a foto da posição; a chave antiga sai do conjunto |
| `removerFoto` | `produtoId`, `fotosVersao`, `posicao` | tira a foto; se for a única = `ultima`; a chave sai do conjunto |
| `moverFoto` | `produtoId`, `fotosVersao`, `de`, `para` | reposiciona; `de` = `para` = `falha_geral` |

Ordem em `alterarConjunto`:

```mermaid
sequenceDiagram
  participant A as Aparelho
  participant S as alterarConjunto
  participant D as Banco
  participant R as R2
  A->>S: adicionarFoto / trocarFoto / removerFoto / moverFoto
  S->>S: requireAdminAction, Zod (envioId uuid minúsculo com hífens)
  S->>D: lerConjunto (produto + fotosVersao + fotos)
  S->>S: fotosVersao diferente = alterado
  S->>D: obterEnvio (só adicionar e trocar; ausente ou não confirmado = foto_expirada)
  S->>S: aplicarAcao (regra pura, conjunto.ts)
  S->>D: substituirConjunto (db.batch sob LOCK_FOTOS)
  S->>S: revalidatePath /painel/produtos e /painel/produtos/id
  S->>R: apagarObjetos([chave que saiu]) (só trocar e remover)
  S-->>A: ok + fotosVersao nova + fotos
```

- **Regra pura** (`src/lib/fotos/conjunto.ts`, `aplicarAcao`, sem I/O): devolve a lista
  nova numerada de 1 a n, mais `saiu` (a chave que deixou o conjunto) em trocar e
  remover, ou uma recusa. `MAXIMO_FOTOS = 3`. Recusas: `limite`, `ultima`, e
  `falha_geral` para posição inexistente, `de` = `para` ou chave repetida (a mesma
  foto já presente no conjunto). O resultado sempre tem 1 a 3 fotos em posições 1..n.
- **Zod**: `produtoId` inteiro positivo, `fotosVersao` inteiro ≥ 0, posições inteiras
  1..3, `envioId` via `uuidEnvio`. Entrada inválida = `falha_geral` sem tocar no banco
  e **sem `atual`**.
- **Chave e autoria vêm do banco, não do cliente**: a chave nova, `enviadoPor` e
  `enviadoEm` (= `criadoEm` do envio) saem do envio lido por `obterEnvio` com a sessão.
  Envio inexistente, de outra pessoa ou não `confirmado` = `foto_expirada`. A validade de
  24 h é conferida no batch (`substituirConjunto`).
- **Resposta de sucesso**: `{ ok: true } & Conjunto` (`fotosVersao` nova + `fotos`), **sem
  `mensagem`**: a tela usa `SUCESSO_FOTO` (`src/lib/fotos/mensagens.ts`). A vista é
  montada antes do batch, então um erro nela vira `falha_geral` sem gravar nada.
- **Falhas trazem `atual`** (conjunto e `fotosVersao` correntes) sempre que o conjunto
  pôde ser lido: `alterado`, `foto_expirada`, `limite`, `ultima` e `falha_geral` da
  regra. Se o batch devolve `alterado` ou `foto_expirada`, o conjunto é **relido**
  (`falharRelendo`). Sem `atual` só em: entrada inválida, `nao_existe` (produto sumido,
  inclusive no batch) e falha da primeira leitura.
- **R2 depois do batch, em melhor esforço**: trocar e remover apagam o objeto antigo
  só depois de o banco valer; `revalidatePath` também. Falha ao apagar não vira erro:
  só `console.warn("fotos.conjunto.objeto_nao_apagado", { produtoId })`, sem chave. O
  órfão sai na limpeza diária (SF12).
- **Versão própria**: o conjunto usa `fotosVersao` (concorrência otimista), separada da
  `versao` do produto.

### Rota de exibição

| Rota | Handler | O que faz |
|---|---|---|
| `GET /painel/fotos/[arquivo]` | `src/app/painel/fotos/[arquivo]/route.ts` | Serve a imagem do R2 ao painel. |

Ordem: `getAdminSession` (sem sessão, **404**, não lança nem redireciona) → regex
`chaveDoArquivo` (`<uuid v4>.(webp|jpg)`) **antes** de tocar no binding →
`fotoExibivel` → `servirObjeto(chave, If-None-Match)`. Qualquer recusa é um 404
igual. Só a chave que está em `produto_fotos` ou em `fotos_envio` `confirmado` é
servida (`chaveExibivel` em `src/lib/db/fotos.ts`, um statement). Resposta 200 com
`Cache-Control: private, max-age=31536000, immutable`, `ETag`, `X-Content-Type-Options:
nosniff` e `Content-Security-Policy: default-src 'none'`; se o `If-None-Match` casa, o
R2 devolve o objeto sem corpo e a rota responde **304**. Exceção em qualquer passo:
500 sem corpo e `console.error("fotos.exibicao.falha")`, sem chave, arquivo nem erro
original. Só `GET` é exportado (o Next atende `HEAD` com o mesmo handler).

### Cadastro de produto com fotos

`criarProduto` (`src/lib/produtos/actions.ts`) lê o campo `fotos` repetido do
`FormData`, na ordem: nenhum = `sem_foto`; fora de 1..3 ids distintos (uuid) =
`falha_geral` (adulteração). Depois chama `inserirComFotos` (`src/lib/db/produtos.ts`,
substituiu o `inserir` da 003). Se algum envio não é mais válido (da pessoa,
`confirmado`, com menos de 24 h), a falha é `foto_expirada` com `envioIds` dos
envios a refazer; lista vazia (corrida) vira `falha_geral`. Mensagens em
`src/lib/produtos/mensagens.ts` e `src/lib/fotos/mensagens.ts` (os textos
repetidos têm teste de igualdade).

`removerProduto` agora usa `remover`, que devolve `{ tipo: "removido", chaves }`;
a action apaga os objetos no R2 **depois do banco**, em melhor esforço (log
`produtos.remocao.objetos_nao_apagados` só com a quantidade). Falha do R2 não
desfaz a remoção.

### Telas do cadastro (`/painel/produtos/novo`, SF9)

`page.tsx` (servidor: `requireAdminPage`, lista as categorias) renderiza o client
component `cadastro-produto.tsx`, com **dois passos**: **Fotos** e **Dados do produto**.
Os dois ficam montados e o inativo fica `hidden`, então "Voltar às fotos" não perde o
que foi digitado; nada vai para storage do navegador (recarregar a página zera tudo).
A troca de passo (e o fechamento do recorte) leva o foco ao título do passo, para o leitor
de tela. Contrato: `specs/004-fotos-produto/contracts/telas.md`.

```mermaid
graph TD
  A["Passo Fotos: lista + Escolher"] -->|"escolhe arquivo"| B["conferirArquivo (tipo, abre, tamanho)"]
  B -->|recusa| A
  B --> C["RecorteFoto (1:1)"]
  C -->|Cancelar| A
  C -->|"Usar esta foto"| D["useEnvioFotos.enviar"]
  D --> E["foto na lista: Enviando..."]
  E -->|"enviada"| A
  E -->|"nao enviada"| F["Nao enviada + Tentar de novo"]
  F --> E
  A -->|"Continuar (>= 1 foto, nenhuma pendente)"| G["Passo Dados: FormProduto"]
  G -->|"Salvar: campos fotos ocultos"| H["criarProduto"]
  H -->|"foto_expirada"| A
  H -->|ok| I["detalhe do produto"]
  G -->|"Voltar as fotos"| A
```

| Arquivo (em `src/app/painel/(protegido)/produtos/`) | Papel |
|---|---|
| `novo/cadastro-produto.tsx` | Orquestra os passos, o recorte e o `useEnvioFotos`. "Continuar" fica desabilitado sem foto enviada ou com alguma foto *enviando* / *não enviada*; com *não enviada*, mostra `CONTINUAR_COM_NAO_ENVIADA` ligado ao botão por `aria-describedby`. Com o recorte aberto, o passo mostra só título, aviso e recorte. |
| `novo/sugestao.tsx` | Hook `useSugestao` (pede a sugestão e guarda o estado) e `AvisoSugestao` (região viva). Ver "Sugestão por IA". |
| `novo/textos-sugestao.ts` | `ESPERANDO_SUGESTAO`, `MARCADOR_SUGESTAO` e o tipo `Sugestao`; sem dependências, para o form da edição não carregar a action (FR-034). |
| `_fotos/escolher-foto.tsx` | No celular (`(pointer: coarse)`): "Tirar foto" (`capture="environment"`) e "Escolher da galeria" separados; no computador: só "Escolher arquivo". Na hidratação vale o layout de computador. Com 3 fotos, botões desabilitados e o texto "Máximo de 3 fotos". |
| `_fotos/recorte-foto.tsx` | `react-easy-crop`: recorte 1:1, `restrictPosition` (a moldura não sai da imagem), zoom de 1 até `min(lado menor / 400, 4)` (aproximar mais deixaria o recorte abaixo de `LADO_MINIMO`), controle "Aproximar". "Usar esta foto" devolve a área em pixels da imagem original; nada é enviado aqui. |
| `_fotos/lista-fotos.tsx` | Lista vertical, uma foto por linha, capa = primeira (selo "Capa"). Reordena por **arrasto pela miniatura** (pointer events: captura do ponteiro, destino pelo centro vertical dos outros itens) ou pelos botões "Usar como capa", "Mover para cima", "Mover para baixo"; "Remover" sem confirmação por padrão (`confirmarRemocao` é ligado pela tela Fotos). Props opcionais da SF11: `onTrocar`, `podeRemover`, `desabilitado`. Mostra "Enviando…" e "Não enviada" (com "Tentar de novo" quando permitido). |
| `_fotos/usar-envio.ts` | Hook `useEnvioFotos` e `conferirArquivo`; ver abaixo. |
| `_fotos/tipos.ts` | `EstadoFoto` (`enviando`, `enviada` com `envioId`, `nao_enviada` com `mensagem` e `podeTentar`) e `FotoLocal`. |
| `form-produto.tsx` | Ganhou o modo `cadastro`: props `envioIds`, `envioEmCurso` e `onFotoExpirada`. |

**Envio de cada foto** (`useEnvioFotos`): `conferirArquivo` antes do recorte (tipo pelos
bytes, se o aparelho abre a imagem, lado mínimo; recusa vira aviso e a foto nem entra) →
recorte → `prepararFoto` → `pedirEnvio` → `PUT` direto na URL assinada com **tempo limite
de 60 s** (`TEMPO_LIMITE_ENVIO_MS`, aborta e deixa a foto *não enviada*) → `confirmarEnvio`.
Cada etapa só vale se a foto ainda existe, a tentativa é a mesma e a tela continua montada
(remover, "Tentar de novo" e sair da tela abortam o `PUT` em curso).

- **"Tentar de novo"** reaproveita o arquivo original e o recorte guardados em memória (não
  pede novo recorte). Depois da confirmação, só o blob já tratado fica (miniatura e reenvio).
- **Foto expirada** (envio com mais de 24 h ou invalidado): reenvia o **blob já tratado**,
  sem nova preparação, pedindo um `pedirEnvio` novo.
- **Recusas no aparelho** (`formato`, `nao_abre`, `pequena`, `grande`): a foto sai da
  lista e o motivo vira aviso. `nao_enviada` (falha inesperada) mantém a foto com "Tentar de novo".
- **`muitos_pendentes`**: sem "Tentar de novo"; a miniatura e a memória da foto são soltas e
  a mensagem ocupa o lugar. Para `nao_passou` repetido seguido, a mensagem muda
  (`mensagemFoto("nao_passou", { repetida })`).
- **Miniatura**: só existe a do blob **tratado** (nenhuma blob URL do arquivo original na
  lista); as blob URLs são revogadas ao remover e ao desmontar.
- **`pendentes`** = alguma foto que não está *enviada* (enviando ou não enviada): trava
  "Continuar" e "Salvar" (decisão D1 do contrato).

**Modo cadastro do `FormProduto`**: envia um campo oculto `fotos` por `envioId`, na ordem
da lista (sem nenhuma foto, **nenhum** campo; nunca `fotos=""`). "Salvar" fica desabilitado
com `envioEmCurso`. Se `criarProduto` devolver `foto_expirada`, o formulário avisa a tela
uma única vez por resultado (`onFotoExpirada(envioIds)`): as fotos citadas viram *não
enviada* com "Tentar de novo" e a tela volta ao passo Fotos. A mensagem de `foto_expirada`
no formulário some quando alguma das fotos expiradas já foi reenviada ou removida. O texto
(`src/lib/fotos/mensagens.ts` e `src/lib/produtos/mensagens.ts`) é "Uma das fotos ficou
muito tempo sem ser salva. Envie essa foto de novo." (T144; antes dizia "expirou").

### Tela Fotos do produto (`/painel/produtos/[id]/fotos`, SF11)

`page.tsx` (servidor: `requireAdminPage`, `obterProdutoDoPainel`; produto inexistente mostra
"Produto não encontrado" e "Voltar à lista") renderiza o client component
`gerenciar-fotos.tsx` com o `Conjunto` inicial (`fotosVersao` + `fotos`). Reaproveita
`EscolherFoto`, `RecorteFoto`, `ListaFotos` e o hook `useEnvioFotos` do cadastro.

| Ação | Como a tela chama |
|---|---|
| Adicionar | "Escolher" → `conferirArquivo` → recorte → `useEnvioFotos` (`pedirEnvio`, `PUT`, `confirmarEnvio`) → `adicionarFoto` com o `envioId` |
| Trocar | "Trocar foto" no item (mostra `PEDIDO_TROCA(n)`, foco no pedido) → mesmo caminho de envio → `trocarFoto` na posição |
| Mover | botões "Usar como capa" / "Mover para cima" / "Mover para baixo" ou arrasto → `moverFoto` |
| Remover | "Remover" com **confirmação** (`confirmarRemocao`, `CONFIRMAR_REMOCAO_FOTO`) → `removerFoto` |

- **Grava na hora, uma ação por vez**: `executar` liga `pendente` (e um `ref` síncrono) e
  trava todos os botões e o arrasto (`desabilitado` da `ListaFotos`) até a resposta;
  durante o envio/gravação aparece "Salvando…" (`SALVANDO`). A ação seguinte usa a
  `fotosVersao` devolvida pela anterior (US4-AC7).
- **Estado vem do servidor**: no sucesso a tela troca o estado por `{ fotosVersao, fotos }`
  da resposta; nas falhas com `atual` (`alterado`, `foto_expirada`, `limite`, `ultima`,
  `falha_geral` da regra) também, então a mudança de outra pessoa aparece com as fotos
  correntes. `nao_existe` (produto apagado por outra pessoa) mostra só o aviso e "Voltar à
  lista". Exceção em qualquer action vira `falha_geral`.
- **Com 1 foto**: sem "Remover" (`podeRemover={fotos.length > 1}`), com "Trocar foto" e o
  texto de `mensagemFoto("ultima")`. Com 3 fotos, `EscolherFoto` fica sem espaço ("Máximo
  de 3 fotos"); durante a troca recebe `quantidade={0}` para permitir a escolha.
- **Troca sem perder a antiga até o fim**: a foto antiga só sai quando `trocarFoto` dá
  certo; "Cancelar" (no pedido, no recorte ou na foto *não enviada*) descarta o envio sem
  tocar no conjunto.
- **Uma chamada por envio**: o `useEffect` que detecta a foto *enviada* marca a chave em
  `processada` para chamar `adicionarFoto`/`trocarFoto` uma única vez; depois remove a
  foto do hook.
- **`muitos_pendentes`**: `telaFotos` troca o texto do cadastro por
  `MUITOS_PENDENTES_TELA_FOTOS` ("Você enviou muitas fotos que não foram usadas. Tente de
  novo amanhã."), porque aqui cada ação já grava.
- **Foco**: ao pedir a foto nova o foco vai ao pedido; após cada ação, ao aviso.
- **Textos novos** (`src/lib/fotos/mensagens.ts`, aprovados na SF11): `PEDIDO_TROCA`,
  `SALVANDO`, `MUITOS_PENDENTES_TELA_FOTOS`; os de sucesso são os `SUCESSO_FOTO`.

**`ListaFotos`** ganhou props opcionais (o cadastro não muda): `onTrocar` (mostra "Trocar
foto"), `podeRemover` (padrão `true`) e `desabilitado` (trava botões e arrasto).
`EstadoFoto` ganhou `salva` (foto já gravada no produto; `previa` é a URL `/painel/fotos/<arquivo>`).

**Leitura do painel** (`src/lib/produtos/painel.ts`, T104a): `ItemLista.capaUrl` e
`DetalheProduto.fotos: FotoVista[]` + `fotosVersao`. As URLs são sempre
`/painel/fotos/<arquivo>` (rota com sessão), nunca a do bucket; chave fora do formato
(`arquivoDaChave` do barrel R2) é omitida em vez de virar imagem quebrada.

**Outras telas**: o detalhe `[id]` lista as fotos em ordem, capa primeiro (selo "Capa"), e
ganhou o botão "Fotos"; sem fotos (produto herdado da 003) mostra o quadro "sem foto". A
lista `produtos/` mostra a capa em miniatura 64×64 com `loading="lazy"`. A tela de remover
produto avisa "As fotos do produto também serão apagadas." (`AVISO_REMOCAO_PRODUTO`).

### Limpeza diária (SF12)

**Visão leiga**: fotos que foram enviadas mas nunca usadas (cadastro abandonado, troca ou
remoção em que o R2 estava fora) ficariam no armazenamento para sempre. Uma vez por dia, às
03:00 de Brasília, o sistema apaga essas fotos sem uso.

```mermaid
sequenceDiagram
  participant CF as Cron Trigger (0 6 * * * UTC)
  participant W as cloudflare/worker.ts (scheduled)
  participant R as POST /api/interno/limpeza
  participant L as executarLimpeza
  participant DB as Postgres
  participant R2 as R2 (fotos/)
  CF->>W: scheduled
  W->>R: Request em processo, Bearer CRON_SECRET
  R->>L: segredo confere (SHA-256, tempo fixo)
  L->>DB: expirarEnvios (lock 4001)
  L->>R2: apaga objetos dos envios expirados
  L->>R2: lista fotos/ e filtra com mais de 25 h
  L->>DB: chavesConhecidas (um statement)
  L->>R2: apaga órfãos em lotes de 1000
  R-->>W: 200 com contagens
  W-->>CF: lança erro se status diferente de 200
```

| Peça | Papel |
|---|---|
| `cloudflare/worker.ts` | Worker próprio. `fetch` é o do OpenNext; `scheduled` chama em processo `POST https://interno.invalid/api/interno/limpeza` (sem rede) com `Authorization: Bearer <CRON_SECRET>`, aguarda e **lança** se o status não for 200, para o cron aparecer como falha. |
| `cloudflare/open-next-worker.d.ts` | Declara o módulo `open-next-worker` (o `.open-next/worker.js` gerado). |
| `src/app/api/interno/limpeza/route.ts` | Só `POST` com o segredo (hash SHA-256 de ambos comparado em laço de tempo fixo). Segredo ausente ou errado, ou qualquer outro método: **404 sem corpo**, igual em todos os casos. Erro interno: 500 sem corpo, log sem mensagem. |
| `src/lib/fotos/limpeza.ts` | `executarLimpeza(agora)`: (a) `expirarEnvios` apaga as linhas de `fotos_envio` com 24 h ou mais sob o lock 4001 e remove os objetos; (b) lista `fotos/` no R2, separa os objetos com mais de 25 h e apaga os ausentes das duas tabelas (`chavesConhecidas`). Lotes de 1000; falha de um lote só soma em `falhas` e a próxima execução tenta de novo. Log só com contagens (`enviosExpirados`, `orfaosApagados`, `falhas`), nunca chave de objeto. |
| `src/lib/db/fotos.ts` | `expirarEnvios` (batch: lock + `DELETE ... RETURNING chave`) e `chavesConhecidas` (`produto_fotos` UNION ALL `fotos_envio` em **um** statement, mesmo snapshot). |
| `wrangler.jsonc` | `main` = `cloudflare/worker.ts`; `alias` `open-next-worker`; `triggers.crons` nos três ambientes. |

- **Por que 25 h**: 1 h além das 24 h de validade do envio, para cobrir diferença de relógio
  entre R2 e Postgres. As tabelas são lidas **depois** de listar o R2.
- **`CRON_SECRET`**: `.dev.vars` no local; `wrangler secret` no dev e em produção
  (cadastrados). Ver [operacao.md](../operacao.md#variáveis-de-ambiente).
- **Prova local** (feita, resposta 200):
  `npx opennextjs-cloudflare build && npx wrangler dev --test-scheduled`, e em outro terminal
  `curl "http://localhost:8787/cdn-cgi/handler/scheduled?cron=0+6+*+*+*"`.

### Sugestão por IA (SF13)

**Visão leiga.** No cadastro, ao tocar em "Continuar" no passo Fotos, o passo Dados abre na hora
e o sistema preenche nome, categoria e descrição a partir das fotos; cada campo preenchido
ganha o marcador "Sugestão — confira". Ela confere e edita; nada é salvo sozinho. Se a IA
falhar ou estiver pausada, o cadastro manual segue normalmente.

**Técnico.** `sugerirProduto({ envioIds })` em `src/lib/produtos/sugestao.ts` (`"use server"`)
devolve `{ ok: true, sugestao: { nome, categoriaId, descricao } }` (cada campo pode ser `null`)
ou `{ ok: false, motivo: "ia_indisponivel" | "ia_pausada", mensagem }`.

```mermaid
sequenceDiagram
  participant T as Tela (sugestao.tsx)
  participant A as sugerirProduto
  participant DB as Postgres
  participant R as R2
  participant O as OpenAI (Responses API)
  T->>A: envioIds (1 a 3)
  A->>A: requireAdminAction + Zod
  A->>DB: enviosValidos (confirmados, da própria pessoa, < 24 h)
  A->>DB: consumirSugestao (lock 4002, 30/pessoa, 100/dia)
  alt sem vaga
    A-->>T: ia_pausada
  end
  A->>R: lerObjeto (bytes, base64)
  A->>O: pedirSugestao (store false, schema estrito, 20 s)
  O-->>A: JSON
  A->>A: validarNome, validarDescricao, categoria existe?
  A-->>T: sugestão (nada gravado)
```

- **Ordem fixa**: guard, Zod, envios válidos, consumo da vaga **antes** da chamada, categorias
  (`listarCategorias`), bytes pelo binding, IA, validação campo a campo.
- **Resposta é entrada não confiável**: `nome` e `descricao` passam por `validarNome` e
  `validarDescricao` (agora exportados de `src/lib/produtos/validacao.ts`); o que reprova
  vira `null`; `categoriaId` fora das categorias vira `null`. Tudo `null` ⇒ `ia_indisponivel`.
- **Qualquer falha** (exceto o guard) vira `ia_indisponivel`, sem expor a causa; ela fica no
  log `ia.sugestao` (ver [operacao.md](../operacao.md#troubleshooting)).
- Módulo, constantes e fronteira em [architecture.md](../architecture.md#módulo-de-ia-feature-004-sf13).

**Tela (SF14).** Arquivos em `src/app/painel/(protegido)/produtos/novo/`:

| Arquivo | Papel |
|---|---|
| `sugestao.tsx` | `useSugestao`: estados `ocioso`, `esperando`, `pronta` e `falhou`; `pedirPrimeira` e `tentarDeNovo`. `AvisoSugestao`: texto de espera, mensagem de falha e o botão. |
| `textos-sugestao.ts` | Textos "Preenchendo a partir das fotos…" e "Sugestão — confira" e o tipo `Sugestao`. Sem imports: o `form-produto.tsx` (também usado na edição) importa só daqui. |
| `cadastro-produto.tsx` | Chama `pedirPrimeira(envioIds)` no "Continuar" e passa a sugestão `pronta` ao form. |
| `../form-produto.tsx` | Prop `sugestao`, só no modo cadastro; aplica os valores e controla o marcador. |

- **Uma vez por cadastro**: o pedido sai só no primeiro "Continuar" (estado `ocioso`); trocar
  as fotos depois não pede outra. Pedidos numerados: resposta de pedido antigo é ignorada.
- **Preenche só campo vazio**: os campos seguem não controlados; o valor é aplicado no DOM
  e o campo ganha o marcador (prop `dica`), que some ao editar. Categoria fora da lista de
  opções fica vazia. Preço, "a partir de" e status nunca são sugeridos.
- **Com "Salvar" em curso, espera**: a resposta do `Salvar` devolve o form aos valores
  enviados e apagaria o que fosse aplicado; a sugestão é aplicada quando o envio termina.
- **Falhas**: `ia_indisponivel` mostra a mensagem e "Tentar sugestão de novo" (o foco vai ao
  título "Dados do produto", pois o botão some); `ia_pausada` mostra a mensagem sem botão.
  Qualquer exceção na chamada vira `ia_indisponivel` com texto padrão.
- **Região viva** `role="status"` fica fora das seções `hidden`, montada desde o início: texto
  que entra dentro de seção oculta não seria anunciado. Fora do passo Dados, recebe o estado
  `ocioso`.
- **`dica`**: prop opcional de `CampoTexto`, `AreaTexto` e `Selecao` (`src/components/ui/`),
  um `<p>` abaixo do controle ligado por `aria-describedby` junto com o erro.

**Pegadinhas.** `MODELO` (`gpt-6-luna`) e `ESFORCO` (`none`) são provisórios; a escolha vem da
medição com fotos reais (`npm run test:ia`, T132) e vira emenda do ADR-010 (T133).
T120a (prova técnica do `gpt-5.4-mini`) está feita. T132 (medição, humano) e T133 (escolha de
modelo e esforço, aprovada pelo humano) são pendências de entrega: **produção sobe com o
`gpt-6-luna` e esforço `none`** (decisão de 2026-10-14, ADR-010 emendado), sem bloquear o
merge.
**CPU acima do Workers Free**: `sugerirProduto` mediu 21 ms de CPU no dev (T139); risco
aceito, ver [operacao.md](../operacao.md#limite-de-cpu-do-plano-gratuito-do-workers).
Cada objeto de sugestão é aplicado uma vez: campo que a pessoa esvaziou não é repreenchido.

### Arquivos

| Arquivo | Papel |
|---|---|
| `src/lib/produtos/sugestao.ts` | `sugerirProduto` (SF13); ver "Sugestão por IA". |
| `src/lib/ai/` | `config.ts`, `sugestao.ts` (`pedirSugestao`) e `index.ts` (barrel); ver "Módulo de IA" em [architecture.md](../architecture.md#módulo-de-ia-feature-004-sf13). |
| `src/lib/db/ia-uso.ts` | `consumirSugestao` (contador diário sob `LOCK_IA_USO`). |
| `src/test/conformance/ia-acesso.test.ts` | Fronteira da IA (AST, nega por padrão). |
| `src/lib/fotos/actions.ts` | `pedirEnvio`, `confirmarEnvio` e as do conjunto: `adicionarFoto`, `trocarFoto`, `removerFoto`, `moverFoto` (via `alterarConjunto`). |
| `src/lib/fotos/aparelho/` | Pipeline da foto no navegador (SF8): `detectar-tipo.ts`, `suporta-webp.ts`, `recortar.ts`, `codificar.ts`, `preparar-foto.ts` e o teste de fronteira; ver a seção acima. |
| `src/lib/fotos/conjunto.ts` | `aplicarAcao` (regra pura do conjunto), `MAXIMO_FOTOS`, tipos `AcaoConjunto` e `NovaFoto`. |
| `src/lib/fotos/tipos.ts` | `MotivoFoto`, `FotoVista`, `Conjunto`, `FalhaFoto`, `ResultadoFotos`; sem imports de runtime (seguro para o client). |
| `src/lib/fotos/mensagens.ts` | Textos pt-BR por motivo, avisos de sucesso e confirmação (inclui `CONTINUAR_COM_NAO_ENVIADA`, o texto do "Continuar" travado); sem imports de runtime. |
| `src/lib/fotos/erros.ts` | `falhaFoto` e o mapa motivo da verificação → motivo da tela. |
| `src/lib/fotos/validacao.ts` | `uuidEnvio` (normaliza para minúsculas) e `envioIdsCadastro` (1..3 distintos). |
| `src/lib/fotos/exibicao.ts` | `fotoExibivel` (`server-only`): a rota não importa `db/fotos` direto. |
| `src/lib/fotos/limpeza.ts` | `executarLimpeza` (SF12); ver "Limpeza diária". |
| `cloudflare/worker.ts` | Worker próprio com o `scheduled` da limpeza (SF12). |
| `src/lib/db/fotos.ts` | SQL: `emitirEnvio`, `obterEnvio`, `marcarConfirmado`, `descartarEnvio`, `enviosValidos`, `chaveExibivel`, `lerConjunto`, `substituirConjunto`; `expirarEnvios`, `chavesConhecidas` (SF12); `TETO_PENDENTES = 20`; `envioValido` (a regra `VALIDO`). |
| `src/lib/db/produtos.ts` | `inserirComFotos`, `remover` (devolve as chaves), `obterPorId` (traz `fotosVersao` e `fotos`) e `listar` (traz `capa`, a posição 1). |
| `src/lib/produtos/painel.ts` | Expõe à UI `capaUrl`, `fotos` e `fotosVersao` com URL pela rota com sessão (SF11). |
| `src/app/painel/(protegido)/produtos/novo/` e `_fotos/` | Telas do cadastro (SF9); ver "Telas do cadastro". |
| `src/app/painel/(protegido)/produtos/[id]/fotos/` | `page.tsx` e `gerenciar-fotos.tsx` (SF11); ver "Tela Fotos do produto". |
| `src/lib/r2/` | Módulo R2, ver [architecture.md](../architecture.md#módulo-r2-feature-004-sf2-sf3-e-sf6); `servirObjeto` foi acrescentado na SF6. |
| `src/test/db/fotos-fixtures.ts` | Infra de teste (não é produção). |
| `src/test/fixtures/fotos/aparelho/chrome-android-srgb.icc` | Perfil ICC real do Chrome Android (SF10), usado por `src/lib/r2/verificacao/aparelho.test.ts`. |

### Prova com aparelho real (SF10, R4)

Fonte: `specs/004-fotos-produto/research.md` (seção "R4"), `tasks.md` (SF10) e a emenda do
[ADR-009](../../specs/adr/009-fotos-r2.md) (Decisão 3).

**Chrome Android: aprovado** (Xiaomi Poco X7 Pro, 2026-10-11, dev em modo registro). Foram
3 fotos (1 tirada na hora, 2 da galeria com localização ligada). O `wrangler tail` mostrou
3 × `fotos.verificacao.registro` com resultado aceito e blocos `[VP8X, ICCP, VP8]`, nenhuma
recusa. Os 3 objetos no R2 são WebP 1200×1200 e o `exiftool -a -G1` não mostra IFD0, ExifIFD,
GPS, XMP nem IPTC.

- **Regra do ICC fechada**: o perfil do Chrome é o sRGB do Google ("sRGB", "Google Inc.
  2016", 456 bytes, 9 tags), aceito como está. Limite de 8 KB e as 13 tags permitidas
  mantidos; nenhum bloco novo. `vp8x_reservado` confirmado pelo arquivo real.
- **Fixture**: as fotos reais **não** entram no repositório (público). Entra só o perfil
  extraído, `src/test/fixtures/fotos/aparelho/chrome-android-srgb.icc` (`.gitattributes`
  marca `*.icc binary`), dentro de um WebP montado em `src/lib/r2/verificacao/aparelho.test.ts`.
  A verificação o aceita com a recusa ligada e recusa os controles (declarado como JPEG; tag
  fora da lista).
- **Modo registro**: ligado só durante a SF10 (`62c8b4b`, `FOTOS_VERIFICACAO` em `env.dev`) e
  desligado em `78d9052`. A conformidade `verificacao-modo.test.ts` voltou a negar a variável em
  qualquer lugar do `wrangler.jsonc` e do `.dev.vars.example`. O modo segue implementado e
  coberto por teste unitário. No dev, a foto do Chrome Android foi aceita e o `tail` do log de
  registro ficou vazio, confirmando a recusa ligada.
- **Migration `0002`**: aplicada no Neon dev no primeiro run do PR #19 (rascunho); está
  congelada.

**Riscos aceitos** (refazer a parte iOS da SF10 antes de liberar uma administradora com iPhone):

| Item | Situação |
|---|---|
| Safari iOS (sem WebP, logo JPEG; perfil Display P3) | Não provado em aparelho; só os testes unitários da SF8 |
| HEIF da galeria | Não testada; o cenário 7 da US2 está coberto pelos testes da SF8 |
| Apertos só de JPEG: APP14 "Adobe", `jfif_posicao`, `sof_precisao`, `sof_componentes` | Mantidos estritos, sem dado real |
| Apertos de ALPH: `alph_sem_flag`, `alph_com_vp8l` | Mantidos estritos, sem dado real (o Chrome não gerou alpha) |

### Concorrência e travas

`consumirSugestao` também roda sob lock (`LOCK_IA_USO` = 4002), para os limites da IA serem exatos.
Os writers que tocam fotos são `db.batch` sob `LOCK_FOTOS` (4001), a emenda de
2026-10-09 do ADR-008: `inserirComFotos`, `remover` e `substituirConjunto`. Emitir,
confirmar e descartar envio são um statement cada, fora do lock. Todo array vai como
**um** parâmetro (`${sql.param(ids)}::uuid[]`). `substituirConjunto`/`lerConjunto`
(conjunto de fotos de um produto, com `fotos_versao` própria, sem tocar `versao`)
são chamados pelas actions do conjunto (SF7). Detalhes do schema em
[database.md](../database.md#tabela-fotos_envio).

### Fronteira de acesso e guards

- **ESLint** (`eslint.config.mjs`, `proibirSubmoduloR2`): proíbe importar
  `@/lib/r2/*` (submódulos) fora de `src/lib/r2/`; só o barrel `@/lib/r2`, que tem
  `server-only`. Vale em `src/app`, `src/lib/categorias`, `src/lib/db` etc.
- **`src/test/conformance/fotos-acesso.test.ts`**: AST, nega por padrão; confere as regras
  de import do contrato §1 (R2 só em áreas autorizadas, submódulo de R2 fora de
  `src/lib/r2/`, `db/fotos` só em `fotos/`, `produtos/` e `db/`, aparelho sem
  `server-only`/db/r2/auth, `aws4fetch` só no R2) e a regra 6: `INSERT` em `produtos` só
  dentro de `inserirComFotos`.
- **`src/test/conformance/fotos-rota-guard.test.ts`**: prova a ordem da rota (sessão
  antes do R2, regex antes do binding).
- **`painel-guard.test.ts`**: a rota de imagem é a exceção nomeada
  `GUARDA_POR_SESSAO` (`src/app/painel/fotos/[arquivo]/route.ts#GET`): exige
  `getAdminSession` em vez de `requireAdminAction`, porque sem sessão responde 404 e
  não lança.

### Pegadinhas

- **`react-easy-crop` fixada em `6.2.3`** (versão exata, dependência de runtime): entrou
  pelo gesto de pinça, arriscado de fazer à mão; não substitui nada da stack. Bump só
  deliberado.
- **Nada sobrevive a recarregar a página**: as fotos enviadas e não usadas ficam como
  `confirmado` em `fotos_envio` até a limpeza diária (SF12) apagá-las, depois de 24 h.
- **Safari iOS e HEIF não provados em aparelho real**: risco aceito da SF10 (ver
  "Prova com aparelho real"). Antes de liberar uma administradora com iPhone, refazer a
  parte iOS da SF10.
- **Fotos não passam pela edição de dados**: `[id]/editar` não mexe nas fotos; elas só
  mudam na tela `[id]/fotos`, com `fotosVersao` própria.
- **Fotos pelo `<img>` simples** (`@next/next/no-img-element` desligado com comentário):
  a rota exige sessão e não há otimização de imagem; a miniatura da lista usa
  `loading="lazy"`.
- **Concorrência entre pessoas**: se outra pessoa mudar o conjunto, a ação seguinte falha
  com `alterado` e a tela passa a mostrar as fotos atuais (sem refazer a ação sozinha).
- **`pedirEnvio` valida a config do R2 antes de gravar**: sem
  `R2_ACCESS_KEY_ID`/`R2_SECRET_ACCESS_KEY`/`R2_S3_ENDPOINT` a resposta é
  `falha_geral` e nenhuma linha `emitido` é criada.
- **Teto de pendentes é aproximado** sob concorrência da mesma pessoa (comentário em
  `TETO_PENDENTES`).
- **`foto_expirada` por 24 h**: o envio só vale se `confirmado` e com menos de 24 h; o
  id é normalizado para minúsculas (o Postgres devolve assim).
- **Objetos órfãos** (recusa que não apagou o objeto, troca/remoção de foto ou de produto com R2
  fora) são recolhidos pela limpeza diária (SF12), com atraso de até cerca de um dia.
- **T118b pendente**: o cron ainda não foi provado no `roseshop-dev` (deploy do CI do PR #19).
  No plano gratuito os logs do cron não ficam guardados: a execução de 2026-10-15 06:00 UTC
  (03:00 de Brasília) é capturada por `wrangler tail --env dev`; o merge (T150) só depois
  (ver [operacao.md, Troubleshooting](../operacao.md#troubleshooting)).
- **Produção configurada antes do merge (T148, 2026-10-14)**: chaves do R2, `CRON_SECRET` e
  CORS do `roseshop-prod`, projeto OpenAI de produção separado. Falta a prova de ponta a ponta
  das chaves do R2: um cadastro com foto em produção, no roteiro do merge (T150).
- **"Tirar do destaque"** (texto da 003) foi mantido; ponto a observar na entrega com a
  administradora (T143).
- **Cron declarado nos três ambientes**: deploy sem `triggers.crons` não remove o cron já
  publicado; `src/test/conformance/worker-typecheck.test.ts` barra qualquer outro valor. A rota é exceção declarada em `painel-guard.test.ts` (protegida por segredo, não por sessão).
- **Durable Objects do OpenNext**: não reexportados pelo worker próprio (não há `durable_objects`).
- **Validação no runtime real (SF9, T093, 2026-10-11, quickstart §4)**: roteiro pela tela no
  `preview`. O `PUT` em `/cdn-cgi/local/r2/s3/roseshop-local/fotos/<uuid>.webp` respondeu 200
  com a foto tratada em WebP de ~20 KB; objetos de produtos removidos somem do R2 local; a
  rota da foto em janela anônima dá 404; o `If-None-Match` dá **304** tanto com ETag forte
  quanto com a fraca `W/"…"` (o R2 local usa comparação fraca).
- **Valide no `preview`**: o binding do R2 e o endpoint S3 local só existem no
  worker, nunca no `next dev`.
