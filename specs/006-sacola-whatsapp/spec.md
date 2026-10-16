# Feature Specification: Sacola e pedido pelo WhatsApp

**Feature Branch**: `feature/006-sacola-whatsapp`

**Created**: 2026-10-16

**Status**: Draft

**Input**: User description: "Feature 006 — Sacola + pedido pelo WhatsApp (catálogo público Roseshop). A cliente monta uma sacola com vários produtos e envia UM pedido pelo WhatsApp. Nenhum dado de pedido é gravado no servidor." (descrição completa, com comportamento, fora do escopo, critérios de sucesso e restrições, registrada na conversa de abertura desta spec)

## Clarifications

### Session 2026-10-16

- Correção do humano: onde a descrição diz "ids", leia "códigos de referência"
  (formato da 003). Sacola, consulta de conferência e mensagem usam só o código.
- Q: O pior caso descrito (15 itens, nomes de 40 caracteres acentuados, observação
  de 200) não cabe em 1800 caracteres. Como garantir o limite? → A: A mensagem se
  ajusta para caber. O orçamento de 1800 é medido sobre o endereço inteiro, em
  caracteres já codificados. Os nomes são cortados por caractere inteiro (code
  point) antes de codificar e encolhem primeiro, até sobrar só o código. A
  observação nunca é cortada em silêncio: é limitada por um contador do orçamento
  que resta. Teste do pior caso com acentos, emoji e observação cheia.
- Q: O que conta como toque no SC-001? → A: Só os toques da sacola (3 "Adicionar",
  abrir a sacola, enviar). A navegação entre produtos fica fora do critério porque
  adicionar pela lista é escopo futuro.
- Q: Com o que comparar para avisar "preço alterado"? → A: A sacola guarda também o
  preço visto ao adicionar (centavos) e a marcação "a partir de". O preço guardado
  só dispara o aviso; nunca entra na mensagem nem no subtotal.
- Decisão do humano: no primeiro commit da 006, marcar T091–T097 da 005; T090 e
  T098 ficam abertas com a nota "adiada para a entrega final".
- Q: A conferência recebe os códigos por GET (no endereço) ou POST (no corpo)? →
  A: POST com corpo JSON (os códigos nunca vão ao endereço nem aos logs da
  plataforma). Resposta com um item por código pedido, estado `ok`, `esgotado` ou
  `inexistente`. Exige `Content-Type: application/json` e corpo de até 1 KB,
  recusado antes de ler o corpo. Nunca registra o corpo em log nem ecoa códigos,
  nem em erro. Uma única consulta ao banco para todos os códigos. A rota não
  depende de cookie de sessão.
- Q: Sem JavaScript (ou antes de hidratar), o que aparece no lugar do botão, do
  contador e da `/sacola`? → A: O servidor não gera o botão da sacola nem o
  contador; os dois aparecem só depois de hidratar, num espaço reservado (sem a
  tela pular). Vale o mesmo quando o acesso ao armazenamento do navegador lança
  erro (ex.: modo privado): botão e contador não aparecem, o detalhe segue só com
  "Perguntar no WhatsApp", sem mensagem de erro. `/sacola` sem JS: "Ative o
  JavaScript para usar a sacola" com link ao catálogo, sem indexação. O SC-005
  compara o HTML do servidor do detalhe e do cabeçalho com o da 005, exceto o
  espaço reservado.
- Q: Na `/sacola`, com o número do WhatsApp ausente ou inválido, o envio some ou
  fica desabilitado com explicação? → A: Fica desabilitado (marcado como
  desabilitado para leitor de tela e ligado ao texto que explica), sem link e sem
  montar o endereço, com o texto "O envio pelo WhatsApp está indisponível no
  momento. Tente mais tarde." O resto da sacola funciona. A falha é registrada uma
  vez por carregamento do servidor, sem o valor configurado. Validação E.164 da
  005; a mensagem nunca é montada com número inválido.
- Q: Com duas abas alterando a sacola, a última grava a sacola inteira ou cada
  alteração relê e aplica só a sua mudança? → A: Por operação. Toda alteração
  (adicionar, quantidade, remover, limpar, aplicar o resultado da conferência)
  relê o armazenamento logo antes de gravar e aplica só a própria operação sobre a
  sacola relida e validada; os limites (15 produtos, 1 a 10) são conferidos no
  resultado. A conferência altera só os códigos que cobriu. O aviso de mudança de
  outra aba só atualiza a tela, nunca regrava. Teste com duas abas intercaladas:
  as duas adições sobrevivem. Atomicidade estrita fica fora de escopo.
- Q: Como a observação é normalizada e em que unidade contam os 200 caracteres?
  → A: Uma única regra de normalização, usada pelo contador, pelo campo e pela
  mensagem: quebras CRLF viram LF, forma NFC, sem caracteres de controle (exceto
  LF) nem invisíveis de direção ou largura zero, preservando o junção de emoji
  (U+200D) e os seletores de variação (U+FE0E/U+FE0F); sem espaços nas pontas; 3
  ou mais quebras seguidas viram 2. Os 200 contam em caracteres inteiros (code
  points). O limite é o menor entre o que resta dos 200 e o que resta do
  orçamento codificado (FR-016). Vai ao final, depois do rótulo "Observação:";
  vazia depois de normalizar, a linha não aparece. **Atualização do humano
  (2026-10-16, tasks)**: a tela mostra "N de 200" enquanto o teto de 200 é o
  menor e, quando o orçamento do endereço passa a ser o menor, "Espaço da
  mensagem quase cheio" com barra de progresso, sem expor a conta codificada; o
  campo não passa do limite; a troca de modo é anunciada ao leitor de tela uma
  vez, na transição.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Adicionar produtos à sacola pelo detalhe (Priority: P1)

A cliente abre o detalhe de um produto disponível e toca em "Adicionar à sacola".
O botão passa a indicar "Na sacola" e o contador da sacola, no cabeçalho, aumenta.
Ela volta ao catálogo, abre outro produto e repete. "Perguntar no WhatsApp"
continua no detalhe, como ação secundária, para quem quer perguntar por um único
produto.

**Why this priority**: sem adicionar não existe sacola; é a base de todo o resto.

**Independent Test**: sem sessão, abrir o detalhe de dois produtos disponíveis,
adicionar cada um e conferir o botão "Na sacola" e o contador; abrir um esgotado e
conferir que não há nenhum dos dois botões.

**Acceptance Scenarios**:

1. **Given** o detalhe de um produto disponível que não está na sacola, **When** a
   página abre, **Then** "Adicionar à sacola" é a ação principal e "Perguntar no
   WhatsApp" aparece como ação secundária.
2. **Given** a sacola com 1 produto, **When** a cliente toca em "Adicionar à
   sacola" no detalhe de outro produto, **Then** o produto entra com quantidade 1,
   o botão passa a indicar "Na sacola" e o contador do cabeçalho mostra 2, sem
   recarregar a página.
3. **Given** um produto que já está na sacola, **When** o detalhe dele abre (agora
   ou depois de recarregar), **Then** o botão já indica "Na sacola" e tocá-lo não
   aumenta a quantidade; ele leva à sacola.
4. **Given** um produto "Esgotado", **When** o detalhe abre, **Then** nem
   "Adicionar à sacola" nem "Perguntar no WhatsApp" são oferecidos.
5. **Given** a sacola com 15 produtos diferentes, **When** a cliente abre o
   detalhe de um 16º produto, **Then** "Adicionar à sacola" aparece desabilitado,
   com uma explicação em texto de que a sacola chegou ao limite de 15 produtos.
6. **Given** o detalhe aberto em duas abas do mesmo navegador, **When** a cliente
   adiciona o produto numa aba, **Then** a outra aba passa a mostrar "Na sacola" e
   o contador atualizado sem precisar recarregar.
7. **Given** o contador do cabeçalho, **When** lido por leitor de tela, **Then**
   anuncia a quantidade em texto (ex.: "Sacola, 2 produtos") e leva à sacola.

---

### User Story 2 - Revisar a sacola e enviar o pedido pelo WhatsApp (Priority: P1)

A cliente toca no contador e abre a sacola. Vê cada produto com nome, código,
preço e quantidade, ajusta quantidades, remove o que não quer, escreve uma
observação opcional e toca em "Enviar pedido pelo WhatsApp". O WhatsApp abre na
conversa com a vendedora, com uma mensagem compacta já escrita: uma linha por
produto e o subtotal. Na volta, a sacola continua montada e a tela oferece
"Limpar sacola" ou "Voltar".

**Why this priority**: é a conversão da loja: um pedido com vários produtos numa
mensagem só, no lugar de uma pergunta por produto.

**Independent Test**: no dev, num celular Android, montar uma sacola com 3
produtos (um com preço, um "a partir de", um sem preço), enviar e conferir a
mensagem que chega ao WhatsApp e a tela de confirmação na volta.

**Acceptance Scenarios**:

1. **Given** a sacola com 2 produtos, **When** a cliente abre a sacola, **Then** vê
   cada produto com nome, código "#0042", preço unitário no formato da 005,
   quantidade e valor da linha, e o subtotal.
2. **Given** um produto com quantidade 1, **When** a cliente aumenta a quantidade,
   **Then** o valor da linha e o subtotal atualizam; em 10 o aumento fica
   desabilitado; em 1 a diminuição fica desabilitada (para tirar, usa "Remover").
3. **Given** a sacola com produtos, **When** a cliente toca em "Remover" num item,
   **Then** ele sai da sacola, o subtotal e o contador atualizam.
4. **Given** a sacola com produtos, **When** a cliente toca em "Limpar sacola",
   **Then** o sistema pede confirmação dizendo que todos os produtos vão sair; ao
   confirmar, a sacola fica vazia.
5. **Given** "2x" de um produto de R$ 6,00 e "1x" de um "a partir de R$ 10,00",
   **When** a sacola e a mensagem são montadas, **Then** o subtotal é "a partir de
   R$ 22,00".
6. **Given** a sacola com 2 produtos com preço e 1 sem preço, **When** a sacola e a
   mensagem são montadas, **Then** o item sem preço mostra "Consulte o valor", o
   subtotal soma só os 2 com preço e aparece a linha "+ 1 item a consultar"
   (plural: "+ 2 itens a consultar").
7. **Given** uma sacola pronta, **When** a cliente toca em "Enviar pedido pelo
   WhatsApp", **Then** o WhatsApp abre na conversa com o número configurado no
   ambiente, com a mensagem pronta: cabeçalho curto, uma linha por produto no
   formato "2x Nome (#0042) — R$ 12,00", o subtotal e, se escrita, a observação;
   sem link por produto e sem nome da cliente.
8. **Given** a cliente escreveu uma observação, **When** a mensagem é montada,
   **Then** a observação vai ao final, depois do rótulo "Observação:", com o texto
   normalizado (FR-015a) e as quebras de linha preservadas; a observação nunca é
   guardada (ao recarregar a sacola, o campo está vazio). **Given** uma observação
   com quebras de linha e texto no formato de uma linha de produto, **Then** as
   linhas antes do rótulo ficam iguais às de uma mensagem sem observação.
   **Given** uma observação só com espaços ou caracteres removidos, **Then** a
   linha "Observação:" não aparece.
9. **Given** o pedido enviado, **When** a cliente volta do WhatsApp para a sacola,
   **Then** a sacola continua com os mesmos produtos e a tela mostra a confirmação
   de que o pedido foi aberto no WhatsApp, com "Limpar sacola" e "Voltar".
10. **Given** um nome com acento, "&", "#", "?", "+" ou emoji, **When** a mensagem é
    montada, **Then** chega ao WhatsApp sem caracteres trocados (cortado só pela
    regra de tamanho, FR-016).
11. **Given** a sacola vazia, **When** a cliente abre a sacola, **Then** vê uma
    mensagem simples de sacola vazia com caminho de volta ao catálogo, e o envio
    não é oferecido.
12. **Given** o número do WhatsApp do ambiente ausente ou inválido, **When** a
    sacola abre, **Then** "Enviar pedido pelo WhatsApp" aparece desabilitado, sem
    link para o WhatsApp, com o texto "O envio pelo WhatsApp está indisponível no
    momento. Tente mais tarde." ligado ao botão para o leitor de tela; a mensagem
    não é montada; o resto da sacola funciona; e a falha fica registrada para o
    mantenedor sem o valor configurado.
13. **Given** uma sacola com 15 produtos de nomes longos, **When** a cliente
    escreve a observação, **Then** o campo mostra "N de 200" enquanto o teto de 200
    é o limite e, quando o espaço da mensagem passa a ser o limite, "Espaço da
    mensagem quase cheio" com uma barra, e não aceita passar disso; os nomes na mensagem encolhem antes de a observação perder
    espaço; **Given** que a sacola cresce depois e o texto já escrito deixa de
    caber, **Then** o excesso aparece, o envio fica desabilitado e nada é cortado
    sozinho.

---

### User Story 3 - Sacola sempre conferida com o catálogo atual (Priority: P1)

Ao abrir a sacola, o sistema confere cada produto com o catálogo naquele momento.
Produto que esgotou fica marcado e não entra no total nem na mensagem; produto
que foi removido sai sozinho, com aviso; produto cujo preço mudou passa a usar o
preço atual, com aviso. A mensagem enviada nunca leva dado desatualizado.

**Why this priority**: sem a conferência, a cliente pediria produto esgotado ou
com preço velho, e a Rose teria de corrigir pedido por pedido.

**Independent Test**: montar uma sacola com 4 produtos; no painel, esgotar um,
remover outro e mudar o preço de um terceiro; abrir a sacola e conferir as
marcações, os avisos, o subtotal e a mensagem.

**Acceptance Scenarios**:

1. **Given** um produto da sacola que foi marcado "Esgotado" no painel, **When** a
   sacola abre, **Then** ele aparece marcado "Esgotado" (em texto), fora do
   subtotal e da mensagem, sem controle de quantidade, com "Remover".
2. **Given** um produto da sacola esgotado, **When** ele volta a ficar disponível
   antes da sacola ser aberta de novo, **Then** volta ao subtotal e à mensagem com a
   quantidade que tinha.
3. **Given** um produto da sacola que foi removido do catálogo (ou um código que
   não existe), **When** a sacola abre, **Then** ele sai da sacola sozinho e um aviso
   diz que o produto "#0042" não está mais no catálogo.
4. **Given** um produto da sacola cujo preço mudou (ou ganhou ou perdeu "a partir
   de", ou passou a não ter preço) desde que entrou na sacola, **When** a sacola
   abre, **Then** ele usa o preço atual e um aviso junto do item diz que o preço
   mudou; o preço visto antes nunca aparece no subtotal nem na mensagem, e passa a
   ser o preço atual (o aviso não se repete na próxima abertura sem nova mudança).
5. **Given** a sacola aberta há algum tempo, **When** a cliente toca em "Enviar
   pedido pelo WhatsApp", **Then** o sistema confere a sacola de novo; se nada
   mudou, o WhatsApp abre; se algo mudou (esgotou, saiu, preço), a tela é
   atualizada com os avisos, o WhatsApp não abre e a cliente envia de novo depois de
   conferir.
6. **Given** todos os produtos da sacola esgotados, **When** a sacola abre, **Then**
   o envio fica desabilitado com explicação em texto.
7. **Given** o catálogo indisponível (banco fora, sem rede, sem resposta em 4 s
   ou resposta de erro), **When** a sacola abre, **Then** aparece uma mensagem
   simples de que não foi possível conferir a sacola agora, com "Tentar de novo".
   **When** o envio é tocado, **Then** o envio é bloqueado com "Não consegui
   conferir agora, tente de novo.", a lista conferida continua na tela e o próprio
   botão de envio é a nova tentativa. Nos dois casos o WhatsApp não abre e a sacola
   guardada não é alterada.
8. **Given** a conferência, **When** a resposta é inspecionada, **Then** contém só os
   dados públicos da 005 (código, nome, preço, "a partir de", disponível ou
   esgotado, capa), nunca campo interno, e não fica guardada em cache.

---

### User Story 4 - Sacola guardada no aparelho (Priority: P2)

A cliente fecha o navegador e volta no dia seguinte: a sacola continua lá. Depois
de 7 dias sem mexer, a sacola é descartada. Nada fica no servidor e nada exige
login.

**Why this priority**: a cliente costuma montar o pedido aos poucos, entre outras
conversas; mas a sacola já é útil dentro de uma única visita.

**Independent Test**: montar a sacola, fechar e reabrir o navegador e conferir;
simular dado com 8 dias, dado corrompido e dado de formato antigo e conferir que
a sacola abre vazia, sem erro.

**Acceptance Scenarios**:

1. **Given** uma sacola com 2 produtos, **When** a cliente fecha o navegador e o
   abre de novo no mesmo aparelho, **Then** a sacola e o contador continuam com os 2
   produtos e as quantidades.
2. **Given** uma sacola alterada pela última vez há mais de 7 dias, **When** o
   catálogo abre, **Then** a sacola está vazia, sem mensagem de erro.
3. **Given** um dado da sacola corrompido, de formato antigo, com quantidade fora
   de 1 a 10, código inválido ou mais de 15 produtos, **When** o catálogo abre,
   **Then** a sacola está vazia, sem erro e sem quebrar a página.
4. **Given** o navegador sem armazenamento disponível (o acesso lança erro, ex.:
   modo privado restrito), **When** o detalhe abre, **Then** nem "Adicionar à
   sacola" nem o contador aparecem, o detalhe segue só com "Perguntar no
   WhatsApp", sem mensagem de erro, e o resto do catálogo não é afetado.
5. **Given** a sacola guardada, **When** o que fica no aparelho é inspecionado,
   **Then** só há, por produto, o código de referência, a quantidade, o preço visto
   (centavos) e a marcação "a partir de", além do necessário para a validade e o
   formato; nenhum dado pessoal, nome ou observação.
6. **Given** o navegador sem JavaScript, **When** o detalhe abre, **Then** o HTML
   é o da 005 (só "Perguntar no WhatsApp", sem botão da sacola nem contador, com o
   espaço reservado); **When** `/sacola` abre, **Then** aparece só "Ative o
   JavaScript para usar a sacola" com link ao catálogo.

---

### Edge Cases

- **Produto adicionado esgota antes da cliente abrir a sacola**: entra marcado como
  esgotado (US3.1); o detalhe, se reaberto, já não oferece os botões.
- **Produto removido e código nunca reaproveitado**: o código de um produto
  removido nunca passa a apontar para outro produto (regra da 003), então um
  item velho não vira outro produto.
- **Duas abas alterando a sacola ao mesmo tempo**: cada alteração relê a sacola
  guardada e aplica só a própria operação (FR-008a), então adições de produtos
  diferentes em abas diferentes sobrevivem; no mesmo produto vale a última
  operação; as duas abas passam a mostrar o mesmo conteúdo. Um "Adicionar" que,
  sobre a sacola relida, passaria de 15 é recusado com a explicação do limite.
- **Sacola aberta numa aba enquanto outra adiciona um produto**: a sacola aberta
  passa a mostrar o novo produto, já conferido com o catálogo.
- **Limite de 15 com produtos esgotados na sacola**: o esgotado ainda conta para o
  limite até ser removido; a explicação do limite sugere remover algum.
- **Observação no limite**: o campo não aceita mais que o permitido (200
  caracteres ou o que resta do orçamento, o que for menor) e mostra "N de 200" ou,
  quando o orçamento é o limite, "Espaço da mensagem quase cheio" com barra, sem
  a conta codificada; nada do que a cliente escreveu é cortado sem ela ver.
- **Sacola grande com observação longa**: os nomes na mensagem encolhem para dar
  espaço; com os nomes já reduzidos ao código, o espaço da observação diminui e a
  tela troca "N de 200" por "Espaço da mensagem quase cheio" com barra.
- **Cliente aumenta a sacola depois de escrever a observação**: se o texto já
  escrito não couber mais, a tela avisa que a observação não cabe mais na mensagem
  e o envio fica desabilitado até ela encurtar; o texto nunca é cortado sozinho.
- **Mensagem perto do limite de tamanho**: nunca passa do limite (FR-016).
- **Cliente sem WhatsApp instalado**: o link abre a página do WhatsApp na web
  (comportamento do WhatsApp, igual à 005).
- **Volta do WhatsApp sem enviar**: a sacola está intacta; a confirmação diz que o
  pedido foi aberto no WhatsApp, não que foi enviado.
- **Preço alto e soma grande**: subtotal no formato brasileiro (R$ 1.234,56), em
  centavos inteiros, sem arredondamento.
- **Armazenamento bloqueado (modo privado)**: botão e contador não aparecem; o
  detalhe segue só com "Perguntar no WhatsApp", sem erro (FR-002a).
- **Sessão de administradora no mesmo navegador**: a sacola funciona igual à de
  qualquer cliente.
- **Abrir a sacola por link copiado em outro aparelho**: mostra a sacola daquele
  aparelho (a sacola não viaja no endereço).

## Requirements *(mandatory)*

### Functional Requirements

**Adicionar**

- **FR-001**: O detalhe de um produto disponível MUST oferecer "Adicionar à
  sacola" como ação principal e manter "Perguntar no WhatsApp" (005, FR-018) como
  ação secundária. Produto esgotado MUST NOT oferecer nenhuma das duas.
- **FR-002**: Adicionar MUST colocar o produto com quantidade 1, sem recarregar a
  página; produto já na sacola MUST aparecer como "Na sacola", e tocar nele leva à
  sacola sem alterar a quantidade.
- **FR-002a**: O botão da sacola e o contador do cabeçalho MUST NOT ser gerados
  pelo servidor: aparecem só depois de a página ficar interativa e de o
  armazenamento do navegador ser lido com sucesso, num espaço reservado que não
  desloca o conteúdo. Sem JavaScript, ou se o acesso ao armazenamento lançar erro,
  o detalhe MUST seguir como na 005 (só "Perguntar no WhatsApp"), sem mensagem de
  erro.
- **FR-003**: A sacola MUST aceitar no máximo 15 produtos diferentes. Com 15, o
  "Adicionar à sacola" de um produto que não está na sacola MUST ficar
  desabilitado com explicação em texto.
- **FR-004**: Todas as páginas públicas MUST ter, no cabeçalho, o acesso à sacola
  com o contador de produtos, identificável por texto (FR-022 e FR-023 da 005).

**Quantidade e edição**

- **FR-005**: Cada produto da sacola MUST ter quantidade inteira de 1 a 10; os
  controles de quantidade MUST respeitar os limites. A sacola MUST permitir remover
  um produto e limpar tudo; limpar MUST pedir confirmação com texto claro.

**Persistência no aparelho**

- **FR-006**: A sacola MUST ficar guardada só no aparelho, sem login e sem nada
  gravado no servidor, contendo por produto só o código de referência (formato da
  003, nunca o identificador interno, FR-002 da 005), a quantidade, o preço visto
  ao adicionar (centavos inteiros, ou ausência de preço) e a marcação "a partir
  de", além do necessário para validade e formato. MUST NOT guardar nome do
  produto, nome da cliente, observação nem outro dado pessoal. O preço guardado
  serve só para o aviso de preço alterado (FR-011).
- **FR-007**: A sacola MUST valer por 7 dias desde a última alteração. Sacola
  vencida, ausente, corrompida, de formato antigo ou com valores fora das regras
  (FR-003, FR-005) MUST ser tratada como vazia, sem erro visível.
- **FR-008**: Alterações na sacola MUST aparecer nas outras abas abertas do mesmo
  navegador, sem recarregar. Sem armazenamento disponível no navegador (o acesso
  lança erro), a sacola MUST NOT ser oferecida (FR-002a).
- **FR-008a**: Toda alteração (adicionar, mudar quantidade, remover, limpar,
  aplicar o resultado da conferência) MUST reler a sacola guardada imediatamente
  antes de gravar e aplicar só a própria operação sobre a sacola relida e validada
  (FR-007); os limites (FR-003, FR-005) MUST ser conferidos sobre o resultado. O
  resultado da conferência MUST alterar só os produtos que ela cobriu. O aviso de
  mudança vindo de outra aba MUST só atualizar a tela, nunca gravar. Atomicidade
  estrita entre abas fica fora de escopo.

**Página da sacola**

- **FR-009**: A página da sacola MUST listar cada produto com nome, código
  "#0042", foto de capa (ou o marcador "sem foto"), preço unitário (FR-012 da 005),
  quantidade, valor da linha e as ações de quantidade e "Remover"; MUST mostrar o
  subtotal (FR-012 desta spec), a observação opcional, "Limpar sacola" e "Enviar
  pedido pelo WhatsApp". Sacola vazia MUST mostrar mensagem simples com caminho ao
  catálogo, sem envio. Sem JavaScript, a página MUST mostrar só "Ative o
  JavaScript para usar a sacola" com link ao catálogo.
- **FR-010**: A página da sacola MUST pedir aos buscadores que não a indexem nem
  sigam seus links (FR-004 da 005).

**Conferência com o catálogo**

- **FR-011**: Ao abrir a sacola e ao tocar em enviar, o sistema MUST conferir os
  produtos com o catálogo atual por uma consulta pública, somente leitura e sem
  cache, que recebe só códigos de produto. Resultado por produto:
  - esgotado: marcado "Esgotado", fora do subtotal e da mensagem, com "Remover";
    volta a contar se ficar disponível;
  - removido ou inexistente: sai da sacola sozinho, com aviso que cita o código;
  - preço alterado (o atual difere do guardado em valor, "a partir de" ou
    ausência de preço): usa o preço atual, com aviso junto do item, e o guardado
    passa a ser o atual. O preço guardado MUST NOT entrar no subtotal nem na
    mensagem.
  Se a conferência ao enviar encontrar mudança, o WhatsApp MUST NOT abrir e a tela
  MUST mostrar os avisos. A conferência falha quando não há resposta em 4 s, há erro
  de rede ou a resposta é 400, 5xx ou fora do formato. Falha ao abrir: a sacola
  MUST mostrar que não foi possível conferir agora, com "Tentar de novo". Falha ao
  enviar: o envio MUST ser bloqueado com "Não consegui conferir agora, tente de
  novo.", a lista conferida MUST continuar na tela e o botão de envio MUST
  continuar ativo como a nova tentativa. Em qualquer falha, o WhatsApp MUST NOT
  abrir com dados não conferidos e a sacola guardada MUST NOT ser alterada.
- **FR-012** (total): O subtotal MUST ser a soma, em centavos inteiros, de
  quantidade × preço dos produtos disponíveis com preço. Se algum desses for "a
  partir de", o subtotal MUST vir com "a partir de" antes do valor. Produto sem
  preço MUST mostrar "Consulte o valor" e MUST gerar a linha "+ N item a
  consultar" / "+ N itens a consultar" (N = produtos sem preço). Sem nenhum produto
  com preço, o subtotal MUST ser "Consulte o valor".
- **FR-013**: A consulta de conferência MUST receber os códigos no corpo do pedido
  (POST, JSON), nunca no endereço. MUST recusar, antes de ler o corpo, pedido sem
  tipo JSON declarado ou com corpo acima de 1 KB. MUST validar a entrada (de 1 a 15
  códigos inteiros válidos, sem repetição) e recusar qualquer outra, sem detalhar o
  motivo. MUST responder com um item por código pedido, cada um com o estado `ok`
  (disponível, com os dados públicos), `esgotado` (com os dados públicos) ou
  `inexistente` (sem dados). MUST responder sem cache, MUST expor só os dados
  públicos da 005, MUST NOT depender de sessão e MUST NOT registrar em log o corpo
  nem os códigos pedidos, nem ecoá-los em resposta de erro.

**Mensagem do WhatsApp**

- **FR-014**: A mensagem MUST ter: cabeçalho curto, uma linha por produto
  disponível no formato "2x Nome (#0042) — R$ 12,00" (valor da linha; "a partir de"
  ou "Consulte o valor" quando for o caso), o subtotal, a linha de itens a
  consultar quando houver e a observação, se escrita. MUST NOT ter link por
  produto, nome da cliente nem produto esgotado.
- **FR-015**: O nome do produto na mensagem MUST ter no máximo 40 caracteres,
  cortado por caractere inteiro (code point, sem partir acento ou emoji) antes de
  codificar. A observação MUST ter no máximo 200 caracteres inteiros (code points,
  contados depois da normalização) e MUST NOT ser guardada.
- **FR-015a** (normalização da observação): uma única regra, usada igualmente pelo
  contador, pelo campo e pela mensagem, MUST: converter CRLF em LF; aplicar NFC;
  remover caracteres de controle (exceto LF) e os invisíveis de direção e largura
  zero (U+200B–U+200F, U+202A–U+202E, U+2060, U+2066–U+2069, U+FEFF), preservando
  U+200D e os seletores de variação U+FE0E/U+FE0F; tirar os espaços das pontas;
  reduzir 3 ou mais quebras seguidas a 2. A observação MUST ir por último, depois
  do rótulo "Observação:", e MUST NOT alterar as linhas anteriores; vazia depois de
  normalizar, a linha MUST NOT aparecer. A mesma entrada MUST dar resultado
  idêntico no contador, no campo e na mensagem.
- **FR-016** (orçamento): O endereço completo que abre o WhatsApp, medido inteiro
  em caracteres já codificados, MUST ter no máximo 1800 caracteres em qualquer
  combinação válida de sacola e observação. Para caber:
  - os nomes MUST encolher primeiro, por igual e por caractere inteiro, abaixo de
    40 se preciso, até restar só quantidade, código e valor da linha;
  - a observação MUST NOT ser cortada em silêncio. O limite é o menor entre o
    que resta dos 200 caracteres inteiros (FR-015) e o que resta do orçamento
    codificado depois dos nomes no mínimo (uma quebra de linha custa 3, um emoji
    até 12). Enquanto o teto de 200 for o menor, o campo MUST mostrar "N de 200"
    (N = caracteres inteiros já usados, depois de normalizar); quando o orçamento
    do endereço passar a ser o menor, MUST mostrar "Espaço da mensagem quase
    cheio" com uma barra de progresso, MUST NOT expor a conta em caracteres
    codificados. A troca de um modo para outro MUST ser anunciada ao leitor de
    tela uma vez, na transição (região `aria-live="polite"`), sem anunciar cada
    tecla. O campo MUST impedir passar do limite; se o texto já escrito deixar de
    caber (ex.: a sacola cresceu), o excesso MUST ser mostrado e o envio MUST ficar
    desabilitado até a cliente encurtar.
  O limite MUST ser garantido pela forma de montar a mensagem e provado por teste
  do pior caso: 15 produtos, quantidade 10, códigos com o máximo de dígitos aceito
  (10, até 2.147.483.647), nomes de 40
  caracteres acentuados e com emoji, preços com "a partir de" e observação cheia
  com acentos e emoji.
- **FR-017**: O envio MUST usar o número do WhatsApp configurado no ambiente (005,
  FR-019), validado no mesmo formato internacional. Sem número válido, o envio
  MUST aparecer desabilitado (também para o leitor de tela), sem link e com o texto
  "O envio pelo WhatsApp está indisponível no momento. Tente mais tarde." ligado a
  ele; a mensagem e o endereço MUST NOT ser montados; o resto da sacola MUST
  funcionar; a falha MUST ser registrada uma vez por carregamento do servidor, sem
  o valor configurado (US2.12).

**Depois do envio**

- **FR-018**: Depois de abrir o WhatsApp, a sacola MUST NOT ser esvaziada. A tela
  MUST mostrar a confirmação de que o pedido foi aberto no WhatsApp, com "Limpar
  sacola" e "Voltar" (ao catálogo).

**Telas e acessibilidade**

- **FR-019**: As telas novas seguem as regras de esqueleto funcional da 005
  (FR-022 e FR-023): semântica, teclado, leitor de tela, Android sem zoom, texto ≥
  16 px, alvos ≥ 48 px. Mudanças no contador, no subtotal e nos avisos MUST ser
  anunciadas ao leitor de tela. As regras (limites, total, mensagem, conferência)
  MUST ficar separadas da apresentação, para a feature de design trocar as telas
  sem mudar as regras.

### Key Entities *(include if feature involves data)*

- **Sacola**: guardada só no aparelho; lista de até 15 itens, cada um com o código
  de referência do produto, a quantidade (1 a 10), o preço visto (centavos ou sem
  preço) e a marcação "a partir de"; tem data da última alteração
  (validade de 7 dias) e versão do formato.
- **Item conferido**: o item da sacola junto com o estado público atual do
  produto (nome, código, preço, "a partir de", disponível ou esgotado, capa), ou a
  indicação de que o produto não existe mais. Existe só na tela, nunca é guardado.
- **Mensagem do pedido**: texto montado no momento do envio a partir dos itens
  conferidos e da observação; não é guardada em lugar nenhum pelo sistema.
- **Contato da vendedora**: o mesmo número por ambiente da 005.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Uma cliente monta uma sacola de 3 produtos e abre o WhatsApp com a
  mensagem pronta em no máximo 6 toques da sacola a partir do detalhe: 3
  "Adicionar à sacola", abrir a sacola e enviar. A navegação entre produtos
  (voltar e abrir o próximo) fica fora da contagem, porque adicionar pela lista é
  escopo futuro.
- **SC-002**: Em 100% das combinações válidas testadas, incluindo o pior caso, o
  endereço que abre o WhatsApp fica dentro do limite de tamanho (FR-016).
- **SC-003**: Em 100% das verificações com produto esgotado, removido e com preço
  alterado, a sacola mostra a marcação ou o aviso certo e a mensagem enviada não
  contém produto esgotado, produto removido nem preço anterior.
- **SC-004**: O custo de processamento da consulta de conferência é medido no
  ambiente dev, com 15 produtos, e fica dentro do aceito (ADR-010: sem falha por
  limite de processamento).
- **SC-005**: Sem regressão na 005: lista, "Carregar mais", filtro, detalhe,
  restauração da lista ao voltar, "Perguntar no WhatsApp" e o pedido de não
  indexação continuam passando nos testes e no roteiro da 005; o HTML gerado pelo
  servidor para o detalhe e o cabeçalho é igual ao da 005, exceto o espaço
  reservado da sacola.
- **SC-006**: As telas novas passam na verificação automática de acessibilidade
  sem violações graves e são usáveis só com teclado.
- **SC-007**: Em 100% das inspeções, nada sobre o pedido (produtos, quantidades,
  observação) é gravado no servidor nem nos registros do sistema.

## Assumptions

- O "id" da descrição é o **código de referência** do produto (correção do humano,
  2026-10-16): é público, imutável e nunca reaproveitado (003), e a 005 proíbe
  expor o identificador interno (FR-002 da 005).
- O contador do cabeçalho mostra o número de produtos diferentes na sacola (a
  mesma unidade do limite de 15), não a soma das quantidades.
- O valor de cada linha da mensagem e da sacola é quantidade × preço unitário
  (ex.: "2x Meia (#0042) — R$ 12,00" para R$ 6,00 cada).
- A validade de 7 dias conta a partir da última alteração da sacola (adicionar,
  mudar quantidade, remover).
- Cabeçalho da mensagem, por exemplo: "Olá! Quero fazer este pedido:"; o texto
  exato pode ser ajustado no plano sem mudar a regra.
- Quantidade só é alterada na sacola; o detalhe sempre adiciona 1.
- "Voltar", na confirmação, leva ao catálogo (página inicial).
- A confirmação aparece ao voltar à sacola depois de tocar em enviar; o sistema não
  sabe se a mensagem foi de fato enviada no WhatsApp.
- Público-alvo e regras de texto e toque iguais aos da 005 (Android, Chrome).
- Fora de escopo: gravar pedidos, estoque ou reserva, pagamento, adicionar direto
  da lista ou dos destaques, sacola em painel lateral, nome da cliente, contagem de
  acessos, redesign das telas (feature seguinte) e o número da Rose em produção
  (entrega final; produção segue com o número de teste do mantenedor).

## Dependencies

- Feature 005 (catálogo público): detalhe, formato de preço, "Perguntar no
  WhatsApp", número por ambiente, não indexação, telas de esqueleto e páginas
  dinâmicas (ADR-011). A 006 não muda as regras da 005, só acrescenta a ação
  principal no detalhe e o acesso à sacola no cabeçalho.
- Feature 003 (produtos): código de referência imutável e não reaproveitado,
  preço em centavos, "a partir de", esgotado.
- ADR-010: critério de aceite de CPU (falhar por limite, Erro 1102, não passar de
  10 ms).

## Notas para o plan

Registradas a pedido do humano; não são decisões da spec.

- Páginas públicas continuam dinâmicas (ADR-011); a sacola não muda o cache das
  páginas da 005. A consulta de conferência responde `no-store`.
- A consulta de conferência é um POST público em `src/app/api/catalogo/`, lendo
  pelo módulo `src/lib/catalogo/` (barrel server-only); checa `Content-Type` e
  tamanho (≤ 1 KB) antes de parsear; valida com Zod; uma única query com `IN`;
  não lê cookie de sessão; não loga corpo nem códigos (o `observability` do
  wrangler grava o URL, por isso não GET); teste de conformidade nos moldes de
  `catalogo-acesso`.
- Número inválido (FR-017): botão com `aria-disabled="true"` e `aria-describedby`
  para o texto, sem `href`; o construtor da mensagem nunca é chamado; log uma vez
  por isolate, sem o valor. Teste da US2.12: sem `href` `wa.me`, texto presente,
  log sem o valor.
- Observação (FR-015a): função pura única `normalizarObservacao`, importada pelo
  contador, pelo campo e pelo construtor; o campo não usa `maxLength` nativo
  (conta UTF-16). Testes: mesma saída nos três pontos; texto com quebras e no
  formato de linha de item não altera as linhas antes do rótulo.
- Concorrência (FR-008a): operações como funções puras `(sacolaRelida) => nova`;
  sem `navigator.locks`; teste com armazenamento falso intercalando duas abas
  (as duas adições sobrevivem).
- Medir a CPU da conferência no dev com 15 produtos (SC-004), como a T139 da 005.
- Testes de integração em série (`npm run test:int`, memória do projeto).
- Teste do pior caso da mensagem (SC-002) como teste unitário da regra pura.
- Orçamento (FR-016): medido com `encodeURIComponent` sobre o texto e somado ao
  prefixo `https://wa.me/<número>?text=`. Medição de referência (2026-10-16, pior
  caso com nomes de 40 caracteres): só letras sem acento 1845, todos acentuados
  4845, com emoji 8445; nomes vazios e observação de 200 acentuada 2458. O
  travessão "—" custa 9 caracteres codificado; a escolha de separadores entra no
  orçamento.
- **Primeiro commit da 006**: marca como feitas as tasks T091–T097 da 005
  (`specs/005-catalogo-publico/tasks.md`); T090 (número da Rose em produção) e T098
  (SC-001 da 005) ficam abertas com a nota "adiada para a entrega final".
