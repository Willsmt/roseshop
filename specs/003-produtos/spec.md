# Feature Specification: Produtos do painel

**Feature Branch**: `feature/003-produtos`

**Created**: 2026-10-07

**Status**: Approved

**Input**: User description: "Feature 003 — produtos (CRUD de produtos no painel das admins). As três admins (mesmo poder) cadastram, editam, marcam disponível/esgotado e removem os produtos de revenda, que depois alimentam o catálogo público e a sacola do WhatsApp. A mãe usa pelo celular e tem baixa familiaridade com tecnologia: o fluxo precisa ser curto e tolerante a erro."

## Clarifications

### Session 2026-10-07

- Q: Quais os limites de tamanho do nome e da descrição? → A: Nome de 3 a 80 caracteres (contados após remover espaços nas pontas e colapsar espaços repetidos); descrição até 1000 caracteres.
- Q: Há limite de destaques e produto esgotado pode ser destaque? → A: No máximo 8 produtos em destaque ao mesmo tempo; produto esgotado não pode ser destacado; ao ser marcado como esgotado, sai do destaque automaticamente; voltar a "Disponível" NÃO recoloca no destaque.
- Q: A concorrência otimista vale também para troca de status e de destaque? → A: Sim, é estrita para todas as ações (edição, status, destaque e remoção), sem exceção.
- Q: Como evitar produto duplicado por duplo toque em "Salvar"? → A: Sem mecanismo extra: o segundo envio cai na unicidade de nome (FR-004/FR-005) e a mensagem mostra o código do produto existente como link para o detalhe dele.
- Q: O alvo de 2 s do SC-007 vale para toda requisição? → A: Vale excluindo a primeira requisição após um período de inatividade do banco (partida a frio do provedor).
- Q: A regra de equivalência da 002 (FR-005) trata hífen e espaço como equivalentes? → A: Sim (ex.: "Guarda-chuvas" = "Guarda chuvas"); FR-004 permanece como está.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Cadastrar um produto (Priority: P1)

A administradora, pelo celular, abre o painel, escolhe "Novo produto", informa o
nome, escolhe a categoria, opcionalmente escreve a descrição e o preço (podendo
marcar "a partir de") e salva. O produto passa a existir na hora, recebe um
código de referência curto (ex.: #0042) e aparece no topo da lista de produtos.

**Why this priority**: sem produto cadastrado nada mais da loja funciona
(catálogo, destaques, sacola). É também a tarefa que a mãe mais vai repetir.

**Independent Test**: com o painel vazio de produtos, cadastrar um produto só
com nome e categoria e verificar que ele aparece na lista com código, categoria
e status "Disponível".

**Acceptance Scenarios**:

1. **Given** uma administradora logada e a categoria "Meias" existente, **When**
   ela informa o nome "Meia soquete listrada", escolhe "Meias" e salva, **Then**
   o produto é criado com status "Disponível", sem preço, sem foto, sem destaque,
   recebe o próximo código de referência e aparece no topo da lista.
2. **Given** o formulário de novo produto, **When** ela informa preço "12,90" e
   marca "a partir de", **Then** o produto é salvo com esse preço e com a
   indicação "a partir de", exibidos como "a partir de R$ 12,90".
3. **Given** o formulário de novo produto, **When** ela tenta salvar sem nome ou
   sem categoria, **Then** nada é salvo, o que ela já digitou é preservado e uma
   mensagem simples diz qual campo falta.
4. **Given** um produto "Meia Soquete" já cadastrado, **When** ela tenta cadastrar
   "meia soquete" ou "Méia Soquete", **Then** nada é salvo e a mensagem informa
   que já existe um produto com esse nome, mostrando o código dele como link
   para o detalhe desse produto.
5. **Given** um preço inválido (zero, negativo, texto ou acima do limite),
   **When** ela salva, **Then** nada é salvo e a mensagem explica o formato
   esperado (ex.: "12,90").
6. **Given** que a opção "a partir de" está marcada sem preço informado, **When**
   ela salva, **Then** nada é salvo e a mensagem pede o preço ou a retirada da
   marcação.
7. **Given** duas administradoras salvando produtos novos ao mesmo tempo,
   **When** os dois cadastros são concluídos, **Then** cada produto recebe um
   código diferente.
8. **Given** que a categoria escolhida foi removida por outra administradora
   enquanto o formulário estava aberto, **When** ela salva, **Then** nada é salvo
   e a mensagem pede para escolher outra categoria, preservando o restante.

---

### User Story 2 - Marcar disponível / esgotado (Priority: P1)

A administradora abre o detalhe de um produto (a mesma visão que uma cliente
teria) e, por ser administradora, tem ali a ação de marcar o produto como
"Esgotado" ou de volta como "Disponível", com um toque.

**Why this priority**: é a alteração mais frequente do dia a dia (acabou o
estoque, chegou reposição) e precisa ser a mais rápida.

**Independent Test**: com um produto disponível, abrir o detalhe, tocar em
"Marcar como esgotado" e ver o status trocado no detalhe e na lista.

**Acceptance Scenarios**:

1. **Given** um produto "Disponível", **When** a administradora toca em "Marcar
   como esgotado" no detalhe, **Then** o status passa a "Esgotado", a tela
   confirma a mudança e a lista reflete o novo status.
2. **Given** um produto "Esgotado", **When** ela toca em "Marcar como
   disponível", **Then** o status volta a "Disponível".
3. **Given** que outra administradora alterou o mesmo produto depois que esta
   abriu o detalhe, **When** esta toca para trocar o status, **Then** a troca é
   recusada, nada é alterado e a mensagem pede para recarregar e ver o estado
   atual.
4. **Given** uma pessoa não logada ou fora da lista de administradoras, **When**
   ela tenta abrir o detalhe administrativo ou acionar a troca de status,
   **Then** o acesso é negado como em qualquer área do painel.
5. **Given** um produto "Disponível" e em destaque, **When** ela o marca como
   "Esgotado", **Then** ele sai do destaque automaticamente, na mesma ação, e a
   tela avisa isso.
6. **Given** um produto que saiu do destaque ao ser marcado como esgotado,
   **When** ela o marca de volta como "Disponível", **Then** ele continua fora do
   destaque até alguém destacá-lo de novo.

---

### User Story 3 - Encontrar um produto na lista do painel (Priority: P2)

A administradora vê a lista de produtos, mais recentes primeiro, em páginas, e
pode filtrar por categoria e por status e buscar pelo código (ex.: "42" ou
"#0042", que uma cliente mandou no WhatsApp) ou por parte do nome.

**Why this priority**: com dezenas de produtos, achar o item certo (sobretudo
pelo código que a cliente cita) vira o gargalo de qualquer outra ação.

**Independent Test**: com produtos de várias categorias e status, aplicar cada
filtro e cada tipo de busca e conferir que só os produtos esperados aparecem.

**Acceptance Scenarios**:

1. **Given** produtos cadastrados em datas diferentes, **When** a lista abre sem
   filtro, **Then** os produtos aparecem do mais recente para o mais antigo, cada
   um com código, nome, categoria, status e preço (quando houver).
2. **Given** mais produtos do que cabem numa página, **When** ela avança de
   página, **Then** vê os seguintes na mesma ordem, sem repetir nem pular itens.
3. **Given** o filtro "Meias" + "Esgotado", **When** aplicado, **Then** só aparecem
   produtos da categoria Meias que estão esgotados.
4. **Given** o produto #0042, **When** ela busca "42", "0042" ou "#0042", **Then**
   esse produto aparece.
5. **Given** o produto "Guarda-chuva Floral", **When** ela busca "floral" ou
   "guarda chuva", **Then** esse produto aparece (sem diferenciar maiúscula,
   minúscula, acento ou hífen).
6. **Given** uma busca ou filtro sem resultado, **When** aplicado, **Then** a tela
   diz em linguagem simples que nada foi encontrado e oferece limpar os filtros.
7. **Given** nenhum produto cadastrado, **When** a lista abre, **Then** uma
   mensagem convida a cadastrar o primeiro produto, com o botão "Novo produto".

---

### User Story 4 - Editar um produto (Priority: P2)

A partir do detalhe, a administradora edita nome, categoria, descrição, preço e
a marcação "a partir de". O código de referência nunca muda, nem quando o
produto troca de categoria.

**Why this priority**: corrigir erro de digitação, ajustar preço e trocar a
categoria são frequentes, mas menos que cadastrar e marcar esgotado.

**Independent Test**: editar um produto existente (inclusive a categoria) e
verificar que as alterações aparecem no detalhe e na lista com o mesmo código.

**Acceptance Scenarios**:

1. **Given** o produto #0042 na categoria "Bolsas", **When** ela muda a categoria
   para "Meias" e salva, **Then** o produto passa a "Meias" e continua #0042.
2. **Given** um produto com preço, **When** ela apaga o preço e salva, **Then** o
   produto fica sem preço e a marcação "a partir de" é desfeita.
3. **Given** a edição de um produto, **When** ela troca o nome para um já usado
   por outro produto (pela mesma regra de equivalência do cadastro), **Then**
   nada é salvo e a mensagem indica o código do produto que já usa o nome.
4. **Given** que outra administradora salvou uma alteração no mesmo produto
   enquanto esta editava, **When** esta salva, **Then** a segunda alteração é
   recusada, nada é sobrescrito e a mensagem pede para recarregar e refazer a
   alteração sobre a versão atual.
5. **Given** que o produto foi removido por outra administradora enquanto esta
   editava, **When** esta salva, **Then** nada é recriado e a mensagem informa que
   o produto não existe mais.
6. **Given** uma alteração salva, **When** o detalhe é aberto, **Then** mostra o
   e-mail da administradora que criou o produto e o da que alterou por último.

---

### User Story 5 - Marcar / desmarcar destaque (Priority: P3)

No detalhe do produto, a administradora marca ou desmarca o produto como
destaque. Nesta feature isso só fica registrado (e visível no painel); a vitrine
de destaques é da feature do catálogo público.

**Why this priority**: prepara o carrossel do catálogo, mas não tem efeito
visível para clientes nesta feature.

**Independent Test**: marcar um produto como destaque e verificar que a marcação
aparece no detalhe e na lista do painel; desmarcar e verificar que some.

**Acceptance Scenarios**:

1. **Given** um produto sem destaque, **When** ela toca em "Destacar", **Then** o
   produto fica marcado como destaque e a lista mostra essa marcação.
2. **Given** um produto em destaque, **When** ela toca em "Tirar do destaque",
   **Then** a marcação é removida.
3. **Given** que já existem 8 produtos em destaque, **When** ela tenta destacar
   um nono, **Then** nada é alterado e a mensagem explica que o limite é de 8
   destaques e que é preciso tirar um do destaque antes.
4. **Given** que outra administradora alterou o mesmo produto antes, **When** esta
   troca o destaque, **Then** a troca é recusada pela mesma regra de concorrência.
5. **Given** um produto "Esgotado", **When** ela abre o detalhe, **Then** a ação
   "Destacar" não é oferecida (ou, se acionada por outro caminho, é recusada sem
   alterar nada) e a mensagem explica que produto esgotado não pode ser destaque.
6. **Given** 7 produtos em destaque e duas administradoras destacando produtos
   diferentes ao mesmo tempo, **When** as duas ações terminam, **Then** no máximo
   uma é aceita e nunca existem mais de 8 produtos em destaque.

---

### User Story 6 - Remover um produto (Priority: P3)

No detalhe, a administradora escolhe "Remover produto". Uma confirmação explícita
diz o que vai acontecer ("O produto #0042 Meia soquete listrada será apagado de
vez e não poderá ser recuperado"). Confirmando, o produto some de todo o sistema.

**Why this priority**: necessário, mas raro; marcar como esgotado cobre a maior
parte das situações de "parei de vender por enquanto".

**Independent Test**: remover um produto confirmando a ação e verificar que ele
não aparece mais na lista, na busca nem pelo endereço do detalhe.

**Acceptance Scenarios**:

1. **Given** o detalhe do produto #0042, **When** ela toca em "Remover produto",
   **Then** aparece a confirmação com o código e o nome, e nada é apagado antes de
   ela confirmar.
2. **Given** a confirmação aberta, **When** ela cancela, **Then** o produto
   continua intacto.
3. **Given** a confirmação aberta, **When** ela confirma, **Then** o produto é
   apagado de vez, ela volta à lista com uma mensagem de sucesso e o produto não
   aparece em lista, busca, filtro nem pelo endereço do detalhe.
4. **Given** o produto #0042 removido, **When** um novo produto é cadastrado,
   **Then** ele recebe um código novo; #0042 nunca é reaproveitado.
5. **Given** que outra administradora alterou o produto depois que esta abriu a
   confirmação, **When** esta confirma, **Then** a remoção é recusada e a mensagem
   pede para recarregar e conferir o estado atual.
6. **Given** que o produto já foi removido por outra administradora, **When** esta
   confirma a remoção, **Then** a mensagem informa que o produto já não existe e
   ela volta à lista.

---

### User Story 7 - Categoria com produtos não pode ser removida (Priority: P1)

Com produtos reais existindo, a regra já prometida na 002 passa a valer de fato:
a administradora não consegue remover uma categoria que tenha produtos, e a
mensagem diz quantos produtos a categoria tem.

**Why this priority**: é a garantia de integridade que a 002 deixou para a 003;
sem ela, remover uma categoria deixaria produtos sem categoria.

**Independent Test**: cadastrar um produto numa categoria e tentar remover essa
categoria pelo painel de categorias.

**Acceptance Scenarios**:

1. **Given** a categoria "Meias" com 3 produtos, **When** a administradora tenta
   removê-la, **Then** a remoção é recusada e a mensagem informa que a categoria
   tem 3 produtos.
2. **Given** que o último produto de uma categoria foi removido ou movido para
   outra categoria, **When** ela remove a categoria, **Then** a remoção segue as
   regras normais da 002.
3. **Given** um produto sendo cadastrado numa categoria ao mesmo tempo em que
   outra administradora remove essa categoria, **When** as duas ações terminam,
   **Then** nunca existe produto apontando para categoria inexistente: ou o
   produto é salvo e a remoção é recusada, ou a categoria é removida e o cadastro
   é recusado.

---

### Edge Cases

- Nome só com espaços, com espaços nas pontas ou espaços duplos: espaços nas
  pontas são removidos e espaços repetidos são colapsados antes de validar; nome
  com menos de 3 caracteres após isso (inclusive vazio) é recusado.
- Nome acima de 80 caracteres ou descrição acima de 1000: recusado com mensagem
  que diz o limite; o texto digitado é preservado para ela encurtar.
- Preço com ponto, vírgula ou "R$" ("12.90", "12,90", "R$ 12,90"): aceito quando
  não há ambiguidade; o valor é sempre guardado de forma exata (sem
  arredondamento de casas decimais).
- Código acima de #9999: o código cresce de dígitos (#10000) sem quebrar busca nem
  ordenação.
- Duplo toque em "Salvar" no celular (rede lenta): não há mecanismo extra. No
  cadastro, o segundo envio é recusado pela unicidade de nome (FR-004/FR-005) e a
  mensagem mostra o código do produto já criado como link para o detalhe dele; na
  edição, troca de status ou destaque, o segundo envio é recusado pela
  concorrência otimista (FR-026). Em nenhum caso surge produto duplicado.
- Sessão expirada no meio do cadastro: a ação é recusada e a administradora é
  levada a entrar de novo, sem salvar dado parcial.
- Endereço de detalhe de produto inexistente ou removido: tela simples "Produto
  não encontrado" com caminho de volta à lista.
- Texto da descrição com quebras de linha: preservadas na exibição; nenhum texto
  digitado é interpretado como formatação ou código.
- Troca de categoria de um produto para uma categoria removida no meio tempo:
  tratada como no cadastro (recusa e pede outra categoria).

## Requirements *(mandatory)*

### Functional Requirements

**Acesso**

- **FR-001**: Todas as telas e ações desta feature MUST ser restritas às
  administradoras da allowlist, verificadas em cada tela e em cada ação (mesma
  regra da 001); as três administradoras têm exatamente o mesmo poder.

**Cadastro e campos**

- **FR-002**: Administradoras MUST poder cadastrar produto com: nome
  (obrigatório), categoria (obrigatória, exatamente uma), descrição (opcional),
  preço (opcional) e marcação "a partir de" (opcional, só com preço).
- **FR-003**: O nome MUST ter espaços nas pontas removidos e espaços repetidos
  colapsados antes de validar e, depois disso, ter de 3 a 80 caracteres. A
  descrição, quando informada, MUST ter no máximo 1000 caracteres.
- **FR-004**: O nome MUST ser único em todo o catálogo, sem diferenciar
  maiúscula, minúscula, acento ou hífen/espaço, pela mesma regra de equivalência
  usada para nomes de categoria na 002 (FR-005 da 002); a garantia vale mesmo com
  duas administradoras salvando ao mesmo tempo.
- **FR-005**: Ao recusar nome repetido, o sistema MUST informar o código do
  produto que já usa o nome, exibido como link para o detalhe desse produto
  (é também o que a administradora vê quando um duplo toque reenvia o cadastro,
  ver FR-028).
- **FR-006**: O preço, quando informado, MUST ser um valor em reais maior que
  zero, com no máximo duas casas decimais e até R$ 99.999,99, guardado de forma
  exata; a marcação "a partir de" MUST ser recusada sem preço e desfeita quando o
  preço for apagado.
- **FR-007**: A categoria MUST ser validada contra a lista de categorias
  existente (módulo de categorias da 002) no momento de salvar, tanto no cadastro
  quanto na edição.
- **FR-008**: Produto recém-cadastrado MUST nascer "Disponível", sem destaque e
  existir e ser visível assim que salvo (não há rascunho).
- **FR-009**: Erros de validação MUST ser exibidos em linguagem simples, junto do
  campo, preservando tudo que já foi digitado.

**Identificação**

- **FR-010**: Cada produto MUST ter um identificador interno único e um código de
  referência curto, sequencial e global, gerado automaticamente e exibido no
  formato "#" + pelo menos 4 dígitos (ex.: #0042).
- **FR-011**: O código de referência MUST nunca mudar (inclusive na troca de
  categoria), nunca ser reaproveitado após exclusão e nunca repetir, mesmo com
  cadastros simultâneos; buracos na sequência são aceitáveis.
- **FR-012**: O código MUST ser exibido em toda tela que mostra o produto (lista,
  detalhe, confirmação de remoção), por ser a referência usada entre
  administradora e cliente (inclusive na futura mensagem do WhatsApp).

**Fotos**

- **FR-013**: O produto MUST suportar até 3 fotos ordenadas. Nesta feature não há
  envio de fotos: todo produto fica sem foto, e telas que mostrariam foto exibem
  um marcador neutro de "sem foto".
- **FR-014** *(requisito futuro, aplicado a partir da 004)*: todo produto deverá
  ter pelo menos 1 foto. Na 003 é permitido salvar produto sem foto, pois nada é
  público ainda.

**Status e destaque**

- **FR-015**: O status MUST ser só "Disponível" ou "Esgotado" (sem quantidade em
  estoque).
- **FR-016**: O detalhe do produto MUST mostrar o produto como uma cliente o veria
  (fotos/marcador, nome, código, categoria, descrição, preço, status) e, para
  administradoras, as ações: marcar disponível/esgotado, editar, destacar/tirar do
  destaque (destacar só aparece para produto "Disponível") e remover.
- **FR-017**: A troca de status MUST ser uma ação de um toque no detalhe, com
  confirmação visual do novo status. Marcar como "Esgotado" um produto em destaque
  MUST tirá-lo do destaque na mesma ação, avisando a administradora; marcar de
  volta como "Disponível" MUST NOT recolocá-lo no destaque.
- **FR-018**: Administradoras MUST poder marcar e desmarcar destaque, com no
  máximo 8 produtos em destaque ao mesmo tempo (limite mantido mesmo com ações
  simultâneas) e somente para produtos "Disponível"; destacar além do limite ou um
  produto esgotado é recusado sem alterar nada, com mensagem que explica o motivo.
  A exibição dos destaques é da feature do catálogo público.

**Edição**

- **FR-019**: Administradoras MUST poder editar nome, categoria, descrição, preço e
  "a partir de", com as mesmas validações do cadastro.

**Listagem e busca (só no painel)**

- **FR-020**: A lista do painel MUST ordenar do mais recente (data de cadastro)
  para o mais antigo, paginada, mostrando código, nome, categoria, status, preço
  (quando houver) e marcação de destaque.
- **FR-021**: A lista MUST permitir filtrar por categoria e por status,
  combináveis entre si e com a busca.
- **FR-022**: A busca MUST encontrar por código (aceitando "42", "0042" ou
  "#0042") e por parte do nome, sem diferenciar maiúscula, minúscula, acento ou
  hífen/espaço.
- **FR-023**: O catálogo público MUST continuar sem busca; a busca é exclusiva do
  painel.

**Remoção**

- **FR-024**: A remoção MUST exigir confirmação explícita que nomeia o produto
  (código e nome) e diz que a exclusão é definitiva.
- **FR-025**: Confirmada, a remoção MUST apagar o produto de vez: ele não aparece
  em nenhuma lista, busca, filtro, contagem ou endereço do sistema.

**Concorrência e autoria**

- **FR-026**: Toda alteração de um produto (edição, troca de status, destaque,
  remoção) MUST seguir, sem exceção, a concorrência otimista estrita da 002: se o
  produto mudou desde que a administradora o abriu, a segunda alteração é recusada
  sem sobrescrever nada e a mensagem pede para recarregar, mesmo quando as duas
  alterações mexem em campos diferentes.
- **FR-027**: O sistema MUST registrar o e-mail da administradora que criou o
  produto e o da que fez a última alteração (qualquer alteração de FR-026, exceto
  remoção), e exibi-los no detalhe administrativo.
- **FR-028**: Não há mecanismo específico contra duplo toque ou reenvio. O
  segundo envio de um cadastro MUST ser recusado pela unicidade de nome
  (FR-004), com a mensagem de FR-005 (código do produto existente como link para
  o detalhe); o segundo envio de qualquer alteração MUST ser recusado pela
  concorrência otimista (FR-026). Em nenhum caso o reenvio cria produto
  duplicado.

**Integridade com categorias (herdado da 002)**

- **FR-029**: Remover categoria que tenha ao menos um produto MUST ser bloqueado,
  com a garantia mantida pelo próprio armazenamento de dados (não só pela tela),
  inclusive sob ações simultâneas; a mensagem informa quantos produtos a
  categoria tem (FR-011 da 002).
- **FR-030**: A garantia do FR-029 MUST ser coberta por teste automatizado de
  integração executado também no ambiente dev online, conforme a §5 do contrato
  da 002.
- **FR-031**: As fixtures e consultas provisórias que a 002 criou para simular
  produtos MUST ser substituídas pela estrutura real de produtos, sem mudar o
  comportamento já especificado na 002.

**Preenchimento por IA (preparação)**

- **FR-032**: Nesta feature o preenchimento é manual. Quando a IA (feature futura)
  sugerir valores, eles MUST passar exatamente pelas mesmas regras de FR-003 a
  FR-007 antes de serem salvos; a IA só sugere, quem salva é a administradora.

### Key Entities *(include if feature involves data)*

- **Produto**: item de revenda. Atributos: identificador interno, código de
  referência (sequencial, imutável, não reaproveitado), nome (único por
  equivalência), descrição, preço opcional em reais com indicação "a partir de",
  status (Disponível/Esgotado), destaque (sim/não), até 3 fotos ordenadas, data de
  cadastro, data da última alteração, e-mail de quem criou, e-mail de quem alterou
  por último e uma versão para detectar alterações concorrentes. Pertence a
  exatamente uma Categoria.
- **Foto do produto**: referência a uma imagem, com posição (1 a 3) dentro do
  produto. Prevista no modelo nesta feature; criada só a partir da 004.
- **Categoria** *(existente, da 002)*: agrupa produtos; não pode ser removida
  enquanto tiver produtos.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A mãe, sozinha, pelo próprio celular, cadastra um produto (nome,
  categoria e preço) em até 3 minutos na primeira tentativa, sem pedir ajuda,
  validado com o mesmo protocolo de observação do SC-005 da 001 e do SC-007 da
  002 (sessão observada, sem instrução prévia além de "cadastre este produto").
- **SC-002**: Na mesma sessão, a mãe marca um produto como esgotado e de volta como
  disponível em até 30 segundos partindo da lista, sem ajuda.
- **SC-003**: Dado um código citado por uma cliente (ex.: "42"), qualquer
  administradora encontra o produto na lista em até 15 segundos.
- **SC-004**: 100% dos critérios de aceite desta spec têm ao menos um teste
  automatizado passando.
- **SC-005**: Em teste automatizado de ações simultâneas, nenhum caso resulta em
  dois produtos com nome equivalente, código repetido, alteração sobrescrita sem
  aviso, produto apontando para categoria inexistente, mais de 8 produtos em
  destaque ou produto esgotado em destaque (0 ocorrências).
- **SC-006**: Remover uma categoria com produtos é recusado em 100% das tentativas,
  verificado também no ambiente dev online.
- **SC-007**: Com 500 produtos cadastrados, abrir a lista, trocar de página,
  filtrar ou buscar mostra o resultado em até 2 segundos numa conexão móvel comum,
  excluída a primeira requisição após um período de inatividade do banco
  (partida a frio do provedor).
- **SC-008**: Nenhuma mensagem de erro exibida às administradoras contém jargão
  técnico, verificado na revisão das mensagens (mesma régua do SC-005 da 001).

## Assumptions

- As três administradoras e o acesso ao painel são os da 001; nenhuma permissão
  nova é criada.
- A lista de categorias e suas regras são as da 002; a 003 só consome a lista
  e passa a tornar real o bloqueio de remoção por produtos.
- Nesta feature nada é público: o "detalhe como a cliente veria" existe dentro do
  painel; a versão pública é da feature do catálogo.
- Tamanho de página da lista: 20 produtos (ajustável no plano sem mudar a spec).
- "Mais recentes primeiro" usa a data de cadastro; editar um produto não o move
  para o topo.
- O limite de preço (R$ 99.999,99) cobre com folga os produtos de revenda.
- Produto sem preço é exibido sem valor (o texto exato de exibição fica para a
  feature do catálogo); no painel aparece como "Sem preço".
- Variações (cor, tamanho) ficam só na descrição; não há variações estruturadas.
- O tratamento de produtos criados sem foto na 003 quando a trava de foto passar a
  valer é decisão da 004.
- Remover um produto não deixa histórico; a autoria registrada é só a atual
  (criador e último editor), não um log de alterações.
- Fora de escopo: envio de fotos e trava de foto (004), IA de preenchimento,
  catálogo público e carrossel de destaques, sacola/WhatsApp e fundação visual
  (ADR-005).

## Dependencies

- Feature 001 (autenticação e allowlist das administradoras).
- Feature 002 (categorias): lista de categorias, validação de categoria, regra de
  equivalência de nomes, concorrência otimista e o contrato da §5 de
  `specs/002-categorias/contracts/categorias.md` (bloqueio de remoção garantido no
  armazenamento, teste de integração no ambiente dev e limpeza das fixtures e
  consultas provisórias).
