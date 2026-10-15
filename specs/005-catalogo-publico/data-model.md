# Data Model: Catálogo público (005)

**Plan**: [plan.md](./plan.md) | **Research**: [research.md](./research.md)

**Sem migration e sem mudança de schema.** A 005 só lê as tabelas `categorias`, `produtos` e
`produto_fotos` (002–004). O SQL público fica num arquivo novo, `src/lib/db/catalogo.ts` (zona do
tech-lead); `produtos.ts`, `fotos.ts` e `categorias.ts` não mudam (H4).

## 1. Visões públicas (tipos de saída)

Nenhum tipo público carrega `id` de categoria, `versao`, `fotos_versao`, `fotos_operacao`,
`destaque_vaga`, `criado_por`, `atualizado_por`, `atualizado_em`, `enviado_por` nem `enviado_em`
(FR-002). O `id` do produto **é** o código de referência (003), e por isso só circula
formatado ou no cursor opaco.

### ProdutoCartao (lista e destaques)

| Campo | Origem | Regra |
|---|---|---|
| `codigo` | `produtos.id` | `formatarCodigo` → `"#0042"` |
| `href` | `produtos.id` | `/p/` + `padStart(4,"0")` |
| `nome` | `produtos.nome` | texto puro (FR-003) |
| `preco` | `preco_centavos`, `a_partir_de` | `"R$ 12,90"` / `"a partir de R$ 12,90"` / `"Consulte o valor"` (FR-012) |
| `esgotado` | `produtos.esgotado` | boolean; rótulo "Esgotado" em texto (FR-023) |
| `capa` | `produto_fotos` posição 1 | `{ url: "/fotos/<arquivo>", alt }` ou `null` (marcador "sem foto") |

### ProdutoPublico (detalhe)

`ProdutoCartao` + `categoria` (nome), `descricao` (`string | null`; vazia ⇒ seção omitida),
`fotos` (1 a 3, `ORDER BY posicao`, capa primeiro, cada uma `{url, alt}`; alt = `"<nome> — foto
<n> de <total>"`, FR-017) e `whatsapp` (`{ href } | null`; `null` quando esgotado ou quando a
configuração é inválida, FR-018/FR-019).

### CategoriaFiltro

| Campo | Origem | Regra |
|---|---|---|
| `slug` | `replace(categorias.chave, ' ', '-')` | injetivo (research D7) |
| `nome` | `categorias.nome` | rótulo |

Só categorias com `EXISTS (produto)`, esgotado ou não (FR-011, US4.3/4.4), em
`ORDER BY chave COLLATE "C", id`, a mesma ordem do painel da 002 (`categorias.ts`). A `chave` já é
normalizada (sem acento, minúscula), então "Água" vem antes de "Bolsas". Collation "C" é
independente do locale do servidor e não depende de ICU no Neon. Confirmado no teste de integração.

### BlocoLista (resposta do GET e 1º bloco da página)

`{ itens: ProdutoCartao[], proximo: string | null, categoria: string | null }`. `categoria` é o
slug efetivamente aplicado (`null` = "Todas", inclusive por fallback, US4.6).

## 2. Consultas (`src/lib/db/catalogo.ts`)

| Função | SQL (resumo) | Requisito |
|---|---|---|
| `listarDestaques(db)` | produtos `WHERE destaque_vaga IS NOT NULL ORDER BY destaque_vaga ASC` + capa (LEFT JOIN posição 1); no máximo 8 pela constraint da 003 | FR-009, US1.3/1.4 |
| `listarBloco(db, {categoriaId?, depois?})` | `ORDER BY criado_em DESC, id DESC LIMIT 25`; `depois` ⇒ `(criado_em, id) < ('epoch'::timestamptz + $µs * interval '1 microsecond', $id)`; devolve também `floor(extract(epoch from criado_em)*1e6)::bigint` **como texto** do último item para o cursor | FR-006, FR-007 |
| `categoriasComProdutos(db)` | `SELECT nome, replace(chave,' ','-') AS slug, id FROM categorias c WHERE EXISTS (SELECT 1 FROM produtos p WHERE p.categoria_id = c.id)`; o `id` fica só no servidor para filtrar | FR-011 |
| `obterPublico(db, id)` | produto + nome da categoria + `json_agg` das fotos por posição (um statement, como `obterPorId` da 003) | FR-014 |
| `fotoPublica(db, chave)` | `EXISTS (SELECT 1 FROM produto_fotos WHERE chave_objeto = $1)`; **não** considera `fotos_envio` | FR-015, US6 |

Resolução do filtro: o servidor carrega `categoriasComProdutos`, acha o slug pedido e usa o `id`
interno no `listarBloco`. O id nunca sai na resposta.

## 3. Cursor

`base64url("<µs>.<id>")`. Validação (Zod): base64url decodificável; conteúdo
`^\d{1,17}\.\d{1,10}$`; `id` em 1…2.147.483.647; `µs` ≤ 2^53 − 1 é desnecessário porque nunca
vira `number` (vai como texto para o SQL com cast `::bigint`). Inválido ⇒ 400. Opaco por
convenção, não por segredo (P7, mantida na A5; nota no FR-002). O conteúdo decodificado é só
`<µs>.<id>`, conferido pela conformidade do GET.

## 4. Configuração por ambiente

| Chave | Onde | Validação | Falha |
|---|---|---|---|
| `WHATSAPP_NUMBER` | `wrangler secret` (dev, produção); `.dev.vars` (local) | `^\+[1-9]\d{7,14}$` | sem botão + `catalogo.whatsapp_invalido` |
| `SITE_URL` | `vars` no `wrangler.jsonc` (os 3 ambientes) | URL; `https:` fora do local; sem barra final | prévia sem imagem, mensagem sem link + `catalogo.site_url_invalida` |
| `NEXT_INC_CACHE_R2_BUCKET` | binding R2 (`roseshop-cache-<amb>`) | — | o OpenNext ignora o cache e renderiza (IgnorableError) |
| `NEXT_CACHE_DO_QUEUE` | binding DO `DOQueueHandler` | — | sem revalidação em segundo plano (o pedido após 35 s, o `expireTime`, ainda espera, D2) |

## 5. Estados da página pública

| Estado | Status | Cache-Control | Conteúdo |
|---|---|---|---|
| Página inicial com produtos | 200 | `public, max-age=20` | destaques (se houver) + filtro + 1º bloco |
| Página inicial sem produtos | 200 | idem | "Ainda não há produtos" (FR-005) |
| Detalhe | 200 | idem | ProdutoPublico |
| Código não canônico | 308 → `/p/NNNN` | idem | — |
| Código inválido, inexistente, removido | 404 | idem | "Produto não encontrado" + link ao catálogo, sem Open Graph de produto |
| Banco indisponível, com versão guardada | 200 | `no-store` **só na resposta repetida pelo worker**; os pedidos seguintes recebem a mesma versão com `public, max-age=20` [ISR] (research D5, A1) | versão anterior da página, durante a falha e até 1 min depois que o banco volta (FR-024, P9) |
| Banco indisponível, sem versão guardada | 503 | `no-store`, `Retry-After: 30` | "Não foi possível carregar agora" + "Tentar de novo" |
| Revalidação da fila (`HEAD` com `x-isr: 1`) [ISR] | o do Next, sem mudança | sem mudança | o worker não repete nem converte; no 500, só registra com `resultado: "revalidacao"` (research D5) |

Os valores de `Cache-Control` desta tabela são do ramo **[ISR]**. No ramo **[FALLBACK]**, 200/308/404 levam `public, max-age=60`, não há versão guardada (todo 500 vira 503) nem revalidação da fila (tasks, "Ramo ISR × ramo FALLBACK").
