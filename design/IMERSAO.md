# Imersão

## O produto, em uma frase

Um catálogo que a cliente abre pelo link do WhatsApp, no celular e no 4G, para ver o que a Rose
tem, juntar numa sacola e mandar o pedido de volta pelo próprio WhatsApp. Não há conta, busca
nem pagamento: a cliente navega por **categoria** e por **destaque**.

## O que vi no app de hoje (`design/screenshots/antes/`, 390px)

- Esqueleto sem identidade: Arial, preto e branco, links sublinhados, "Sacola, 0 produtos" solto
  no topo.
- **Os destaques empurram tudo.** Com até 8 destaques em 2 colunas, são 4 linhas de cartão antes
  do filtro de categoria. A cliente que quer "meias" rola quase duas telas até achar o filtro.
- O detalhe mostra as fotos empilhadas na vertical, a mais de uma tela do botão da sacola.
- O cartão mostra `#0007`, um código que não ajuda a escolher e repete o que o detalhe já mostra.
- A sacola funciona e é acessível, mas é uma lista de formulário sem nenhum acolhimento.
- O painel (`/painel/entrar`) é limpo e grande. As telas internas exigem login Google e serão
  fotografadas na Fase 6.

## Público

- **Clientes:** mulheres adultas de várias idades, Android comum, 4G, links do WhatsApp. Texto
  de 17px ou mais no corpo, contraste alto, alvos de 48px, nada que dependa de gesto escondido.
- **Dona Rose e mais duas administradoras:** pouca familiaridade com tecnologia. O painel muda
  de pele, não de estrutura.

## Restrições que moldam o desenho (além do prompt)

1. **A `/sacola` sem JavaScript não pode ter texto do servidor fora do `<noscript>`**
   (`catalogo-html-005.test.tsx`, que renderiza layout + página). Por isso o cabeçalho do layout
   público leva só o **símbolo do logo em SVG**, com `aria-label`, sem `<title>` nem `<text>`.
   O nome "roseshop" escrito fica dentro das páginas.
2. **O contador da sacola nasce vazio** e aparece depois de hidratar, num espaço de altura fixa.
3. **Textos da sacola são fixos** (`src/lib/sacola/textos.ts`, fora do escopo). Só os textos de
   `_catalogo/textos.ts` são reescritos.
4. **Dados disponíveis no cartão:** código, nome, preço formatado, esgotado e capa. Não há
   categoria no cartão, nem número de fotos, nem imagem por categoria (ver `SUGESTOES.md`).
5. **Fotos:** quadradas, WebP 1200px, tiradas em casa. Fundo, luz e enquadramento variam muito.
6. **CPU do Worker:** `/` com mediana de 17 ms (ver `CPU.md`). Nada de trabalho novo no servidor.

## Referências do humano (vistas no navegador em 390px e 1440px, sem ler código)

| Referência | Levo | Descarto |
|---|---|---|
| **Brigade Overland** | Blocos grandes de cantos bem arredondados que empilham seções; a lista de marcas como linhas "foto pequena + nome grande", alvos de toque enormes e leitura imediata. | O tom bruto: caixa alta condensada, vídeo no topo, paleta de mato e lama. Peso demais para panos de prato. |
| **Marine Serre** | Um **símbolo simples** (a lua) que vira padrão e assina a marca sozinho, sem o nome. É o que quero do logo: uma forma que a Rose reconheça e que funcione em 32px. | Verde ácido, preto e branco duro, moda-passarela, menu horizontal que transborda no celular. |
| **Marketplace Hub** (cópia salva bloqueada pelo FrameAuth; vista ao vivo) | Categorias como **cartões grandes com nome sobre a imagem**: escolher categoria é tocar numa área do tamanho do polegar. | Fundo preto, verde-limão, busca como entrada principal (a cliente não busca), estética "template de Framer". |
| **Sézane** | Luz quente, muito respiro, pontos sobre a foto indicando que há mais fotos, faixa de categorias com rolagem lateral e a atual sublinhada. | Fotos de estúdio (as da Rose não são), nomes cortados com reticências (ruim para quem lê devagar), caixa alta espaçada. O par "creme + serifada" é exatamente o lugar-comum a evitar. |

## Referências próprias

| Referência | Por que | Levo | Descarto |
|---|---|---|---|
| **Labour and Wait** (loja de utilidades domésticas) | Vende o mesmo tipo de coisa da Rose: objetos de uso, sem glamour. | A **honestidade do objeto**: foto simples, nome claro, preço fácil de achar. A ideia de que um produto comum fica digno num quadro calmo e consistente. | Caixa alta espaçada, frio de galeria. |
| **Farm Rio** | Brasileira, calor de cor, voz de conversa ("vem conhecer!"). | A **foto pousada sobre um campo de cor**, que dá unidade a fotos diferentes; a voz próxima. | Excesso de estampa, banners de cupom, foto de modelo. |
| **Toast** (contraexemplo) | Abri para estudar a luz das fotos. | Uma lição: o site mostrou **dois avisos sobrepostos antes de qualquer produto**. Nada pode ficar entre a cliente e os produtos. | Tudo o mais. |
| **Fotos amadoras do Wikimedia Commons** (`direcoes/_fotos/`) | Simular a foto real da Rose: guarda-chuva sobre lençol azul, pano de prato amassado, pote seguro na mão. | Usadas nos esboços para testar cada direção com foto ruim de verdade, não com foto de catálogo. | Nada vai para o app. |

## O que a identidade precisa resolver

1. Deixar **bonita uma foto caseira** sem esconder o que ela é.
2. Levar a cliente à **categoria** em um toque, sem passar por oito destaques antes.
3. Ter **um** gesto memorável (o logo e a "luz da manhã") e todo o resto calmo.
4. Caber no orçamento: CSS e SVG primeiro, JavaScript só nas ilhas que já existem, 3D depois de
   tudo.
