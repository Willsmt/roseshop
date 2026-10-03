# Operação

> Estado: **Fase 0 — scaffold**. Comandos e bindings abaixo refletem o que
> existe hoje em `package.json` e `wrangler.jsonc`. Já existe a stack local de
> banco (Docker, ver "Banco local"), mas o app ainda não a consome: não há
> driver, schema nem migrations. R2, auth e IA não estão configurados.

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
| `npm run prepare` | `husky` — roda sozinho no `npm install` e aponta `core.hooksPath` para `.husky/_`, ativando os hooks de git. Não precisa ser chamado à mão. |
| `npm run db:up` | `docker compose up -d --wait` — sobe Postgres + proxy Neon e espera o healthcheck do Postgres. |
| `npm run db:down` | `docker compose down` — para os containers; **preserva** os dados (volume `pgdata`). |
| `npm run db:reset` | `docker compose down -v && docker compose up -d --wait` — **DESTRUTIVO: apaga o volume `pgdata` e todos os dados do banco local**, e sobe um banco vazio. Só afeta o local. |
| `npm run db:psql` | `docker compose exec postgres psql -U roseshop -d roseshop` — shell SQL no container (requer `db:up` antes). |

Scripts ainda **não existem** (pendentes de Fase 0, ver CLAUDE.md): qualquer
comando de migration Drizzle.

## Banco local (Docker)

### Visão leiga

Para desenvolver sem tocar no banco real, o projeto traz um banco de dados de
mentirinha que roda no seu computador, dentro do Docker. Um comando
(`npm run db:up`) liga, outro (`npm run db:down`) desliga. Um segundo
container faz o "tradutor" para o driver HTTP do Neon, o mesmo usado em
produção (ADR-002). Hoje o app ainda não usa esse banco: só a infra existe.

### Aprofundamento técnico

Definido em `docker-compose.yml` (projeto `roseshop`):

| Serviço | Imagem | Porta no host | Observações |
|---|---|---|---|
| `postgres` | `postgres:17-alpine` | `127.0.0.1:5440` -> 5432 | Volume nomeado `pgdata`; healthcheck `pg_isready` (3s, até 20 tentativas). |
| `neon-proxy` | `ghcr.io/timowilhelm/local-neon-http-proxy@sha256:cd2ae14e...` | `127.0.0.1:4444` -> 4444 | Proxy HTTP compatível com `@neondatabase/serverless`. Só sobe depois de o Postgres ficar saudável (`depends_on: service_healthy`). Alcança o Postgres pela rede interna (`postgres:5432`). |

```mermaid
graph LR
  App["app (driver @neondatabase/serverless)"] -->|"HTTP http://localhost:4444/sql"| P["neon-proxy :4444"]
  P -->|"TCP postgres:5432 (rede do compose)"| DB["postgres:17-alpine"]
  M["migrations / db:psql"] -->|"TCP localhost:5440"| DB
```

Decisões e pegadinhas:

- **Porta 5440 de propósito**: 5432, 5433 e 5434 estão ocupadas por outros
  projetos e por um Postgres do sistema na máquina do mantenedor. Se a sua
  também tiver conflito, o `db:up` falha ao publicar a porta (a porta é fixa
  no compose; não há variável para trocá-la).
- **Portas presas em `127.0.0.1`**: nada é exposto à rede local.
- **Imagem do proxy fixada por digest**: a tag `:main` é mutável, então o
  digest garante a mesma imagem para todos. É uma imagem comunitária, não
  oficial do Neon. Atualizar o digest é decisão consciente.
- **Credenciais não são segredos**: usuário/senha/banco no compose e no
  `.dev.vars.example` são de um banco local, só em loopback, só com dados de
  seed. Por isso podem ser commitados. **Nunca** reutilize essas credenciais
  em dev online ou produção.
- **Versão do Postgres**: a major local (17) acompanha a do Neon (ADR-002).
  **Requisito para a Fase 0.5**: criar o projeto no Neon em **Postgres 17**.
- **`localhost` na connection string** (verificado manualmente pelo
  mantenedor): um `POST` em `http://localhost:4444/sql` com o header
  `Neon-Connection-String` apontando para `localhost:5440` retornou
  `{"ok":1}`. Ou seja, o protocolo HTTP do Neon responde via proxy usando
  `localhost`, funcionando offline, sem depender do DNS do `localtest.me`.
  A verificação foi manual; não há teste automatizado no repositório.
- **Risco aberto (Fase 0.4)**: `wrangler.jsonc` tem a flag
  `global_fetch_strictly_public`, que pode impedir o worker de fazer `fetch`
  para `localhost:4444` no `npm run preview`. **Não confirmado** — validar
  quando o driver for integrado; pode exigir ajuste na config (zona protegida,
  decisão do tech-lead).
- Primeira subida baixa as imagens; `db:up` precisa de Docker disponível no WSL.

## Hooks de git (husky)

### Visão leiga

Antes de um commit ou push sair da sua máquina, três "porteiros" automáticos
conferem o trabalho: um procura segredos esquecidos no código, outro barra
mensagens de commit fora do padrão, e o último roda toda a verificação de
qualidade antes de enviar. Eles são instalados sozinhos ao rodar `npm install`
(script `prepare`). Os scripts ficam em `.husky/`.

### Hooks

| Hook | Arquivo | O que faz | Falha quando |
|---|---|---|---|
| `pre-commit` | `.husky/pre-commit` | 1) Exige `gitleaks` no `PATH`; 2) `gitleaks git --pre-commit --staged --redact --no-banner --verbose` nos arquivos em stage; 3) `npx --no -- lint-staged`. | `gitleaks` ausente; gitleaks acha possível segredo; ESLint falha nos arquivos em stage. |
| `commit-msg` | `.husky/commit-msg` | 1) Rejeita mensagem com linha `Co-Authored-By:` ou `Claude-Session:` (início de linha, sem diferenciar maiúsculas) ou texto "generated with ... claude"; 2) `npx --no -- commitlint --edit "$1"`. | Trailer proibido (constitution, princípio VI) ou mensagem fora do Conventional Commits. |
| `pre-push` | `.husky/pre-push` | `npm run check` (lint + typecheck + testes). | Qualquer etapa do `check` falha. |

Configs relacionadas:

| Arquivo | Conteúdo |
|---|---|
| `.lintstagedrc.json` | Para `*.{ts,tsx,js,jsx,mjs,mts,cjs}` roda `eslint --max-warnings=0 --no-warn-ignored` (só nos arquivos em stage; zero warnings tolerados). |
| `commitlint.config.mjs` | Estende `@commitlint/config-conventional`, sem regras customizadas. |

Detalhes que costumam surpreender:

- `gitleaks` é resolvido por `command -v` no `PATH`, **não** por caminho fixo.
  Se `~/.local/bin` não estiver no `PATH` do shell que roda o git, o hook
  falha com "gitleaks não encontrado" mesmo com o binário instalado.
- Não há `.gitleaks.toml`: valem as regras padrão do gitleaks.
- `npx --no` impede baixar pacotes na hora: `lint-staged` e `commitlint`
  precisam estar instalados (`npm install`).
- O `pre-push` roda a suíte inteira e pode demorar; é o mesmo gate de "pronto"
  do `CLAUDE.md`.

### Hooks locais não são o gate definitivo

Qualquer hook pode ser pulado com `--no-verify` (`git commit --no-verify`,
`git push --no-verify`), e quem não rodou `npm install` não os tem ativos. O
gate definitivo será o **CI** (Fase 0.6), ainda **não implementado** (ver
seção "Deploy"). Até lá, os hooks são só a primeira linha de defesa.

### Instalar o gitleaks no WSL

O `pre-commit` exige o binário. Versão usada: **8.30.1**. Instalação com
verificação de checksum (rodar no terminal do WSL):

```bash
VERSION=8.30.1
cd "$(mktemp -d)"
gh release download "v${VERSION}" --repo gitleaks/gitleaks \
  --pattern "gitleaks_${VERSION}_linux_x64.tar.gz" \
  --pattern "gitleaks_${VERSION}_checksums.txt"
sha256sum --check --ignore-missing "gitleaks_${VERSION}_checksums.txt"
tar -xzf "gitleaks_${VERSION}_linux_x64.tar.gz" gitleaks
mkdir -p ~/.local/bin
install -m 755 gitleaks ~/.local/bin/gitleaks
gitleaks version   # deve imprimir 8.30.1
```

Só instale depois de o `sha256sum --check` reportar `OK`. Os nomes dos
assets (`linux_x64` e `checksums.txt`) seguem o padrão de releases do
gitleaks; o bloco acima é uma receita reconstruída, não um script do
repositório — se o `gh release download` não achar o asset, liste com
`gh release view v8.30.1 --repo gitleaks/gitleaks`.

### Auditoria inicial do histórico

Ao adotar os hooks, rodou-se `gitleaks git` sobre o histórico existente:
**nenhum vazamento em 21 commits**. (Informação do mantenedor; não há
relatório versionado no repositório.)

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

`.dev.vars.example` (commitado; exceção no `.gitignore`) lista as chaves
esperadas. Copie para `.dev.vars` (ignorado pelo git; este documento nunca o
lê). Os valores do exemplo são da stack local e não são segredos (ver "Banco
local").

| Variável | Propósito | Onde é usada | Tipo |
|---|---|---|---|
| `NEXTJS_ENV` | Vem do template do OpenNext. O adaptador a lê no `preview` para escolher qual arquivo `.env.*` do Next carregar (exemplo: `development`). | Adaptador OpenNext, no `preview`; **não** é usada pelo código de `src/`. | Var de configuração local (não sensível) |
| `DATABASE_URL` | Connection string do Postgres. Local: `localhost:5440`. A mesma string serve ao driver (via proxy) e às migrations (conexão direta). | Ainda **sem consumidor** no código (sem driver/Drizzle). | Secret em dev online e produção (`wrangler secret --env dev` / `--env production`), conforme ADR-006 (segredos de runtime do app ficam somente na Cloudflare); no local, valor não sensível |
| `NEON_FETCH_ENDPOINT` | Endpoint do proxy HTTP local do Neon (`.../sql`). | Ainda sem consumidor. Definir **somente no local**; **ausente** em dev online e produção (o driver usa o endpoint padrão do Neon). | Var pública, só local |

Chaves de R2, OpenAI e Auth.js ainda não estão no exemplo (features não
implementadas).

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
(`roseshop`). Hoje existem, de fato, o `npm run preview` e a stack Docker de banco; não há
Neon, R2 nem workers de dev/produção configurados. O `docker-compose.yml`
local existe (ver "Banco local"), mas ainda não é consumido pelo app.

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
- **`.dev.vars` ausente ou incompleto**: compare as chaves com
  `.dev.vars.example` (tabela em "Variáveis de ambiente"). Hoje o app ainda não
  lê `DATABASE_URL` nem `NEON_FETCH_ENDPOINT`, então a falta delas não quebra nada.
- **`npm run db:up` falha com "port is already allocated"**: algo no host usa
  5440 ou 4444. Libere a porta; o compose não a parametriza.
- **`db:up` falha por Docker indisponível**: confirme que o Docker responde no
  WSL (`docker ps`).
- **Perdi os dados do banco local**: `npm run db:reset` apaga o volume
  `pgdata`. É o comportamento esperado; só afeta o local.
- **`psql`/migration não conecta**: use `localhost:5440` (não 5432) e confirme
  que o Postgres está saudável (`docker compose ps`).
- **Commit bloqueado com "gitleaks não encontrado"**: instale conforme a seção
  "Instalar o gitleaks no WSL" e confirme que `~/.local/bin` está no `PATH`.
- **Commit bloqueado por possível segredo**: o gitleaks imprime o achado com
  o valor ocultado (`--redact`). Remova o segredo do stage; se já foi
  commitado antes, trate como incidente e avise o tech-lead. Não use
  `--no-verify` para contornar.
- **Commit rejeitado pelo `commit-msg`**: remova trailers `Co-Authored-By` /
  `Claude-Session` e use Conventional Commits (`tipo(escopo): resumo`).
- **Push demorado ou bloqueado**: o `pre-push` roda `npm run check`; rode-o
  antes e corrija o que falhar.
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
