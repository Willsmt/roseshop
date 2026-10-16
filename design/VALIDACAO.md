# Validação final (Fase 8) — 2026-10-16

Feita no `preview` local (`npm run preview`, workerd) com o chrome-devtools (Chrome 155, WSL, sem
GPU). Banco local com o `seed:local` e, no R2 local, as fotos amadoras do Commons no lugar das
fotos de cor lisa do seed (JPEG de 960px, cerca de 230 KB cada; ver `direcoes/_fotos/CREDITOS.md`).
Capturas em `screenshots/fase8/`. CPU do Worker em `CPU.md`.

## Fluxo da cliente (390px)

| Passo | Resultado |
|---|---|
| Abrir `/` com sacola vazia | Destaques com 5 cartões, filtro com 6 categorias, "Sacola, 0 produtos" |
| Escolher "Meias" | `/?categoria=meias`, "Meias" com `aria-current`, "Mostrando produtos de Meias" |
| Abrir "Meia Listrada Verde 16" | `/p/0017`, "Adicionar à sacola" e "Perguntar no WhatsApp" |
| Tocar em "Adicionar à sacola" | Vira "Na sacola" com o foco nele; o cabeçalho anuncia "1 produto" |
| Abrir `/sacola` | Conferida: item, quantidade, subtotal, observação |
| Botão do WhatsApp | `<button>` "Enviar pedido pelo WhatsApp", habilitado, 50px, sem `href`, nenhum link `wa.me` na página. **Não foi tocado**: abriria o WhatsApp de verdade (o caminho do envio é coberto por teste) |

Capturas: `fluxo-1-categoria-meias-390`, `fluxo-2-produto-390`, `fluxo-3-na-sacola-390`,
`fluxo-4-sacola-botao-whatsapp-390`.

## Lighthouse mobile (acessibilidade, boas práticas, SEO)

A ferramenta de Lighthouse do chrome-devtools **não roda a categoria Performance**; por isso não há
"nota de Performance". LCP e CLS vêm do trace de performance (abaixo).

| Página | Acessibilidade | Boas práticas | SEO | O que falhou |
|---|---|---|---|---|
| `/` | 100 | 100 | 58 | `is-crawlable` (o `noindex` é proposital) e falta de meta description |
| `/p/0017` | 100 | 100 | 58 | idem |
| `/sacola` | 100 | 100 | 58 | idem |
| `/painel/entrar` | 100 | 100 | 91 | meta description |

Achado à parte, anterior ao redesenho e fora do escopo dele: **`/painel/entrar` não tem
`noindex`** (o Lighthouse a considera indexável). As páginas públicas têm. Fica para decisão humana
(zona de auth).

## LCP e CLS em Slow 4G (trace, 390px, CPU 4x mais lenta, sem cache)

| Página | LCP | CLS | Meta (LCP < 2,5 s, CLS < 0,1) |
|---|---|---|---|
| `/` | **8279 ms** | 0,00 | **LCP reprovado** |
| `/p/0017` | **3312 ms** | 0,00 | **LCP reprovado** |
| `/painel/entrar` | 1487 ms | 0,00 | aprovado |

**Por que a página inicial reprova.** O LCP é a 2ª foto dos destaques; 92% do tempo é o download
dela (7655 ms). A página pede **9 fotos com `loading="eager"`**, mas só **3** aparecem na primeira
tela: as outras 6 (destaques além da borda e os 4 primeiros itens da lista, que no layout novo
ficam bem abaixo da dobra) disputam a mesma banda. Com cerca de 230 KB por foto, são mais de 2 MB
antes de a foto do LCP terminar.

- A regra "destaques todos eager; na lista, os 4 primeiros eager" é da 005 (FR-008) e está
  fixada em `page.test.tsx`. Ela fazia sentido no layout antigo. No novo, a própria FR-008 ("fora
  da primeira tela visível, MUST ser baixada só quando estiver para aparecer") pede menos eager:
  **o redesenho deixou a regra numérica desalinhada da intenção da spec**.
- **Proposta aprovada e aplicada** (ver "Depois da correção do LCP", abaixo): só os 2 primeiros
  destaques eager, o primeiro com `fetchpriority="high"`; o resto dos destaques e toda a lista com
  `lazy`.
- Mesmo com isso, o detalhe (1 foto de 240 KB) dá 3,3 s: o peso da foto é o limite. A 005 decidiu
  servir o arquivo original, sem versão reduzida (FR-008). Uma miniatura para o cartão é a medida
  que realmente resolve, e pede dado novo (ver `SUGESTOES.md`).
- Ressalva: as fotos usadas são JPEG do Commons; as reais saem do aparelho como WebP ou JPEG de
  400 a 1200px, até 1 MiB (feature 004). Podem ser menores ou maiores que estas.

## Depois da correção do LCP

Aplicado com aval humano: na página inicial, `eager` só nos 2 primeiros destaques (o primeiro com
`fetchpriority="high"`, que o Next também leva ao `<link rel="preload">`); o resto dos destaques e
toda a lista com `lazy`. O HTML de `/` pede logo 2 fotos em vez de 9.

Mesmo método (390px, Slow 4G, CPU 4x mais lenta, sem cache), duas cargas:

| Página | Antes | Depois (carga 1) | Depois (carga 2) | CLS |
|---|---|---|---|---|
| `/` | 8279 ms | **6709 ms** | **6619 ms** | 0,00 |

- **Melhorou cerca de 1,6 s, mas ainda reprova a meta de 2,5 s.** Agora só as 2 fotos eager saem
  no início; as lazy vêm depois do JS. O LCP é a **segunda** foto dos destaques (235 KB): divide a
  banda com a primeira (249 KB, prioridade alta), com o JS da página e com as fontes. Só as duas
  fotos somam cerca de 480 KB, o que no Slow 4G já passa de 2,5 s.
- O limite agora é o **peso do arquivo**, não a ordem de carga: nenhuma regra de `loading` deixa uma
  foto de 240 KB abaixo de 2,5 s neste link. A saída é a miniatura (`SUGESTOES.md`).
- Testes ajustados (só a contagem de eager): `page.test.tsx` (destaques `eager, eager, lazy`;
  lista toda `lazy`) e `destaques.test.tsx` (2 eager e 6 lazy em 8). Caso novo em
  `destaques.test.tsx`: só a primeira foto tem `fetchpriority="high"`.
- Fixtures da 005: só `inicio-005.html` mudou (preloads de 6 para 2, `fetchpriority` na primeira
  foto e as 4 primeiras fotos da lista de `eager` para `lazy`); regravado com `GRAVAR_HTML_005=1`.
  Detalhe e esgotado saíram idênticos.

## Movimento reduzido (390px)

`prefers-reduced-motion: reduce`: a luz da janela não anima (duração 0,01 ms), o 3D não carrega
(nenhum canvas e o chunk do three não é baixado), sem rolagem lateral, tudo utilizável.

## Console e rede

Navegação por `/`, `/?categoria=meias`, `/p/0017`, `/sacola` e `/painel/entrar`: **console sem
erros nem avisos** e **nenhum 404** (fotos 200 ou 304, fontes 200, chunks 200).

## Capturas do catálogo

`screenshots/fase8/inicio-{360,390,768,1440}.webp` e `detalhe-{360,390,768,1440}.webp` (neste
Chrome sem WebGL o logo aparece em SVG, que é o fallback correto). A sacola nas quatro larguras
está em `screenshots/fase5/` (não mudou depois).

## O que não foi validado pelo agente

- **Celular real.** Nada aqui rodou num Android: CLS da troca de fontes no Android (os fallbacks
  usam `local("Roboto")` e `local("Noto Serif")`, cujos nomes não pude conferir), toque, rolagem
  lateral com o dedo, 3D com GPU de verdade. As observações do humano no Poco não chegaram a mim.
- **Painel por dentro.** As telas internas pedem login Google; vi só `/painel/entrar`.
- **Nota de Performance do Lighthouse** (a ferramenta disponível não a calcula).
- **O envio de verdade pelo WhatsApp** (coberto por teste, não tocado no navegador).
