# Autoavaliação

Escrita ao fim da Fase 8, depois da validação (`VALIDACAO.md`) e das medições (`CPU.md`). As notas
valem para o que foi entregue e medido, não para o que o redesenho poderia ser.

## Notas

| Critério | Nota | Por quê |
|---|---|---|
| **Originalidade** | 6 | O arco como forma única (foto, categoria, janela, logo) é um sistema próprio, não colagem; mas fundo claro quente, serifada e rosa ficam perto do lugar-comum "loja delicada", e o logo de arcos concêntricos ainda pode ser lido como arco-íris. |
| **Coerência** | 8 | Uma forma, uma luz, duas fontes e os mesmos tokens no catálogo, na sacola e no painel; nenhum componente com cara de biblioteca. Perde pontos porque o painel só trocou de pele e não o vi por dentro. |
| **Adequação à cliente** | 5 | Achar o produto ficou mais fácil (destaques numa fileira, categorias em botões grandes, preço legível) e a acessibilidade dá 100 no Lighthouse; mas a primeira impressão no 4G reprova: LCP de 6,6 a 6,7 s na página inicial (era 8,3 s antes de restringir as fotos eager) e 3,3 s no detalhe em Slow 4G, com fotos de 230 KB. Sem miniatura, a meta de 2,5 s não fecha. |
| **Adequação à Dona Rose** | 6 | Contraste, foco visível, botões de 48px e erros que não se confundem com ação; fluxos e textos intactos. Mas não entrei no painel (login Google) e não a vi usando: a nota é sobre o que os testes e o código garantem, não sobre uso real. |
| **Fidelidade ao conceito** | 7 | Manhã, rosa e arco aparecem na forma e na luz, sem símbolo religioso; a voz ("Os que a Rose separou para você") aproxima. O 3D, que deveria ser o momento da rosa, é sutil demais em 56px para carregar a ideia. |
| **Qualidade técnica** | 6 | `npm run check` verde, 3.369 testes, invariantes da sacola sem alteração, SC-005 protegido por fixtures regravados com cuidado, CPU do Worker sem piora, three fora do JS inicial e só em aparelho capaz. Contra: LCP reprovado, 131 KB gzip de three para um logo de 56px, fallbacks de fonte não conferidos no Android. |

## O que mais gostei

1. **A moldura em arco para a foto caseira.** Esconde a bagunça dos cantos de cima e dá a mesma
   borda a fotos com luz e fundo diferentes. É a decisão que mais serve à Dona Rose, porque não
   depende de ela fotografar melhor.
2. **A orientação sem quebrar a spec.** A spec manda destaques acima da lista; em vez de subir as
   categorias, a fileira lateral encolheu os destaques para a altura de um cartão, e as categorias
   viraram botões de um toque.
3. **Zero mudança de comportamento.** Todo o redesenho passou pelos testes de papel e texto; o
   único seletor ajustado foi uma string de classe, e os fixtures da 005 foram regravados num
   commit próprio, com o gravador corrigido e a idempotência conferida.

## O que mudaria com mais tempo

1. **As fotos e o LCP.** A primeira parte já foi feita com aval: de 9 fotos eager para 2 (a
   primeira com `fetchpriority="high"`), o que levou o LCP de `/` de 8,3 s para 6,6 a 6,7 s. Falta a
   parte que resolve: uma miniatura para o cartão e para a primeira foto do detalhe (dado novo,
   `SUGESTOES.md`). Sem ela, a meta de LCP < 2,5 s no 4G não fecha, nem na página inicial nem no
   detalhe.
2. **O 3D.** Com honestidade: 131 KB gzip e cerca de 6% de um núcleo (medido no SwiftShader) para
   um logo de 56px que, de perto, quase não se distingue do SVG, não se pagam. Ou ele vira um
   momento de verdade (maior, só na primeira visita e só em tela larga), ou eu o tiraria e deixaria
   o SVG, que já é a marca.
3. **Acessibilidade fina.** O `lowercase` do título muda o nome acessível para "roseshop"; o
   cartão repete o nome do produto no `alt` da foto e no texto (o leitor de tela lê duas vezes).
   O primeiro é só CSS; o segundo é contrato da 005 e pediria ajuste na spec. Também: meta
   description nas páginas públicas e `noindex` em `/painel/entrar`.

## Onde hesitei

- **Janela ou Letreiro.** O Letreiro tinha a melhor orientação e o preço mais legível; escolhi a
  Janela pelo acolhimento e pelo tratamento da foto, e trouxe do Letreiro só os botões de
  categoria. Ainda acho que a cliente acharia o produto mais rápido no Letreiro.
- **O logo.** Testei a rosa em espiral e as pétalas deslocadas; as duas ficaram infantis
  (pirulito, bolinho). Fiquei com os arcos concêntricos sabendo do risco de arco-íris.
- **React Three Fiber ou three puro.** Recomendei three puro para não trazer 10 dependências e um
  reconciliador para um objeto só; o humano concordou. O peso do three em si continuou o problema.
- **Onde pôr a sacola no topo.** O teste da 005 só permite ao layout o espaço reservado; em vez de
  mexer no teste, o espaço ficou sobreposto ao canto e cada página ganhou o próprio topo.
- **Mexer ou não na regra de `eager`.** Vi o problema de LCP na Fase 8 e não mudei por conta
  própria, porque é comportamento fixado em teste e na spec; propus em `VALIDACAO.md`, o humano
  aprovou e a mudança entrou (2 eager em vez de 9). Errei ao não perceber isso já na Fase 5: o
  layout novo empurrou a lista para baixo da dobra e a regra numérica antiga deixou de fazer
  sentido ali mesmo.

## O que eu não validei

- **Celular real:** CLS da troca de fontes no Android (os fallbacks dependem de `local("Roboto")` e
  `local("Noto Serif")`, nomes que não pude conferir no WSL), toque, rolagem lateral com o dedo,
  3D com GPU de verdade e o custo de CPU real do 3D.
- **Painel por dentro:** sem login, vi só `/painel/entrar`; as demais telas foram validadas por
  teste e pela leitura do diff (só classes mudaram).
- **Nota de Performance do Lighthouse:** a ferramenta disponível não calcula essa categoria.
- **Envio real pelo WhatsApp:** coberto por teste, não tocado no navegador.

## Observações do humano no Poco

**Pendente.** Os pedidos da Fase 8 trouxeram só o espaço reservado ("[cole aqui o que você viu]",
depois "[PREENCHA]"), e o humano confirmou que não tem as observações agora. Não registro nada no
lugar delas. Quando chegarem, entram aqui e podem mudar as notas
de adequação à cliente, de adequação à Dona Rose e de qualidade técnica.
