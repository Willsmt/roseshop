# Operação

> Estado: **Fase 0 concluída**. Comandos e bindings abaixo refletem o que
> existe hoje em `package.json` e `wrangler.jsonc` (três ambientes declarados e
> publicados; a produção está no ar desde o primeiro deploy pelo CI). Já existem a stack local de
> banco (Docker, ver "Banco local") e a conexão Drizzle + driver HTTP do Neon,
> exercitada pela rota `/api/health`, pelas categorias (feature 002: migration
> `0000`) e pelos produtos (feature 003: migration `0001`) do painel. O login das administradoras
> (Auth.js + Google) está implementado (feature 001); R2 e IA não estão
> configurados.

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
| `npm run deploy:dev` | `opennextjs-cloudflare build && opennextjs-cloudflare deploy --env dev` — builda e publica o worker `roseshop-dev`. Deploy manual permitido (ADR-006). |
| `npm run deploy:production` | `node scripts/require-ci.mjs && opennextjs-cloudflare build && opennextjs-cloudflare deploy --env production` — publica o worker `roseshop`. A trava `scripts/require-ci.mjs` só deixa passar se a variável `CI` estiver definida (o GitHub Actions a define); fora do CI imprime erro e sai com código 1 (constitution, princípio VIII). |
| `npm run lint` | `eslint .` — flat config nativa do Next 16 (`eslint.config.mjs`), com `eslint-config-next` para core-web-vitals e TypeScript. |
| `npm run cf-typegen` | `wrangler types --env-interface CloudflareEnv ./cloudflare-env.d.ts` — regenera os tipos TypeScript dos bindings declarados em `wrangler.jsonc`. Rodar sempre após alterar bindings. |
| `npm run typecheck` | `tsc --noEmit` — checagem de tipos de todo o projeto (`tsconfig.json`, modo `strict`). |
| `npm test` | `vitest run` — roda os testes **unitários** (`*.test.ts`, sem banco) uma vez (modo CI). Exclui `*.int.test.ts`. Sem `passWithNoTests`: suíte vazia agora falha. |
| `npm run test:int` | `vitest run --config vitest.int.config.mts` — roda os testes de **integração** (`*.int.test.ts`), que exigem `npm run db:up`, **migrations aplicadas** (`npm run db:migrate`) e `DATABASE_URL` no `.dev.vars`. Não faz parte do `check` nem do `pre-push`. |
| `npm run test:perf` | `vitest run --config vitest.perf.config.mts --disableConsoleIntercept` — medição de desempenho de `listar` com **500 produtos**, só no banco **local** (exige `db:up` e `db:migrate`). Popula, mede (meta < 2 s) e limpa; usa `resetCategorias`, então **recria as categorias** do banco local. Fora do `check` e do `test:int`. |
| `npm run test:watch` | `vitest` — modo watch para desenvolvimento. |
| `npm run check` | `npm run lint && npm run typecheck && npm run test` — o gate de "pronto" (lint + tipos + testes), encadeado e interrompido no primeiro erro. |
| `npm run prepare` | `husky` — roda sozinho no `npm install` e aponta `core.hooksPath` para `.husky/_`, ativando os hooks de git. Não precisa ser chamado à mão. |
| `npm run db:up` | `docker compose up -d --wait` — sobe Postgres 18 + proxy Neon e espera o healthcheck do Postgres. |
| `npm run db:down` | `docker compose down` — para os containers; **preserva** os dados (volume `pgdata`). |
| `npm run db:reset` | `docker compose down -v && docker compose up -d --wait` — **DESTRUTIVO: apaga o volume `pgdata` e todos os dados do banco local**, e sobe um banco vazio. Só afeta o local. |
| `npm run db:psql` | `docker compose exec postgres psql -U roseshop -d roseshop` — shell SQL no container (requer `db:up` antes). |

| `npm run db:generate` | `drizzle-kit generate` — gera migration SQL em `src/lib/db/migrations/` a partir de `src/lib/db/schema.ts`. A `0000` foi gerada assim e editada à mão (função `categoria_chave` e seed; ver [database.md](./database.md#migration-0000-e-seed)); depois de editar, rode de novo e confira "No schema changes". |
| `npm run db:migrate` | `drizzle-kit migrate` — aplica as migrations no banco de `DATABASE_URL`, por conexão TCP direta (não passa pelo proxy HTTP). |

`drizzle.config.ts` lê `DATABASE_URL` do ambiente e, se ausente, carrega o
`.dev.vars` (`process.loadEnvFile`); sem a variável, falha com erro explícito.
Em CI/dev online/produção a variável vem do ambiente e deve ser a connection
string **direta** do Neon, sem pooler (ADR-002; decisão N1 da feature 002:
app, migration e probe usam o mesmo `DATABASE_URL` direto, ver "CI").

**Fluxo local típico** (banco novo ou recém-resetado):

```bash
npm run db:up        # sobe Postgres 18 + proxy HTTP do Neon
npm run db:migrate   # aplica as migrations no banco local (0000 categorias + seed,
                     # 0001 produtos, 0002 envios de foto e uso da IA)
npm run test:int     # integração (exige as migrations aplicadas)
```

## Banco local (Docker)

### Visão leiga

Para desenvolver sem tocar no banco real, o projeto traz um banco de dados de
mentirinha que roda no seu computador, dentro do Docker. Um comando
(`npm run db:up`) liga, outro (`npm run db:down`) desliga. Um segundo
container faz o "tradutor" para o driver HTTP do Neon, o mesmo usado em
produção (ADR-002). Hoje o único uso pelo app é a rota `/api/health`, que
faz um `select 1` para confirmar que o banco responde (ver
[architecture.md, "Camada de banco"](./architecture.md#camada-de-banco-e-health-check)).

### Aprofundamento técnico

Definido em `docker-compose.yml` (projeto `roseshop`):

| Serviço | Imagem | Porta no host | Observações |
|---|---|---|---|
| `postgres` | `postgres:18-alpine` | `127.0.0.1:5440` -> 5432 | Volume nomeado `pgdata` montado em `/var/lib/postgresql` (layout do Postgres 18; não em `/var/lib/postgresql/data`); healthcheck `pg_isready` (3s, até 20 tentativas). |
| `neon-proxy` | `ghcr.io/timowilhelm/local-neon-http-proxy@sha256:cd2ae14e...` | `127.0.0.1:4444` -> 4444 | Proxy HTTP compatível com `@neondatabase/serverless`. Só sobe depois de o Postgres ficar saudável (`depends_on: service_healthy`). Alcança o Postgres pela rede interna (`postgres:5432`). |

```mermaid
graph LR
  App["app (driver @neondatabase/serverless)"] -->|"HTTP http://localhost:4444/sql"| P["neon-proxy :4444"]
  P -->|"TCP postgres:5432 (rede do compose)"| DB["postgres:18-alpine"]
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
- **Versão do Postgres**: a major local (18) acompanha a do projeto Neon
  (commit `a8ae651`; o Neon em si é informação do mantenedor, ver "Recursos
  online"). **Volume antigo**: quem tinha o volume `pgdata` do Postgres 17 deve
  rodar `npm run db:reset` (destrutivo, só local); o 18 não sobe sobre dados da
  17 nem com o ponto de montagem antigo.
- **`localhost` na connection string** (verificado manualmente pelo
  mantenedor): um `POST` em `http://localhost:4444/sql` com o header
  `Neon-Connection-String` apontando para `localhost:5440` retornou
  `{"ok":1}`. Ou seja, o protocolo HTTP do Neon responde via proxy usando
  `localhost`, funcionando offline, sem depender do DNS do `localtest.me`.
  A verificação foi manual; não há teste automatizado no repositório.
- **`global_fetch_strictly_public` não bloqueia o proxy local (resolvido)**:
  a flag em `wrangler.jsonc` era um risco para o `fetch` do worker a
  `localhost:4444`. Validado no workerd: `npm run preview` com `/api/health`
  respondeu 200 `{db: ok}` (corpo do commit `6ed2cfc`).
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
gate definitivo é o **CI** (GitHub Actions, ver seção "CI"), que repete
`npm run check`, os testes de integração e a varredura do gitleaks. Os hooks
são só a primeira linha de defesa.

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

Há dois tipos de teste, cada um com sua config:

| Tipo | Arquivos | Config | Como roda | Banco |
|---|---|---|---|---|
| Unitário | `src/**/*.test.{ts,tsx}` | `vitest.config.mts` + `vitest.setup.ts` | `npm test`; entra no `npm run check` e no `pre-push` | Não precisa |
| Integração | `src/**/*.int.test.{ts,tsx}` | `vitest.int.config.mts` + `vitest.int.setup.ts` | `npm run test:int`, manual; **fora** do `pre-push` | Exige `npm run db:up`; o setup falha se `DATABASE_URL` faltar (lê `.dev.vars` se existir), `testTimeout` de 15 s |

Hoje existem testes em `src/lib/db/` (`health.test.ts`, `erros-pg.test.ts`
unitários; `client.int.test.ts`, `batch-transacao.int.test.ts`, `fk-produtos.int.test.ts`,
os `categorias.*.int.test.ts` e os `produtos.*.int.test.ts` de integração, via
proxy local), em `src/lib/categorias/`, `src/lib/produtos/`, em `src/lib/auth/`, nas telas do painel e em
`src/components/ui/`, além de testes transversais:
`src/test/conformance/painel-guard.test.ts` (nega por padrão rotas/actions sem
guard; ver [F01](./features/F01-autenticacao.md#teste-de-conformidade-nega-por-padrão)),
`categorias-guard.test.ts` e `categorias-acesso.test.ts` (guard nas telas e
actions de categorias e fronteira de imports; ver
[F02](./features/F02-categorias.md#camadas-e-fronteira-de-acesso)),
`produtos-acesso.test.ts` e `produtos-paginas-guard.test.ts` (o mesmo para
produtos; ver [F03](./features/F03-produtos.md#fronteira-de-acesso-e-guards)) e
`src/next-config.test.ts` (header `no-store` em `/painel`). Em
`vitest.setup.ts`, `server-only` é trocado por um mock vazio. Configuração
do tipo unitário (`vitest.config.mts`):

| Aspecto | Configuração | Observação |
|---|---|---|
| Runner | Vitest `^5.0.3` (instalado: 5.0.3) | Plugin `@vitejs/plugin-react` para JSX/TSX. |
| Ambiente padrão | `node` | Testes de componente devem usar `jsdom` (instalado como devDependency); a convenção é declarar o ambiente no próprio arquivo de teste, pois não há override global. |
| Globals | desligados (sem `globals: true`) | `describe`, `it`, `expect`, `vi` precisam ser importados de `vitest`. |
| Alias `@/*` | resolvido nativamente pelo Vite (`resolve.tsconfigPaths: true`) | Lê os `paths` do `tsconfig.json`; substitui o plugin `vite-tsconfig-paths`, removido do projeto. |
| Arquivos de teste | `src/**/*.test.{ts,tsx}`, exceto `*.int.test.*` | Testes fora de `src/` não são descobertos; os de integração têm config própria. |
| Setup | `vitest.setup.ts` importa `@testing-library/jest-dom/vitest` | Matchers como `toBeInTheDocument` ficam disponíveis. |

#### Integração: pegadinhas (feature 002)

- **`fileParallelism: false`** em `vitest.int.config.mts`: vários arquivos fazem
  `TRUNCATE categorias`, então os arquivos de integração rodam em série.
- `vitest.int.setup.ts` também troca `server-only` por um mock vazio.
- Infra em `src/test/db/categorias-fixtures.ts` (`resetCategorias` refaz o seed
  lendo o bloco entre os marcadores da migration `0000`) e
  `src/test/db/produtos-fixtures.ts` (`inserirProduto(s)`, `limparProdutos`,
  `nomeUnicoProduto`: `chave` tem unicidade global, então nomes são únicos por
  processo). `produtos` é tabela real (migration `0001`); não há mais fixture
  provisória.
- **Execução interrompida** (Ctrl+C, timeout) pode deixar produtos de teste ou
  categorias fora do seed no banco local. Recuperação: `npm run db:reset`
  (**destrutivo, só local**) e depois `npm run db:migrate`.
- **`produtos-medicao.int.test.ts` fica fora do `test:int`** (exclusão em
  `vitest.int.config.mts`) e roda só em `npm run test:perf`.
- **Probe do CI**: `vitest.probe.config.mts` roda **somente**
  `src/lib/db/batch-transacao.int.test.ts` e `src/lib/db/fk-produtos.int.test.ts`
  (include literal, para nenhum teste com `TRUNCATE` tocar o Neon dev). O
  `fk-produtos` não usa `TRUNCATE`: grava categoria e produto com marcador único
  no nome dentro de um `db.batch` que reverte, e a limpeza apaga só pelo
  marcador. Usado pelo CI do PR; não adicione reset nem escrita de banco no
  setup dessa config. `PROBE_SLEEP_S` (padrão 2 s; o CI usa 5)
  controla o `pg_sleep` do cenário de lock.

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
| `esbuild@0.28.1`, `esbuild@0.25.4` e `esbuild@0.25.12` | Valida/instala o binário nativo do esbuild (a 0.25.4 é a cópia aninhada em `@opennextjs/aws`; a 0.25.12 vem do override abaixo, usada pelo `drizzle-kit`). |
| `workerd@1.20261001.1` | Binário do runtime da Cloudflare usado no `preview`. A aprovação é por versão exata e o `workerd` muda a cada atualização do `wrangler`: todo bump do wrangler exige reaprovar com `npm approve-scripts workerd`. |
| `unrs-resolver@1.12.2` | Resolver nativo, dependência transitiva de `eslint-config-next` (via `eslint-import-resolver-typescript`). |

Regra: **pacote novo com script de instalação precisa de aprovação explícita**
(nova entrada em `allowScripts`, decisão do tech-lead). Como as chaves incluem
a versão, um bump de versão desses pacotes também exige atualizar a entrada.
A coluna "por que" acima é inferência pela função de cada pacote; o motivo
da aprovação não está descrito em nenhum arquivo do repositório além do
commit `ccb808b` (que apenas diz "approved explicitly").

### Override `@esbuild-kit/core-utils` -> `esbuild` 0.25.12

`package.json` tem `overrides` forçando `@esbuild-kit/core-utils` (loader do
`drizzle-kit`) a usar `esbuild` 0.25.12 em vez do 0.18.20 que ele traria
(GHSA-67mh-4wv8-2f99, afeta só o dev server do esbuild, sem exposição no uso
do `drizzle-kit`). Verificado no commit `6ed2cfc`: o `drizzle-kit` carrega
`drizzle.config.ts` pelo loader com override. **Não remova** o override sem
reavaliar a vulnerabilidade; a entrada `esbuild@0.25.12` em `allowScripts`
depende dele.

## Auditoria de dependências

**Dependências de autenticação com política própria** (feature 001):
`next-auth@5.0.0-beta.32` e `server-only@0.0.1` ficam em **versão exata** (sem
`^`) no `package.json`; `zod` está em `^4.6.5`. O `next-auth` v5 ainda é beta
(a tag `latest` do npm é a 4.x). Atualizá-lo é decisão deliberada: só em PR
próprio, depois de ler o changelog e rodar `npm audit --omit=dev` (ADR-003,
adendo; ADR-007).

Política formalizada no [ADR-007](../specs/adr/007-auditoria-de-dependencias.md)
e aplicada pelo job `security` do CI (ver "CI"). Resumo:

- **Runtime** (`npm audit --omit=dev`): vulnerabilidade `high`/`critical`
  bloqueia o PR no CI. Estado em `6ed2cfc`: 0 vulnerabilidades de runtime.
- **Dev**: não bloqueia o CI; vulnerabilidade aceita fica documentada
  abaixo com justificativa e data de revisão.
- Antes de aceitar: atualizar a dependência; depois `overrides` validado por
  teste; só então aceitar. `npm audit fix --force` não é usado. Script de
  instalação de pacote novo exige aprovação explícita (`allowScripts`).

| Advisory | Pacote/caminho | Justificativa | Aceita em | Revisar em |
|---|---|---|---|---|
| GHSA-vfj7-8cjw-p6xm | `braces`, via `eslint-config-next` | Sem versão corrigida; os padrões glob vêm só da nossa config. | 2026-10-03 | 2026-11-03 |

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
| `DATABASE_URL` | Connection string do Postgres. Local: `localhost:5440`; a mesma string serve ao driver (via proxy) e às migrations (conexão direta). No Neon dev, a **mesma string direta, sem pooler**, é usada pelo app (secret da Cloudflare), pela migration e pelo probe (secret do GitHub Environment `dev`), decisão N1. | `src/lib/db/client.ts` (`createDb`, via `/api/health` e `src/lib/db/contexto.ts`), `drizzle.config.ts`, `vitest.int.setup.ts` e o passo do probe em `.github/workflows/pull-request.yml`. | Secret em dev online e produção (`wrangler secret --env dev` / `--env production`), conforme ADR-006 (segredos de runtime do app ficam somente na Cloudflare); no local, valor não sensível |
| `NEON_FETCH_ENDPOINT` | Endpoint do proxy HTTP local do Neon (`.../sql`). | `src/lib/db/client.ts` (`neonConfig.fetchEndpoint`). Definir **somente no local**; **ausente** em dev online e produção (o driver usa o endpoint padrão do Neon). | Var pública, só local |
| `AUTH_SECRET` | Segredo de assinatura das sessões do Auth.js. **Gerado** (`openssl rand -base64 32`); não vem do Google. **Diferente em cada ambiente** (local, dev, produção). | Lido pelo próprio Auth.js (`next-auth`) de `process.env`; nenhum arquivo de `src/` o referencia. Trocar o valor derruba todas as sessões do ambiente. | Secret em dev online e produção |
| `AUTH_GOOGLE_ID` | Client ID do OAuth do Google (termina em `.apps.googleusercontent.com`). | `src/lib/auth/config.ts` (`createAuthConfig`, provedor Google). | Secret em dev online e produção |
| `AUTH_GOOGLE_SECRET` | Client Secret do OAuth do Google (começa com `GOCSPX-`). | `src/lib/auth/config.ts` (`createAuthConfig`, provedor Google). | Secret em dev online e produção |
| `ADMIN_EMAILS` | Allowlist de e-mails das administradoras, separados por vírgula, sem espaço. Comparação sem diferenciar maiúsculas; entradas inválidas são ignoradas. | `src/lib/auth/config.ts` (callback `signIn`) e `src/lib/auth/guard.ts` (`getAdminSession`, a cada acesso). | Secret em dev online e produção (contém e-mails pessoais) |
| `OPENAI_API_KEY` | Chave da OpenAI (começa com `sk-`); local e dev usam a do projeto `roseshop-dev`, produção usará a de `roseshop-prod`. | Nenhum consumidor ainda (feature 005, IA). | Secret em dev online e produção |

As cinco últimas estão declaradas em `.dev.vars.example` e tipadas em
`cloudflare-env.d.ts`. As quatro de auth têm consumidor (coluna "Onde é usada");
`OPENAI_API_KEY` **ainda não é referenciada** em `src/`. Chaves de R2 não são variáveis: R2
é binding (ver "Bindings").

### Google OAuth (informação do mantenedor)

Não verificável nos arquivos do repositório. Projeto `roseshop` no Google
Cloud, app em modo **Testing** com as administradoras como test users, e um
**único client Web** com 4 redirect URIs (sempre `/api/auth/callback/google`):
`localhost:3000`, `localhost:8787`, `roseshop-dev` e `roseshop`.

### OpenAI (informação do mantenedor)

Não verificável nos arquivos. Projetos `roseshop-dev` e `roseshop-prod`;
créditos pré-pagos com **auto-recharge desligado** (o saldo é o teto rígido) e
limite de uso configurado nos projetos. Há uma lista curta de modelos baratos
com entrada de imagem, a reduzir para um na feature 005. A chave de produção
foi criada e cadastrada como secret de runtime de produção (relato do
mantenedor, 2026-10-03).

## Administradoras e emergência de acesso

### Visão leiga

Quem pode entrar no painel é decidido por duas coisas: a conta precisa estar
liberada no Google (enquanto o app está em modo de teste) **e** o e-mail precisa
estar na lista `ADMIN_EMAILS` de cada ambiente. Em caso de suspeita de acesso
indevido, existe um "botão de pânico": trocar o `AUTH_SECRET`, que desconecta
todo mundo.

### Incluir ou remover administradora

1. **Incluir**: no Google Cloud (projeto `roseshop`, app em modo **Testing**),
   adicione o e-mail como *test user*; depois acrescente-o em `ADMIN_EMAILS` do
   ambiente (secret na Cloudflare, `--env dev` ou `--env production`; local:
   `.dev.vars`). Reenvie a lista inteira, separada por vírgula, sem espaço. Use
   o procedimento por pipe de "Cadastrar um secret"; não imprima o valor.
2. **Remover**: tire o e-mail de `ADMIN_EMAILS` (e, se quiser, dos *test users*).
   **Vale no próximo acesso**: `getAdminSession` reconfere a lista a cada
   página/ação, mesmo com o cookie ainda válido. Não precisa deploy.
3. Em dev local, reinicie o `npm run preview` depois de editar o `.dev.vars`
   (ver Troubleshooting).

### Emergência: derrubar todas as sessões

A sessão é um cookie JWT assinado com `AUTH_SECRET`, sem registro no servidor.
Trocar o secret invalida **todas as sessões daquele ambiente** no próximo
acesso:

```bash
openssl rand -base64 32 | npx wrangler secret put AUTH_SECRET --env <amb>
```

(`<amb>` = `dev` ou `production`.) Depois, **revise o `ADMIN_EMAILS`** para
confirmar que só há administradoras legítimas. As administradoras precisarão
entrar de novo. Cada ambiente tem o seu `AUTH_SECRET`; trocar um não afeta os
outros. "Sair" na tela encerra apenas o aparelho de quem clicou.

### Diagnóstico de login

Os logs do callback de login contêm só códigos de evento, nunca e-mail ou nome.

| O que aparece | Significado |
|---|---|
| `auth.signin.recusado` seguido de `[auth][error] AccessDenied` | Conta fora da lista (ou e-mail não verificado). A tela mostra o aviso de recusa. Normal. |
| `auth.allowlist.vazia` | `ADMIN_EMAILS` ausente, vazia ou sem nenhum e-mail válido: ninguém consegue entrar. Verifique o secret do ambiente. |
| `[auth][error] CallbackRouteError` com causa `response parameter "iss" (issuer) missing`, e redirecionamento para `/painel/entrar?error=Configuration` | **Ruído esperado** quando a pessoa **cancela** na tela do Google: o Google volta sem o parâmetro `iss` e o Auth.js falha antes de reconhecer o erro do provedor. Não é falha de configuração; a tela mostra o aviso genérico de falha. |

Uma falha real de configuração (ex.: credencial do Google errada) também chega
como `error=Configuration`, com a mesma mensagem na tela: diferencie pelo log
(causa do erro) e confira `AUTH_GOOGLE_ID`/`AUTH_GOOGLE_SECRET`. Origem dessa
verificação: `specs/001-auth-admins/research.md`, R6 (T032).

**Ver `console.warn` e query strings no preview local**: o log do `wrangler`
não mostra esses registros. O `preview` expõe uma consulta de observabilidade
local, `POST /cdn-cgi/local/explorer/api/local/observability/query`, com SQL
**somente leitura** sobre os logs e spans capturados. Foi o único jeito de ver
os `console.warn` do callback e as query strings das chamadas (corpo e formato
da consulta: ver a documentação do wrangler; não estão descritos no repositório).

## Deploy

### Visão leiga

O projeto tem três "cópias": a **local** (no seu computador), a **dev**
(publicada na internet para testar) e a **produção** (a loja de verdade). Cada
uma tem seu próprio nome de worker e seu próprio bucket de imagens, de modo que
mexer em uma não afeta as outras. Dev pode ser publicado à mão; produção só
pelo CI.

### Aprofundamento técnico

`wrangler.jsonc` (ver [architecture.md, "Build e deploy"](./architecture.md#build-e-deploy-opennext--wrangler)
para os bindings):

| Ambiente | Como selecionar | Worker | R2 (`PRODUCT_IMAGES`) | Deploy |
|---|---|---|---|---|
| Local | nível de cima (sem `--env`); `npm run preview` | `roseshop-local` | `roseshop-local` (simulado em `.wrangler/state/`) | não há |
| Dev | `--env dev` | `roseshop-dev` | `roseshop-dev` | `npm run deploy:dev` (manual) |
| Produção | `--env production` | `roseshop` | `roseshop-prod` | `npm run deploy:production` (só CI) |

Regras:

- O nível de cima tem nome inofensivo (`roseshop-local`): um `wrangler deploy`
  sem `--env` nunca atinge dev nem produção. **Nunca** use `"remote": true`
  no nível de cima.
- O nome do binding é o mesmo nos três (`PRODUCT_IMAGES`, `IMAGES`,
  `WORKER_SELF_REFERENCE`); só o recurso muda. `r2_buckets`, `images` e
  `services` são **redeclarados por env** (não herdados); `ASSETS` (`assets`) é
  herdado.
- Os scripts `deploy` e `upload` antigos foram removidos (commit `fffa3fe`).
- Validado no commit `fffa3fe`: dry-run dos bindings por ambiente e
  `/api/health` 200 no preview local. O mantenedor também validou no dev
  publicado: `/api/health` 503 sem o secret e 200 com ele.

### Recursos online (informação do mantenedor)

Não verificável nos arquivos do repositório; vem do relato do mantenedor e dos
corpos de commit.

| Recurso | Estado |
|---|---|
| R2 `roseshop-dev` e `roseshop-prod` | Criados, localização **ENAM**. O R2 não tem região na América do Sul. (Os nomes dos buckets conferem com `wrangler.jsonc`.) |
| Neon | Projeto `roseshop`, Postgres 18, região São Paulo; branches `production` (padrão) e `dev` (sem expiração). |
| Subdomínio `workers.dev` da conta | `willsmt`, **compartilhado por todos os workers da conta**: trocá-lo quebra todas as URLs. Dev em `https://roseshop-dev.willsmt.workers.dev`. |
| Worker `roseshop` (produção) | **No ar** desde o primeiro deploy pelo CI (merge do PR #9, relato do mantenedor). `https://roseshop.willsmt.workers.dev/api/health` responde 200. Veja "Primeiro deploy de produção" em "CI". |
| Custos | Budget alert de US$ 1 na conta Cloudflare (informativo, não pausa o uso). A conta também hospeda o bucket `comunidade-belleetbelle`: a cota gratuita do R2 é **compartilhada**. |

### Cadastrar um secret

```bash
npx wrangler secret put DATABASE_URL --env dev        # ou --env production
```

Para `DATABASE_URL`, cole o valor **somente no prompt** interativo (nunca em
argumento, arquivo ou histórico do shell). Para os demais secrets, prefira o
procedimento por pipe abaixo. Dev online tem 6 secrets cadastrados
(informação do mantenedor): `DATABASE_URL`, `AUTH_SECRET`, `AUTH_GOOGLE_ID`,
`AUTH_GOOGLE_SECRET`, `ADMIN_EMAILS`, `OPENAI_API_KEY`. Em produção, cadastre
logo após o primeiro deploy; até lá `/api/health` responde 503.

#### Procedimento por pipe (validar e enviar)

Verificado na prática (informação do mantenedor). Colar no prompt causou
valores trocados entre secrets e um espaço inicial no Client ID. Então:

1. Valide o valor **no `.dev.vars` local pelo formato**, sem imprimi-lo:
   Client ID termina em `.apps.googleusercontent.com`; Client Secret começa
   com `GOCSPX-`; chave da OpenAI começa com `sk-`; nenhum valor com espaço
   no início.
2. Envie ao ambiente por pipe, extraindo a chave exata do arquivo:

```bash
grep '^AUTH_GOOGLE_ID=' .dev.vars | cut -d= -f2- | tr -d '\n' \
  | npx wrangler secret put AUTH_GOOGLE_ID --env dev
```

Exceção: `AUTH_SECRET` **não** se copia do `.dev.vars`; gere um novo por
ambiente (`openssl rand -base64 32`). Não use `echo` com o valor.

Os 6 secrets de runtime de produção (`DATABASE_URL`, `AUTH_SECRET`,
`AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `ADMIN_EMAILS`, `OPENAI_API_KEY`) já
foram cadastrados pelo mesmo procedimento (validar + pipe), conforme relato do
mantenedor. Não confundir com os secrets do GitHub (seção "CI"), que servem só
ao deploy.

**Regra operacional**: ao rodar wrangler, responda **no** a qualquer oferta de
alterar o `wrangler.jsonc` ("add it on your behalf"); o arquivo é de
autoria do tech-lead.

### CI

> Estado: workflows em `main` (`.github/workflows/`) e em uso. O primeiro
> deploy de produção pelo CI ocorreu no merge do PR #9 (relato do mantenedor).

#### Visão leiga

Toda vez que se abre um PR, o GitHub roda sozinho uma bateria de verificações
(código, testes com banco de verdade e caça a senhas vazadas). Se passar, o PR
é publicado automaticamente no ambiente **dev** para teste. Quando um humano
faz merge em `main`, as mesmas verificações rodam de novo e o app vai para a
**produção**. Depois de cada deploy, um teste de fumaça confere se o sistema
responde.

#### Aprofundamento técnico

```mermaid
graph LR
  PR[PR para main] --> C1[checks.yml]
  C1 --> D[deploy-dev: migration, deploy roseshop-dev, smoke]
  M[push em main] --> C2[checks.yml]
  C2 --> P[deploy-production: migration, deploy roseshop, smoke]
```

| Workflow | Gatilho | O que faz |
|---|---|---|
| `checks.yml` | `workflow_call` (reutilizável) | Jobs `quality`, `integration` e `security` (abaixo). |
| `pull-request.yml` | `pull_request` para `main` | `checks` + `deploy-dev` (environment `dev`), **só se** o PR for do próprio repositório (`head.repo.full_name == github.repository`); PR de fork nunca recebe secrets nem faz deploy. |
| `main.yml` | `push` em `main` | `checks` + `deploy-production` (environment `production`). |

Jobs de `checks.yml`:

| Job | Conteúdo |
|---|---|
| `quality` | `npm ci` + `npm run check` (lint, typecheck e testes unitários). |
| `integration` | Postgres `postgres:18-alpine` (porta 5440) e proxy Neon (porta 4444) como `services`; espera o proxy responder, aplica as migrations (`npm run db:migrate`, passo "Migrations (Postgres do job)", no banco descartável do job, nunca dev/produção) e roda `npm run test:int`. A imagem do proxy usa o **mesmo digest** do `docker-compose.yml`. `DATABASE_URL` e `NEON_FETCH_ENDPOINT` do job apontam para o banco descartável do próprio job (não são segredos). |
| `security` | Checkout com histórico completo; instala o gitleaks **8.30.1** verificando o checksum (`sha256sum --check`); `gitleaks git --redact` varre o histórico inteiro; `npm audit --omit=dev --audit-level=high` (ADR-007). |

Passos dos jobs de deploy (`deploy-dev` e `deploy-production`): `npm ci` →
migrations (`npm run db:migrate` só se existir
`src/lib/db/migrations/meta/_journal.json`; hoje existem a `0000`, a `0001` e a
`0002`, então roda) →
**(só `deploy-dev`) probe de transação do batch** → `npm run deploy:dev` ou
`npm run deploy:production` → `scripts/smoke-health.sh <url>/api/health`.

**Probe do `db.batch` no Neon dev** (`pull-request.yml`, passo "Probe de
transação do batch (Neon dev)", ADR-008): `npx vitest run --config
vitest.probe.config.mts` com `DATABASE_URL: ${{ secrets.DATABASE_URL }}` do
environment `dev` (o mesmo secret da migration, **sem secret novo**) e
`PROBE_SLEEP_S=5`. Prova que o `db.batch` roda numa única transação, que o lock
advisory fica visível em `pg_locks` e bloqueia o segundo batch, o isolamento
`read committed` e a forma do erro `23001`; o `batch-transacao` não escreve em tabelas. Roda depois
da migration e **antes** do deploy: se falhar, o deploy dev não acontece e o
ADR-008 deve ser reaberto. Se o app passar a usar a string com pooler, repita o
probe com ela antes de chegar à produção.
O mesmo passo roda também `src/lib/db/fk-produtos.int.test.ts` (feature 003): prova
no Neon dev que a FK `produtos.categoria_id` é `ON DELETE RESTRICT` (`23001`) e
que o batch reverte. Esse teste escreve linhas marcadas e as apaga.
A **primeira** execução do PR da feature 002 aplica a migration `0000` no Neon
dev e a congela (mudança depois disso é migration nova).
A trava `scripts/require-ci.mjs` passa porque o Actions define `CI=true`.

`scripts/smoke-health.sh` tenta `GET` no `/api/health` até 10 vezes, com 6 s de
intervalo (~60 s), e exige HTTP 200; senão o job falha.
O `.nvmrc` fixa o **Node 24**, lido por `actions/setup-node` (`node-version-file`).

**Endurecimento dos workflows** (confirmado nos arquivos):

- Actions fixadas por SHA de commit, com a versão em comentário:
  `actions/checkout` v7.0.1 e `actions/setup-node` v7.0.0.
- `permissions: contents: read` em todos os workflows; `persist-credentials: false`
  em todo checkout; `HUSKY: 0` no CI.
- Secrets só no passo que os usa (`DATABASE_URL` na migration e no probe;
  `CLOUDFLARE_API_TOKEN` no deploy); `CLOUDFLARE_ACCOUNT_ID` vem de `vars`.
- Concorrência: `pr-<número>` com cancelamento por PR; `deploy-dev` e
  `deploy-production` serializados (`cancel-in-progress: false`).

#### GitHub Environments (informação do mantenedor)

Não verificável nos arquivos do repositório.

| Environment | Restrição | Secrets | Variável |
|---|---|---|---|
| `dev` | nenhuma informada | `CLOUDFLARE_API_TOKEN`, `DATABASE_URL` (string direta do branch Neon `dev`) | `CLOUDFLARE_ACCOUNT_ID` |
| `production` | aceita deploy somente do branch `main` | `CLOUDFLARE_API_TOKEN`, `DATABASE_URL` (string direta do branch Neon `production`) | `CLOUDFLARE_ACCOUNT_ID` |

O token da Cloudflare tem escopo mínimo (Workers Scripts: Edit + leituras de
conta/usuário), restrito à conta, e **expira em 2027-10-03**: renovar antes
disso, senão o deploy passa a falhar.

#### Gravar um secret no GitHub (informação do mantenedor)

Nunca cole o valor junto com outros comandos nem o imprima.

1. Execute o `read` **isolado** (sem outros comandos na mesma colagem), para
   a variável do shell, sem eco: `read -rs VALOR`.
2. Valide:
   - Token Cloudflare: `GET /user/tokens/verify` deve retornar `active`.
   - `DATABASE_URL` do Neon: esquema `postgres`, host `neon.tech`, **sem
     pooler** (string direta, decisão N1), `sslmode=require`, sem espaços, e o endpoint `ep-...` conferido
     com o console do Neon e **diferente** entre dev e production.
3. Grave por pipe, no environment correto:

```bash
printf %s "$VALOR" | gh secret set DATABASE_URL --env dev
unset VALOR
```

#### Primeiro deploy de produção

Ocorreu no merge do PR #9 (relato do mantenedor). Como esperado, o smoke test
falhou com 503 (`/api/health` sem `DATABASE_URL` de runtime) até os 6 secrets
de runtime de produção serem cadastrados na Cloudflare (ver "Cadastrar um
secret"); depois de cadastrá-los o smoke test ficou verde e
`https://roseshop.willsmt.workers.dev/api/health` responde 200. O smoke de
`main.yml` aponta para essa URL (confirmado no arquivo).

Se um novo ambiente precisar nascer, o roteiro é o mesmo: o primeiro deploy
falha no smoke com 503 até os secrets de runtime existirem; cadastre-os e
reexecute o job.

#### Proteção do branch `main` (informação do mantenedor)

Não verificável nos arquivos do repositório: foi configurada via API do GitHub
e vem do relato do mantenedor. Validação relatada: o merge do PR #10 foi
recusado até os checks passarem.

| Regra | Valor |
|---|---|
| Pull request | obrigatório (sem push direto em `main`) |
| Checks obrigatórios | os 3 jobs de `checks.yml` (`checks / ...`: `quality`, `integration`, `security`) e `deploy no dev` |
| Atualização | o branch precisa estar atualizado com `main` antes do merge |
| Histórico | linear |
| Force push e remoção do branch | bloqueados |
| Administradores | a regra vale também para eles |
| Aprovações exigidas | 0 (projeto solo) |

Consequência prática: todo PR precisa do deploy no dev verde, e o merge só vem
depois, por humano. O nome exato de cada check no GitHub segue o `name:` do job
em `checks.yml` (confirmado nos arquivos); a lista cadastrada na proteção não é
verificável daqui.

#### Runner fixado e pendência de migração

Os 3 workflows (`checks.yml`, `pull-request.yml`, `main.yml`) usam
`runs-on: ubuntu-24.04` (confirmado nos arquivos; commit `1568b3a`). O motivo é
que `ubuntu-latest` migra para o Ubuntu 26 em 2026-10-19 (informação do
mantenedor). **Pendência**: migrar o runner para o Ubuntu 26 em um PR próprio,
validando os checks e o deploy no dev.

#### Melhoria futura

Dependabot para GitHub Actions (atualizar os SHAs fixados). Não implementado.

## Troubleshooting

- **Smoke test do CI falha com 503**: o worker foi publicado, mas faltam os
  secrets de runtime no ambiente (Cloudflare, não GitHub). Cadastre-os (ver
  "Cadastrar um secret") e reexecute o job.
- **PR de fork sem deploy no dev**: esperado; o job `deploy-dev` só roda para
  PR do próprio repositório.
- **Deploy do CI falha com erro de autenticação Cloudflare**: verifique se o
  token expirou (validade até 2027-10-03) ou perdeu escopo.
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
- **Mudei o `.dev.vars` (ex.: `ADMIN_EMAILS`) e nada mudou no preview**: o
  `wrangler dev` lê o `.dev.vars` **uma vez, ao subir**. Pare e rode de novo o
  `npm run preview` (observado na T039 da feature 001).
- **Dois `npm run preview` ao mesmo tempo (porta 8787 e 8788)**: dois previews no
  mesmo repositório disputam as pastas de build (`.next` e o `.open-next` gerado
  pelo `opennextjs-cloudflare build`). **Observado** (relato do mantenedor): um
  segundo `npm run preview` subiu na porta 8788 e, depois do build dele, o
  preview que já rodava na 8787 deixou de existir. A causa exata **não foi
  confirmada por inspeção**. Recomendação: rodar **um preview por vez** e parar o
  anterior antes de subir outro.
- **Login cancelado no Google gera erro no log**: esperado, ver "Diagnóstico de
  login".
- **Bindings não aparecem nos tipos (`cloudflare-env.d.ts`)**: rodar
  `npm run cf-typegen` depois de qualquer mudança em `wrangler.jsonc`.
- **Secret com valor trocado ou com espaço inicial** (login Google falha,
  `invalid_client`, 401 da OpenAI): causado por colagem manual no prompt do
  `wrangler secret put`. Revalide o formato no `.dev.vars` e reenvie por pipe
  (ver "Cadastrar um secret"). `wrangler secret list` mostra só nomes, não
  confere valores.
- **`.dev.vars` ausente ou incompleto**: compare as chaves com
  `.dev.vars.example` (tabela em "Variáveis de ambiente"). Sem `DATABASE_URL`, o
  `/api/health` responde 503 `{db: "error"}` (não lança); sem as chaves de auth
  (`AUTH_SECRET`, `AUTH_GOOGLE_*`, `ADMIN_EMAILS`) o login em `/painel` não
  funciona (ver "Diagnóstico de login").
- **`npm run db:up` falha com "port is already allocated"**: algo no host usa
  5440 ou 4444. Libere a porta; o compose não a parametriza.
- **`db:up` falha por Docker indisponível**: confirme que o Docker responde no
  WSL (`docker ps`).
- **Perdi os dados do banco local**: `npm run db:reset` apaga o volume
  `pgdata`. É o comportamento esperado; só afeta o local.
- **`/api/health` devolve 503 `{db: "error"}`**: banco inacessível, `DATABASE_URL`
  errada **ou ausente** (secret não cadastrado no ambiente; o log diz
  `[health] configuração do banco ausente ou inválida`). O log traz só o tipo do erro (`[health] falha ao
  consultar o banco (<tipo>)`), de propósito; confira `docker compose ps` e o
  `.dev.vars`.
- **`npm run test:int` falha com "DATABASE_URL ausente"**: rode `npm run db:up`
  e configure o `.dev.vars` a partir do `.dev.vars.example`.
- **`npm run test:int` falha com "relation categorias does not exist" ou
  seed ausente**: faltou `npm run db:migrate` depois do `db:up` (ou do
  `db:reset`). A integração exige as migrations aplicadas.
- **`test:int` falha com `TRUNCATE` recusado por FK ou nome de produto
  repetido**: sobraram produtos de uma execução interrompida. Rode
  `npm run db:reset` (destrutivo, só local) e `npm run db:migrate`.
- **Probe do batch falha no CI do PR**: o `deploy-dev` não roda. Não force: o
  ADR-008 assume transação única no `db.batch` e, se o probe provar o contrário,
  deve ser reaberto. Antes disso, confira se o `secrets.DATABASE_URL` do
  environment `dev` é a string direta (sem pooler).
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
  "Ambiente"). Rode `dev`, `preview`, `build` e `deploy:*` sempre no terminal do
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
