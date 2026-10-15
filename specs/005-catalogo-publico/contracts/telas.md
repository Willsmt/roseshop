# Contrato: telas públicas provisórias (005)

**Plan**: [../plan.md](../plan.md) | **Contrato**: [publico.md](./publico.md)

Esqueleto funcional, sem identidade visual (FR-022). Telas em `src/app/(public)/`; componentes
próprios em `src/app/(public)/_catalogo/`. Os primitivos de `src/components/ui/` (`button`,
`aviso`) são reutilizados quando cabem. Texto ≥ 16 px, alvos ≥ 48 px, sem rolagem horizontal a
360 px de largura.

## Página inicial `/`

```
<header>  <h1>Roseshop</h1>
<main>
  <section aria-labelledby="destaques">   (omitida sem destaques)
    <h2 id="destaques">Destaques</h2>
    <ul> <li> CartaoProduto ×≤8
  <section aria-labelledby="produtos">
    <h2 id="produtos">Produtos</h2>
    <nav aria-label="Filtrar por categoria">  (omitida sem categorias)
      <ul> <li><a href="/" aria-current="page">Todas</a> … <a href="/?categoria=meias">Meias</a>
    <p aria-live="polite">  "Mostrando produtos de Meias" | "Mostrando todos os produtos"
    <ul> <li> CartaoProduto …         | <p>Ainda não há produtos.</p>
    <button>Carregar mais</button>    (omitido sem próximo)
    <p role="alert">Não foi possível carregar mais produtos. <button>Tentar de novo</button>
```

- `CartaoProduto` (server e client usam o mesmo componente, sem `server-only`): `<a href="/p/0042">`
  envolvendo a foto (`<img alt>` ou o marcador "Sem foto" em texto), nome, "#0042", preço e
  "Esgotado" em texto.
- `ListaCatalogo` (client) renderiza também a `<nav>` do filtro (research D7/I2): o
  `aria-current` vem do filtro efetivo, nunca de um valor fixo do servidor.
  **[ISR]** recebe o 1º bloco de "Todas" e as categorias por props; lê `useSearchParams()` dentro
  de `<Suspense>` (fallback = a lista de "Todas" com o filtro em "Todas"); com filtro e sem
  restauração válida, mostra "Carregando produtos…" (`aria-busy`) e busca no GET; o
  `aria-current` segue a URL até o GET responder e depois o `categoria` devolvido (`null` ⇒
  "Todas", US4.6). **[FALLBACK]** recebe o 1º bloco já filtrado e o slug efetivo por props.
  Em ambos: ao clicar em "Carregar mais", acrescenta o bloco e move o foco para o primeiro item
  novo, **sem mudar a URL**; o aviso `aria-live` anuncia a troca de filtro (US4.7).
- Restauração ao voltar: research D15 (vale antes do GET do 1º bloco; URL só com o filtro).
- Fotos: as primeiras 4 da lista e todas as dos destaques com `loading="eager"`; o resto `lazy`
  (FR-008).

## Detalhe `/p/0042`

```
<main>
  <nav><a href="/">Voltar ao catálogo</a></nav>
  <article>
    <h1>{nome}</h1>
    <p>#0042 · {categoria}</p>
    <p>{preco}</p>
    <p><strong>Esgotado</strong></p>     (só se esgotado)
    <ul aria-label="Fotos"> <li><img alt="{nome} — foto 1 de 3"> …
    <section aria-labelledby="descricao"> (omitida sem descrição) <h2>Descrição</h2> <p class="whitespace-pre-line">
    <a href="https://wa.me/…" >Perguntar no WhatsApp</a>   (omitido se esgotado ou sem número)
```

- O "Voltar ao catálogo" usa `router.back()` quando a página anterior é do catálogo (preserva
  filtro e blocos) e `/` nos outros casos (link aberto direto); nesse caso, como o "Ver o
  catálogo" do 404, apaga as restaurações guardadas antes de navegar (research D15, F3).
- O link do WhatsApp abre na mesma aba (`wa.me` abre o app no Android); sem `target="_blank"`.

## Erro (503) e não encontrado (404)

- `error.tsx`: `<h1>Não foi possível carregar agora</h1>`, texto "Tente de novo em instantes.",
  `<button>Tentar de novo</button>`.
- `not-found.tsx` do detalhe: `<h1>Produto não encontrado</h1>`, `<a href="/">Ver o catálogo</a>`.

## Textos

Todos em `src/app/(public)/_catalogo/textos.ts` (sem dependências), como o `textos-sugestao.ts` da
004. A feature de design troca a apresentação sem tocar nas regras de `src/lib/catalogo/`.
