# ADR-001 — Hospedagem: Cloudflare Workers via OpenNext

**Status:** aceito
**Data:** 2026-10-03 (registra decisão tomada em 2026-10-01)

## Contexto

O Roseshop precisa de hospedagem gratuita para um catálogo com finalidade
comercial (vendas da mantenedora do negócio), com Next.js no App Router.

## Decisão

- **Cloudflare Workers**, no plano gratuito, que permite uso comercial.
- **Adaptador OpenNext** (`@opennextjs/cloudflare`) com o Next.js real.
- Ambientes conforme ADR-006.

## Alternativas descartadas

- **Vercel Hobby**: o plano gratuito é restrito a uso pessoal e não comercial.
- **vinext** (scaffold padrão do `create-cloudflare` a partir da versão 2.72):
  reimplementação da API do Next sobre Vite, descrita pelo próprio projeto como
  experimento. Risco de incompatibilidade em bibliotecas acopladas ao Next,
  em especial o Auth.js (ADR-003).

## Consequências

- (+) Hospedagem gratuita com uso comercial; borda com data centers no Brasil.
- (+) Compatibilidade máxima com o ecossistema Next.
- (−) OpenNext não é suportado em Windows nativo: desenvolvimento em WSL.
- (−) Limites do free tier: 10 ms de CPU por requisição, bundle de até 3 MB
  comprimido, cotas de requisições compartilhadas por conta (ADR-006).
- (−) `@opennextjs/cloudflare` 1.20.8 importa `esbuild` sem declará-lo
  (phantom dependency): `esbuild` fixado como devDependency até correção upstream.
