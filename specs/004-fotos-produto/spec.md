# Feature Specification: Fotos de produto com sugestão por IA

**Feature Branch**: `feature/004-fotos-produto`

**Created**: 2026-10-08

**Status**: Draft

**Input**: User description: "Feature 004 — fotos de produto (upload no R2) com sugestão por IA. As admins cadastram um produto começando pelas fotos: sobem até 3 fotos, a IA lê as fotos e sugere nome, categoria (dentro da lista fixa da 002) e descrição; a admin revisa, ajusta e salva. Pensado para uso pelo celular pela mãe, com baixa familiaridade com tecnologia." (descrição completa, com decisões de produto, restrições de segurança e armazenamento, fora do escopo e itens técnicos para o plan, registrada na conversa de abertura desta spec)

## Clarifications

### Session 2026-10-08

- Q: Como resolver o conflito da spec com a constitution (III.4 e VII)? → A: a spec
  se ajusta à constitution, que não será emendada. Envio direto do navegador ao
  armazenamento por URL pré-assinada de curta duração, emitida só para
  administradora autenticada e na allowlist, para uma área temporária. Todo o
  processamento no aparelho (orientação, recorte, redução e recodificação pelo
  canvas, o que descarta EXIF/GPS), gerando WebP, ou JPEG se o navegador não gerar
  WebP; o que sai do aparelho é sempre JPEG, PNG ou WebP. HEIC/HEIF só como entrada
  no aparelho, onde o navegador abrir; o servidor nunca recebe HEIC. O servidor não
  processa imagem: na confirmação do envio, relê o objeto e confere conteúdo
  (assinatura do arquivo), tamanho, dimensões mínimas e ausência de metadados; o que
  estiver fora da regra é apagado e recusado.
- Q: Como é o botão de remover foto no cadastro (cenário 6 da US1)? → A: ícone de
  lixeira com o texto "Remover" ao lado, igual ao da US4. Nenhum botão da feature
  usa o verbo "Tirar" para remover; "Tirar foto" só abre a câmera.
- Q: Onde fica a garantia de 1 a 3 fotos sem buracos (FR-003)? → A: nas ações de
  escrita de fotos, com `db.batch` e lock advisory (padrão da ADR-008), provada pelo
  teste de concorrência (SC-007). No banco continuam só as constraints já
  existentes (posição de 1 a 3, única por produto).
- Q: O que acontece com os produtos da 003 sem foto no dev online e no local? → A:
  são apagados antes de a regra FR-001 valer, por operação manual do mantenedor com
  comando conferido. A spec só registra; não há caminho de convivência.
- Q: Os padrões assumidos na abertura da spec valem? → A: sim, como decisões:
  moldura quadrada (1:1); fotos temporárias expiram em 24 horas; sugestão por IA só
  no cadastro de produto novo; tempo limite da IA de 20 segundos; foto mínima de
  400 pixels no menor lado; botões alternativos ao arrasto para reordenar.
- Q: Na confirmação do envio, o que o servidor trata como metadado a recusar? → A:
  lista de blocos permitidos: passam só os blocos estruturais do formato (dados da
  imagem, cabeçalho, JFIF, sRGB/gama) e o perfil de cor ICC; qualquer outro bloco
  (EXIF, XMP, IPTC, comentários, texto ou desconhecido) faz o arquivo ser apagado e
  recusado.
- Q: Na tela "Fotos" de um produto salvo, cada mudança é gravada na hora ou só com
  um botão "Salvar"? → A: gravação imediata por ação (adicionar, remover depois da
  confirmação, trocar, mover), com aviso curto; não há botão "Salvar" nessa tela.
  Cada ação devolve a versão nova do conjunto de fotos e a tela passa a usá-la, para
  que ações seguidas da mesma administradora não sejam recusadas como conflito com
  ela mesma.
- Q: Que mensagem aparece quando o servidor recusa, na confirmação, uma foto de
  formato aceito com metadado ou animação? → A: "Não deu para usar essa foto.
  Tente de novo ou use 'Tirar foto'.", com a miniatura no estado "Não enviada" e o
  botão "Tentar de novo". Na segunda recusa seguida pelo mesmo motivo, na mesma
  tela, a mensagem passa a ser "Essa foto não está passando. Escolha outra ou peça
  ajuda.".

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Cadastrar produto começando pelas fotos (Priority: P1)

A administradora toca em "Novo produto". A primeira tela pede as fotos, com dois
botões grandes: "Tirar foto" (abre a câmera) e "Escolher da galeria". Para cada
foto, ela ajusta o recorte numa moldura de proporção fixa e confirma. A foto é
enviada e aparece na tela como miniatura. Ela pode enviar até 3 fotos; a primeira
é a capa. Com ao menos 1 foto enviada, toca em "Continuar" e segue para o
formulário do produto (o mesmo da 003), onde preenche e salva. O produto nasce
com as fotos já enviadas, na ordem em que estavam.

**Why this priority**: sem foto o produto não pode mais ser salvo (FR-014 da 003
passa a valer). Esta é a única porta de entrada de produtos novos a partir desta
feature; sem ela o cadastro fica bloqueado.

**Independent Test**: com a IA desligada, cadastrar um produto com 1 foto e outro
com 3 fotos, preenchendo os campos à mão; conferir que ambos aparecem com as fotos
na ordem certa e que a capa é a da posição 1.

**Acceptance Scenarios**:

1. **Given** uma administradora autenticada no painel, **When** toca em "Novo
   produto", **Then** vê a tela de fotos com os botões "Tirar foto" e "Escolher
   da galeria", e o botão "Continuar" fica indisponível enquanto não houver foto
   enviada.
2. **Given** a tela de fotos, **When** a administradora escolhe uma imagem,
   **Then** vê a imagem numa moldura de proporção fixa, pode mover e aproximar
   para ajustar o recorte, e só depois de tocar em "Usar esta foto" a foto é
   enviada.
3. **Given** uma foto confirmada no recorte, **When** o envio termina, **Then** a
   miniatura aparece na lista de fotos com a indicação "Capa" se for a primeira, e
   o botão "Continuar" fica disponível.
4. **Given** 3 fotos já enviadas, **When** a administradora olha a tela, **Then**
   os botões de adicionar foto ficam indisponíveis, com o texto "Máximo de 3
   fotos".
5. **Given** fotos enviadas, **When** a administradora arrasta uma miniatura para
   outra posição, **Then** a ordem muda e a foto que ficar na posição 1 passa a
   ser a capa.
6. **Given** fotos enviadas, **When** a administradora toca em "Remover" (ícone de
   lixeira com o texto "Remover" ao lado, igual ao da US4) numa miniatura antes de
   salvar o produto, **Then** a foto sai da lista sem pedir confirmação (nada foi
   salvo ainda) e as demais sobem de posição.
7. **Given** fotos enviadas e o formulário preenchido com dados válidos, **When**
   a administradora toca em "Salvar", **Then** o produto é criado com exatamente
   aquelas fotos, na ordem mostrada, e ela vai para o detalhe do produto.
8. **Given** o formulário de um novo produto, **When** a administradora tenta
   salvar sem nenhuma foto (por exemplo, voltou e removeu todas), **Then** o
   cadastro é recusado com a mensagem "Coloque pelo menos 1 foto do produto." e
   nada é criado.
9. **Given** um cadastro recusado por outro motivo (ex.: nome repetido, FR-004 da
   003), **When** a administradora corrige e salva de novo, **Then** as fotos já
   enviadas continuam lá, sem precisar enviar outra vez.

---

### User Story 2 - Envio seguro e econômico das fotos (Priority: P1)

Todo o tratamento da foto acontece no próprio celular, antes de ela sair dele: a
orientação da câmera é aplicada, a foto é recortada, reduzida (para gastar pouco
dado móvel) e regravada num formato padrão, o que descarta dados escondidos da
imagem (como localização e modelo do celular). A foto vai direto do celular para
uma área temporária do armazenamento, com uma autorização de envio de curta
duração que só administradora autenticada recebe. Ao confirmar o envio, o servidor
relê a foto guardada, sem alterá-la, e confere o conteúdo, o tamanho, as dimensões
e a ausência de dados escondidos; o que estiver fora da regra é apagado e recusado.

**Why this priority**: foto de celular carrega a localização da casa de quem tirou.
Guardar isso, ou aceitar arquivo disfarçado de imagem, é risco à segurança e à
privacidade da família. Faz parte do mínimo do P1.

**Independent Test**: com uma autorização de envio válida, colocar na área
temporária, por teste automatizado e sem passar pelo tratamento do aparelho,
arquivos forjados (foto com localização gravada, não-imagem com extensão de imagem,
SVG, GIF, HEIC, imagem animada, foto pequena e arquivo acima do teto) e confirmar o
envio; conferir que todos são apagados e recusados, e que uma foto válida gerada
pelo tratamento do aparelho é aceita.

**Acceptance Scenarios**:

1. **Given** uma foto JPEG, PNG ou WebP, ou uma HEIC/HEIF que o navegador do
   aparelho consiga abrir, **When** é enviada, **Then** sai do aparelho e fica
   guardada em WebP (ou em JPEG, se o navegador não gerar WebP), e o arquivo
   original não sai do aparelho nem é guardado em lugar nenhum.
2. **Given** uma foto com localização (GPS) e outros dados da câmera gravados,
   **When** é tratada no aparelho e enviada, **Then** a foto guardada não contém
   nenhum desses dados.
3. **Given** um arquivo SVG ou GIF, **When** a administradora o escolhe, **Then**
   o envio é recusado no aparelho com a mensagem "Esse tipo de arquivo não é
   aceito. Use uma foto tirada pelo celular ou salva na galeria." e nada é
   enviado.
4. **Given** um arquivo na área temporária cujo conteúdo não é JPEG, PNG ou WebP,
   mesmo com nome ou tipo declarado de imagem (ex.: um PDF renomeado para `.jpg`,
   ou um HEIC), **When** o envio é confirmado, **Then** o servidor o recusa pelo
   conteúdo, com a mesma mensagem do cenário 3, e o apaga.
5. **Given** um envio acima do teto de tamanho, **When** é feito, **Then** é
   recusado pela própria autorização de envio ou, se chegar à área temporária, é
   apagado na confirmação, com a mensagem "Essa foto ficou grande demais. Tente de
   novo ou escolha outra.".
6. **Given** uma pessoa sem sessão de administradora (ou fora da allowlist),
   **When** pede uma autorização de envio ou tenta confirmar um envio, **Then** o
   pedido é recusado e nada é guardado.
7. **Given** uma foto HEIC que o navegador do aparelho não consegue abrir para o
   recorte, **When** a administradora a escolhe, **Then** vê a mensagem "Não
   conseguimos abrir essa foto neste aparelho. Tente usar 'Tirar foto' ou escolha
   outra." e pode tentar de novo.
8. **Given** uma falha de conexão durante o envio, **When** o envio não termina,
   **Then** a miniatura mostra "Não enviada" com o botão "Tentar de novo", sem
   perder as fotos já enviadas.
9. **Given** um arquivo na área temporária que é JPEG, PNG ou WebP mas contém
   metadados (EXIF, GPS ou equivalentes) ou é animado, **When** o envio é
   confirmado, **Then** o servidor o apaga e recusa, ele não pode ser adotado
   por nenhum produto nem enviado à IA, e a miniatura mostra "Não enviada" com o
   botão "Tentar de novo" e a mensagem "Não deu para usar essa foto. Tente de novo
   ou use 'Tirar foto'.".
10. **Given** uma recusa pelo motivo do cenário 9, **When** a próxima tentativa na
    mesma tela é recusada de novo pelo mesmo motivo, **Then** a mensagem passa a
    ser "Essa foto não está passando. Escolha outra ou peça ajuda.".

---

### User Story 3 - Sugestão de nome, categoria e descrição pela IA (Priority: P2)

Ao tocar em "Continuar" na tela de fotos, o formulário abre e, enquanto a
administradora espera, aparece "Preenchendo a partir das fotos…". Em seguida
os campos nome, categoria e descrição chegam preenchidos com uma sugestão, marcados
como "Sugestão — confira". Ela confere, muda o que quiser, completa preço e salva.
Nada é salvo sem ela tocar em "Salvar".

**Why this priority**: acelera muito o cadastro pela mãe (digitar no celular é o
gargalo), mas o cadastro manual da US1 já funciona sem ela.

**Independent Test**: com a IA respondendo (ou simulada), enviar fotos de um
produto conhecido e conferir que os três campos chegam sugeridos, que a categoria
sugerida é uma das existentes e que nada foi criado até tocar em "Salvar".

**Acceptance Scenarios**:

1. **Given** ao menos 1 foto enviada, **When** a administradora toca em
   "Continuar", **Then** o formulário abre imediatamente, editável, com o aviso
   "Preenchendo a partir das fotos…", e a sugestão é pedida uma única vez para
   aquelas fotos.
2. **Given** a sugestão chegou, **When** o formulário é atualizado, **Then** nome,
   categoria e descrição aparecem preenchidos com a indicação "Sugestão — confira",
   e preço, "a partir de" e status não são sugeridos.
3. **Given** a administradora já digitou algo num campo antes de a sugestão chegar,
   **When** a sugestão chega, **Then** aquele campo não é alterado; só os campos
   ainda vazios recebem a sugestão.
4. **Given** a IA sugeriu uma categoria, **When** a sugestão é aplicada, **Then**
   a categoria é sempre uma das categorias existentes; se a IA devolver algo fora
   da lista, o campo categoria fica vazio para a administradora escolher.
5. **Given** a sugestão aplicada, **When** a administradora toca em "Salvar",
   **Then** os valores passam pelas mesmas regras do cadastro manual (FR-003 a
   FR-007 da 003), inclusive a recusa por nome repetido.
6. **Given** a IA falha, demora além do tempo limite, recusa a imagem ou devolve
   resposta inválida, **When** isso acontece, **Then** o aviso vira "Não deu para
   sugerir agora. Preencha você mesma." com o botão "Tentar sugestão de novo", e o
   formulário continua utilizável para cadastro manual.
7. **Given** o limite de uso da IA foi atingido, **When** a administradora pede a
   sugestão, **Then** vê a mensagem "As sugestões estão pausadas por agora.
   Preencha você mesma." e o cadastro manual continua normal.
8. **Given** uma sugestão aplicada e não confirmada, **When** a administradora sai
   da tela sem salvar, **Then** nenhum produto é criado.

---

### User Story 4 - Gerenciar as fotos de um produto existente (Priority: P2)

No detalhe de um produto, a administradora toca em "Fotos" e vê as fotos na ordem,
com a capa marcada. Pode adicionar (até 3), remover, substituir uma foto por outra
na mesma posição e reordenar arrastando. Cada mudança é gravada na hora, com um
aviso curto; não há botão "Salvar" nessa tela. O produto nunca fica sem foto.

**Why this priority**: corrigir foto ruim ou trocar a capa é frequente, mas
depende do cadastro (US1) já existir.

**Independent Test**: num produto com 2 fotos, adicionar uma terceira, trocar a
ordem, substituir a do meio e remover uma; conferir o resultado no detalhe e que a
última foto não pode ser removida.

**Acceptance Scenarios**:

1. **Given** um produto com menos de 3 fotos, **When** a administradora adiciona
   uma foto (mesmos passos de recorte e envio da US1), **Then** a foto entra na
   última posição do produto.
2. **Given** um produto com 2 ou mais fotos, **When** a administradora arrasta uma
   foto para outra posição, **Then** a nova ordem é salva e a foto na posição 1
   passa a ser a capa em todo o painel.
3. **Given** um produto com 2 ou mais fotos, **When** a administradora toca em
   "Remover" numa foto e confirma ("Remover esta foto do produto? Ela será
   apagada."), **Then** a foto sai do produto e as seguintes sobem de posição.
4. **Given** um produto com 1 foto só, **When** a administradora olha essa foto,
   **Then** a opção "Remover" não aparece; aparece "Trocar foto", e a explicação
   "O produto precisa de pelo menos 1 foto.".
5. **Given** qualquer foto do produto, **When** a administradora toca em "Trocar
   foto" e envia outra, **Then** a nova foto ocupa a mesma posição e a antiga é
   apagada.
6. **Given** uma mudança nas fotos, **When** é gravada, **Then** o detalhe registra
   a administradora que fez a última alteração (FR-027 da 003), sem invalidar uma
   edição de nome, preço ou outros campos que outra administradora tenha aberto.
7. **Given** a tela "Fotos" aberta, **When** a administradora faz duas ou mais
   mudanças seguidas (ex.: adiciona uma foto e depois a move para a capa),
   **Then** cada uma é gravada na hora e nenhuma é recusada como conflito com a
   mudança anterior dela mesma.

---

### User Story 5 - Duas administradoras mexendo nas fotos ao mesmo tempo (Priority: P2)

As fotos têm controle de concorrência próprio, separado do dos campos do produto.
Quando duas administradoras mexem nas fotos do mesmo produto ao mesmo tempo, a
segunda mudança que depender de uma situação que já mudou é recusada sem estragar
nada, e a tela mostra como as fotos estão agora.

**Why this priority**: são poucas administradoras e o choque é raro, mas sem regra
clara um produto pode ficar com 4 fotos, sem foto, ou com a ordem trocada sem
ninguém perceber.

**Independent Test**: teste automatizado de ações simultâneas sobre as fotos do
mesmo produto, conferindo que nunca há mais de 3 fotos, nunca 0 fotos, nunca duas
fotos na mesma posição, e que a recusa traz a mensagem prevista.

**Acceptance Scenarios**:

1. **Given** duas administradoras com a tela de fotos do mesmo produto aberta,
   **When** a primeira salva uma mudança (adicionar, remover, trocar ou
   reordenar) e depois a segunda tenta salvar outra mudança a partir da tela
   antiga, **Then** a mudança da segunda é recusada sem alterar nada, ela vê "As
   fotos deste produto foram mudadas por outra pessoa. Veja como ficaram e faça
   de novo." e a tela passa a mostrar as fotos atuais.
2. **Given** um produto com 2 fotos e duas administradoras adicionando uma foto ao
   mesmo tempo, **When** ambas salvam, **Then** só uma entra; a outra recebe a
   mensagem do cenário 1 (ou, se a tela já estiver atualizada com 3 fotos, "Este
   produto já tem 3 fotos. Remova ou troque uma para colocar outra.") e a foto que
   ela enviou não fica no produto.
3. **Given** um produto com 2 fotos e duas administradoras removendo fotos
   diferentes ao mesmo tempo, **When** ambas confirmam, **Then** só uma remoção
   acontece e o produto continua com pelo menos 1 foto.
4. **Given** uma administradora editando nome ou preço e outra mexendo nas fotos
   do mesmo produto, **When** as duas salvam, **Then** as duas mudanças são
   aceitas, pois fotos e campos do produto têm controles independentes.
5. **Given** uma administradora mexendo nas fotos e outra removendo o produto,
   **When** a remoção acontece antes, **Then** a mudança nas fotos é recusada com
   a mensagem de produto não encontrado já usada na 003.

---

### User Story 6 - Limpeza de fotos que sobraram (Priority: P3)

Fotos enviadas e nunca usadas (cadastro abandonado), fotos de produtos removidos e
fotos substituídas ou removidas não ficam guardadas para sempre. A remoção do
produto já apaga suas fotos na mesma ação, e uma limpeza automática periódica
apaga o que sobrar.

**Why this priority**: não afeta o uso diário, mas evita custo crescente de
armazenamento e guarda de fotos que ninguém vê.

**Independent Test**: criar envios temporários antigos, um produto removido cuja
apagada de fotos falhou e uma foto substituída; rodar a limpeza e conferir que só
o que pertence a produtos existentes, ou é temporário recente, continua guardado.

**Acceptance Scenarios**:

1. **Given** um produto com fotos, **When** a administradora o remove (US6 da
   003), **Then** as fotos são apagadas na mesma ação; se a apagada das fotos
   falhar, a remoção do produto acontece mesmo assim e a sobra fica para a
   limpeza.
2. **Given** a confirmação de remoção de um produto, **When** ela é exibida,
   **Then** o texto informa que as fotos também serão apagadas.
3. **Given** fotos temporárias enviadas há mais de 24 horas e não adotadas por
   nenhum produto, **When** a limpeza periódica roda, **Then** elas são apagadas.
4. **Given** fotos temporárias com menos de 24 horas, **When** a limpeza roda,
   **Then** elas são mantidas (podem estar num cadastro em andamento).
5. **Given** fotos guardadas que não pertencem a nenhum produto existente e não são
   temporárias recentes, **When** a limpeza roda, **Then** são apagadas.
6. **Given** fotos que pertencem a produtos existentes, **When** a limpeza roda,
   **Then** nenhuma delas é apagada, mesmo que um cadastro ou mudança de fotos
   esteja acontecendo naquele momento.

---

### Edge Cases

- **Cadastro abandonado no meio**: a administradora envia fotos e fecha o
  navegador. Nenhum produto é criado; as fotos temporárias ficam até a limpeza
  (US6). Ao tocar de novo em "Novo produto", a tela começa vazia.
- **Foto temporária de outra pessoa**: uma administradora só pode adotar, no
  cadastro, fotos temporárias que ela mesma enviou, cujo envio foi confirmado pelo
  servidor e que ainda não foram adotadas nem apagadas.
- **Envio não confirmado**: um arquivo que chegou à área temporária mas cujo envio
  nunca foi confirmado (conexão caiu, navegador fechado) não existe para o sistema:
  não pode ser adotado nem enviado à IA, e é apagado pela limpeza (FR-037). Qualquer outra referência é recusada, e nada é criado.
- **Duplo toque em "Salvar" no cadastro**: o segundo envio é recusado pela
  unicidade de nome (FR-028 da 003); as fotos ficam só no produto criado pelo
  primeiro envio.
- **Adoção de foto temporária já expirada**: se a limpeza apagou uma foto
  temporária antes do "Salvar" (cadastro aberto por mais de 24 horas), o cadastro
  é recusado com "Uma das fotos expirou. Envie de novo." e a tela mostra quais
  fotos faltam.
- **Envio de foto durante o "Salvar"**: o produto é criado só com as fotos que já
  estavam enviadas quando ela tocou em "Salvar"; uma foto ainda em envio não é
  incluída e o botão "Salvar" fica indisponível enquanto houver envio em curso.
- **Foto muito pequena**: imagem com menos de 400 pixels no menor lado é recusada
  com "Essa foto está muito pequena. Escolha outra com mais qualidade.".
- **Imagem animada ou com várias páginas** (ex.: WebP animado, HEIC com várias
  imagens): no aparelho, só a primeira imagem é usada; um arquivo animado que
  chegue à área temporária é apagado e recusado na confirmação (cenário 9 da US2).
- **Foto de lado ou de cabeça para baixo**: a orientação gravada pela câmera é
  aplicada no aparelho antes do recorte, para que a foto guardada apareça como a
  administradora viu.
- **IA sugere nome que já existe**: a sugestão aparece normalmente; a recusa vem
  só ao salvar, com a mensagem de FR-005 da 003.
- **IA sugere texto com conteúdo impróprio ou longo demais**: a sugestão passa
  pelas mesmas validações de tamanho e formato dos campos (FR-003 a FR-007 da
  003); o que não passar é descartado e o campo fica vazio.
- **Fotos de produtos diferentes no mesmo cadastro**: a IA sugere com base no
  conjunto; a revisão é responsabilidade da administradora.
- **Produto em destaque**: como todo produto tem pelo menos 1 foto (FR-001), todo
  produto em destaque tem foto; nenhuma ação desta feature pode deixar um produto
  em destaque sem foto.
- **Produtos legados sem foto**: produção não tem produtos sem foto a migrar; os
  produtos da 003 sem foto no dev online e no local são apagados antes de a regra
  FR-001 valer, por operação manual do mantenedor com comando conferido (ver
  Clarifications). Não há caminho de convivência com produto sem foto.

## Requirements *(mandatory)*

### Functional Requirements

**Regra de foto**

- **FR-001**: Todo produto MUST ter de 1 a 3 fotos desde a criação e durante toda
  a sua existência. O FR-014 da 003 passa a valer integralmente; o FR-013 da 003
  ("sem envio de fotos") é substituído por esta feature.
- **FR-002**: As fotos de um produto MUST ter posições 1, 2 e 3 sem buracos e sem
  repetição; a posição 1 é a capa, usada como miniatura em todo o painel.
- **FR-003**: Nenhuma ação (remover foto, trocar foto, ações simultâneas) MUST
  deixar um produto com 0 fotos, com mais de 3 ou com posições com buraco. A
  garantia fica nas ações de escrita de fotos, no servidor, com `db.batch` e lock
  advisory (padrão da ADR-008), não só na tela, e é provada pelo teste de
  concorrência (SC-007). No banco continuam só as constraints já existentes
  (posição de 1 a 3, única por produto).
- **FR-004**: Produto sem foto MUST NOT poder ser destaque. Com FR-001 e FR-003,
  isso é um invariante: o teste de concorrência do SC-005 da 003 passa a verificar
  também "0 produtos em destaque sem foto".

**Cadastro começando pelas fotos**

- **FR-005**: "Novo produto" MUST abrir primeiro a tela de fotos; o formulário de
  campos (o da 003) só é acessível com ao menos 1 foto enviada.
- **FR-006**: No celular, a tela de fotos MUST oferecer dois botões distintos:
  "Tirar foto" (abre a câmera) e "Escolher da galeria".
- **FR-007**: Antes do envio, a administradora MUST ajustar o recorte numa moldura
  quadrada (1:1), movendo e aproximando a imagem; nada é enviado antes de ela
  confirmar o recorte.
- **FR-008**: As fotos enviadas antes de o produto existir MUST ficar numa área
  temporária, vinculadas à administradora que as enviou; ao salvar, o produto
  "adota" essas fotos, na ordem mostrada, numa única ação: ou o produto é criado
  com todas as fotos, ou nada é criado.
- **FR-009**: Uma foto temporária MUST poder ser adotada no máximo uma vez, só pela
  administradora que a enviou, e só enquanto não tiver expirado (FR-031).
- **FR-010**: Um cadastro recusado (nome repetido, validação, conflito) MUST manter
  as fotos temporárias já enviadas na tela, para nova tentativa sem reenvio.

**Envio e armazenamento**

- **FR-011**: No aparelho, as entradas aceitas MUST ser fotos JPEG, PNG e WebP e,
  onde o navegador conseguir abrir, HEIC/HEIF (senão vale o cenário 7 da US2).
  SVG, GIF e qualquer outro formato MUST ser recusados no aparelho com a mensagem
  do cenário 3 da US2. O que sai do aparelho MUST ser sempre JPEG, PNG ou WebP
  (constitution III.4); o servidor MUST NOT aceitar HEIC/HEIF nem outro formato.
- **FR-012**: Na confirmação do envio, o servidor MUST reler o arquivo guardado na
  área temporária e verificar o tipo pelo conteúdo (assinatura do arquivo); nome,
  extensão e tipo declarado são ignorados para essa decisão. Conteúdo que não seja
  JPEG, PNG ou WebP MUST ser apagado e recusado com a mensagem do cenário 3 da US2.
- **FR-013**: No aparelho, antes do envio, a foto MUST ser recortada na moldura
  1:1, reduzida e regravada (o que descarta EXIF, GPS e equivalentes), gerando
  WebP; se o navegador não gerar WebP, gera JPEG. O original MUST NOT sair do
  aparelho.
- **FR-014**: A autorização de envio MUST limitar o tamanho máximo do arquivo, e a
  confirmação MUST conferir de novo o tamanho do arquivo guardado; acima do teto,
  o envio é recusado (ou apagado, se já estiver na área temporária) com a mensagem
  do cenário 5 da US2. O valor do teto é definido no plan, compatível com uma foto
  já reduzida pelo aparelho (FR-013) e com o SC-005.
- **FR-015**: O envio MUST ir direto do navegador ao armazenamento de fotos, por
  autorização de envio (URL pré-assinada) de curta duração, emitida só para
  administradora autenticada e na allowlist (verificação na própria ação, como na
  001) e válida só para um arquivo novo na área temporária. A foto só passa a
  existir para o sistema (pode ser adotada ou enviada à IA) depois de a
  administradora confirmar o envio e o servidor reler o arquivo e conferir
  conteúdo (FR-012), tamanho (FR-014), dimensões mínimas (FR-018), que é estática
  e que não tem metadados; o que estiver fora da regra MUST ser apagado e recusado
  (metadado ou animação: mensagens dos cenários 9 e 10 da US2).
  A confirmação exige a mesma autenticação e allowlist. O servidor MUST NOT
  processar a imagem (decodificar, redimensionar, converter ou regravar),
  conforme a constitution (VII).
- **FR-016**: O que fica guardado MUST estar em WebP, JPEG ou PNG, estático e sem
  metadados, garantido pela verificação do servidor na confirmação (FR-015). A
  verificação MUST usar lista de blocos permitidos: só passam os blocos
  estruturais do formato (dados da imagem, cabeçalho, JFIF, sRGB/gama) e o perfil
  de cor ICC; qualquer outro bloco (EXIF, GPS, XMP, IPTC, comentários, texto ou
  bloco desconhecido) faz o arquivo ser apagado e recusado. O original MUST NOT
  ser guardado.
- **FR-017**: A orientação registrada pela câmera MUST ser aplicada no aparelho
  antes do recorte, para que a foto guardada apareça na orientação vista pela
  administradora.
- **FR-018**: Fotos com menos de 400 pixels no menor lado, depois do recorte, MUST
  ser recusadas com a mensagem do edge case "Foto muito pequena": no aparelho,
  antes do envio, e de novo pelo servidor na confirmação, lendo as dimensões do
  arquivo guardado.
- **FR-019**: Fotos temporárias MUST ser visíveis só para administradoras
  autenticadas. A exposição das fotos ao público é decidida na feature do
  catálogo público.

**Edição das fotos**

- **FR-020**: Administradoras MUST poder adicionar foto (até 3), remover foto
  (desde que reste ao menos 1), trocar uma foto por outra na mesma posição e
  reordenar arrastando, sempre pelo detalhe do produto. Cada ação MUST ser gravada
  na hora, sem botão "Salvar" na tela de fotos, com um aviso curto do resultado
  (ex.: "Foto adicionada").
- **FR-021**: Remover foto de produto salvo MUST pedir confirmação com texto claro
  (cenário 3 da US4). Trocar e reordenar não pedem confirmação. O botão de
  remover foto, no cadastro e na edição, MUST ser um ícone de lixeira com o texto
  "Remover" ao lado; nenhum botão desta feature usa o verbo "Tirar" para remover
  ("Tirar foto" só abre a câmera).
- **FR-022**: A reordenação por arrasto MUST ter alternativa por toque (ex.:
  botões "Mover para a esquerda/direita" ou "Usar como capa"), com alvos de no
  mínimo 48px, para quem não consegue arrastar.

**Concorrência das fotos**

- **FR-023**: As fotos de um produto MUST ter controle de concorrência próprio,
  independente da versão do produto. Mudança nas fotos MUST NOT invalidar edição
  aberta dos campos do produto, e vice-versa. A concorrência otimista estrita da
  003 (FR-026 da 003) continua valendo para os campos do produto.
- **FR-024**: Qualquer mudança nas fotos de um produto (adicionar, remover, trocar,
  reordenar) feita a partir de uma situação que já mudou MUST ser recusada sem
  alterar nada, com a mensagem do cenário 1 da US5, e a tela MUST passar a mostrar
  as fotos atuais. Cada ação aceita MUST devolver a versão nova do conjunto de fotos
  e a tela MUST passar a usá-la, para que ações seguidas da mesma administradora
  não sejam recusadas como conflito com ela mesma.
- **FR-025**: Tentativa de passar de 3 fotos MUST ser recusada com "Este produto
  já tem 3 fotos. Remova ou troque uma para colocar outra.", sem alterar nada.
- **FR-026**: Mudança nas fotos MUST registrar a administradora que fez a última
  alteração do produto (FR-027 da 003) e a data, sem alterar a versão usada pelo
  FR-026 da 003.

**Sugestão por IA**

- **FR-027**: Ao avançar da tela de fotos para o formulário de um produto novo, o
  sistema MUST pedir à IA uma sugestão de nome, categoria e descrição com base
  nas fotos enviadas, sem impedir a administradora de digitar enquanto espera.
- **FR-028**: A categoria sugerida MUST ser uma das categorias existentes no
  momento do pedido; qualquer outra resposta é descartada e o campo fica vazio.
- **FR-029**: A resposta da IA MUST ser tratada como entrada não confiável:
  validada no servidor quanto a formato e limites dos campos; o que não passar é
  descartado. Ao salvar, valem as mesmas regras do cadastro manual (FR-003 a
  FR-007 e FR-032 da 003).
- **FR-030**: A sugestão MUST NOT ser salva sozinha: só preenche campos vazios do
  formulário, marcados como "Sugestão — confira"; o produto só é criado quando a
  administradora toca em "Salvar". Variações (cor, tamanho) continuam só na
  descrição; a IA não cria variações nem sugere preço ou status.
- **FR-031**: Falha, demora acima do tempo limite de 20 segundos, recusa ou resposta inválida da IA MUST NOT bloquear o cadastro
  manual; a mensagem é a do cenário 6 da US3, com opção de tentar de novo.
- **FR-032**: O pedido de sugestão MUST ser restrito a administradoras
  autenticadas e na allowlist e MUST ter limite de uso por período (valor definido
  no plan); ao atingir o limite, vale a mensagem do cenário 7 da US3.
- **FR-033**: A chave de acesso à IA MUST existir só como segredo de ambiente no
  servidor, nunca no código, no navegador ou em log. As fotos enviadas à IA MUST
  ser só as de envio já confirmado pelo servidor (sem metadados, FR-016).
- **FR-034**: A sugestão por IA MUST existir só no cadastro de produto novo; na
  edição de produto existente não há sugestão nesta feature.

**Limpeza**

- **FR-035**: Remover um produto MUST apagar suas fotos na mesma ação, em melhor
  esforço: falha ao apagar as fotos não impede a remoção do produto. A confirmação
  de remoção (FR-024 da 003) MUST dizer que as fotos também serão apagadas.
- **FR-036**: Fotos removidas ou trocadas na edição MUST ser apagadas do
  armazenamento em melhor esforço na mesma ação.
- **FR-037**: Uma limpeza automática periódica MUST apagar (a) fotos temporárias
  não adotadas com mais de 24 horas, com ou sem envio confirmado, e (b) fotos guardadas que não pertencem a
  nenhum produto existente. A frequência é definida no plan, com no mínimo uma
  execução por dia.
- **FR-038**: A limpeza MUST NOT apagar foto que pertença a produto existente nem
  foto temporária com menos de 24 horas, inclusive se rodar ao mesmo tempo que um
  cadastro, adoção ou mudança de fotos.

**Exibição no painel**

- **FR-039**: A lista de produtos do painel MUST mostrar a capa de cada produto
  como miniatura, substituindo o marcador "sem foto" da 003.
- **FR-040**: O detalhe do produto MUST mostrar as fotos na ordem, com a capa
  primeiro, e manter o restante do FR-016 da 003.
- **FR-041**: Todas as mensagens desta feature MUST seguir a linguagem simples da
  constitution (princípio V), sem jargão técnico (ex.: não dizer "upload", "MIME",
  "EXIF", "timeout").

### Key Entities *(include if feature involves data)*

- **Foto do produto** *(prevista na 003, criada a partir desta feature)*: imagem
  tratada no aparelho e verificada pelo servidor (WebP, JPEG ou PNG, estática,
  sem metadados) pertencente a exatamente um produto, com
  posição 1 a 3, data de envio e quem enviou. A posição 1 é a capa.
- **Conjunto de fotos do produto**: as fotos de um produto vistas como um todo,
  com uma versão própria para detectar mudanças concorrentes (FR-023),
  independente da versão do produto.
- **Foto temporária**: imagem tratada no aparelho e enviada direto à área
  temporária antes de o produto existir, vinculada à administradora que a enviou,
  com data de envio. Só pode ser adotada ou enviada à IA depois de o servidor
  confirmar o envio (FR-015). Deixa de ser temporária ao ser adotada por um
  produto; expira em 24 horas se não for adotada.
- **Sugestão da IA**: proposta de nome, categoria (uma das existentes) e descrição
  para um cadastro em andamento. Não é guardada; vive só no formulário até a
  administradora salvar ou sair.
- **Produto** *(existente, da 003)*: passa a exigir de 1 a 3 fotos; a remoção
  apaga as fotos.
- **Categoria** *(existente, da 002)*: lista fechada da qual a IA escolhe.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A mãe, sozinha, pelo próprio celular, cadastra um produto das fotos
  ao salvar (ao menos 1 foto tirada na hora, revisão da sugestão, preço) em até 4
  minutos na primeira tentativa, sem pedir ajuda, com o mesmo protocolo de
  observação do SC-005 da 001, do SC-007 da 002 e do SC-001 da 003 (sessão
  observada, sem instrução prévia além de "cadastre este produto"). Entra junto com
  as observações pendentes da 001, 002 e 003 na entrega.
- **SC-002**: Na mesma sessão, a mãe troca a capa de um produto existente em até 1
  minuto, sem ajuda.
- **SC-003**: Em teste com um conjunto de pelo menos 10 produtos reais da loja, a
  categoria sugerida pela IA é a correta em pelo menos 8 de cada 10 casos, e em
  100% dos casos é uma categoria existente ou vazia.
- **SC-004**: Em 90% dos cadastros, a sugestão aparece no formulário em até 15
  segundos depois de tocar em "Continuar", numa conexão móvel comum.
- **SC-005**: Uma foto de celular comum (cerca de 12 megapixels) gasta no máximo
  1 MB de dados móveis para ser enviada, medido no envio.
- **SC-006**: 0 fotos guardadas contêm metadados de localização ou de câmera, e 0
  arquivos fora dos formatos aceitos (JPEG, PNG, WebP estáticos) permanecem
  guardados depois da confirmação do envio, verificado por teste automatizado que
  coloca na área temporária arquivos forjados, sem o tratamento do aparelho (com
  GPS, SVG, GIF, HEIC, animado, PDF renomeado), e confere que todos são apagados e
  recusados.
- **SC-007**: Em teste automatizado de ações simultâneas, 0 produtos ficam com 0
  fotos, mais de 3 fotos, posições repetidas ou com buraco, ou em destaque sem
  foto.
- **SC-008**: Depois de uma execução da limpeza, 0 fotos temporárias com mais de
  24 horas e 0 fotos sem produto permanecem guardadas, e 0 fotos de produtos
  existentes foram apagadas.
- **SC-009**: Com a IA indisponível, 100% dos cadastros manuais com fotos
  continuam possíveis, verificado por teste automatizado.
- **SC-010**: 100% dos critérios de aceite desta spec têm ao menos um teste
  automatizado passando (o SC-001 e o SC-002 são verificados por observação).
- **SC-011**: Nenhuma mensagem exibida às administradoras nesta feature contém
  jargão técnico, verificado na revisão das mensagens (mesma régua do SC-005 da
  001).

## Fora do escopo

- Catálogo público e exibição das fotos às clientes.
- Carrossel de destaques ordenado por `destaque_vaga`.
- Busca no catálogo público.
- Sugestão por IA na edição de produto existente.
- Sugestão de preço, status ou destaque pela IA.
- Variações de produto como entidade própria (continuam na descrição).
- Guarda do arquivo original da foto.

## Dependências

- **Spec da 003**: FR-013 e FR-014 da 003 são alterados por esta feature (FR-001);
  a 003 deve receber nota apontando para a 004.
- **Zonas protegidas**: armazenamento de fotos, IA, schema de dados e
  configuração de ambiente são zonas protegidas; mudanças só pelo tech-lead com
  revisão humana.

## Itens técnicos para o plan (registrados, não decididos aqui)

- Limite de tamanho na URL pré-assinada do R2 (como amarrar o tamanho máximo à
  autorização de envio), duração da autorização e valor do teto do FR-014.
- Geração de WebP pelo canvas no Safari (iPhone) e o fallback para JPEG quando o
  navegador não gerar WebP; qualidade de compressão para cumprir o SC-005.
- Como verificar, sem processar a imagem, a ausência de metadados (leitura da
  estrutura do arquivo: blocos do JPEG, chunks do PNG e do WebP; lista exata de
  blocos permitidos por formato, conforme FR-016), a imagem
  estática e as dimensões (pelo cabeçalho), dentro do limite de CPU do Worker.
- Suporte a HEIC/HEIF no navegador (abertura para o recorte fora do Safari).
- Dimensão final da foto guardada (lado do quadrado 1:1).
- Estrutura de chaves no R2 (temporário vs. definitivo) e como a adoção move ou
  referencia o objeto.
- Mecanismo e frequência da limpeza periódica (FR-037).
- Modelo da OpenAI, tempo limite (FR-031), limite de uso (FR-032) e custo por
  chamada.
- Forma do controle de concorrência das fotos (FR-023) e chave do lock advisory
  das ações de fotos no registro único de locks (FR-003, ADR-008).
- Gravação imediata por ação na tela "Fotos": cada ação devolve a versão nova do
  conjunto de fotos e a tela passa a usá-la (FR-024), para que ações seguidas da
  mesma administradora não sejam recusadas como conflito com ela mesma; definir
  como a versão volta ao client e como a tela se atualiza.

## Assumptions

- Produção está vazia: não há produtos sem foto a migrar (dev online e local: ver
  Clarifications).
- A sugestão da IA é pedida uma vez por cadastro, automaticamente ao tocar em
  "Continuar"; novos pedidos só pelo botão "Tentar sugestão de novo" depois de
  falha. Trocar as fotos depois de pedir a sugestão não pede outra sugestão
  automaticamente.
- As administradoras usam celulares com câmera e navegador atual (Android com
  Chrome e iPhone com Safari); desktop continua secundário, com "Escolher
  arquivo" no lugar dos dois botões.
- A autenticação, a allowlist e os guards da 001 são reaproveitados sem mudança.
- A mensagem de "produto não encontrado" e a confirmação de remoção vêm da 003,
  com o acréscimo de FR-035.
