# Feature Specification: Autenticação das administradoras

**Feature Branch**: `feature/001-auth-admins`

**Created**: 2026-10-03

**Status**: Approved (2026-10-03, pelo humano, após clarify, plan, tasks e analyze)

**Input**: User description: "Autenticação das administradoras do Roseshop. Três administradoras (a dona do negócio, a filha e o filho), todas com o mesmo poder; a dona tem baixa familiaridade com tecnologia e usa só o celular; clientes do catálogo nunca fazem login. A administradora entra no painel com a conta Google que já usa no celular, em um toque, sem criar senha. Só os e-mails autorizados entram; qualquer outra conta Google é recusada com mensagem clara e gentil em português, sem jargão. Todas as páginas e ações do painel exigem login; quem não está logado é levado à tela de entrada. A administradora consegue sair de forma óbvia. O catálogo público continua acessível sem login. UX (constitution V): fluxo linear, uma tarefa por tela, alvos de toque ≥ 48px, texto ≥ 16px, linguagem simples, mobile-first. Segurança (constitution III): autorização verificada no login E em cada página/ação protegida; incluir ou remover administradora não exige alteração de código. Fora de escopo: cadastro de clientes, papéis diferentes, recuperação de senha, identidade visual final."

## Clarifications

### Session 2026-10-03

- Q: Por quanto tempo a administradora deve continuar conectada no celular antes de precisar entrar de novo? → A: 30 dias, renovados a cada uso (expira só após 30 dias sem abrir o painel).
- Q: Ao tocar em "Sair", a sessão deve ser encerrada só no aparelho atual ou em todos os aparelhos? → A: Só no aparelho atual; celular perdido se resolve tirando o e-mail da lista, o que bloqueia todos os aparelhos no próximo uso.
- Q: Como a administradora chega à tela de entrada do painel, já que o catálogo não terá convite de login? → A: Endereço próprio do painel, salvo como atalho na tela inicial do celular de cada administradora; nenhum link no catálogo.
- Q: Tentativas de entrada recusadas devem ficar registradas e com que detalhe? → A: Registrar só que houve uma recusa e quando, sem e-mail nem nome.
- Q: Ao tocar em "Sair", o sistema deve pedir confirmação? → A: Não; sai direto, sem confirmação.
- Acréscimo do humano: o cliente de login do Google está em modo Testing (ADR-003); contas que não são test users são barradas pelo próprio Google antes de chegar ao Roseshop. A mensagem gentil de recusa (US2) vale para contas que são test users mas não estão na lista de autorizadas.
- Acréscimo do humano: em emergência, trocar o segredo de sessão de um ambiente invalida todas as sessões daquele ambiente. É procedimento operacional, não funcionalidade do painel.
- Q: (pós-analyze) A validade de "30 dias sem uso" precisa ser exata ao dia ou basta uma janela? → A: Janela: a sessão expira entre 29 e 30 dias sem uso (renovação no máximo uma vez a cada 24 horas).
- Q: Se o Google devolver o mesmo sinal para "a pessoa cancelou" e "a conta foi recusada", como a tela deve se comportar? → A: Uma única mensagem gentil para os dois casos: "Não foi possível entrar com essa conta. Tente de novo ou use outra conta.", com botão para tentar com outra conta. Se os sinais forem distintos, cada caso mantém sua mensagem.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Entrar no painel com a conta Google (Priority: P1)

A administradora abre o endereço do painel no celular, vê uma tela de entrada com
um único botão grande ("Entrar com Google"), toca nele, escolhe (ou confirma) a
conta Google que já usa no aparelho e chega ao painel. Ela não cria nem digita
senha em momento algum.

**Why this priority**: Sem entrada não existe painel; é a base de todas as
features administrativas futuras (cadastro de produtos, fotos, etc.).

**Independent Test**: Com uma conta autorizada, abrir a tela de entrada no
celular, tocar no botão e verificar que o painel abre identificando a
administradora.

**Acceptance Scenarios**:

1. **Given** uma pessoa sem sessão ativa e com e-mail na lista de autorizadas, **When** ela toca em "Entrar com Google" e confirma a conta no Google, **Then** ela chega à página inicial do painel e vê seu nome ou e-mail indicando quem está conectada.
2. **Given** a tela de entrada aberta em um celular, **When** ela é exibida, **Then** há uma única ação principal (o botão de entrar), com área de toque de no mínimo 48px, texto de no mínimo 16px e nenhum campo de senha.
3. **Given** uma administradora já conectada, **When** ela abre o endereço da tela de entrada, **Then** ela é levada direto ao painel, sem precisar entrar de novo.
4. **Given** uma pessoa que tentou abrir uma página específica do painel sem estar conectada, **When** ela entra com sucesso, **Then** ela chega à página que tentou abrir originalmente (e não a uma página genérica).
5. **Given** uma pessoa na tela do Google, **When** ela cancela ou volta sem escolher conta, **Then** ela retorna à tela de entrada com uma mensagem simples convidando a tentar de novo, sem mensagem de erro técnica (se o sistema não conseguir distinguir cancelamento de recusa, vale a mensagem única definida em Clarifications).

---

### User Story 2 - Recusar contas não autorizadas (Priority: P1)

Uma pessoa com uma conta Google que não está na lista de administradoras tenta
entrar. Ela não chega ao painel e vê uma mensagem gentil, em português simples,
explicando que aquela conta não tem acesso e o que fazer (por exemplo, tentar
com outra conta ou falar com a dona da loja).

**Why this priority**: É a garantia de segurança central da feature; sem ela,
qualquer conta Google acessaria o painel.

**Independent Test**: Com uma conta Google cadastrada como test user no cliente
de login do Google, mas fora da lista de autorizadas, tentar entrar e verificar
que o painel não abre e a mensagem de recusa aparece. (Contas que não são test
users são barradas pelo próprio Google antes de chegar ao Roseshop; ver
Assumptions.)

**Acceptance Scenarios**:

1. **Given** uma conta Google aceita pelo Google (test user) cujo e-mail não está na lista de autorizadas, **When** a pessoa conclui o fluxo do Google, **Then** nenhuma sessão é criada, ela não vê nenhuma página do painel e vê uma mensagem como "Esta conta Google não tem acesso ao painel. Tente entrar com outra conta." (ou a mensagem única de Clarifications, se recusa e cancelamento não forem distinguíveis), sem termos técnicos (como "erro", "403", "OAuth", "callback", "allowlist").
2. **Given** a mensagem de recusa exibida, **When** a pessoa a lê, **Then** existe um botão claro (≥ 48px) para tentar novamente com outra conta Google.
3. **Given** um e-mail autorizado escrito na lista com letras maiúsculas ou espaços extras, **When** a dona da conta entra com esse e-mail, **Then** o acesso é concedido (a comparação ignora maiúsculas/minúsculas e espaços nas pontas).
4. **Given** uma conta Google cujo e-mail não foi verificado pelo Google, **When** a pessoa tenta entrar, **Then** o acesso é recusado com a mesma mensagem gentil.
5. **Given** uma tentativa de entrada recusada, **When** o sistema a registra, **Then** o registro indica apenas que houve uma recusa e quando, sem e-mail, nome ou outro dado pessoal.

---

### User Story 3 - Proteger todas as páginas e ações do painel (Priority: P1)

Qualquer página ou ação do painel só funciona para uma administradora conectada
e autorizada naquele momento. Quem não está conectado é levado à tela de
entrada. A verificação acontece em cada acesso, não só no momento da entrada.

**Why this priority**: Defesa em profundidade exigida pela constitution (III.2);
sem isso, uma sessão antiga ou uma chamada direta a uma ação contornaria o login.

**Independent Test**: Sem sessão, abrir diretamente o endereço de uma página do
painel e disparar uma ação protegida; verificar o redirecionamento para a
entrada e a recusa da ação.

**Acceptance Scenarios**:

1. **Given** uma pessoa sem sessão ativa, **When** ela abre diretamente qualquer endereço do painel, **Then** ela é levada à tela de entrada e nenhum conteúdo do painel é exibido.
2. **Given** uma pessoa sem sessão ativa, **When** uma ação protegida do painel é chamada diretamente (sem passar pela interface), **Then** a ação é recusada, nada é alterado e nenhum dado do painel é devolvido.
3. **Given** uma administradora conectada cujo e-mail foi removido da lista de autorizadas, **When** ela abre qualquer página do painel ou dispara qualquer ação protegida, **Then** o acesso é recusado da mesma forma que para uma conta não autorizada, sem precisar esperar a sessão expirar.
4. **Given** uma sessão adulterada, expirada ou inválida, **When** ela é usada para acessar o painel, **Then** ela é tratada como ausência de sessão.
5. **Given** uma administradora que não abre o painel há mais de 30 dias, **When** ela abre qualquer página do painel, **Then** ela é levada à tela de entrada.
6. **Given** uma administradora que usa o painel com intervalos menores que 29 dias, **When** ela abre o painel, **Then** continua conectada sem precisar entrar de novo (a validade é renovada com o uso, no máximo uma vez a cada 24 horas).

---

### User Story 4 - Sair do painel (Priority: P2)

A administradora encontra facilmente um botão "Sair" no painel, toca nele e
volta à tela de entrada. Depois de sair, o painel não abre mais naquele
aparelho até ela entrar de novo.

**Why this priority**: Importante para uso em aparelhos compartilhados e para a
sensação de controle, mas o painel já entrega valor sem ela.

**Independent Test**: Conectada, tocar em "Sair" e tentar reabrir uma página do
painel; verificar que a tela de entrada aparece.

**Acceptance Scenarios**:

1. **Given** uma administradora conectada em qualquer página do painel, **When** ela olha a tela, **Then** o botão "Sair" está visível sem abrir menus, com área de toque ≥ 48px e texto ≥ 16px.
2. **Given** uma administradora conectada, **When** ela toca em "Sair", **Then** a sessão daquele aparelho é encerrada imediatamente, sem pedido de confirmação, e ela vê a tela de entrada.
3. **Given** uma administradora que acabou de sair, **When** ela usa o botão "voltar" do navegador ou reabre o endereço do painel, **Then** ela é levada à tela de entrada e não vê conteúdo do painel.
4. **Given** uma administradora conectada no celular e no computador, **When** ela toca em "Sair" no celular, **Then** só a sessão do celular é encerrada; a do computador continua ativa.

---

### User Story 5 - Catálogo público continua aberto (Priority: P1)

Clientes navegam pelo catálogo e pela sacola sem nunca ver uma tela de login
nem um convite para entrar.

**Why this priority**: As clientes são a razão de ser da loja; a autenticação não
pode atrapalhar o catálogo.

**Independent Test**: Sem sessão, abrir as páginas públicas e verificar que
carregam normalmente, sem redirecionamento.

**Acceptance Scenarios**:

1. **Given** uma visitante sem sessão, **When** ela abre qualquer página pública (página inicial, catálogo, sacola), **Then** a página carrega normalmente, sem redirecionamento para a tela de entrada.
2. **Given** uma visitante no catálogo público, **When** ela navega, **Then** não há botão, link nem aviso de login nem link para o painel; as administradoras chegam ao painel pelo endereço próprio, salvo como atalho na tela inicial do celular.
3. **Given** a verificação de saúde do sistema, **When** ela é consultada sem sessão, **Then** continua respondendo normalmente.

---

### Edge Cases

- A lista de autorizadas está vazia ou ausente no ambiente: ninguém entra (falha
  fechada) e a tela mostra a mesma mensagem gentil de recusa; o problema de
  configuração fica registrado para quem mantém o sistema, sem expor detalhes à
  usuária.
- O Google está indisponível ou o fluxo falha por motivo externo: a pessoa volta
  à tela de entrada com mensagem simples ("Não foi possível entrar agora. Tente
  de novo em instantes.").
- O celular tem várias contas Google e a administradora escolhe a errada: recebe
  a mensagem de recusa com opção clara de tentar com outra conta.
- A administradora abre o painel em dois aparelhos (celular e computador): ambos
  funcionam de forma independente; sair em um não encerra o outro.
- Celular de uma administradora perdido ou roubado: tirar o e-mail dela da lista
  de autorizadas bloqueia o acesso em todos os aparelhos no próximo uso; ela volta
  a ter acesso quando o e-mail for incluído de novo.
- Necessidade de derrubar todas as sessões de um ambiente de uma vez
  (emergência): procedimento operacional de troca do segredo de sessão daquele
  ambiente; todas as administradoras precisam entrar de novo. Não é funcionalidade
  do painel.
- Conta Google que não é test user do cliente de login: barrada pelo próprio
  Google, antes de chegar ao Roseshop; a tela exibida é a do Google, fora do
  controle desta feature.
- Endereço de retorno após o login apontando para fora do Roseshop: é ignorado e
  a pessoa vai para a página inicial do painel.
- Uma administradora removida da lista enquanto tem o painel aberto perde o
  acesso no próximo acesso a página ou ação (ver User Story 3, cenário 3).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema MUST permitir que a administradora entre no painel usando exclusivamente sua conta Google, sem criar, digitar ou recuperar senha.
- **FR-002**: O sistema MUST conceder acesso somente a contas cujo e-mail, verificado pelo Google, esteja na lista de administradoras autorizadas.
- **FR-003**: A comparação de e-mails com a lista MUST ignorar diferenças de maiúsculas/minúsculas e espaços nas pontas.
- **FR-004**: A lista de administradoras autorizadas MUST ser configurável por ambiente sem alteração de código nem nova publicação de código.
- **FR-005**: O sistema MUST verificar a autorização no momento da entrada E novamente em cada página e em cada ação protegida do painel.
- **FR-006**: Toda página do painel acessada sem sessão válida e autorizada MUST levar a pessoa à tela de entrada, sem exibir conteúdo do painel.
- **FR-007**: Toda ação protegida chamada sem sessão válida e autorizada MUST ser recusada sem efeitos colaterais e sem devolver dados do painel.
- **FR-008**: Contas não autorizadas MUST ver uma mensagem de recusa em português simples, gentil, sem termos técnicos, com um botão para tentar com outra conta.
- **FR-009**: Após entrar, a administradora MUST ser levada à página do painel que tentou abrir antes, desde que seja um endereço interno do painel; caso contrário, à página inicial do painel.
- **FR-010**: Toda página protegida do painel (todas exceto a tela de entrada) MUST exibir um botão "Sair" visível sem abrir menus; tocar nele MUST encerrar a sessão e levar à tela de entrada.
- **FR-011**: As páginas públicas (catálogo, sacola e verificação de saúde) MUST continuar acessíveis sem sessão e sem qualquer convite a login. Como catálogo e sacola ainda não existem (ver Assumptions), nesta feature a regra é verificada na página inicial atual e na verificação de saúde, e vale por regra para todo endereço fora da área do painel.
- **FR-012**: A tela de entrada, a mensagem de recusa e o botão "Sair" MUST seguir o princípio V: uma tarefa por tela, alvos de toque ≥ 48px, texto ≥ 16px, linguagem simples, desenho pensado primeiro para celular.
- **FR-013**: Todas as administradoras autorizadas MUST ter exatamente o mesmo nível de acesso (sem papéis).
- **FR-014**: Se a lista de autorizadas estiver vazia ou ausente, o sistema MUST recusar todos os acessos ao painel (falha fechada).
- **FR-015**: Segredos de autenticação e a lista de e-mails autorizados MUST NOT aparecer no código versionado, em logs ou no conteúdo enviado ao navegador. Tentativas de entrada recusadas MUST ser registradas apenas com o fato da recusa e o horário, sem e-mail, nome ou outro dado pessoal.
- **FR-016**: A sessão da administradora MUST expirar entre 29 e 30 dias sem uso do painel; o uso renova esse prazo (no máximo uma renovação a cada 24 horas). Sessão expirada exige nova entrada.
- **FR-017**: "Sair" MUST encerrar apenas a sessão do aparelho atual, sem pedir confirmação.
- **FR-018**: O catálogo público MUST NOT conter link para o painel nem para a tela de entrada; o painel é acessado pelo seu endereço próprio.

### Key Entities

- **Administradora**: pessoa autorizada a usar o painel. Identificada pelo e-mail
  da conta Google; atributos exibidos: nome e e-mail fornecidos pelo Google. Não
  há cadastro próprio nem tabela de usuárias.
- **Lista de autorizadas (`ADMIN_EMAILS`)**: conjunto de e-mails com acesso ao painel, mantido como
  configuração do ambiente (local, dev, produção), não como dado editável pelo
  painel nesta feature.
- **Sessão**: estado de "conectada" de uma administradora em um aparelho; tem
  validade de 29 a 30 dias sem uso, renovada com o uso, e é encerrada ao sair
  (só naquele aparelho).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Uma administradora autorizada, com a conta Google já presente no celular, chega ao painel a partir da tela de entrada com no máximo 2 toques e em menos de 15 segundos.
- **SC-002**: 100% das tentativas de entrada com contas fora da lista são recusadas, com a mensagem gentil, em todos os ambientes.
- **SC-003**: 100% das páginas e ações do painel recusam acesso sem sessão autorizada (verificado por testes automatizados que cobrem cada página e ação protegida existente).
- **SC-004**: Incluir ou remover uma administradora leva menos de 5 minutos, sem alteração de código, e a remoção bloqueia o acesso no próximo acesso a página ou ação.
- **SC-005**: A dona do negócio consegue entrar e sair do painel sozinha, no celular, na primeira tentativa, sem ajuda.
- **SC-006**: 100% das páginas públicas carregam sem sessão e sem redirecionamento para a entrada.

## Assumptions

- O método de entrada é Google com lista de e-mails autorizados, conforme ADR-003
  (já aceito); esta spec não reabre essa decisão.
- A lista de autorizadas é mantida pelo mantenedor técnico como configuração de
  cada ambiente; uma tela no painel para gerenciar administradoras está fora de
  escopo.
- O conteúdo do painel ainda não existe: esta feature entrega uma página inicial
  do painel mínima (saudação com nome/e-mail e botão "Sair") apenas para
  validar o fluxo; as páginas de negócio virão em features futuras.
- As páginas públicas de catálogo e sacola ainda não existem; o critério de
  acesso público vale para a página inicial atual, para a verificação de saúde e,
  por regra, para todo endereço fora da área do painel.
- O visual segue apenas os requisitos mínimos do princípio V; a identidade visual
  final é feature futura.
- Não há registro de auditoria de entradas/saídas nesta feature além dos logs
  operacionais da plataforma; recusas são registradas sem dados pessoais
  (FR-015).
- O cliente de login do Google está em modo Testing (ADR-003): só contas
  cadastradas como test users passam pelo Google. A mensagem gentil de recusa
  (US2) cobre contas que são test users mas não estão na lista de autorizadas;
  contas que não são test users veem a tela de bloqueio do próprio Google. Os
  testes de recusa usam uma conta test user fora da lista.
- Procedimento de emergência (operacional, não funcionalidade do painel): trocar
  o segredo de sessão (`AUTH_SECRET`) de um ambiente invalida todas as sessões daquele ambiente,
  e todas as administradoras precisam entrar de novo. Deve ser documentado em
  `docs/operacao.md`.
- Orientar cada administradora a salvar o endereço do painel como atalho na tela
  inicial do celular é tarefa de implantação, não funcionalidade do sistema.
- Fora de escopo: cadastro de clientes, papéis diferentes entre administradoras,
  recuperação de senha, identidade visual final, tela de gestão de
  administradoras.
