# Operação

> Estado: **Fase 0 — scaffold**. Comandos e bindings abaixo refletem o que
> existe hoje em `package.json` e `wrangler.jsonc`. Nada de banco, R2, auth ou
> IA está configurado ainda.

## Visão leiga

Esta página é o manual de "como rodar, testar e publicar" o projeto no estado
atual. Como ainda não há features de produto implementadas, o foco aqui é só a
esteira de desenvolvimento: rodar localmente, gerar o preview no runtime real
da Cloudflare e, futuramente, publicar.

## Comandos (`package.json`)

| Comando | O que faz |
|---|---|
| `npm run dev` | `next dev`. Runtime Node, rápido, com hot reload. **Não é o runtime de produção** — workerd pode se comportar diferente (ver `next.config.ts`, que ativa `initOpenNextCloudflareForDev()` para permitir acesso a bindings mesmo aqui). |
| `npm run build` | `next build` puro (build Next.js, sem empacotar para Cloudflare). |
| `npm run start` | `next start` — serve o build Next.js padrão (Node), não o worker. |
| `npm run preview` | `opennextjs-cloudflare build && opennextjs-cloudflare preview` — builda e sobe o worker localmente via workerd (`http://localhost:8787` por padrão). É o runtime mais próximo de produção disponível localmente. |
| `npm run deploy` | `opennextjs-cloudflare build && opennextjs-cloudflare deploy` — builda e publica na Cloudflare. **Hoje não há pipeline de CI**; rodar isso manualmente iria contra a regra da constitution (`.specify/memory/constitution.md`, princípio VIII: deploy de produção só via merge em `main` pelo CI). |
| `npm run upload` | `opennextjs-cloudflare build && opennextjs-cloudflare upload` — builda e envia a versão ao Cloudflare sem promovê-la a deploy ativo. |
| `npm run lint` | `eslint .` — flat config nativa do Next 16 (`eslint.config.mjs`), com `eslint-config-next` para core-web-vitals e TypeScript. |
| `npm run cf-typegen` | `wrangler types --env-interface CloudflareEnv ./cloudflare-env.d.ts` — regenera os tipos TypeScript dos bindings declarados em `wrangler.jsonc`. Rodar sempre após alterar bindings. |

Scripts ainda **não existem** (pendentes de Fase 0, ver CLAUDE.md): `typecheck`,
`test`, `check`, qualquer comando de migration Drizzle.

## Bindings

Detalhados em um só lugar: [architecture.md, seção "Build e deploy"](./architecture.md#build-e-deploy-opennext--wrangler).
Para regenerar os tipos após mudar bindings, use `npm run cf-typegen`.

## Variáveis de ambiente

**Não há `.dev.vars.example` no repositório ainda** — só existe um `.dev.vars`
local (ignorado pelo git via `.gitignore`, nunca lido ou citado por este
documento). Como não há chave alguma declarada publicamente, não há tabela de
variáveis para listar nesta sync. Quando a primeira feature que precisa de
segredo (banco, R2, IA, Auth.js) for implementada, este documento deve ganhar
uma tabela nome → propósito → onde é usada → secret ou var pública, e o
repositório deve ganhar um `.dev.vars.example` committado.

## Deploy

Hoje não existe pipeline de CI (GitHub Actions) neste repositório — o fluxo
descrito em `specs/adr/006-ambientes-dev-producao.md` (lint/typecheck/teste →
migration → deploy em `roseshop-dev` por PR; merge em `main` → deploy em
`roseshop`) ainda não tem implementação correspondente. `wrangler.jsonc`
também não tem blocos `env` separando dev/produção (ver alerta em
`docs/architecture.md`).

Resumo das três camadas decididas no ADR-006 (detalhes em
[architecture.md, "Ambientes"](./architecture.md#ambientes-decididos-nos-adrs-002-e-006-ainda-não-implementados)):
local (Docker + `npm run preview`), dev online (`roseshop-dev`) e produção
(`roseshop`). Hoje só existe, de fato, o `npm run preview` local; não há
`docker-compose`, Neon, R2 nem workers de dev/produção configurados.

## Troubleshooting

- **`next dev` funcionando mas `preview` quebrando**: esperado às vezes —
  `next dev` roda em Node, `preview` roda em workerd (runtime real da
  Cloudflare). Qualquer API Node-only ou binding ausente só aparece no
  `preview`. Valide sempre no `preview` antes de considerar algo pronto.
- **Bindings não aparecem nos tipos (`cloudflare-env.d.ts`)**: rodar
  `npm run cf-typegen` depois de qualquer mudança em `wrangler.jsonc`.
- **`.dev.vars` ausente ou incompleto**: não há `.dev.vars.example` ainda
  para comparar (ver seção acima) — como ainda não há segredo nenhum exigido
  pelo app, isso não bloqueia nada em Fase 0.
- **Desenvolvimento somente no WSL**: o OpenNext não é suportado oficialmente
  em Windows nativo (`.specify/memory/constitution.md`, princípio VII; `CLAUDE.md`, seção
  "Ambiente"). Rode `dev`, `preview`, `build` e `deploy` sempre no terminal do
  WSL, nunca no PowerShell/CMD.
- **Erro "dubious ownership" ao rodar `git` pelo PowerShell via
  `\\wsl.localhost\...`**: o repositório pertence ao usuário do WSL e o Git do
  Windows o vê como de outro dono. Solução: usar o terminal do WSL para o
  git, em vez de adicionar o caminho em `safe.directory`. (Orientação do
  mantenedor; não está registrada em nenhum arquivo do repositório.)
- **`next lint` não existe no Next 16**: o comando foi removido, por isso o
  script é `"lint": "eslint ."` em `package.json`, com `eslint.config.mjs`
  (flat config). Confirmado: a CLI instalada (`next@16.3.8`) não traz
  `next-lint`. Não "restaure" o script para `next lint`.
