# Feature Specification: Categorias do catálogo

**Feature Branch**: `feature/002-categorias`

**Created**: 2026-10-04

**Status**: Draft (clarify concluído; plano e tasks gerados e revisados após duas análises; aguardando implementação)

**Input**: User description: "Categorias do catálogo da Roseshop. A Roseshop é um catálogo de revenda que a dona vende pelo WhatsApp. Não há busca: o filtro por categoria é o único meio de navegação do catálogo público, então as categorias organizam os produtos e alimentam esse filtro. A lista de categorias é fixa e controlada pelas administradoras (três pessoas, todas com o mesmo poder, já autenticadas pela feature 001). Pelo painel, elas podem ver a lista, criar, renomear e remover categorias. Lista inicial, que deve existir desde o primeiro deploy: Bolsas, Guarda-chuvas, Tupperware, Panos de prato, Meias. Não pode haver duplicidade: dois nomes são iguais quando diferem só em maiúsculas/minúsculas, acentos ou espaços extras, tanto ao criar quanto ao renomear. Uma feature futura de IA vai sugerir a categoria de um produto a partir das fotos, escolhendo exclusivamente dentro dessa lista e nunca criando categoria; a lista é a fonte única de verdade para isso. O público do painel é de administradoras com pouca familiaridade com tecnologia, usando o celular: mensagens de erro claras, em português, sem jargão. Fora de escopo: cadastro de produtos (feature 003), catálogo público e filtro visível ao visitante, IA de preenchimento e identidade visual (a UI do painel é funcional e simples, já que o ADR-005 está pendente)."

## Clarifications

### Session 2026-10-04

- Q: O que acontece ao remover uma categoria com produtos vinculados? → A: Bloqueado. A mensagem informa quantos produtos estão na categoria e orienta a movê-los antes.
- Q: Qual a ordem de exibição das categorias? → A: Alfabética automática, sem ordenação manual.
- Q: Um produto pertence a quantas categorias? → A: Exatamente uma.
- Q: A lista inicial volta em deploys futuros se for alterada? → A: Não. É criada uma única vez; categorias iniciais removidas ou renomeadas não voltam e as alterações das administradoras prevalecem.
- Q: Pode existir lista vazia? → A: Não. Deve existir sempre ao menos uma categoria; a remoção da última é bloqueada com mensagem clara.
- Q: Em renomeação concorrente da mesma categoria, qual regra vale? → A: A segunda alteração concorrente sobre a mesma categoria é recusada com mensagem pedindo para atualizar a lista (não vale "última gravação").
- Q: Quais as regras do nome? → A: De 2 a 40 caracteres após remover espaços nas pontas e colapsar espaços internos repetidos; aceita letras (incluindo acentuadas), números, espaço e hífen. Na checagem de duplicidade são iguais nomes que diferem só em maiúsculas/minúsculas, acentos, espaços extras ou hífen versus espaço. O nome é exibido exatamente como digitado (após a normalização de espaços).

### Session 2026-10-04 (após `/speckit-analyze`)

- Q: O que conta como "letra" e "número" no nome, e como tratar formas Unicode equivalentes? → A: Letras são qualquer caractere Unicode da categoria `\p{L}` (de qualquer alfabeto, incluindo acentuadas) e números são `\p{N}`. Antes de validar e guardar, o nome é normalizado para a forma NFC (mesmo texto visível, codificação única).
- Q: Como a área de categorias cumpre "uma tarefa por tela" (constitution V)? → A: Telas separadas: a lista; criar; renomear; e a confirmação de remoção, cada uma em sua tela.
- Q: A mensagem de bloqueio por produtos mostra a quantidade real já na 002? → A: Sim. A contagem lê os produtos ligados no momento da tentativa; na 002, sem cadastro de produtos, isso é verificado com uma tabela de produtos de teste.

### Session 2026-10-04 (implementação da SF3)

- Q: Um nome feito só de hífens e espaços (ex.: "--", "- -") é aceito? → A: Não. Após normalizar, o nome precisa conter pelo menos uma letra (`\p{L}`) ou um número (`\p{N}`); sem isso a chave de comparação fica vazia e esses nomes colidiriam entre si. Mensagem: "O nome precisa ter pelo menos uma letra ou número." ("A-" continua aceito.)

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

1. **Given** um ambiente recém-publicado e uma administradora conectada, **When** ela abre a área de categorias, **Then** vê exatamente as cinco categorias iniciais, em ordem alfabética: Bolsas, Guarda-chuvas, Meias, Panos de prato e Tupperware.
2. **Given** a lista exibida em um celular, **When** ela é carregada, **Then** cada categoria ocupa uma linha legível, com texto de no mínimo 16px e alvos de toque de no mínimo 48px.
3. **Given** uma pessoa sem sessão autorizada, **When** ela tenta abrir a área de categorias, **Then** é levada à tela de entrada e nenhum nome de categoria é exibido (regras da feature 001).
4. **Given** um ambiente que já foi publicado antes e cuja lista foi alterada pelas administradoras, **When** uma nova versão do sistema é publicada, **Then** as alterações delas (criações, renomeações, remoções) são preservadas.
5. **Given** uma categoria inicial removida ou renomeada por uma administradora, **When** uma nova versão do sistema é publicada, **Then** a categoria inicial não é recriada e a lista continua como as administradoras a deixaram.
6. **Given** categorias com nomes como "meias", "Bolsas" e "Água" (iniciais minúsculas ou acentuadas), **When** a lista é exibida, **Then** a ordem é alfabética, sem diferenciar maiúsculas/minúsculas nem acentos ("Água" antes de "Bolsas"), e cada nome aparece exatamente como foi digitado.

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
3. **Given** uma categoria "Guarda-chuvas", **When** a administradora tenta criar "Guárda-chuvas" (diferença só no acento), "guarda chuvas" (espaço no lugar do hífen) ou "GUARDA-CHUVAS", **Then** a criação é recusada como duplicada. "Guarda-chuva" (sem o "s") é um nome diferente e é aceito.
4. **Given** o campo de nome vazio ou só com espaços, **When** a administradora confirma, **Then** a criação é recusada com mensagem pedindo que ela escreva um nome.
5. **Given** um nome com menos de 2 ou mais de 40 caracteres (contados após remover espaços nas pontas e colapsar espaços repetidos), **When** a administradora confirma, **Then** a criação é recusada com mensagem dizendo o tamanho aceito (de 2 a 40 letras), e o texto digitado continua no campo.
6. **Given** um nome com caracteres fora de letras (incluindo acentuadas), números, espaço e hífen (por exemplo, "Bolsas!" ou "Meias 😀"), **When** a administradora confirma, **Then** a criação é recusada com mensagem dizendo que só letras, números, espaço e hífen são aceitos.
7. **Given** o nome "  Bolsas   de   Praia  ", **When** a categoria é criada, **Then** ela é salva e exibida como "Bolsas de Praia" (espaços normalizados, maiúsculas e acentos preservados).
8. **Given** uma recusa por nome repetido, **When** a mensagem aparece, **Then** ela diz em português simples qual categoria já existe com aquele nome e pede outro nome (por exemplo, "Já existe uma categoria chamada Panos de prato. Escolha outro nome."), sem termos técnicos, e o que a administradora digitou continua no campo para ela corrigir.
9. **Given** uma pessoa sem sessão autorizada, **When** a ação de criar é chamada diretamente (sem passar pela interface), **Then** ela é recusada e nada é criado.

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
4. **Given** uma renomeação, **When** o novo nome tem tamanho fora de 2 a 40 caracteres ou caracteres não aceitos, **Then** ela é recusada com as mesmas mensagens da criação e o nome atual é mantido.
5. **Given** uma categoria renomeada, **When** a lista é exibida, **Then** ela aparece na posição alfabética do novo nome.
6. **Given** uma categoria que (no futuro) estará ligada a produtos, **When** ela é renomeada, **Then** a ligação é mantida: os produtos continuam na mesma categoria, agora com o novo nome.
7. **Given** o novo nome vazio ou só com espaços, **When** a administradora confirma, **Then** a renomeação é recusada com mensagem pedindo que ela escreva um nome, e o nome atual é mantido.
8. **Given** uma pessoa sem sessão autorizada, **When** a ação de renomear é chamada diretamente, **Then** ela é recusada e nada muda.

---

### User Story 4 - Remover uma categoria (Priority: P2)

A administradora escolhe uma categoria, toca em "Remover" e o painel pede uma
confirmação com texto claro do que vai acontecer. Ao confirmar, a categoria sai da lista.

**Why this priority**: Importante para manter a lista enxuta, mas o catálogo já
funciona com criar e renomear.

**Independent Test**: Remover uma categoria sem produtos e conferir que ela sai da
lista; cancelar a confirmação e conferir que nada muda.

**Acceptance Scenarios**:

1. **Given** uma categoria sem produtos ligados, **When** a administradora toca em "Remover", **Then** o painel mostra uma tela de confirmação em português simples dizendo qual categoria será removida e que a ação não pode ser desfeita, com botões claros de confirmar e de cancelar (≥ 48px).
2. **Given** a confirmação aberta, **When** a administradora cancela, **Then** a categoria continua na lista e nada muda.
3. **Given** a confirmação aberta, **When** ela confirma, **Then** a categoria sai da lista e deixa de poder ser escolhida por qualquer outra parte do sistema.
4. **Given** uma categoria que tem produtos ligados (por exemplo, 3), **When** a administradora tenta removê-la, **Then** a remoção é bloqueada, nada muda, e a mensagem diz quantos produtos estão na categoria e orienta a movê-los para outra categoria antes (por exemplo, "Esta categoria tem 3 produtos. Mova esses produtos para outra categoria e tente remover de novo."; com 1 produto, a mensagem usa o singular).
5. **Given** que resta apenas uma categoria na lista, **When** a administradora tenta removê-la, **Then** a remoção é bloqueada, nada muda, e a mensagem diz que precisa existir pelo menos uma categoria (por exemplo, "A loja precisa ter pelo menos uma categoria. Crie outra antes de remover esta."). O botão "Remover" pode aparecer, mas a tentativa é recusada pelo sistema, não só pela interface.
6. **Given** uma pessoa sem sessão autorizada, **When** a ação de remover é chamada diretamente, **Then** ela é recusada e nada é removido.

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
- Duas administradoras renomeiam, ao mesmo tempo, a mesma categoria: só a primeira
  alteração é aplicada; a segunda é recusada, sem efeitos, com mensagem pedindo que
  atualize a lista (FR-019). Nenhuma alteração é perdida em silêncio.
- Nome com apenas espaços, só pontuação ou só símbolos: recusado (vazio, ou com
  caracteres não aceitos, conforme FR-007 e FR-008), com a mensagem correspondente.
- Nome equivalente ao de uma categoria que acabou de ser removida: aceito, pois a
  removida deixou de existir.
- Lista vazia: não é possível chegar a ela; a remoção da última categoria é
  bloqueada (FR-020). Duas administradoras removendo ao mesmo tempo as duas últimas
  categorias: só uma remoção é aceita e a outra recebe a mensagem de que precisa
  existir pelo menos uma categoria.
- Categoria inicial removida ou renomeada: nunca é recriada por uma nova publicação.
- Falha ao salvar ou remover por motivo externo (conexão ruim no celular): mensagem
  simples ("Não foi possível concluir agora. Tente de novo em instantes."), sem
  jargão, e a lista continua como estava.
- Equivalência: "Guarda-chuvas", "Guarda chuvas", "GUARDÁ-CHUVAS" e "guarda   chuvas"
  são o mesmo nome para fins de duplicidade; já "Guarda-chuva" (sem o "s") é outro
  nome. O nome salvo e exibido é sempre o que a administradora digitou, só com os
  espaços normalizados.
- Produto com uma categoria é removido ou movido: a contagem usada na mensagem de
  bloqueio reflete os produtos ligados no momento da tentativa de remoção.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema MUST manter uma única lista de categorias, controlada exclusivamente pelas administradoras, sem categorias paralelas em outro lugar.
- **FR-002**: A lista MUST existir, desde o primeiro deploy de cada ambiente, com as categorias Bolsas, Guarda-chuvas, Tupperware, Panos de prato e Meias, sem ação manual de ninguém.
- **FR-003**: A lista inicial MUST ser criada uma única vez por ambiente. Publicar uma nova versão do sistema MUST preservar a lista como as administradoras a deixaram (criações, renomeações e remoções), sem recriar nem sobrescrever nada; categorias iniciais removidas ou renomeadas não voltam.
- **FR-004**: Administradoras autorizadas MUST poder ver a lista, criar, renomear e remover categorias pelo painel; todas têm exatamente o mesmo poder (sem papéis).
- **FR-005**: O sistema MUST recusar um nome de categoria equivalente a outro já existente, na criação e na renomeação. Dois nomes são equivalentes quando diferem apenas em maiúsculas/minúsculas, acentos, espaços extras (nas pontas ou repetidos no meio) ou hífen versus espaço (por exemplo, "Guarda-chuvas" e "Guarda chuvas").
- **FR-006**: Na renomeação, o nome equivalente à própria categoria MUST ser aceito (permite corrigir maiúsculas, acentos e espaços).
- **FR-007**: O sistema MUST recusar nome vazio ou composto só por espaços, na criação e na renomeação, com mensagem pedindo que a administradora escreva um nome.
- **FR-008**: O nome da categoria MUST ser normalizado antes de validar e guardar: forma Unicode NFC, sem espaços nas pontas e com espaços repetidos no meio reduzidos a um. Depois disso, o nome MUST ter de 2 a 40 caracteres e conter apenas letras (Unicode `\p{L}`, de qualquer alfabeto, incluindo acentuadas), números (Unicode `\p{N}`), espaço e hífen; qualquer outro caractere (pontuação, símbolos, emojis) é recusado, com mensagem que diz o que é aceito. O nome normalizado MUST conter pelo menos uma letra ou um número (nomes só com hífens e espaços, como "--" ou "- -", são recusados com a mensagem "O nome precisa ter pelo menos uma letra ou número."). O nome MUST ser guardado e exibido exatamente como digitado após essa normalização, preservando maiúsculas e acentos.
- **FR-009**: Renomear uma categoria MUST manter sua identidade: tudo que estiver ligado a ela continua ligado, e qualquer referência guardada por outra parte do sistema permanece válida.
- **FR-010**: Remover uma categoria MUST exigir confirmação explícita, com texto claro do que vai acontecer, antes de qualquer efeito (constitution V).
- **FR-011**: A remoção de uma categoria com produtos ligados MUST ser bloqueada, sem alterar nada. A mensagem MUST informar quantos produtos estão na categoria e orientar a administradora a movê-los para outra categoria antes de tentar de novo. A verificação MUST ocorrer no sistema (não só na interface) e valer no momento da remoção.
- **FR-012**: A ordem de exibição das categorias MUST ser alfabética pelo nome, automática e sem diferenciar maiúsculas/minúsculas nem acentos, na lista do painel e para qualquer consumidor da lista. Não há ordenação manual. Renomear ou criar reposiciona a categoria automaticamente.
- **FR-013**: Cada produto MUST pertencer a exatamente uma categoria (nem zero, nem várias). Esta feature só entrega a lista; a regra define o contrato que a feature 003 vai consumir.
- **FR-014**: Outras partes do sistema (cadastro de produtos e IA) MUST obter as categorias disponíveis exclusivamente a partir dessa lista e MUST escolher somente entre as categorias existentes; um valor fora da lista MUST ser rejeitado.
- **FR-015**: Nenhuma parte do sistema, incluindo a futura IA, MUST ter caminho para criar, renomear ou remover categoria; só a ação de uma administradora autorizada no painel.
- **FR-016**: Toda página e ação de categorias MUST exigir sessão de administradora autorizada, verificada a cada acesso (regras da feature 001); sem ela, páginas levam à entrada e ações são recusadas sem efeitos e sem devolver dados.
- **FR-017**: Todas as mensagens ao usuário (erros, confirmações, avisos) MUST ser em português simples, sem jargão ou códigos técnicos, dizer o que aconteceu e o que fazer em seguida, e ser exibidas junto ao campo ou à ação a que se referem.
- **FR-018**: A interface de categorias MUST seguir a constitution V: uma tarefa por tela, alvos de toque ≥ 48px, texto ≥ 16px, linguagem simples, desenho pensado primeiro para celular, sem identidade visual própria (UI funcional e simples).
- **FR-019**: Quando duas administradoras agirem ao mesmo tempo sobre a mesma categoria ou o mesmo nome, o sistema MUST manter a lista consistente (sem duplicidade e sem perda silenciosa de alteração). A segunda alteração concorrente sobre a mesma categoria MUST ser recusada, sem efeitos, com mensagem pedindo que a administradora atualize a lista (por exemplo, "Esta categoria foi alterada por outra pessoa. Atualize a lista e tente de novo."). Unicidade de nome (FR-005) e bloqueios de remoção (FR-011 e FR-020) continuam garantidos sob concorrência.
- **FR-020**: Deve existir sempre ao menos uma categoria. A remoção da última categoria MUST ser bloqueada, sem alterar nada, com mensagem clara dizendo que precisa existir pelo menos uma categoria. A regra MUST valer também sob remoções simultâneas.

### Key Entities

- **Categoria**: agrupamento de produtos que alimenta o filtro do catálogo público.
  Atributos: nome (2 a 40 caracteres, texto exibido às clientes e às administradoras,
  único segundo a equivalência de FR-005, guardado como digitado após a normalização
  de espaços) e identidade estável que não muda ao renomear. Cada produto (feature
  003) pertence a exatamente uma categoria. Existe
  uma única lista de categorias no sistema. Outras entidades (produto, na feature
  003) referenciam a categoria pela identidade, não pelo nome.
- **Administradora**: pessoa autorizada pela feature 001; única que cria, renomeia
  e remove categorias.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Em 100% dos ambientes novos, a lista contém as cinco categorias iniciais logo após o primeiro deploy, sem ação manual.
- **SC-002**: A administradora cria, renomeia ou remove uma categoria em no máximo 3 toques depois de abrir a área de categorias (sem contar a digitação do nome) e em menos de 30 segundos, com cada ação em tela própria. Hoje cada ação leva 2 toques: criar = "Nova categoria" + "Salvar"; renomear = "Renomear" + "Salvar"; remover = "Remover" (na lista) + "Remover" (na tela de confirmação). Verificado manualmente no celular, com o resultado anotado no PR.
- **SC-003**: 100% das tentativas de criar ou renomear para um nome equivalente a outro existente (maiúsculas, acentos ou espaços extras) são recusadas, com mensagem clara.
- **SC-004**: 100% das páginas e ações de categorias recusam acesso sem sessão autorizada (verificado por testes automatizados).
- **SC-005**: 100% das mensagens de erro e confirmação desta feature estão em português e não contêm termos técnicos (verificado por revisão da lista de mensagens).
- **SC-006**: Nenhum valor de categoria fora da lista é aceito por consumidores da lista (verificado por teste de rejeição), e nenhuma categoria é criada por qualquer caminho diferente da ação da administradora no painel.
- **SC-007**: A dona do negócio, no celular, consegue criar e renomear uma categoria sozinha, na primeira tentativa, sem ajuda. **Validação adiada**: vinculada ao SC-005 da feature 001 (a dona ainda não tem acesso em produção); deve ser verificada quando o SC-005 da 001 for fechado. A pendência fica anotada no PR da 002.
- **SC-008**: Após uma nova publicação do sistema, 100% das alterações feitas pelas administradoras na lista continuam presentes, e nenhuma categoria inicial removida ou renomeada é recriada.
- **SC-009**: 100% das tentativas de remover uma categoria com produtos ligados, ou a última categoria existente, são bloqueadas sem alterar dados (verificado por testes automatizados, inclusive por chamada direta da ação), e a mensagem de bloqueio por produtos informa a quantidade correta (na 002, verificado com uma tabela de produtos de teste; na 003, com a tabela real).
- **SC-010**: 100% dos nomes fora da regra (menos de 2 ou mais de 40 caracteres após normalização, ou com caracteres não aceitos) são recusados na criação e na renomeação, e 100% das listas exibidas estão em ordem alfabética (verificado por testes automatizados).

## Assumptions

- A autenticação e a autorização das administradoras são as da feature 001; esta
  feature só consome a verificação existente e não a altera.
- A lista é pequena (dezenas de itens, no máximo), então não há paginação nem busca
  dentro da tela de categorias.
- A comparação de equivalência de nomes trata maiúsculas/minúsculas, acentos,
  espaços extras e hífen versus espaço como irrelevantes (decisão do humano, ver
  Clarifications); qualquer outra diferença torna os nomes diferentes.
- A identidade visual do painel está pendente (ADR-005); a tela segue só os
  requisitos mínimos da constitution V.
- O catálogo público e o filtro visível ao visitante ficam para outra feature; esta
  feature só entrega a lista e as regras que o filtro vai consumir.
- Fora de escopo: cadastro de produtos (feature 003), catálogo público e filtro
  visível ao visitante, IA de preenchimento ou sugestão, identidade visual,
  histórico ou auditoria de alterações em categorias, papéis diferentes entre
  administradoras, categorias aninhadas (subcategorias) e imagens ou descrições de
  categoria.
