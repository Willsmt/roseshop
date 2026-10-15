# Contrato: superfície pública (005)

**Plan**: [../plan.md](../plan.md) | **Dados**: [../data-model.md](../data-model.md)

Tudo aqui é acessível sem sessão. Nada do painel muda (FR-001): `/painel/**` continua com
`private, no-store` e guards da 001–004.

## 1. Worker (`cloudflare/worker.ts` + `cloudflare/publico.ts`, zona protegida)

`publico.ts` exporta funções puras (testadas sem workerd):

- `prepararPedido(url): { tipo: "seguir" } | { tipo: "reescrever", caminho: "/p/0" } | { tipo:
  "redirecionar", destino: string }`
  - só para GET/HEAD em `/p/<x>` (um segmento). `x` fora de `^\d{1,9}$`, `0` ou acima de
    2.147.483.647 ⇒ reescrever para `/p/0`. Fora da forma canônica (`String(n).padStart(4,"0")`)
    ⇒ 308 para `/p/<canônico>`, preservando a query string. Os demais caminhos ⇒ seguir.
- `ajustarResposta(caminho, resposta): Response`
  - `/` e `/p/*`: status 200/308/404 ⇒ `Cache-Control: public, max-age=20`; status 500 ⇒ o worker
    repete o pedido uma vez (research D5, P9): 200 na repetição ⇒ entrega a versão anterior com
    `Cache-Control: no-store`; 500 de novo ⇒ 503 + `Cache-Control: no-store` + `Retry-After: 30`
    (corpo da página de erro). Outros status passam sem mudança.
  - `/`, `/p/*`, `/fotos/*`, `/api/catalogo/*`: `X-Robots-Tag: noindex, nofollow`.
  - `/painel/*`, `/api/auth/*`, `/api/interno/*`, `/api/health`, assets: sem mudança.
- Cada pedido recebe um `ctx` próprio com `roseshop.causa` (research D11). No 500, o worker
  registra `catalogo.banco_indisponivel` (causa `"banco"`) ou `catalogo.erro_inesperado` (causa
  `"inesperado"`), com rota normalizada (`/` ou `/p/[codigo]`) e `resultado` (`"versao_anterior"`
  ou `"503"`).
- Reexporta `DOQueueHandler` do `open-next-worker`. O `scheduled` (SF12) não muda.

## 2. Páginas (`src/app/(public)/`)

| Rota | Arquivo | Renderização | Dados |
|---|---|---|---|
| `/` | `page.tsx` | ISR, `revalidate = 20` | `lerVitrine()` → `{ destaques, categorias, bloco }` (sem filtro; D7) |
| `/p/[codigo]` | `p/[codigo]/page.tsx` | ISR, `revalidate = 20`, `generateStaticParams → []`, `dynamicParams = true` | `lerProduto(codigo)` → `ProdutoPublico \| "nao_encontrado" \| { redirecionar }` |
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

- 200 `BlocoLista` (data-model §1), `Cache-Control: public, max-age=20`,
  `Content-Type: application/json`, `X-Content-Type-Options: nosniff`.
- 400 corpo `{}`, `no-store`.
- 503 corpo `{}`, `no-store`, com registro `catalogo.banco_indisponivel` (rota
  `/api/catalogo/produtos`).

O JSON contém **só** as chaves de `ProdutoCartao` (lista fechada; o teste de conformidade compara
as chaves).

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

Componentes e páginas importam só do barrel `@/lib/catalogo` (regra de lint, como `@/lib/r2`).
Nenhum componente cliente importa `@/lib/catalogo` (server-only): eles recebem dados prontos por
props ou pelo JSON do GET, e os rótulos vêm de `exibicao.ts`, que é puro.

## 7. Eventos de log

`console.error(JSON.stringify({ evento, rota, causa, resultado? }))`. `causa ∈ {"banco","r2",
"config","inesperado"}`.

| Evento | Quando |
|---|---|
| `catalogo.banco_indisponivel` | 500 de página com causa banco (`resultado`: `versao_anterior` ou `503`); 503 do GET da lista |
| `catalogo.erro_inesperado` | 500 de página sem causa marcada (`resultado`: `versao_anterior` ou `503`) |
| `catalogo.fotos_falha` | exceção na rota de fotos |
| `catalogo.whatsapp_invalido` | `WHATSAPP_NUMBER` ausente ou fora do E.164 |
| `catalogo.site_url_invalida` | `SITE_URL` ausente ou inválida |

Nunca no log: número do WhatsApp, chave de objeto, URL completa com query, IP, cabeçalhos, e-mail,
mensagem de exceção.
