# Três direções e a escolha

Os esboços (início e detalhe, 390px, dados e fotos fictícios) estão em `design/direcoes/<nome>/`.
As capturas estão em `design/screenshots/direcoes/`. Contraste calculado pela fórmula WCAG 2.x
(luminância relativa). Todas as combinações de texto abaixo passam em AA (≥ 4,5:1).

---

## 1. Janela

**Conceito.** *A loja é a janela da casa da Rose de manhã: a luz entra, e o que ela separou para
você está ali no parapeito.* O arco da janela é a forma que organiza tudo: emoldura o logo, as
fotos e os botões de categoria. A luz aparece num lugar só, no topo, como amanhecer.

**Logo.** "Rosa de arcos" (`direcoes/janela/logo.svg`): três arcos concêntricos sobre uma linha
de parapeito. Lido de longe, é uma janela; de perto, as pétalas de um botão de rosa visto de
frente. Traço único, uma cor, legível em 32px (três arcos e uma base, sem detalhe fino).

**Paleta.**

| Token | Hex | Uso | Contraste |
|---|---|---|---|
| `fundo` | `#FFFBF8` | Página | — |
| `fundo-2` | `#F6ECE8` | Moldura das fotos, superfícies | — |
| `tinta` | `#3B1F2B` | Texto principal (ameixa escura, não preto) | 14,40 sobre `fundo` |
| `tinta-suave` | `#6B4A57` | Texto de apoio | 7,44 sobre `fundo` |
| `rosa` | `#A8325A` | Ação principal, preço | 6,24 sobre `fundo`; branco sobre ele 6,42 |
| `ceu` | `#DCE8F2` | Céu da manhã (topo), superfícies frias | `tinta` sobre ele 11,91 |
| `luz` | `#F8DDB6` | Só a luz do topo, decorativa | `tinta` sobre ela 11,30 |
| `folha` | `#3D6B4F` | Confirmação, sucesso | 5,98 sobre `fundo` |

**Tipografia.** *Young Serif* (Bastien Sozeau, OFL) nos títulos e preços: uma serifada pesada,
de peso único e formas cheias, que lembra letreiro de padaria antiga e não a elegância fria das
serifadas de moda. *Atkinson Hyperlegible Next* (Braille Institute, OFL) no texto: feita para
leitura com baixa visão, com letras que não se confundem (I/l/1, O/0). Isso serve às clientes de
mais idade e à Dona Rose.

**Linguagem gráfica.** Arco no alto, cantos retos embaixo. A forma vale para foto, botão de
categoria e moldura do topo. Nenhuma textura, nenhum ícone decorativo, um único degradê (a luz).

**Como o produto aparece.** A foto quadrada entra num arco com 6px de moldura em `fundo-2`. O
arco esconde os cantos de cima, onde costuma aparecer bagunça de fundo (parede, tomada, beirada
da mesa), e a moldura igual em todos os cartões dá unidade a fotos com luz e fundo diferentes. No
esboço, o guarda-chuva sobre lençol azul e o pano xadrez amassado ficaram bem, sem retoque.

**Movimento.** Um só momento: a luz do topo "amanhece" (opacidade e posição, cerca de 1 s) ao
abrir. O resto é resposta ao toque: o contador da sacola pulsa ao mudar, o botão afunda ao ser
tocado. Com `prefers-reduced-motion`, nada se move.

**Prós.** É a direção mais fiel ao conceito (manhã, rosa, arco, acolhimento) sem nenhum símbolo
religioso. Valoriza a foto caseira. Calma, legível, envelhece bem.
**Contras.** Fica perto do lugar-comum "loja delicada": fundo claro quente e serifada.
**Risco para a Dona Rose:** baixo, porque o painel herda só cor e tipografia. **Para as
clientes:** no esboço, a janela do topo ocupa quase a primeira dobra antes de qualquer produto.
Precisa encolher.

---

## 2. Caderninho

**Conceito.** *O catálogo é o caderninho da revendedora: cada produto anotado à mão, preço na
etiqueta e marca-texto no que chegou de bom.* Vem da cultura real de revenda no Brasil (o
caderno de pedidos da revendedora de Tupperware e de cosméticos).

**Logo.** Rosa desenhada num traço contínuo, como rabisco de margem, ao lado de "roseshop" na
letra de mão (`direcoes/caderninho/logo.svg`).

**Paleta.** `papel` #FFFEF9, `pauta` #D5E0F1 (só linhas), `margem` #C8364A (5,09 sobre papel),
`caneta` #1F3A8F (10,09 sobre papel; branco sobre ela 10,19), `grafite` #2E2E33 (13,38),
`marca-texto` #FFE76A (fundo; caneta sobre ele 8,20), `etiqueta` #F6EBD9 (grafite sobre ela 11,45).

**Tipografia.** *Shantell Sans* (Shantell Martin e Arrow Type, OFL), letra de mão legível com eixo
de informalidade, nos títulos e preços. *Atkinson Hyperlegible Next* no texto.

**Linguagem gráfica.** Pauta e margem vermelha no fundo, fita adesiva nas fotos, foto com borda
branca levemente torta, etiqueta de preço recortada.

**Como o produto aparece.** Foto "colada" no caderno com borda branca de foto impressa. A foto
caseira combina com o suporte caseiro.

**Movimento.** O marca-texto passa sob o título uma vez; a etiqueta balança ao adicionar.

**Prós.** A direção mais original e mais ligada ao mundo real da Dona Rose.
**Contras (vistos no esboço).** A letra de mão é larga: o cabeçalho do detalhe quebrou em duas
linhas e a sacola virou "Sacola (2)" em dois andares. A pauta passa por trás do texto e obriga
entrelinha de 32px, o que cansa. As fotos tortas atrapalham a leitura da grade.
**Risco:** para as clientes, cara de site infantil ou de brincadeira; para a Dona Rose, um
painel "de caderno" fica confuso.

---

## 3. Letreiro

**Conceito.** *Uma vitrine de bairro pintada à mão: cada categoria tem sua cor, e a foto de casa
ganha um ladrilho de cor que a deixa bonita.*

**Logo.** Placa quadrada com um "R" largo vazado e um ponto-sol amarelo
(`direcoes/letreiro/logo.svg`). Wordmark "rose•shop".

**Paleta.** `rosa` #C2255C (branco sobre ele 5,66), `amarelo` #F2B705 (tinta sobre ele 9,23),
`verde` #0E6E66 (branco 6,10), `anil` #2D479B (branco 8,45), `tinta` #1E1B2E (16,78 sobre branco),
`rosa-claro` #FBD3E0 (tinta 12,38), mais branco.

**Tipografia.** *Archivo* (Omnibus-Type, OFL), uma família só, usando o eixo de largura: larga e
pesada nos títulos e preços (pintura de letreiro), normal no texto.

**Linguagem gráfica.** Campos de cor chapada, cantos de 10px, nenhuma sombra.

**Como o produto aparece.** Foto num ladrilho de cor clara que gira entre quatro tons.

**Movimento.** A cor do topo troca com a categoria; sublinhado que desliza no filtro.

**Prós.** A melhor orientação das três: as categorias viram **blocos grandes de toque** logo no
alto, e quem quer "meias" chega em um toque. Preço muito legível.
**Contras.** Barulhenta. Lê como app de entrega ou de promoção, não como "a loja de alguém de
confiança". A cor por categoria depende de um dado que o cartão não tem (ver `SUGESTOES.md`).
**Risco:** para as clientes, cansaço visual e cara de genérico; para a Dona Rose, um painel
colorido distrai do que importa.

---

## A escolha: Janela, com duas lições das outras

**Escolhi a Janela.** Comparei as três contra o objetivo ("entrou na loja de alguém de
confiança, com cuidado e bom gosto, e achou o que procura sem esforço"):

- **Confiança e acolhimento.** A Janela é a única que transmite calma e cuidado sem pedir
  esforço. O Caderninho é afetivo, mas brinca demais; o Letreiro grita.
- **Foto caseira.** A moldura em arco foi o melhor tratamento das três com foto ruim de
  verdade: esconde os cantos bagunçados e dá unidade. O ladrilho do Letreiro também funciona,
  mas as cores rodando competem com a foto. A borda torta do Caderninho reforça o amadorismo.
- **Conceito.** Manhã, rosa e arco estão na forma, não em enfeite. Nenhum símbolo religioso. O
  arco e a luz são lidos como "casa" e "janela".
- **Legibilidade e alvos.** Atkinson no corpo e 17px de base. O Caderninho falhou aqui no esboço.
- **Orçamento.** CSS puro: um degradê, `border-radius` e uma fonte de título de peso único (um
  arquivo só).

**O que trago das outras:**

1. **Do Letreiro, os blocos grandes de categoria.** O filtro vira uma grade de botões em arco
   (2 colunas, 56px de altura), não uma fila de links sublinhados. Fica onde a spec manda,
   acima da lista (FR-005 e US4).
2. **Do Caderninho, a voz.** Títulos em primeira pessoa da loja e da Rose ("Separados pela
   Rose", "Tudo da loja"), sem jargão. Nada da pauta, da fita nem da letra de mão.

**O que descarto, e por quê:**

- A pauta, a fita, a foto torta e a letra de mão do Caderninho: custam legibilidade e
  parecem infantis.
- A cor por categoria e o fundo cor-de-rosa chapado do Letreiro: barulho, e dependem de dado
  que não existe.
- Da própria Janela: a janela gigante do esboço. Ela encolhe para cerca de 200px, para o
  primeiro produto aparecer na primeira dobra do celular.

**Ajustes que o esboço mostrou e que entram na construção:**

- **Destaques em uma fileira com rolagem lateral** (`scroll-snap`), e não em grade. Com até 8
  destaques, a grade de 2 colunas empurrava o filtro duas telas para baixo; a fileira tem a
  altura de um cartão. A ordem continua a do servidor (FR-009). O último cartão visível fica
  sempre cortado na borda, para avisar que há mais; a fileira funciona por teclado e por leitor
  de tela e não cria rolagem horizontal na página (requisitos no ADR-005).
- **Preço na Young Serif.** O zero cortado da Atkinson ("R$ 12,00") parece técnico num preço. Na
  serifada, os números têm cara de etiqueta escrita. O código do produto continua na Atkinson,
  onde o zero cortado ajuda (0 e O não se confundem). FR-008 pede o código no cartão: ele fica,
  pequeno, em `tinta-suave`.
- **Galeria do detalhe** em rolagem lateral com o próximo arco aparecendo na borda e pontos
  indicando a foto atual. Hoje as fotos são empilhadas.
- **Moldura em arco com `aspect-ratio` na imagem**, não no contêiner. No esboço, o contêiner
  cresceu com a foto e um cartão ficou mais alto que o vizinho.
- **Só tema claro**, com `color-scheme: light`. O tema escuro dobraria o trabalho de contraste
  sobre fotos com fundo imprevisível, e a "luz da manhã" é o conceito.

**O logo, testado em tamanhos** (`direcoes/janela/logo-variantes.html` e
`screenshots/direcoes/janela-logo-tamanhos.png`). Em tamanho grande, três arcos concêntricos
podem lembrar um arco-íris. Testei duas saídas: (B) uma janela com uma rosa em espiral dentro,
que pareceu um pirulito, e (C) pétalas em arco deslocadas, que pareceram um bolinho. As duas são
infantis. Fico com a (A): as pernas retas e o parapeito fazem dela uma porta ou janela (arco-íris
não tem base), e ela é a mais limpa em 32px. Em 16px os três arcos se fundem, então o favicon usa
só dois. A leitura "rosa" vem do nome e da versão 3D, em que os arcos ganham profundidade, como
pétalas.

**Sistema final (base para a Fase 4).** Tokens semânticos: `superficie`, `superficie-2`,
`texto`, `texto-suave`, `acao`, `acao-forte`, `ceu`, `luz`, `sucesso`, `erro`, `linha`, `foco`.
Fontes: Young Serif (título e preço) e Atkinson Hyperlegible Next (texto, 400 e 700),
hospedadas em `public/fonts`. Raios: `arco` (999px no alto e 10px embaixo) para foto e
categoria, `pilula` (botões), `suave` (10px, campos). O foco é um anel de 3px em `acao` com
recuo, visível sobre qualquer foto.
