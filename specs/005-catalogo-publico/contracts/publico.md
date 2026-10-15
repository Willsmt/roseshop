# Contrato: superfície pública (005)

**Plan**: [../plan.md](../plan.md) | **Dados**: [../data-model.md](../data-model.md)

Tudo aqui é acessível sem sessão. Nada do painel muda (FR-001): `/painel/**` continua com
`private, no-store` e guards da 001–004.

**Ramo.** Os valores marcados **[ISR]** valem só se o SF0 passar; no **[FALLBACK]** valem os
marcados assim (tasks, "Ramo ISR × ramo FALLBACK"). Trecho sem marca vale nos dois.

## 1. Worker (`cloudflare/worker.ts` + `cloudflare/publico.ts`, zona protegida)

`publico.ts` exporta funções puras (testadas sem workerd):

- `prepararPedido(url, metodo): { tipo: "seguir" } | { tipo: "reescrever", caminho: "/p/0" } | { tipo:
  "redirecionar", destino: string }`
  - só para GET/HEAD em `/p/<x>` (um segmento). `x` fora de `^\d{1,9}$`, `0` ou acima de
    2.147.483.647 ⇒ reescrever para `/p/0`. Fora da forma canônica (`String(n).padStart(4,"0")`)
    ⇒ 308 para `/p/<canônico>`, preservando a query string. Os demais caminhos ⇒ seguir.
- `ajustarResposta(caminho, resposta, causa): Response` (`causa` é a marca de `roseshop.causa`, D11)
  - `/` e `/p/*`: status 200/308/404 ⇒ `Cache-Control: public, max-age=20` **[ISR]** ou
    `public, max-age=60` **[FALLBACK]** (valor de `prazos.ts`, §6).
  - **[ISR]** status 500 ⇒ o worker repete o pedido uma vez (research D5, P9): 200 na repetição ⇒
    entrega a versão anterior com `Cache-Control: no-store` (**só essa resposta**: os pedidos
    seguintes recebem a mesma versão com 200 de primeira e `max-age=20`, research D5/A1); 500 de
    novo ⇒ 503 + `Cache-Control: no-store` + `Retry-After: 30` (corpo da página de erro).
    **[FALLBACK]** status 500 ⇒ 503 direto, sem repetição. Outros status passam sem mudança.
  - **[ISR]** pedido de revalidação da fila (`x-isr: 1` com `x-prerender-revalidate`, `HEAD`):
    passa **sem mudança** (sem repetição, sem 503, sem cabeçalhos novos); no 500, só registra
    (§7, `resultado: "revalidacao"`). O `DOQueueHandler` interpreta o status original.
  - `/`, `/p/*`, `/fotos/*`, `/api/catalogo/*`: `X-Robots-Tag: noindex, nofollow`.
  - `/painel/*`, `/api/auth/*`, `/api/interno/*`, `/api/health`, assets: sem mudança.
- Cada pedido recebe um `ctx` próprio com `roseshop.causa` (research D11). No 500, o worker
  registra `catalogo.banco_indisponivel` (causa `"banco"`) ou `catalogo.erro_inesperado` (causa
  `"inesperado"`), com rota normalizada (`/` ou `/p/[codigo]`) e `resultado` (`"versao_anterior"`,
  `"503"` ou, [ISR], `"revalidacao"`).
- **[ISR]** Reexporta `DOQueueHandler` do `open-next-worker`. O `scheduled` (SF12) não muda.

## 2. Páginas (`src/app/(public)/`)

| Rota | Arquivo | Renderização | Dados |
|---|---|---|---|
| `/` | `page.tsx` | **[ISR]** `revalidate = 15` (literal; o Next exige) · **[FALLBACK]** `dynamic = "force-dynamic"` | **[ISR]** `lerVitrine()` → `{ destaques, categorias, bloco }` (sem filtro; D7) · **[FALLBACK]** `lerVitrine(categoria)` |
| `/p/[codigo]` | `p/[codigo]/page.tsx` | **[ISR]** `revalidate = 15`, `generateStaticParams → []`, `dynamicParams = true` · **[FALLBACK]** `dynamic = "force-dynamic"` | `lerProduto(codigo)` → `ProdutoPublico \| "nao_encontrado" \| { redirecionar }` |

**[ISR]** `next.config.ts`: `expireTime: 35` (35 s é o `expireTime`, não o `revalidate`; research
D2). Orçamento: 35 + 20 = 55 s + render, travado em ≤ 60 s pelo teste de conformidade do
orçamento.
| erro | `error.tsx` (client) | — | "Não foi possível carregar agora." + botão "Tentar de novo" (`reset()` + `router.refresh()`) |
| 404 do produto | `p/[codigo]/not-found.tsx` | — | "Produto não encontrado" + link "Ver o catálogo" |

- `layout.tsx` do grupo: `metadata.robots = { index: false, follow: false }`,
  `metadataBase = SITE_URL`, título "Roseshop", `openGraph.siteName = "Roseshop"` (US5.2).
- `generateMetadata` do detalhe: `title = nome`, `openGraph.images = [capa.url]` (absoluto pelo
  `metadataBase`), `openGraph.type = "website"`; sem descrição, preço ou código no Open Graph
  além do título. `not-found` não herda metadados de produto (US5.3).
- Falha de leitura (banco) marca `ctx.roseshop.causa = "banco"` e **lança**. Nunca vira
  `notFound()` (FR-024). O worker serve a versão anterior ou transforma o 500 em 503.
- Nenhuma página pública importa `@/lib/auth` nem chama `getAdminSession` (a sessão aberta não
  muda nada; edge case). Isso é verificado no teste de conformidade.

## 3. `GET /api/catalogo/produtos`

Route handler dinâmico (`src/app/api/catalogo/produtos/route.ts`). Só GET.

| Query | Validação (Zod) | Ausente/ inválido |
|---|---|---|
| `categoria` | slug `^[\p{Ll}\p{N}]+(-[\p{Ll}\p{N}]+)*$`, ≤ 60 | ausente/desconhecido/vazio ⇒ "Todas" (`categoria: null`) |
| `depois` | cursor (data-model §3) | ausente ⇒ 1º bloco; inválido ⇒ **400** `{}` |

Respostas:

- 200 `BlocoLista` (data-model §1), `Cache-Control: public, max-age=20` (nos dois ramos),
  `Content-Type: application/json`, `X-Content-Type-Options: nosniff`.
- 400 corpo `{}`, `no-store`.
- 503 corpo `{}`, `no-store`, com registro `catalogo.banco_indisponivel` (rota
  `/api/catalogo/produtos`).

O JSON contém **só** as chaves de `ProdutoCartao` (lista fechada; o teste de conformidade compara
as chaves). O `proximo`, decodificado, é exatamente `^\d{1,17}\.\d{1,10}$` (µs e código; P7/A5).

## 4. `GET /fotos/[arquivo]`

`src/app/fotos/[arquivo]/route.ts`. Só GET (o Next responde HEAD pelo GET).

1. `chaveDoArquivo(arquivo)` (`@/lib/r2`; regex `<uuid v4>.(webp|jpg)`), senão 404.
2. `fotoPublica(chave)`; falso ⇒ 404.
3. `servirObjeto(chave, If-None-Match)`; `null` ⇒ 404.
4. 200 com corpo, ou 304 sem corpo. Cabeçalhos: `Content-Type` (`image/webp`/`image/jpeg` pela
   extensão), `Cache-Control: public, max-age=60`, `ETag`, `X-Content-Type-Options: nosniff`,
   `Content-Security-Policy: default-src 'none'`.

Todo 404 é `new Response(null, {status: 404})` com `Cache-Control: public, max-age=60` e os
mesmos cabeçalhos: indistinguível entre "nunca existiu", "envio pendente", "removida" e
"malformada" (US6.2–6.4). Exceção em qualquer passo ⇒ 503 vazio, `no-store`, com registro
`catalogo.fotos_falha` e `causa` sem chave (FR-024).

## 5. `src/app/robots.ts`

`{ rules: [{ userAgent: "*", allow: "/" }] }`, sem `Disallow` e sem `sitemap` (D9).

## 6. Módulos de domínio (`src/lib/catalogo/`)

| Arquivo | `server-only` | Exporta |
|---|---|---|
| `exibicao.ts` | não (puro) | `precoPublico`, `hrefProduto`, `codigoCanonico`, `altFoto`, `mensagemWhatsapp`, `linkWhatsapp` |
| `slug.ts` | não | `validarSlug` (Zod), sem cálculo (o slug vem do SQL) |
| `cursor.ts` | não | `codificarCursor`, `lerCursor` |
| `config.ts` | sim | `configCatalogo()` → `{ whatsapp: string \| null, siteUrl: string \| null }`, com registro da falha |
| `registro.ts` | sim | `registrarFalha({ evento, rota, causa })` |
| `leitura.ts` | sim | `lerVitrine`, `lerProduto`, `lerBloco(query)`, `lerFoto(arquivo)`: monta as visões públicas a partir de `src/lib/db/catalogo.ts` (único lugar que chama `dbDoContexto` na 005) |
| `index.ts` | sim | barrel só com o que páginas e rotas usam |
| `prazos.ts` | não (puro, sem dependências) | `REVALIDATE_S`, `EXPIRE_S` [ISR], `NAVEGADOR_PAGINA_S` (20 [ISR] ou 60 [FALLBACK]), `NAVEGADOR_LISTA_S` (20), `NAVEGADOR_FOTOS_S` (60); usado pelo `next.config.ts`, por `cloudflare/publico.ts`, pelas duas rotas e pelo teste do orçamento. As páginas repetem o `revalidate` como literal (exigência do Next), e o teste compara |

Componentes e páginas importam só do barrel `@/lib/catalogo` (regra de lint, como `@/lib/r2`).
Nenhum componente cliente importa `@/lib/catalogo` (server-only): eles recebem dados prontos por
props ou pelo JSON do GET, e os rótulos vêm de `exibicao.ts`, que é puro.

## 7. Eventos de log

`console.error(JSON.stringify({ evento, rota, causa, resultado? }))`. `causa ∈ {"banco","r2",
"config","inesperado"}`.

| Evento | Quando |
|---|---|
| `catalogo.banco_indisponivel` | 500 de página com causa banco (`resultado`: `versao_anterior`, `503` ou, [ISR], `revalidacao`); 503 do GET da lista |
| `catalogo.erro_inesperado` | 500 de página sem causa marcada (`resultado`: `versao_anterior`, `503` ou, [ISR], `revalidacao`) |
| `catalogo.fotos_falha` | exceção na rota de fotos |
| `catalogo.whatsapp_invalido` | `WHATSAPP_NUMBER` ausente ou fora do E.164 ([FALLBACK]: uma vez por isolate) |
| `catalogo.site_url_invalida` | `SITE_URL` ausente ou inválida (mensagem sem link, FR-018/FR-019; [FALLBACK]: uma vez por isolate) |

Nunca no log: número do WhatsApp, chave de objeto, URL completa com query, IP, cabeçalhos, e-mail,
mensagem de exceção.
