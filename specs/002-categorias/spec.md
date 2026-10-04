# Feature Specification: Categorias do catálogo

**Feature Branch**: `feature/002-categorias`

**Created**: 2026-10-04

**Status**: Draft (aguardando clarify)

**Input**: User description: "Categorias do catálogo da Roseshop. A Roseshop é um catálogo de revenda que a dona vende pelo WhatsApp. Não há busca: o filtro por categoria é o único meio de navegação do catálogo público, então as categorias organizam os produtos e alimentam esse filtro. A lista de categorias é fixa e controlada pelas administradoras (três pessoas, todas com o mesmo poder, já autenticadas pela feature 001). Pelo painel, elas podem ver a lista, criar, renomear e remover categorias. Lista inicial, que deve existir desde o primeiro deploy: Bolsas, Guarda-chuvas, Tupperware, Panos de prato, Meias. Não pode haver duplicidade: dois nomes são iguais quando diferem só em maiúsculas/minúsculas, acentos ou espaços extras, tanto ao criar quanto ao renomear. Uma feature futura de IA vai sugerir a categoria de um produto a partir das fotos, escolhendo exclusivamente dentro dessa lista e nunca criando categoria; a lista é a fonte única de verdade para isso. O público do painel é de administradoras com pouca familiaridade com tecnologia, usando o celular: mensagens de erro claras, em português, sem jargão. Fora de escopo: cadastro de produtos (feature 003), catálogo público e filtro visível ao visitante, IA de preenchimento e identidade visual (a UI do painel é funcional e simples, já que o ADR-005 está pendente)."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Ver a lista de categorias (Priority: P1)

A administradora abre a área de categorias no painel, pelo celular, e vê todas as
categorias existentes, uma por linha, com o nome de cada uma. No primeiro uso, a
lista já contém Bolsas, Guarda-chuvas, Tupperware, Panos de prato e Meias, sem que
ninguém precise cadastrá-las.

**Why this priority**: Sem a lista não há o que organizar, renomear ou remover; é
também a base que a feature de produtos (003) e a futura IA vão consumir.

**Independent Test**: Em um ambiente recém-publicado, entrar no painel como
administradora, abrir a área de categorias e conferir que as cinco categorias
iniciais aparecem.

**Acceptance Scenarios**:

1. **Given** um ambiente recém-publicado e uma administradora conectada, **When** ela abre a área de categorias, **Then** vê exatamente as cinco categorias iniciais: Bolsas, Guarda-chuvas, Tupperware, Panos de prato e Meias.
2. **Given** a lista exibida em um celular, **When** ela é carregada, **Then** cada categoria ocupa uma linha legível, com texto de no mínimo 16px e alvos de toque de no mínimo 48px.
3. **Given** uma pessoa sem sessão autorizada, **When** ela tenta abrir a área de categorias, **Then** é levada à tela de entrada e nenhum nome de categoria é exibido (regras da feature 001).
4. **Given** um ambiente que já foi publicado antes e cuja lista foi alterada pelas administradoras, **When** uma nova versão do sistema é publicada, **Then** as alterações delas (criações, renomeações, remoções) são preservadas.

---

### User Story 2 - Criar uma categoria (Priority: P1)

A administradora toca em "Nova categoria", digita o nome, confirma e vê a categoria
na lista.

**Why this priority**: A lista é controlada pelas administradoras; quando surgir um
tipo novo de produto, elas precisam poder abrir espaço para ele sem ajuda técnica.

**Independent Test**: Criar uma categoria com nome inédito e conferir que ela aparece
na lista; tentar criar outra com nome equivalente e conferir a recusa.

**Acceptance Scenarios**:

1. **Given** a área de categorias aberta, **When** a administradora informa um nome que não existe na lista e confirma, **Then** a categoria passa a aparecer na lista, sem recarregar nada manualmente além do fluxo normal da tela.
2. **Given** uma categoria "Panos de prato", **When** a administradora tenta criar "panos de prato", "PANOS DE PRATO" ou "  Panos   de prato  ", **Then** a criação é recusada e nada muda na lista.
3. **Given** uma categoria "Guarda-chuvas", **When** a administradora tenta criar "Guarda-chuva" com a diferença só no acento ou em letras equivalentes (por exemplo, "Guárda-chuvas"), **Then** a criação é recusada como duplicada.
4. **Given** o campo de nome vazio ou só com espaços, **When** a administradora confirma, **Then** a criação é recusada com mensagem pedindo que ela escreva um nome.
5. **Given** uma recusa por nome repetido, **When** a mensagem aparece, **Then** ela diz em português simples qual categoria já existe com aquele nome (por exemplo, "Já existe uma categoria chamada Panos de prato."), sem termos técnicos, e o que a administradora digitou continua no campo para ela corrigir.
6. **Given** uma pessoa sem sessão autorizada, **When** a ação de criar é chamada diretamente (sem passar pela interface), **Then** ela é recusada e nada é criado.

---

### User Story 3 - Renomear uma categoria (Priority: P1)

A administradora escolhe uma categoria da lista, toca em "Renomear", digita o novo
nome e confirma. A categoria passa a ter o novo nome em todos os lugares onde aparece.

**Why this priority**: Corrigir um erro de digitação ou ajustar o nome sem perder
o que já está ligado à categoria é uma necessidade comum e não pode exigir apagar
e recriar.

**Independent Test**: Renomear uma categoria para um nome inédito e conferir a
lista; tentar renomear outra para um nome equivalente a uma terceira e conferir a recusa.

**Acceptance Scenarios**:

1. **Given** uma categoria existente, **When** a administradora informa um novo nome inédito e confirma, **Then** a lista mostra o novo nome no lugar do antigo e o antigo deixa de existir.
2. **Given** uma categoria "Meias" e outra "Bolsas", **When** a administradora tenta renomear "Meias" para "bolsas" (ou "BÓLSAS", ou "Bolsas " com espaço extra), **Then** a renomeação é recusada como duplicada, com a mesma mensagem clara da criação, e "Meias" continua com o nome original.
3. **Given** uma categoria "bolsas", **When** a administradora a renomeia para "Bolsas" (diferença só de maiúscula, para corrigir a grafia), **Then** a renomeação é aceita, pois o nome equivalente pertence à própria categoria.
4. **Given** uma categoria que (no futuro) estará ligada a produtos, **When** ela é renomeada, **Then** a ligação é mantida: os produtos continuam na mesma categoria, agora com o novo nome.
5. **Given** o novo nome vazio ou só com espaços, **When** a administradora confirma, **Then** a renomeação é recusada com mensagem pedindo que ela escreva um nome, e o nome atual é mantido.
6. **Given** uma pessoa sem sessão autorizada, **When** a ação de renomear é chamada diretamente, **Then** ela é recusada e nada muda.

---

### User Story 4 - Remover uma categoria (Priority: P2)

A administradora escolhe uma categoria, toca em "Remover" e o painel pede uma
confirmação com texto claro do que vai acontecer. Ao confirmar, a categoria sai da lista.

**Why this priority**: Importante para manter a lista enxuta, mas o catálogo já
funciona com criar e renomear. É a história com mais pontos de produto em aberto.

**Independent Test**: Remover uma categoria sem produtos e conferir que ela sai da
lista; cancelar a confirmação e conferir que nada muda.

**Acceptance Scenarios**:

1. **Given** uma categoria sem produtos ligados, **When** a administradora toca em "Remover", **Then** o painel mostra uma confirmação em português simples dizendo qual categoria será removida e que a ação não pode ser desfeita, com botões claros de confirmar e de cancelar (≥ 48px).
2. **Given** a confirmação aberta, **When** a administradora cancela, **Then** a categoria continua na lista e nada muda.
3. **Given** a confirmação aberta, **When** ela confirma, **Then** a categoria sai da lista e deixa de poder ser escolhida por qualquer outra parte do sistema.
4. **Given** uma categoria que tem produtos ligados, **When** a administradora tenta removê-la, **Then** o comportamento é: [NEEDS CLARIFICATION: o que acontece ao remover uma categoria que já tem produtos vinculados? Opções: (a) bloquear a remoção com aviso e só permitir quando não houver produtos; (b) permitir e deixar os produtos sem categoria; (c) permitir mediante escolha de outra categoria para onde os produtos serão movidos.]
5. **Given** uma pessoa sem sessão autorizada, **When** a ação de remover é chamada diretamente, **Then** ela é recusada e nada é removido.

---

### User Story 5 - Lista como fonte única para outras partes do sistema (Priority: P1)

O cadastro de produtos (feature 003) e a futura IA de sugestão de categoria
escolhem categorias exclusivamente dentro da lista mantida pelas administradoras.
Nenhuma outra parte do sistema cria categoria.

**Why this priority**: É a garantia que impede categorias paralelas, duplicadas ou
inventadas pela IA, o que quebraria o filtro do catálogo. Precisa estar fechada
no desenho desta feature, mesmo que os consumidores só cheguem depois.

**Independent Test**: Verificar que existe uma única lista de categorias, que
qualquer consumidor a obtém por um mesmo ponto de acesso e que não há caminho
para criar categoria fora da ação das administradoras no painel.

**Acceptance Scenarios**:

1. **Given** uma categoria criada, renomeada ou removida no painel, **When** outra parte do sistema consulta as categorias disponíveis, **Then** vê o resultado atualizado, sem cópia ou lista paralela.
2. **Given** um valor de categoria vindo de fora da lista (por exemplo, um nome sugerido pela IA que não existe na lista), **When** o sistema o valida, **Then** o valor é rejeitado e nenhuma categoria nova é criada.
3. **Given** qualquer fluxo que não seja a ação de uma administradora autorizada no painel, **When** ele tenta criar uma categoria, **Then** não existe caminho que permita isso.
4. **Given** uma categoria renomeada, **When** outra parte do sistema guarda a escolha de categoria, **Then** a escolha continua válida após a renomeação (a referência não depende do texto do nome).

---

### Edge Cases

- Duas administradoras criam, ao mesmo tempo, categorias com nomes equivalentes: só
  uma é criada; a outra recebe a mensagem de nome repetido.
- Uma administradora tem a lista aberta enquanto outra remove ou renomeia uma
  categoria: ao agir sobre uma categoria que não existe mais, ela vê uma mensagem
  simples ("Esta categoria não existe mais. Atualize a lista.") e nada é alterado.
- Nome com apenas espaços, só pontuação ou só símbolos: recusado com mensagem
  pedindo um nome válido. [Regras exatas de tamanho e caracteres: ver Questões em aberto.]
- Nome equivalente ao de uma categoria que acabou de ser removida: aceito, pois a
  removida deixou de existir.
- Lista vazia (todas as categorias removidas): a tela mostra uma mensagem
  amigável convidando a criar a primeira categoria; nenhuma outra parte do sistema
  recebe categoria inventada. [Se isso é permitido: ver Questões em aberto, item 3.]
- Falha ao salvar por motivo externo (conexão ruim no celular): mensagem simples
  ("Não foi possível salvar agora. Tente de novo em instantes."), sem jargão, e a
  lista continua como estava.
- Acentos: a comparação trata "Guarda-chuvas" e "Guarda chuvas" como nomes
  diferentes apenas se diferirem em outra coisa além de maiúsculas, acentos e
  espaços extras; hífen é caractere do nome. [Hífen versus espaço: ver Questões em aberto, item 3.]

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema MUST manter uma única lista de categorias, controlada exclusivamente pelas administradoras, sem categorias paralelas em outro lugar.
- **FR-002**: A lista MUST existir, desde o primeiro deploy de cada ambiente, com as categorias Bolsas, Guarda-chuvas, Tupperware, Panos de prato e Meias, sem ação manual de ninguém.
- **FR-003**: Publicar uma nova versão do sistema MUST preservar a lista como as administradoras a deixaram (criações, renomeações e remoções), sem recriar nem sobrescrever nada.
- **FR-004**: Administradoras autorizadas MUST poder ver a lista, criar, renomear e remover categorias pelo painel; todas têm exatamente o mesmo poder (sem papéis).
- **FR-005**: O sistema MUST recusar um nome de categoria equivalente a outro já existente, na criação e na renomeação. Dois nomes são equivalentes quando diferem apenas em maiúsculas/minúsculas, acentos ou espaços extras (nas pontas ou repetidos no meio).
- **FR-006**: Na renomeação, o nome equivalente à própria categoria MUST ser aceito (permite corrigir maiúsculas, acentos e espaços).
- **FR-007**: O sistema MUST recusar nome vazio ou composto só por espaços, na criação e na renomeação.
- **FR-008**: O sistema MUST guardar o nome da categoria sem espaços extras nas pontas e sem espaços repetidos no meio, preservando as maiúsculas e os acentos como a administradora digitou.
- **FR-009**: Renomear uma categoria MUST manter sua identidade: tudo que estiver ligado a ela continua ligado, e qualquer referência guardada por outra parte do sistema permanece válida.
- **FR-010**: Remover uma categoria MUST exigir confirmação explícita, com texto claro do que vai acontecer, antes de qualquer efeito (constitution V).
- **FR-011**: A remoção de categoria com produtos ligados MUST seguir a regra definida em [NEEDS CLARIFICATION: comportamento da remoção com produtos vinculados; ver User Story 4, cenário 4].
- **FR-012**: A ordem de exibição das categorias na lista do painel MUST seguir [NEEDS CLARIFICATION: qual é a ordem de exibição? Opções: (a) alfabética pelo nome; (b) ordem de criação; (c) ordem definida pelas administradoras, com controle para subir e descer].
- **FR-013**: A relação entre produto e categoria MUST ser [NEEDS CLARIFICATION: um produto pertence a exatamente uma categoria ou pode ter várias? Opções: (a) exatamente uma; (b) uma ou mais]. Esta feature só entrega a lista; a regra define o contrato que a feature 003 vai consumir.
- **FR-014**: Outras partes do sistema (cadastro de produtos e IA) MUST obter as categorias disponíveis exclusivamente a partir dessa lista e MUST escolher somente entre as categorias existentes; um valor fora da lista MUST ser rejeitado.
- **FR-015**: Nenhuma parte do sistema, incluindo a futura IA, MUST ter caminho para criar, renomear ou remover categoria; só a ação de uma administradora autorizada no painel.
- **FR-016**: Toda página e ação de categorias MUST exigir sessão de administradora autorizada, verificada a cada acesso (regras da feature 001); sem ela, páginas levam à entrada e ações são recusadas sem efeitos e sem devolver dados.
- **FR-017**: Todas as mensagens ao usuário (erros, confirmações, avisos) MUST ser em português simples, sem jargão ou códigos técnicos, dizer o que aconteceu e o que fazer em seguida, e ser exibidas junto ao campo ou à ação a que se referem.
- **FR-018**: A interface de categorias MUST seguir a constitution V: uma tarefa por tela, alvos de toque ≥ 48px, texto ≥ 16px, linguagem simples, desenho pensado primeiro para celular, sem identidade visual própria (UI funcional e simples).
- **FR-019**: Quando duas administradoras agirem ao mesmo tempo sobre a mesma categoria ou o mesmo nome, o sistema MUST manter a lista consistente (sem duplicidade e sem perda silenciosa de alteração) e informar a segunda com mensagem clara.

### Key Entities

- **Categoria**: agrupamento de produtos que alimenta o filtro do catálogo público.
  Atributos: nome (texto exibido às clientes e às administradoras, único segundo a
  equivalência de FR-005) e identidade estável que não muda ao renomear. Existe
  uma única lista de categorias no sistema. Outras entidades (produto, na feature
  003) referenciam a categoria pela identidade, não pelo nome.
- **Administradora**: pessoa autorizada pela feature 001; única que cria, renomeia
  e remove categorias.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Em 100% dos ambientes novos, a lista contém as cinco categorias iniciais logo após o primeiro deploy, sem ação manual.
- **SC-002**: A administradora cria, renomeia ou remove uma categoria em no máximo 3 toques depois de abrir a área de categorias (sem contar a digitação do nome nem a confirmação de remoção) e em menos de 30 segundos.
- **SC-003**: 100% das tentativas de criar ou renomear para um nome equivalente a outro existente (maiúsculas, acentos ou espaços extras) são recusadas, com mensagem clara.
- **SC-004**: 100% das páginas e ações de categorias recusam acesso sem sessão autorizada (verificado por testes automatizados).
- **SC-005**: 100% das mensagens de erro e confirmação desta feature estão em português e não contêm termos técnicos (verificado por revisão da lista de mensagens).
- **SC-006**: Nenhum valor de categoria fora da lista é aceito por consumidores da lista (verificado por teste de rejeição), e nenhuma categoria é criada por qualquer caminho diferente da ação da administradora no painel.
- **SC-007**: A dona do negócio, no celular, consegue criar e renomear uma categoria sozinha, na primeira tentativa, sem ajuda.
- **SC-008**: Após uma nova publicação do sistema, 100% das alterações feitas pelas administradoras na lista continuam presentes.

## Assumptions

- A autenticação e a autorização das administradoras são as da feature 001; esta
  feature só consome a verificação existente e não a altera.
- A lista é pequena (dezenas de itens, no máximo), então não há paginação nem busca
  dentro da tela de categorias.
- A comparação de equivalência de nomes trata maiúsculas/minúsculas, acentos e
  espaços extras como irrelevantes (definição dada pelo humano); outras diferenças
  (como hífen contra espaço) tornam os nomes diferentes, salvo decisão em contrário
  nas Questões em aberto.
- A identidade visual do painel está pendente (ADR-005); a tela segue só os
  requisitos mínimos da constitution V.
- O catálogo público e o filtro visível ao visitante ficam para outra feature; esta
  feature só entrega a lista e as regras que o filtro vai consumir.
- Fora de escopo: cadastro de produtos (feature 003), catálogo público e filtro
  visível ao visitante, IA de preenchimento ou sugestão, identidade visual,
  histórico ou auditoria de alterações em categorias, papéis diferentes entre
  administradoras, categorias aninhadas (subcategorias) e imagens ou descrições de
  categoria.

## Questões em aberto

As três primeiras estão marcadas no texto como `[NEEDS CLARIFICATION]` (limite do
template). As demais são pontos de produto que não foram decididos aqui e precisam
de resposta no `/speckit-clarify`:

1. **Remoção com produtos vinculados** (FR-011, US4 cenário 4): bloquear, deixar
   produtos sem categoria ou mover para outra categoria.
2. **Ordem de exibição** (FR-012): alfabética, de criação ou definida pelas
   administradoras.
3. **Cardinalidade produto × categoria** (FR-013): exatamente uma ou várias.
4. **Recriação da lista inicial**: se uma administradora remover uma das cinco
   categorias iniciais, ela deve voltar em algum deploy futuro? (FR-003 assume que
   não; precisa de confirmação.)
5. **Lista vazia**: é permitido remover todas as categorias, ou deve existir sempre
   ao menos uma?
6. **Regras do nome**: tamanho máximo e mínimo, e quais caracteres são aceitos
   (por exemplo, números, pontuação, emojis); e se hífen e espaço contam como
   equivalentes ("Guarda-chuvas" × "Guarda chuvas").
