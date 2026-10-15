# Feature Specification: Catálogo público

**Feature Branch**: `feature/005-catalogo-publico`

**Created**: 2026-10-15

**Status**: Draft

**Input**: User description: "Feature 005 — Catálogo público do Roseshop. Qualquer pessoa com o link vê os produtos e pergunta por eles no WhatsApp. Não há login de cliente, busca, sacola nem pagamento. Telas são um esqueleto funcional provisório (semântica, acessibilidade, celular Android), sem identidade visual." (descrição completa, com regras de negócio, fora do escopo e notas para o plan, registrada na conversa de abertura desta spec)

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Ver os produtos na página inicial (Priority: P1)

Uma cliente recebe o link da loja no WhatsApp e abre no celular, sem entrar em
conta nenhuma. Vê no alto os produtos em destaque (até 8) e, abaixo, a lista de
todos os produtos, do mais recente para o mais antigo, cada um com foto, nome,
código, preço e, quando for o caso, a marcação "Esgotado". Quando chega ao fim do
que foi carregado, toca em "Carregar mais" para ver os seguintes.

**Why this priority**: é o motivo da feature existir. Sem a vitrine pública, a
Rose continua mandando foto por foto no WhatsApp.

**Independent Test**: com produtos cadastrados pelo painel (alguns em destaque,
alguns esgotados), abrir a página inicial sem sessão e conferir destaques, lista,
ordem, preço e marcação de esgotado.

**Acceptance Scenarios**:

1. **Given** uma pessoa sem sessão no painel, **When** ela abre a página inicial,
   **Then** vê o catálogo sem precisar entrar, e nenhuma ação ou informação do
   painel aparece.
2. **Given** produtos cadastrados em datas diferentes, **When** a lista abre,
   **Then** os produtos aparecem do mais recente para o mais antigo pela data de
   cadastro; editar um produto não o move de lugar.
3. **Given** 3 produtos em destaque, **When** a página abre, **Then** a área de
   destaques mostra os 3 numa ordem estável definida pelo sistema (um produto não
   muda de posição enquanto continua em destaque), e esses 3 também aparecem na
   lista no lugar normal deles.
4. **Given** nenhum produto em destaque, **When** a página abre, **Then** a área de
   destaques não aparece e a lista fica no topo.
5. **Given** mais produtos do que o tamanho de um bloco, **When** a cliente toca em
   "Carregar mais", **Then** os próximos produtos são acrescentados abaixo dos que
   já estavam, na mesma ordem, sem repetir nem pular nenhum; quando não há mais
   produtos, o botão não aparece.
6. **Given** um produto "Esgotado", **When** ele aparece na lista, **Then** está
   visível, com a marcação "Esgotado" legível também como texto (não só por cor).
7. **Given** um produto sem preço, um com preço 12,90 e um com preço 12,90 e "a
   partir de", **When** aparecem na lista, **Then** exibem respectivamente
   "Consulte o valor", "R$ 12,90" e "a partir de R$ 12,90".
8. **Given** nenhum produto cadastrado, **When** a página abre, **Then** uma
   mensagem simples diz que ainda não há produtos, sem erro.

---

### User Story 2 - Ver o detalhe de um produto por um link próprio (Priority: P1)

A cliente toca num produto (na lista ou nos destaques) e abre o detalhe, num
endereço próprio identificado pelo código de referência (ex.: `/p/0042`). Esse
endereço pode ser copiado e mandado a outra pessoa, que abre o mesmo produto.
O detalhe mostra as fotos (até 3, a capa primeiro), nome, código, categoria,
descrição, preço e, se for o caso, "Esgotado".

**Why this priority**: é onde a cliente decide perguntar; o link do produto é
também o que a Rose vai mandar no WhatsApp no dia a dia.

**Independent Test**: abrir `/p/<código>` de um produto existente sem sessão e
conferir todas as informações; abrir um código inexistente e conferir a página
de "produto não encontrado".

**Acceptance Scenarios**:

1. **Given** o produto #0042 com 3 fotos, **When** a cliente abre `/p/0042`,
   **Then** vê as 3 fotos na ordem definida no painel (capa primeiro), o nome, o
   código "#0042", a categoria, a descrição (com as quebras de linha preservadas)
   e o preço no formato da US1.
2. **Given** o endereço `/p/0042`, **When** ele é aberto em outro aparelho, sem
   sessão, **Then** mostra o mesmo produto.
3. **Given** um código que não existe (ex.: `/p/9999`) ou de produto removido,
   **When** a cliente abre o endereço, **Then** vê a página "Produto não
   encontrado", com caminho de volta ao catálogo, e a resposta é de página
   inexistente (404).
4. **Given** um código inválido (ex.: `/p/abc`, `/p/-1`, `/p/0`), **When** aberto,
   **Then** vê a mesma página "Produto não encontrado" (404).
5. **Given** o produto #0042, **When** a cliente abre `/p/42` ou `/p/00042`,
   **Then** chega ao mesmo produto, no endereço padrão `/p/0042`.
6. **Given** um produto "Esgotado", **When** o detalhe abre, **Then** ele é
   exibido normalmente, com a marcação "Esgotado" em destaque.
7. **Given** o detalhe de um produto, **When** a página é inspecionada (conteúdo
   e dados enviados ao navegador), **Then** não há e-mail de administradora,
   identificador interno, versão, posição de destaque nem nenhum outro campo do
   painel.

---

### User Story 3 - Perguntar pelo produto no WhatsApp (Priority: P1)

No detalhe de um produto disponível, a cliente toca em "Perguntar no WhatsApp".
O WhatsApp abre numa conversa com a vendedora e com a mensagem já escrita,
citando o nome e o código do produto, pronta para enviar.

**Why this priority**: é a conversão da loja; sem isso o catálogo é só vitrine.

**Independent Test**: no ambiente dev, tocar no botão em um produto disponível
num celular Android e conferir que a conversa abre com o número configurado
para o dev e a mensagem com nome e código.

**Acceptance Scenarios**:

1. **Given** o produto disponível #0042 "Meia soquete listrada", **When** a
   cliente toca em "Perguntar no WhatsApp", **Then** o WhatsApp abre numa
   conversa com o número configurado no ambiente, com uma mensagem pronta que
   contém "Meia soquete listrada" e "#0042" e o link do produto.
2. **Given** um nome com acento, "&", "#", "?" ou emoji, **When** a mensagem é
   montada, **Then** chega ao WhatsApp exatamente como o nome cadastrado, sem
   cortar nem trocar caracteres.
3. **Given** um produto "Esgotado", **When** o detalhe abre, **Then** o botão
   "Perguntar no WhatsApp" não é oferecido.
4. **Given** o ambiente dev, **When** o botão é tocado, **Then** a conversa abre com
   o número de teste do dev; **Given** o ambiente de produção, **Then** com o
   número da Rose. Nenhum número está escrito no código.
5. **Given** que o número configurado no ambiente está ausente ou inválido,
   **When** o detalhe de um produto disponível abre, **Then** o botão não é
   oferecido (nunca um link quebrado ou para número errado), o resto do catálogo
   funciona e a falha fica registrada para o mantenedor.

---

### User Story 4 - Filtrar a lista por categoria (Priority: P2)

Acima da lista, a cliente escolhe uma categoria (ex.: "Meias") ou "Todas". A
lista passa a mostrar só os produtos daquela categoria; os destaques continuam
os mesmos.

**Why this priority**: com o catálogo crescendo, ajuda a achar o que interessa,
mas a loja já é útil sem isso.

**Independent Test**: com produtos em três categorias e uma categoria vazia,
escolher cada categoria e conferir a lista, os destaques e as opções do filtro.

**Acceptance Scenarios**:

1. **Given** produtos nas categorias "Meias" e "Guarda-chuvas", **When** a cliente
   escolhe "Meias", **Then** a lista mostra só produtos de Meias, na mesma ordem e
   com o mesmo "Carregar mais", e a área de destaques não muda.
2. **Given** um filtro aplicado, **When** ela escolhe "Todas", **Then** a lista
   volta a mostrar todos os produtos.
3. **Given** uma categoria sem nenhum produto, **When** o filtro é exibido,
   **Then** essa categoria não aparece entre as opções.
4. **Given** uma categoria só com produtos esgotados, **When** o filtro é exibido,
   **Then** ela aparece, porque produto esgotado continua visível.
5. **Given** o filtro "Meias" aplicado, **When** a cliente copia o endereço e abre
   em outro aparelho, ou volta do detalhe de um produto, **Then** a lista continua
   filtrada por "Meias".
6. **Given** um endereço com filtro de uma categoria que não existe mais ou ficou
   sem produtos, **When** ele é aberto, **Then** a lista mostra todos os produtos
   (sem erro), indicando que o filtro está em "Todas".
7. **Given** a lista filtrada, **When** a cliente usa o filtro e o "Carregar mais"
   só com o teclado ou com leitor de tela, **Then** consegue escolher a categoria,
   sabe qual está escolhida e é avisada de que a lista mudou.

---

### User Story 5 - Prévia do link no WhatsApp (Priority: P2)

A Rose (ou uma cliente) cola o link de um produto numa conversa do WhatsApp. Antes
de enviar, o WhatsApp mostra uma prévia com o nome do produto e a foto de capa.

**Why this priority**: torna o link do produto convidativo no canal de venda,
mas o link funciona mesmo sem prévia.

**Independent Test**: colar o link de um produto do ambiente dev numa conversa do
WhatsApp num celular Android e conferir nome e foto na prévia.

**Acceptance Scenarios**:

1. **Given** o link `/p/0042` de um produto com fotos, **When** é colado no
   WhatsApp, **Then** a prévia mostra o nome do produto e a foto de capa.
2. **Given** o link da página inicial, **When** colado, **Then** a prévia mostra o
   nome da loja.
3. **Given** o link de um produto inexistente, **When** colado, **Then** a prévia
   não mostra dados de nenhum produto.
4. **Given** um produto cuja foto de capa foi trocada no painel, **When** o link é
   colado depois do prazo de atualização (FR-020), **Then** a prévia usa a nova
   capa (prévias já geradas antes, guardadas pelo próprio WhatsApp, estão fora do
   controle do sistema).

---

### User Story 6 - Fotos públicas só de produto cadastrado (Priority: P1)

As fotos que a cliente vê vêm de produtos cadastrados. Fotos enviadas no painel
que ainda não fazem parte de um produto (envios pendentes da 004), fotos de
produto removido e fotos substituídas nunca são entregues ao público, nem por
quem tenta adivinhar ou reutilizar um endereço.

**Why this priority**: é a garantia de segurança e privacidade do armazenamento
de fotos ao abrir o sistema ao público.

**Independent Test**: tentar abrir, sem sessão, o endereço público de uma foto de
envio pendente, de uma foto removida e de uma foto de produto existente, e
conferir que só a última é entregue.

**Acceptance Scenarios**:

1. **Given** uma foto que pertence a um produto cadastrado, **When** pedida pelo
   endereço público, **Then** é entregue, sem exigir sessão.
2. **Given** uma foto enviada e ainda não vinculada a produto, **When** alguém
   pede o endereço público correspondente, **Then** a resposta é de inexistente,
   sem revelar se o arquivo existe no armazenamento.
3. **Given** uma foto removida de um produto, trocada por outra ou de um produto
   removido, **When** pedida pelo endereço público depois do prazo de
   atualização (FR-020), **Then** a resposta é de inexistente.
4. **Given** um endereço de foto malformado ou com caminho manipulado, **When**
   pedido, **Then** a resposta é de inexistente e nenhum outro arquivo do
   armazenamento é alcançado.
5. **Given** o armazenamento de fotos, **When** acessado sem passar pelo sistema,
   **Then** continua privado (nenhuma foto é alcançável diretamente).

---

### Edge Cases

- **Produto sem foto** (dado anterior à trava da 004, não deveria existir): lista
  e detalhe mostram um marcador neutro de "sem foto"; a prévia do link sai sem
  imagem; nada quebra.
- **Produto removido enquanto a cliente navega**: ao abrir o detalhe ou tocar em
  "Carregar mais", o produto simplesmente não aparece; o detalhe mostra
  "Produto não encontrado".
- **Produto cadastrado ou removido entre dois "Carregar mais"**: a continuação não
  repete nem pula produtos que já estavam antes; um produto novo cadastrado no
  meio tempo pode só aparecer ao recarregar a página.
- **Produto que esgota com a cliente no detalhe**: o detalhe já aberto pode ainda
  mostrar o botão; a mensagem ao WhatsApp segue normalmente e a vendedora responde
  que acabou. Ao recarregar após o prazo de atualização, o botão some.
- **Produto que esgota estando em destaque**: sai do destaque (regra da 003) e
  continua na lista como "Esgotado".
- **Código acima de #9999**: `/p/10000` funciona como qualquer outro.
- **Nome ou descrição com texto que parece formatação ou código**: exibido como
  texto puro, nunca interpretado.
- **Descrição vazia**: a seção de descrição não aparece; nada de "sem descrição".
- **Preço alto**: separador de milhar no formato brasileiro (R$ 1.234,56).
- **Rede lenta ou falha ao tocar em "Carregar mais"**: os produtos já exibidos
  continuam na tela, aparece uma mensagem simples e o botão permite tentar de novo.
- **Cliente sem WhatsApp instalado**: o link abre a página do WhatsApp na web, que
  oferece abrir no aplicativo ou no navegador (comportamento do WhatsApp).
- **Sessão de administradora aberta no mesmo navegador**: o catálogo é exibido
  igual ao de qualquer cliente, sem ações do painel.
- **Fotos já guardadas no navegador da cliente ou no WhatsApp** após o produto
  ser removido: fora do controle do sistema; o sistema só garante que deixa de
  entregá-las (FR-015).

## Requirements *(mandatory)*

### Functional Requirements

**Acesso público e privacidade**

- **FR-001**: Página inicial, detalhe de produto e fotos de produto cadastrado
  MUST ser acessíveis a qualquer pessoa, sem login. Nenhuma área ou ação do painel
  passa a ser pública.
- **FR-002**: As páginas e respostas públicas MUST expor só: código, nome,
  categoria (nome), descrição, preço, marcação "a partir de", status (disponível
  ou esgotado), condição de destaque e fotos. MUST NOT expor e-mail de
  administradora, identificadores internos, versões, posição de destaque, dados de
  envio de foto nem nenhum outro campo interno.
- **FR-003**: Nada exibido no catálogo (nome, descrição, categoria) MUST ser
  interpretado como formatação ou código; descrição mantém as quebras de linha.
- **FR-004**: Todas as páginas públicas MUST pedir aos buscadores que não as
  indexem nem sigam seus links, em dev e em produção. Esse pedido MUST NOT
  impedir a prévia do link nos aplicativos de mensagem (FR-021 continua valendo).

**Página inicial e lista**

- **FR-005**: A página inicial MUST mostrar a área de destaques e, abaixo, a lista
  de produtos. Sem nenhum destaque, a área não aparece; sem nenhum produto, uma
  mensagem simples substitui a lista.
- **FR-006**: A lista MUST conter todos os produtos cadastrados (disponíveis e
  esgotados, destacados ou não), ordenados pela data de cadastro, do mais recente
  para o mais antigo.
- **FR-007**: A lista MUST ser carregada em blocos de tamanho fixo, com a ação
  "Carregar mais" que acrescenta o bloco seguinte sem repetir nem pular produtos;
  não há paginação numerada. A ação MUST não aparecer quando não houver mais
  produtos e MUST permitir tentar de novo após uma falha, mantendo o que já foi
  exibido.
- **FR-008**: Cada item da lista e dos destaques MUST mostrar foto de capa (ou o
  marcador de "sem foto"), nome, código, preço (FR-012) e, quando for o caso,
  "Esgotado", e levar ao detalhe do produto.

**Destaques**

- **FR-009**: A área de destaques MUST mostrar os produtos em destaque (no máximo
  8, regras da 003 inalteradas) numa ordem estável definida pelo sistema: um
  produto não muda de posição enquanto continua em destaque. Não existe escolha
  manual de posição.

**Filtro por categoria**

- **FR-010**: A lista MUST poder ser filtrada por uma categoria ou por "Todas"
  (padrão). O filtro vale só para a lista, nunca para os destaques, e não há busca
  por texto.
- **FR-011**: O filtro MUST oferecer só categorias com pelo menos um produto
  (disponível ou esgotado), e a escolha MUST ficar no endereço da página, de modo
  que copiar o link ou voltar do detalhe preserve o filtro. Filtro de categoria
  inexistente ou vazia no endereço MUST cair em "Todas", sem erro.

**Preço**

- **FR-012**: O preço MUST ser exibido em reais no formato brasileiro (R$ 12,90;
  R$ 1.234,56). Sem preço: "Consulte o valor". Com "a partir de": "a partir de"
  antes do valor (ex.: "a partir de R$ 12,90"). O mesmo formato vale na lista, nos
  destaques e no detalhe.

**Detalhe do produto**

- **FR-013**: Cada produto MUST ter um endereço público próprio, estável e
  compartilhável, formado pelo código de referência com pelo menos 4 dígitos (ex.:
  `/p/0042`). O endereço com o mesmo número escrito de outra forma (ex.: `/p/42`,
  `/p/00042`) MUST levar ao endereço padrão.
- **FR-014**: O detalhe MUST mostrar as fotos do produto (até 3, na ordem do
  painel, capa primeiro), nome, código no formato "#0042", categoria, descrição
  (quando houver), preço (FR-012) e a marcação "Esgotado" quando for o caso.
  Código inexistente, de produto removido ou inválido MUST exibir a página
  "Produto não encontrado", com caminho de volta ao catálogo e resposta de página
  inexistente (404).

**Fotos públicas**

- **FR-015**: O público MUST receber somente fotos que, no momento do pedido,
  pertencem a um produto cadastrado (respeitado o prazo de FR-020). Fotos de envio
  pendente, substituídas, removidas ou de produto removido MUST receber resposta de
  inexistente, indistinguível da de um arquivo que nunca existiu, inclusive por
  endereço direto ou manipulado.
- **FR-016**: O armazenamento de fotos MUST continuar privado; o público só alcança
  fotos através do sistema.
- **FR-017**: Toda foto exibida MUST ter texto alternativo que identifica o produto
  (ex.: o nome do produto e a posição da foto).

**WhatsApp**

- **FR-018**: O detalhe de um produto disponível MUST oferecer "Perguntar no
  WhatsApp", que abre uma conversa com o número da vendedora configurado para o
  ambiente, com mensagem pronta contendo o nome do produto, o código no formato
  "#0042" e o link do produto, preservando exatamente todos os caracteres do nome.
  Produto esgotado MUST NOT oferecer o botão.
- **FR-019**: O número da vendedora MUST ser configuração por ambiente (dev: número
  de teste do mantenedor; produção: número da Rose), validado no formato
  internacional; nenhum número MUST estar escrito no código. Sem número válido
  configurado, o botão MUST NOT ser oferecido, o restante do catálogo MUST
  funcionar e a falha MUST ficar registrada para o mantenedor.

**Atualização**

- **FR-020**: Qualquer alteração feita no painel (cadastro, edição, esgotado,
  destaque, fotos, remoção de produto ou categoria) MUST estar refletida no
  catálogo público, na página inicial, no detalhe e nas fotos, em até 5 minutos
  (alvo provisório, a confirmar no `/speckit-clarify`).

**Prévia do link**

- **FR-021**: O detalhe de produto MUST informar aos aplicativos de mensagem os
  dados da prévia: nome do produto como título e a foto de capa como imagem; a
  página inicial MUST informar o nome da loja. A página de "Produto não
  encontrado" MUST NOT informar dados de produto. A imagem da prévia MUST ser
  acessível sem login, pela mesma regra de FR-015.

**Telas provisórias e acessibilidade**

- **FR-022**: As telas públicas MUST ser um esqueleto funcional sem identidade
  visual: estrutura semântica (títulos, listas, regiões), utilizáveis só com
  teclado e com leitor de tela, legíveis no celular Android (Chrome) sem zoom nem
  rolagem horizontal, com texto de no mínimo 16 px e alvos de toque de no mínimo
  48 px. Regras de exibição (preço, esgotado, ordem, filtro, botão de WhatsApp)
  MUST ficar separadas da apresentação, para que a futura feature de design troque
  as telas sem mudar essas regras.
- **FR-023**: Estado "Esgotado" e categoria escolhida no filtro MUST ser
  identificáveis por texto, não só por cor ou posição.

### Key Entities *(include if feature involves data)*

- **Produto (visão pública)**: recorte público do produto da 003/004 — código,
  nome, categoria, descrição, preço, "a partir de", disponível/esgotado, em
  destaque ou não, e fotos ordenadas. Sem autoria nem campos internos.
- **Destaque**: condição do produto (da 003), usada para montar a área de
  destaques.
- **Foto pública**: foto que pertence a um produto cadastrado; a capa é a primeira.
  Envios pendentes não são fotos públicas.
- **Categoria (no filtro)**: categoria da 002 que tem pelo menos um produto.
- **Contato da vendedora**: número de WhatsApp por ambiente, fora do banco e do
  código.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Uma cliente que recebe o link da loja encontra um produto e abre a
  conversa no WhatsApp com a mensagem pronta em menos de 1 minuto, sem ajuda, num
  celular Android (observação com pelo menos uma pessoa real).
- **SC-002**: A página inicial e o detalhe de produto mostram conteúdo útil em
  até 3 segundos numa conexão móvel 4G típica, excluindo o primeiro acesso após
  um período de inatividade do banco (mesma exceção do SC-007 da 003).
- **SC-003**: 100% dos produtos testados exibem preço, "a partir de", "Consulte o
  valor" e "Esgotado" conforme as regras, e 100% dos produtos esgotados ficam sem
  o botão de WhatsApp.
- **SC-004**: Em 100% das tentativas de teste, fotos de envio pendente, removidas,
  substituídas ou de produto removido não são entregues ao público, e nenhuma
  página ou resposta pública contém e-mail de administradora ou campo interno.
- **SC-005**: Uma alteração feita no painel aparece no catálogo público dentro do
  prazo de FR-020 em 100% das verificações.
- **SC-006**: Colar o link de um produto no WhatsApp (Android) mostra nome e foto
  de capa na prévia.
- **SC-007**: As telas públicas passam numa verificação de acessibilidade
  automática sem violações graves e são navegáveis só com teclado.
- **SC-008**: O catálogo público funciona sem nenhum recurso pago (constitution
  VII) com o volume esperado da loja.
- **SC-009**: Em 100% das páginas públicas verificadas, o pedido de não indexação
  aos buscadores está presente.

## Assumptions

- Público-alvo: clientes da Rose, quase sempre pelo celular Android, abrindo links
  vindos do WhatsApp; familiaridade com tecnologia variada. As regras de texto e
  alvo de toque do painel (constitution V) valem também aqui.
- Tamanho do bloco do "Carregar mais": 24 produtos (ajustável no plano sem mudar a
  spec).
- Mensagem pronta do WhatsApp: "Olá! Tenho interesse no produto <nome> (#<código>):
  <link do produto>"; o texto exato pode ser ajustado no plano sem mudar a regra.
- Prazo de atualização do catálogo: 5 minutos como alvo provisório, que o
  `/speckit-clarify` confirma ou ajusta.
- O nome da loja exibido e usado na prévia é "Roseshop" até a feature de design.
- Prévias de link já geradas e guardadas pelo WhatsApp, e fotos já guardadas no
  navegador da cliente, estão fora do controle do sistema.
- Produção hoje tem todos os produtos com pelo menos 1 foto (trava da 004); o
  marcador de "sem foto" é só proteção.
- Não há contagem de visitas nem análise de acesso. O catálogo circula só por
  link; ficar fora dos buscadores protege o número da vendedora; abrir para
  buscadores é decisão futura e reversível.
- Fora de escopo: sacola e pedido único pelo WhatsApp (006; o botão desta feature
  tende a virar "adicionar à sacola"), identidade visual e design das telas
  públicas, busca por texto, login de cliente, estoque por quantidade, variações
  além da descrição e tela no painel para configurar o número do WhatsApp.

## Dependencies

- Feature 002 (categorias): lista e nomes de categorias.
- Feature 003 (produtos): código de referência, preço, "a partir de", esgotado,
  destaque (teto de 8, esgotado sai do destaque) e ordem por data de cadastro. A
  005 só lê esses dados e não altera a 003 (regras, ações nem critérios de
  aceite).
- Feature 004 (fotos): fotos ordenadas com capa, armazenamento privado e envios
  pendentes, que nunca são públicos.
- Feature 001: a separação entre painel protegido e catálogo público; nada do
  painel muda de acesso.

## Notas para o plan

Registradas a pedido do humano; não são decisões da spec.

- **Fotos**: rota no Worker que confere no banco se a chave pertence a um produto e
  entrega o objeto pelo binding do R2; bucket segue privado; cache longo assumindo
  chaves imutáveis (troca de foto = chave nova) — confirmar no código da 004. O
  crawler do WhatsApp precisa alcançar essa rota (Open Graph). Conciliar o cache
  longo com FR-015/FR-020 (foto removida deixa de ser entregue no prazo).
- **Destaques**: ordenar por `destaque_vaga` ASC; nenhuma migration e nenhuma
  mudança em `produtos.ts` nesta feature.
- **Renderização**: comparar renderização dinâmica com cache HTTP curto versus ISR
  do OpenNext (exige cache incremental em R2/KV), com prós e contras, CPU do Workers
  Free (risco aceito da T139, ADR-010) e o prazo de FR-020.
- **WhatsApp**: `WHATSAPP_NUMBER` por ambiente no wrangler, validado em E.164; link
  `wa.me` com texto codificado para URL.
- **Privacidade**: nenhuma rota pública expõe autoria (e-mail) nem campos internos;
  teste de conformidade nos moldes de `src/test/conformance/`.
- **Indexação**: meta robots `noindex,nofollow` e/ou cabeçalho `X-Robots-Tag` nas
  páginas públicas e na rota de fotos; avaliar `robots.txt` sem `Disallow`
  (`Disallow` impediria o crawler de ler o `noindex`); conferir que o crawler do
  WhatsApp continua gerando a prévia.
- **Filtro por categoria no endereço**: id expõe identificador interno (conflito
  com FR-002) e slug do nome quebra ao renomear (a 002 permite renomear); escolher
  no plan; o fallback para "Todas" já cobre link quebrado.
- **"Carregar mais"**: paginação por cursor composto (data de cadastro, código),
  não por offset, para não repetir nem pular com empates de data.
- **Rota de fotos**: cada pedido consulta o Neon; avaliar cache de borda curto
  também como proteção contra raspagem esgotando o compute do free tier (SC-008).
