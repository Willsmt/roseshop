# ADR-002 — Banco de dados: Postgres (Neon) + Drizzle

**Status:** aceito
**Data:** 2026-10-02

## Contexto

O Roseshop precisa de um banco relacional pequeno (produtos, categorias,
administradoras), compatível com Cloudflare Workers e dentro de free tier.
O desenvolvimento local deve ser rápido, offline e sem consumir cota de
serviços online.

## Decisão

- **Postgres** em todas as camadas:

  | Camada     | Banco                         |
  |------------|-------------------------------|
  | Local      | Postgres em Docker            |
  | Dev online | Neon, branch `dev`            |
  | Produção   | Neon, branch `production`     |

- **Driver único** em todos os ambientes: `@neondatabase/serverless` (HTTP),
  compatível com o runtime Workers sem TCP nem Hyperdrive.
- **Local**: o Postgres do Docker é exposto ao driver por um proxy HTTP
  compatível com o protocolo do Neon, no mesmo `docker-compose`. O endpoint do
  driver é configurado por variável de ambiente; o código da aplicação não
  ramifica por ambiente.
- **ORM e migrations**: Drizzle ORM + `drizzle-kit`. Migrations são arquivos SQL
  versionados, aplicados em ordem: local → dev → produção.
- A versão major do Postgres local acompanha a do projeto Neon.

## Alternativas descartadas

- **Driver TCP (`postgres.js`) em todos os ambientes**: exigiria Hyperdrive para
  uso recomendado em Workers, com cota limitada no free tier.
- **Driver diferente por ambiente** (TCP local, HTTP em produção): divergência
  local × produção capaz de esconder bugs.
- **Local apontando para o Neon `dev`**: depende de rede, consome cota e mistura
  dados de experimentação local com o ambiente de validação.

## Consequências

- (+) Mesmo código e mesmo driver do local à produção.
- (+) Desenvolvimento local offline e sem custo.
- (−) Uma peça a mais no compose local (proxy HTTP).
- (−) Migrations precisam de conexão direta ao banco (não pelo proxy) — a
  configuração do `drizzle-kit` usa a URL de conexão direta de cada ambiente.
