# ADR-006 — Ambientes: local, dev e produção

**Status:** aceito
**Data:** 2026-10-02 (revisado em 2026-10-02: camada local em Docker)

## Contexto

O Roseshop terá usuárias reais (administradoras e clientes). Mudanças precisam
ser desenvolvidas sem custo, validadas em um ambiente igual ao de produção e só
então chegar às usuárias, sem risco de escrever em dados reais.

## Decisão

Três camadas isoladas:

| Recurso   | Local                         | Dev online                   | Produção                      |
|-----------|-------------------------------|------------------------------|-------------------------------|
| Runtime   | `npm run preview` (workerd)   | Worker `roseshop-dev`        | Worker `roseshop`             |
| Banco     | Postgres em Docker (ADR-002)  | Neon, branch `dev`           | Neon, branch `main`           |
| Imagens   | R2 simulado pelo wrangler (`.wrangler/state/`) | R2 `roseshop-dev` | R2 `roseshop-prod`  |
| OpenAI    | chave dev, limite baixo       | chave dev, limite baixo      | chave prod, limite próprio    |
| Segredos  | `.dev.vars` (não versionado)  | `wrangler secret --env dev`  | `wrangler secret --env production` |
| Login     | Google, callback `localhost`  | Google, callback dev         | Google, callback produção     |

Login Google: um único OAuth client com os três callbacks
(`/api/auth/callback/google`).

Papel de cada camada:

- **Local**: desenvolvimento diário, offline, sem consumir cota de serviços online.
- **Dev online**: validação no runtime real da Cloudflare (limites de CPU,
  bindings reais, URL pública) e teste das administradoras pelo celular antes
  da produção.
- **Produção**: somente código que passou pelo dev.

### Fluxo de entrega (GitHub Actions)

1. Trabalho em branch `feature/*`, `fix/*` etc. → Pull Request para `main`.
2. A cada push no PR: lint + typecheck + testes → migration no Neon `dev` →
   deploy em `roseshop-dev`. Validação humana no ambiente dev.
3. Merge em `main` (somente humano, estratégia rebase): CI → migration no Neon
   `main` → deploy em `roseshop`.

Segredos de deploy/migration ficam em GitHub Environments (`dev`,
`production`). Segredos de runtime do app ficam somente na Cloudflare.

## Regras

- Nada chega a produção sem ter passado pelo dev online.
- A máquina local não acessa recursos de produção nem do dev online.
- Migration roda antes do deploy do código que depende dela, na ordem
  local → dev → produção. Mudança destrutiva segue expand/contract (adicionar →
  migrar dados → remover em deploy posterior).
- Produção contém apenas dados reais; dev e local contêm seed e podem ser zerados.
- Bindings do wrangler são declarados por environment (não são herdados). O
  `WORKER_SELF_REFERENCE` do OpenNext aponta para o worker do próprio ambiente.
- Limites do free tier da Cloudflare (requisições/dia e burst/minuto) são da
  conta e compartilhados entre dev e produção: teste de carga roda somente na
  stack Docker local, nunca contra workers deployados.

## Custos

Todas as camadas cabem no free tier (Cloudflare Workers e R2, Neon, GitHub
Actions, Google OAuth). Único custo variável: chamadas à OpenAI, limitadas pelo
teto de gasto de cada chave.

## Consequências

- (+) Desenvolvimento offline; validação real antes de produção; dados e custos
  isolados.
- (+) Deploy reproduzível e auditável; sem deploy manual de produção.
- (−) Três conjuntos de configuração e segredos para manter.
- (−) Dev online único: com PRs simultâneos, o último push sobrescreve o dev
  (aceitável em projeto solo).
- (−) Cota da Cloudflare compartilhada: bug em loop no dev pode afetar a produção.
