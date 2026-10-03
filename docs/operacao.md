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
| `npm run typecheck` | `tsc --noEmit` — checagem de tipos de todo o projeto (`tsconfig.json`, modo `strict`). |
| `npm test` | `vitest run` — roda a suíte uma vez (modo CI). Com zero testes, termina com sucesso (`passWithNoTests`). |
| `npm run test:watch` | `vitest` — modo watch para desenvolvimento. |
| `npm run check` | `npm run lint && npm run typecheck && npm run test` — o gate de "pronto" (lint + tipos + testes), encadeado e interrompido no primeiro erro. |

Scripts ainda **não existem** (pendentes de Fase 0, ver CLAUDE.md): qualquer
comando de migration Drizzle.

## Testes (Vitest)

Infra de testes pronta, mas **sem nenhum teste escrito ainda** (não há feature
em `specs/NNN-nome/`). Configuração em `vitest.config.mts` e `vitest.setup.ts`:

| Aspecto | Configuração | Observação |
|---|---|---|
| Runner | Vitest `^5.0.3` (instalado: 5.0.3) | Plugin `@vitejs/plugin-react` para JSX/TSX. |
| Ambiente padrão | `node` | Testes de componente devem usar `jsdom` (instalado como devDependency); a convenção é declarar o ambiente no próprio arquivo de teste, pois não há override global. |
| Globals | desligados (sem `globals: true`) | `describe`, `it`, `expect`, `vi` precisam ser importados de `vitest`. |
| Alias `@/*` | resolvido nativamente pelo Vite (`resolve.tsconfigPaths: true`) | Lê os `paths` do `tsconfig.json`; substitui o plugin `vite-tsconfig-paths`, removido do projeto. |
| Arquivos de teste | `src/**/*.test.{ts,tsx}` | Testes fora de `src/` não são descobertos. |
| Setup | `vitest.setup.ts` importa `@testing-library/jest-dom/vitest` | Matchers como `toBeInTheDocument` ficam disponíveis. |
| Sem testes | `passWithNoTests: true` | Evita falhar `npm test`/`npm run check` até existir a primeira feature. Remover quando houver testes, para que uma suíte vazia por engano volte a falhar. |

Os testes rodam em Node/jsdom, **não em workerd**: não substituem a validação
no `preview` para bindings, R2, auth e IA.

## Dependências com ressalvas

### `esbuild` fixado em `0.28.1` (devDependency)

`@opennextjs/cloudflare` (instalado: 1.20.8) importa `esbuild` sem declará-lo
em suas dependências (*phantom dependency*): sem um `esbuild` na raiz, o build
do OpenNext depende de hoisting acidental. Por isso `esbuild` está fixado
(versão exata, sem `^`) em `devDependencies`. O Vite 8 exige `^0.27 || ^0.28`
na raiz, e `0.28.1` (a mesma do wrangler) atende aos dois. Foi verificado com
build completo do OpenNext + `preview` respondendo 200 (corpo do commit
`ccb808b`).

**Não remova** essa entrada até o OpenNext declarar `esbuild` como dependência
própria. Ao atualizar `@opennextjs/cloudflare`, reavalie.

### `allowScripts` no `package.json`

Campo `allowScripts` lista os pacotes cujo script de instalação (postinstall)
tem aprovação explícita para rodar. Por padrão, scripts de instalação de
dependências são um vetor de ataque de supply chain; aqui só rodam os
aprovados, por versão exata:

| Entrada | Por que precisa de script |
|---|---|
| `esbuild@0.28.1` e `esbuild@0.25.4` | Valida/instala o binário nativo do esbuild (a 0.25.4 é a cópia aninhada em `@opennextjs/aws`, dependência do OpenNext). |
| `workerd@1.20261001.1` | Binário do runtime da Cloudflare usado no `preview`. A aprovação é por versão exata e o `workerd` muda a cada atualização do `wrangler`: todo bump do wrangler exige reaprovar com `npm approve-scripts workerd`. |
| `unrs-resolver@1.12.2` | Resolver nativo, dependência transitiva de `eslint-config-next` (via `eslint-import-resolver-typescript`). |

Regra: **pacote novo com script de instalação precisa de aprovação explícita**
(nova entrada em `allowScripts`, decisão do tech-lead). Como as chaves incluem
a versão, um bump de versão desses pacotes também exige atualizar a entrada.
A coluna "por que" acima é inferência pela função de cada pacote; o motivo
da aprovação não está descrito em nenhum arquivo do repositório além do
commit `ccb808b` (que apenas diz "approved explicitly").

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

- **Qual porta/runtime estou validando?** `npm run dev` sobe em
  `http://localhost:3000` (porta padrão do Next, sem override no repo) e roda em
  **Node**. `npm run preview` sobe em `http://localhost:8787` e roda em
  **workerd**. Só o `preview` vale como validação de runtime e de build
  (bindings, R2, auth, IA): `dev` e testes Vitest (Node/jsdom) não detectam
  incompatibilidades do workerd.
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
