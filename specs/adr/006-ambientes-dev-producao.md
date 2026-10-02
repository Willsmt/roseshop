# ADR-006 — Ambientes de desenvolvimento e produção

**Status:** aceito
**Data:** 2026-10-02

## Contexto

O Roseshop terá usuárias reais (administradoras e clientes). Mudanças precisam ser
validadas em um ambiente igual ao de produção antes de chegar a elas, sem risco
de escrever em dados reais ou gerar custo inesperado.

## Decisão

Dois ambientes isolados em todos os recursos:

| Recurso   | Dev                         | Produção                     |
|-----------|-----------------------------|------------------------------|
| Worker    | `roseshop-dev`               | `roseshop`                    |
| Banco     | Neon, branch `dev`          | Neon, branch `main`          |
| Imagens   | R2 `roseshop-dev`            | R2 `roseshop-prod`            |
| OpenAI    | projeto/chave dev, limite baixo | projeto/chave prod, limite próprio |
| Segredos  | `wrangler secret --env dev` | `wrangler secret --env production` |
| Local     | `.dev.vars` aponta para recursos de **dev** | — |

Login Google: um único OAuth client com callbacks de localhost, dev e produção
(`/api/auth/callback/google`).

### Fluxo de entrega (GitHub Actions)

1. Trabalho em branch `feature/*`, `fix/*` etc. → Pull Request para `main`.
2. A cada push no PR: lint + typecheck + testes → migration no Neon `dev` →
   deploy em `roseshop-dev`. Validação humana no ambiente dev.
3. Merge em `main` (somente humano): CI → migration no Neon `main` → deploy em
   `roseshop`.

Segredos de deploy/migration ficam em GitHub Environments (`dev`, `production`).
Segredos de runtime do app ficam somente na Cloudflare.

## Regras

- Nada chega a produção sem ter passado pelo dev.
- Nenhum recurso de produção é acessível a partir da máquina local.
- Migration roda antes do deploy do código que depende dela. Mudança destrutiva
  segue expand/contract (adicionar → migrar dados → remover em deploy posterior).
- Produção contém apenas dados reais; dev contém seed e pode ser zerado.
- Bindings do wrangler são declarados por environment (não são herdados). O
  `WORKER_SELF_REFERENCE` do OpenNext aponta para o worker do próprio ambiente.
- Teste de carga nunca roda contra workers deployados: os limites do free tier
  (requisições/dia e burst/minuto) são da conta e compartilhados entre dev e
  produção. Carga somente em stack Docker local.

## Consequências

- (+) Validação real antes de produção; dados e custos isolados.
- (+) Deploy reproduzível e auditável; sem deploy manual de produção.
- (−) Dois conjuntos de recursos e segredos para manter.
- (−) Ambiente dev único: com PRs simultâneos, o último push sobrescreve o dev
  (aceitável em projeto solo).
