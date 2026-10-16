# Pesquisa de componentes (Fase 3)

Regra que guiou cada escolha: **servir à Janela, caber no orçamento de JavaScript do catálogo no
4G e manter os comportamentos provados por teste** (adendo §3). Quando a opção de biblioteca
trazia peso ou comportamento que o elemento nativo já resolve, ganhou o nativo, com o desenho da
biblioteca como guia de acessibilidade.

Fontes consultadas: MCP do shadcn (registro `@shadcn`), MCP do 21st (catálogo de componentes),
MCP e skill do Motion. O 21st entra só como referência de comportamento: nenhum componente dele é
copiado, porque todos chegam com a estética da casa (sombras, degradês, cantos únicos) e com
dependências de animação.

## Base (todas as telas)

| Componente | Opções vistas | Escolha | Por quê | Adaptação |
|---|---|---|---|---|
| Botão | `@shadcn/button` (cva + Slot do Radix); 21st "Animated Badge"/botões com brilho | **Primitivo próprio** `Button` (já existe), reescrito | O shadcn traz `class-variance-authority`, `clsx`, `tailwind-merge` e Radix só para variar classes; o nosso tem duas variantes e não precisa disso | Pílula (raio cheio), 52px de altura, `acao` e contorno em `texto`; afunda 1px ao tocar; foco com anel de 3px |
| Campos (texto, área, seleção, marcação) | `@shadcn/input`, `@shadcn/select` (Radix Select), 21st "Input" do originui | **Primitivos próprios** (já existem), reescritos | O Select do Radix troca o seletor nativo do celular por uma lista desenhada; o painel escolheu o nativo de propósito (abre o seletor do sistema) | Raio `suave`, borda de 2px em `texto-suave`, rótulo acima em 17px |
| Aviso e mensagem | `@shadcn/alert`, `@shadcn/sonner` (toast) | **Primitivo próprio** `Aviso` | Toast some sozinho: ruim para quem lê devagar; o aviso fixo com `role` correto já está provado | Faixa com borda esquerda grossa em `sucesso`/`erro` e fundo levemente tingido |
| Diálogo de confirmação | `@shadcn/dialog` e `@shadcn/alert-dialog` (Radix); Motion UI "Sheet" (sobre `<dialog>` nativo, pago) | **`<dialog>` nativo** (já usado em "Limpar sacola") | `showModal()` prende o foco e fecha com Esc sem biblioteca; o teste de foco já cobre | Cantos em arco no topo, fundo `superficie`, véu `texto` a 50%; entrada só com opacidade |

## Catálogo público

| Tela, componente | Opções vistas | Escolha | Por quê | Adaptação |
|---|---|---|---|---|
| Cabeçalho, logo | — | **SVG próprio**, inline | Teste da `/sacola` sem JS: nenhum texto no HTML do layout | `role="img"` + `aria-label="Roseshop"` no link; sem `<title>` |
| Cabeçalho, acesso à sacola | 21st "Animated Badge", "Animated Status Badge" | **Link próprio** com contador em pílula | O contador só existe depois de hidratar e mora num espaço de altura fixa; o selo animado do 21st pulsa sem parar | Pílula `superficie-2` com o número em `acao`; pulso único (escala 1→1,15→1, mola CSS) só quando o número muda |
| Início, topo ("janela") | — | **CSS puro** | Um degradê radial e um arco. Nada a carregar | 200px de altura; luz `luz` sobre `ceu`; amanhece uma vez ao abrir |
| Início, destaques | `@shadcn/carousel` (Embla); 21st "Carousel" (appica-dev), "Horizontal Scroll Gallery" (rolagem presa ao scroll vertical) | **Fileira com `scroll-snap` nativo** | O Embla tem cerca de 7 KB comprimido mais o wrapper; o arrasto nativo do celular é o que a cliente conhece. A galeria presa ao scroll vertical trava a rolagem (proibido) | Cartões com 42% da largura: o último visível fica sempre cortado na borda (indício de continuação). `<ul>` com todos os itens no DOM; cada cartão é link focável e o foco rola a fileira (`scroll-padding`). Só o contêiner rola, sem `100vw`: a página não ganha rolagem horizontal. Sem setas no celular; no desktop vira grade de 4. Requisitos completos no ADR-005 |
| Início, filtro de categoria | `@shadcn/tabs` (Radix Tabs); `@shadcn/toggle-group`; 21st "Chip Group", "Selector Chips", "Filter Grid" | **Links próprios em grade de 2 colunas** (lição do Letreiro) | Cada categoria é um endereço (`/?categoria=`) filtrado no servidor: semântica de navegação com `aria-current="page"`, não de abas nem de alternância. Tabs e toggles quebrariam o link e o "voltar" | Botões de 56px com topo em arco; o atual cheio em `texto` com letra `superficie` |
| Início, cartão de produto | 21st cartões de produto em geral (sombra, zoom no hover) | **Próprio** | Zoom no hover não existe no celular e sombra cinza é o "kit SaaS" | Foto quadrada no arco com moldura de 6px; nome em 2 linhas no máximo, sem reticências cortando palavra no meio de nome curto; código pequeno; preço na Young Serif; "Esgotado" em pílula e foto dessaturada |
| Início, "Carregar mais" | 21st botões de "load more" com spinner | **Primitivo `Button` secundário** | O comportamento (foco no primeiro novo, "Tentar de novo") já está provado | "Carregando…" troca o texto; sem spinner |
| Detalhe, galeria | `@shadcn/carousel`; 21st "Thumbnail Carousel" (molas, autoplay), "Thumbnail image viewer" | **`scroll-snap` nativo + pontos** com ilha cliente mínima | Autoplay é proibido para quem lê devagar; molas pedem Motion inteiro. A ilha só observa qual foto está visível (`IntersectionObserver`) para acender o ponto | Arco grande (88% da largura), o próximo aparece na borda; pontos com `aria-hidden`, a lista de fotos já é `aria-label="Fotos"` |
| Detalhe, "Adicionar à sacola" e "Perguntar no WhatsApp" | 21st "Hold to confirm" (Motion UI, pago) | **`Button` primário** e link no estilo secundário | Os invariantes do adendo (espaço reservado, só depois de hidratar, foco no "Na sacola") ficam como estão | Primário em `acao`; o link do WhatsApp com contorno; "Na sacola" vira pílula com marca de confirmação em `sucesso` |
| Sacola, quantidade | 21st "Quantity Stepper" (dígitos rolando, aceleração), "Number Flow", originui "Stepper" | **Próprio**, botões − e + nativos com `<output>` | Os rótulos e `disabled` nos limites já estão provados; dígitos rolando custam uma biblioteca | Botões redondos de 48px em `superficie-2`; o número na Young Serif |
| Sacola, observação e medidor | Motion "Characters remaining" (mola no contador) | **Próprio** (já existe) | O aviso `#obs-conta` só muda na transição; animar o contador anunciaria demais | Barra de progresso nativa estilizada com `accent-color`/pseudo-elementos em `acao` |
| Sacola, "Limpar sacola" | ver diálogo | `<dialog>` nativo | — | — |
| Sacola, "Enviar pedido pelo WhatsApp" | — | `Button` primário largo | `<button>` obrigatório (adendo) | O maior botão da página, fixo no fim do fluxo, não flutuante (não cobre o conteúdo nem o teclado) |
| Erro e não encontrado | — | Próprio | — | Um arco vazio (moldura sem foto) e uma frase direta |

## Painel (estilo, não estrutura)

| Componente | Escolha | Adaptação |
|---|---|---|
| Cabeçalho do painel | O mesmo, com o símbolo do logo e "Painel da loja" | Fundo `superficie-2`, sem a luz (o painel é lugar de trabalho) |
| Botões grandes da página inicial (Produtos, Categorias) | Links no estilo do `Button` primário | Mantêm texto e ordem |
| Lista de produtos | Linha com miniatura | Miniatura com o arco pequeno (mesma linguagem do catálogo), selos "Esgotado" e "Em destaque" em pílula |
| Cadastro por fotos (recorte, lista, arrasto) | Componentes atuais | Só cor, raio e tipografia; o `react-easy-crop` recebe a cor de `acao` na grade |

## Movimento

| Uso | Opções | Escolha |
|---|---|---|
| Molas (contador, botão, diálogo) | `motion` (React, cerca de 30 KB; `LazyMotion` em torno de 5 KB); `motion/mini` `animate` (3,2 KB, WAAPI) | **CSS `linear()` gerado pela skill do Motion**, sem pacote em runtime. Os efeitos são poucos e simples; um `transition` com curva de mola em CSS faz o mesmo sem nenhum byte de JS |
| Troca de página | `motion` `AnimatePresence`; View Transitions API | **View Transitions do CSS** (`@view-transition { navigation: auto }`) onde o navegador suporta; sem suporte, a página troca como hoje. Desligado com `prefers-reduced-motion` |
| Entrada do topo | — | Uma `@keyframes` de 1 s |

## Logo 3D (Fase 7)

| Opção | Peso aproximado (comprimido) | Escolha |
|---|---|---|
| `three` + `@react-three/fiber` (o que o prompt cita) | three (só o necessário) mais R3F e mais 10 dependências transitivas (zustand, scheduler, its-fine e outras) | Recusada pelo humano |
| **`three` sozinho** (`0.186.1`), numa ilha cliente com `useEffect` | Só o necessário de three, sem dependências transitivas | **Aprovada** (ADR-005) |

A geometria é construída em código (arcos como `TubeGeometry` sobre curvas), sem arquivo de
modelo para baixar. Material de cerâmica fosca em `acao`, luz quente lateral, giro lento.

## Coerência

Uma forma (o arco), uma luz, duas fontes, um raio de pílula para ação. Nenhum componente fica
com a cara de biblioteca porque nenhum chega pronto: todos são escritos sobre os tokens da Fase 4.
