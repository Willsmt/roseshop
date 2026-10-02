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
| `npm run deploy` | `opennextjs-cloudflare build && opennextjs-cloudflare deploy` — builda e publica na Cloudflare. **Hoje não há pipeline de CI**; rodar isso manualmente iria contra a regra da constitution (`specs/00-constitution.md`, seção 9: deploy de produção só via merge em `main` pelo CI). |
| `npm run upload` | `opennextjs-cloudflare build && opennextjs-cloudflare upload` — builda e envia a versão ao Cloudflare sem promovê-la a deploy ativo. |
| `npm run lint` | `eslint .` — flat config nativa do Next 16 (`eslint.config.mjs`), com `eslint-config-next` para core-web-vitals e TypeScript. |
| `npm run cf-typegen` | `wrangler types --env-interface CloudflareEnv ./cloudflare-env.d.ts` — regenera os tipos TypeScript dos bindings declarados em `wrangler.jsonc`. Rodar sempre após alterar bindings. |

Scripts ainda **não existem** (pendentes de Fase 0, ver CLAUDE.md): `typecheck`,
`test`, `check`, qualquer comando de migration Drizzle.

## Bindings (`wrangler.jsonc`)

| Binding | Tipo | Aponta para |
|---|---|---|
| `ASSETS` | assets estáticos | `.open-next/assets` |
| `IMAGES` | Cloudflare Images | otimização de imagem do `next/image` |
| `WORKER_SELF_REFERENCE` | service binding | o próprio worker `roseshop` (usado pelo cache do OpenNext) |

Nenhum binding de banco, R2 (storage de produto) ou segredo de IA existe ainda.
Observability está habilitada (`observability.enabled: true`) e source maps são
enviados no deploy (`upload_source_maps: true`).

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
