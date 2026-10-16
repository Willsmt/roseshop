# ADR-005 — Componentes de UI e identidade visual

**Status:** aceito (2026-10-16, humano)
**Data:** 2026-10-16
**Origem:** `prompt-design-roseshop.md` e `design-prompt-adendo.md` (o adendo vence em conflito);
`design/IMERSAO.md`, `design/DIRECOES.md` e `design/REFERENCIAS.md`. Preenche a linha
"Componentes UI: a definir | 005" da constitution II.

## Contexto

- A constitution deixa a biblioteca de componentes em aberto (II), e o ADR-004 cita o shadcn/ui
  como base provável.
- O catálogo é aberto num Android comum, no 4G, a partir de um link do WhatsApp. Cada KB de
  JavaScript nas rotas públicas pesa no LCP. O servidor está no Workers Free, com `/` em 17 ms de
  CPU de mediana (`design/CPU.md`).
- O catálogo e a sacola têm comportamentos provados por teste e invariantes que o redesenho não
  pode mudar (adendo §3): ilhas que só aparecem depois de hidratar, `<dialog>` nativo, foco e
  `aria-live` definidos, envio por `<button>`.
- Os primitivos de `src/components/ui/` já existem, com testes de papel e texto, e o painel
  depende deles.
- O prompt pede um logo 3D com Three.js no topo do catálogo, fora do orçamento de JS e carregado
  depois.

## Decisão

### Componentes

- **Sem biblioteca de componentes em runtime.** Os primitivos continuam em `src/components/ui/`,
  em código próprio (o modelo "o código é seu" do shadcn, sem as dependências dele), escritos
  sobre elementos nativos: `<button>`, `<input>`, `<select>`, `<textarea>`, `<dialog>`,
  `<progress>`.
- O shadcn (MCP e registro) e o 21st servem de **referência de acessibilidade e comportamento**.
  Nenhum componente deles é instalado: Radix, `vaul`, `embla-carousel`, `class-variance-authority`,
  `clsx` e `tailwind-merge` ficam de fora. Motivo: cada um resolve um problema que o elemento
  nativo já resolve neste app, e todos somariam JS às rotas públicas.
- `<select>` continua nativo (no celular abre o seletor do sistema, decisão já tomada no painel).

### Destaques e galeria com rolagem lateral

Feitos com **`scroll-snap` do CSS**, sem biblioteca. Requisitos (ajuste 1 do humano):

- **Indício de continuação:** a largura dos cartões é calculada para que o último visível fique
  cortado na borda direita, nunca alinhado a ela. Assim a cliente vê que há mais.
- **Teclado:** cada cartão é um link focável. Ao receber foco, o navegador rola a fileira até
  ele (`scroll-padding` igual à margem lateral, para o foco não colar na borda). A ordem do Tab
  segue a ordem visual. A fileira não prende o foco nem intercepta setas.
- **Leitor de tela:** a fileira é uma lista (`<ul>`) sob o título da seção, com todos os itens no
  DOM desde o servidor (nada carregado por rolagem). O leitor anuncia "lista, N itens". Os pontos
  da galeria são `aria-hidden`; a lista de fotos já tem `aria-label="Fotos"` e cada foto, o seu
  `alt` ("foto 1 de 3").
- **Sem rolagem horizontal da página:** quem rola é só o contêiner (`overflow-x: auto`). O
  sangramento até a borda da tela é feito com margem negativa igual ao recuo da página e
  `padding` interno de mesmo valor, nunca com `100vw`. O teste visual em 360px confere que
  `document.documentElement.scrollWidth` é igual à largura da janela.
- **Desktop:** os destaques viram grade; não há carrossel.
- A única lógica cliente nova é um `IntersectionObserver` na galeria do detalhe, para acender o
  ponto da foto visível.

### Movimento

- **Sem o pacote `motion` em runtime.** As molas são CSS `linear()` geradas com a skill do
  Motion; entradas são `@keyframes`; troca de página por View Transitions do CSS onde houver
  suporte. Tudo some com `prefers-reduced-motion: reduce`.

### Identidade (direção "Janela")

- **Tokens** semânticos no `@theme` do Tailwind v4 e em variáveis CSS, numa fonte única para
  catálogo e painel (o ADR-004 continua valendo): `superficie`, `superficie-2`, `texto`,
  `texto-suave`, `acao`, `acao-forte`, `ceu`, `luz`, `sucesso`, `erro`, `linha`, `foco`. Valores e
  contrastes em `design/DIRECOES.md`; todo texto em AA.
- **Só tema claro** (`color-scheme: light`).

### Fontes

Hospedadas no próprio app, em `public/fonts/`, sem chamada a serviço externo. Os `.woff2` vêm
**sem modificação** dos repositórios oficiais de cada família (os mesmos que o Google Fonts usa
como fonte), e o texto da licença de cada uma vai junto. Nenhuma das duas licenças declara nome
reservado.

| Família | Uso | Repositório oficial (commit) | Arquivos | Tamanho | Licença |
|---|---|---|---|---|---|
| Young Serif (Bastien Sozeau, noirblancrouge) | Títulos e preços | `github.com/noirblancrouge/YoungSerif` (`8a6c3ce`, 2026-05-19) | `fonts/webfonts/YoungSerif-Regular.woff2` | 81 600 B | OFL 1.1 (`OFL.txt` → `public/fonts/YoungSerif-OFL.txt`) |
| Atkinson Hyperlegible Next (Braille Institute) | Texto | `github.com/googlefonts/atkinson-hyperlegible-next` (`7925f50`, 2025-02-21) | `fonts/webfonts/AtkinsonHyperlegibleNext-Regular.woff2` e `-Bold.woff2` | 24 896 B e 25 928 B | OFL 1.1 (`OFL.txt` → `public/fonts/AtkinsonHyperlegibleNext-OFL.txt`) |

- Total de cerca de 132 KB, carregados com `font-display: swap` e métricas de fallback ajustadas
  (`size-adjust`) para não haver salto de layout. O LCP do catálogo é uma foto, não texto. Se o
  Lighthouse em Slow 4G mostrar a Young Serif como gargalo, o caminho é um subconjunto latin +
  latin-ext (permitido pela OFL, sem nome reservado), o que exigiria uma ferramenta nova e passa
  antes pelo humano.
- Sai o `next/font/google` (Geist), que baixa a fonte do Google a cada build.

### `design/` fora do app

`design/` guarda esboços, capturas e documentos; nada dele é código do app.

- **Tailwind:** `@source not "../../design"` no `globals.css` (o v4 varre o projeto inteiro
  respeitando só o `.gitignore`).
- **TypeScript:** `design` no `exclude` do `tsconfig.json`.
- **ESLint:** `design/**` nos `ignores` do `eslint.config.mjs`.
- **Deploy do Worker:** o OpenNext empacota só a saída do `next build` (`.next/`) e `public/`.
  `design/` não está em nenhum dos dois. A Fase 4 confere isso no `.open-next/` gerado
  (nenhum caminho `design/` no bundle nem nos assets).
- **Git:** as fotos de terceiros dos esboços (`design/direcoes/_fotos/*`) ficam fora do
  repositório pelo `.gitignore`; só o `CREDITOS.md` é versionado.

### Logo 3D (Fase 7)

- **`three` sozinho**, numa ilha cliente carregada com `import()` dinâmico depois que a página e
  os produtos aparecem. Não carrega com `prefers-reduced-motion`, com `saveData`, com
  `navigator.hardwareConcurrency` baixo nem se o WebGL falhar; nesses casos fica o SVG. Pausa
  fora da tela (`IntersectionObserver`) e com a aba em segundo plano (`visibilitychange`). Não
  existe em nenhuma outra rota nem no painel.
- Geometria construída em código (arcos como `TubeGeometry` sobre curvas); nenhum arquivo de
  modelo para baixar.

### Dependências novas (aprovadas, instaladas só na Fase 7)

Instalação com `npm install --save-exact --ignore-scripts`, seguida do output real de
`npm audit --omit=dev --audit-level=high`, `npm audit --audit-level=high` e da checagem da
árvore (ADR-007).

| Pacote | Versão exata | Tipo | O que faz e por que | Licença | Script de instalação |
|---|---|---|---|---|---|
| `three` | `0.186.1` (2026-09-24) | runtime, só na ilha do logo 3D | Renderiza o logo em WebGL. Sem dependências próprias. | MIT | não |
| `@types/three` | `0.186.0` (2026-10-04) | dev | Tipos do `three` para o `tsc` estrito. | MIT | não |

**Dependências de apoio do `@types/three`.** O pacote de tipos declara 6 dependências:
`fflate`, `meshoptimizer`, `@tweenjs/tween.js`, `@dimforge/rapier3d-compat`, `@types/webxr` e
`@types/stats.js`. Elas existem para os tipos dos addons do three (descompressão, física,
animação de exemplo, WebXR, painel de estatísticas). Todas entram **só em dev**, como
transitivas de uma devDependency: o app não as importa, o bundle do navegador não as inclui e o
Worker não as empacota (`npm audit --omit=dev` não as vê).

As versões evitam lançamentos de menos de duas semanas.

**Instalação e auditoria (Fase 7, 2026-10-16).** Instalados com `npm install --save-exact
--ignore-scripts` (nenhum script rodou): o `three` acrescentou 1 pacote e o `@types/three`, 7.
Resultado do audit logo depois:

- `npm audit --omit=dev --audit-level=high` (runtime, o gate do CI): **0 vulnerabilidades**.
- `npm audit --audit-level=high` (tudo): **5 high, todas pré-existentes e de desenvolvimento**,
  uma única falha (GHSA-vfj7-8cjw-p6xm, `braces`) pela cadeia `eslint-config-next` →
  `@next/eslint-plugin-next` → `fast-glob` → `micromatch` → `braces`. O mesmo audit sobre o
  `package-lock.json` do commit anterior (16dccfb) acusa as mesmas 5: não vêm do three. É risco
  aceito pelo ADR-007, registrado em `docs/operacao.md` com revisão em 2026-11-03.
  `npm audit fix --force` não foi usado (trocaria o `eslint-config-next` por uma versão major
  antiga).
- Das 6 dependências de apoio do `@types/three`, as 4 que são pacotes de código aparecem só sob
  ele na árvore (`npm ls --all`): `@dimforge/rapier3d-compat@0.12.0`, `@tweenjs/tween.js@23.1.3`,
  `fflate@0.8.3` e `meshoptimizer@1.1.1`. As outras duas são só tipos (`@types/webxr`,
  `@types/stats.js`). Nenhuma é importada pelo app.

## Alternativas descartadas

- **shadcn/ui completo (Radix + cva + tailwind-merge):** acessível e popular, mas pesa nas rotas
  públicas, troca o `<select>` nativo por lista desenhada e reimplementa o `<dialog>` que a sacola
  já usa com teste de foco.
- **Componentes do 21st:** chegam com estética própria e animação contínua (selos pulsando,
  carrossel com autoplay); o adendo pede sistema, não colagem.
- **`embla-carousel` (Carousel do shadcn):** o `scroll-snap` nativo faz o mesmo com o gesto que
  a cliente já conhece e sem JS.
- **`motion` (Framer Motion):** ótimo para coreografias, mas aqui são três ou quatro molas
  simples; o CSS resolve sem JS.
- **`@react-three/fiber` 9.8.1:** o prompt o cita, mas ele traz 10 dependências transitivas
  (zustand, scheduler, its-fine, suspend-react, react-use-measure, use-sync-external-store,
  buffer, base64-js, @babel/runtime, @types/webxr) e um reconciliador React para uma cena de um
  objeto só, sem interação. Recusado pelo humano em 2026-10-16.
- **Fontes por `next/font/google`:** baixa os arquivos do Google a cada build; o prompt pede os
  woff2 versionados em `public/fonts`.

## Consequências

- (+) Nenhum byte de biblioteca de UI nas rotas públicas; o JS do catálogo continua sendo só o
  das ilhas que já existem, mais o observador da galeria.
- (+) Os testes atuais (papel e texto) continuam válidos; os primitivos mudam de pele, não de
  contrato.
- (+) Fontes e licenças versionadas no repositório; nenhuma chamada a terceiros ao abrir a loja.
- (−) Todo componente novo é escrito e mantido pelo projeto; não há "atualizar a biblioteca".
- (−) O carrossel nativo não tem setas no celular: depende do arrasto lateral, o gesto que a
  cliente já usa na galeria do próprio celular. No teclado, cada cartão é um link focável e a
  fileira rola até ele; no desktop, os destaques viram grade e não há carrossel.
- (−) 132 KB de fonte sem subconjunto. Aceito enquanto o LCP medido ficar abaixo de 2,5 s.
- (−) A linha "Componentes UI" da constitution II passa a apontar para este ADR; a emenda da
  tabela é do humano (`/speckit-constitution`).
