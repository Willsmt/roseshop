# CLAUDE.md

Guia operacional para agentes (Claude Code e afins) neste repositório.
**Leia `.specify/memory/constitution.md` antes de qualquer tarefa.** Regras de stack,
segurança, arquitetura e UX estão lá e não são repetidas aqui. Em conflito,
a constitution vence.

## Ambiente

- Next.js 16 (App Router, Turbopack) + TypeScript, deploy em Cloudflare Workers
  via OpenNext (`@opennextjs/cloudflare`).
- Desenvolvimento em Linux (WSL). Não rodar build/preview em Windows nativo.
- Segredos de dev em `.dev.vars` (lido pelo wrangler/workerd). Nunca ler,
  imprimir, copiar ou commitar esse arquivo. Chaves esperadas: `.dev.vars.example`.
- Line endings LF (`.gitattributes`).

## Comandos

```bash
npm run dev          # next dev (rápido, runtime Node — não é o runtime de produção)
npm run preview      # build OpenNext + workerd local em http://localhost:8787
npm run lint         # eslint (flat config nativa do Next 16)
npm run cf-typegen   # regenera cloudflare-env.d.ts após mudar bindings
npm run typecheck    # tsc --noEmit
npm test             # vitest run: só unitários (*.test.ts), sem banco
npm run test:int     # integração (*.int.test.ts); exige db:up + db:migrate; roda arquivos em série; fora do pre-push
npm run test:perf    # medição da lista com 500 produtos (vitest.perf.config.mts); só banco LOCAL, popula e limpa; recria as categorias; fora do check/test:int
npm run test:ia      # medição MANUAL da IA (SF13; vitest.ia.config.mts): lê ia-medicao/ (fora do git) e a chave dev; gasta dinheiro real; fora do check/test:int/CI
npm run test:watch   # vitest em modo watch
npm run check        # lint + typecheck + test (gate de "pronto")
npm run db:up        # sobe Postgres 18 + proxy HTTP do Neon (Docker, portas 5440/4444)
npm run db:down      # para os containers (preserva dados)
npm run db:reset     # DESTRUTIVO: apaga os dados do banco local e recria (rode db:migrate depois; recupera fixture sobrada do test:int)
npm run db:psql      # shell psql no banco local
npm run deploy:dev   # build OpenNext + deploy do worker roseshop-dev (manual)
npm run deploy:production  # só roda no CI (scripts/require-ci.mjs); publica roseshop
npm run db:generate  # drizzle-kit generate (migration SQL em src/lib/db/migrations)
npm run db:migrate   # drizzle-kit migrate (TCP direto no DATABASE_URL)
# fluxo local: db:up -> db:migrate -> test:int
# probe do batch e da FK de produtos no Neon dev: só no CI (pull-request.yml, vitest.probe.config.mts)
# hooks (husky) instalados pelo `prepare` no npm install; exigem gitleaks no PATH
```

Valide no `preview` tudo que toca runtime (bindings, R2, auth, IA): o `dev`
roda em Node e pode mascarar incompatibilidades do workerd.

## Estrutura

```
specs/                    # fonte de verdade: specs de feature (NNN-nome/) e ADRs (adr/)
.specify/                 # Spec Kit: constitution (memory/), templates e scripts
docker-compose.yml        # stack local de banco (Postgres 18 + proxy Neon)
.dev.vars.example         # chaves esperadas do .dev.vars (valores locais, não secretos)
docs/                     # onboarding: o que FOI construído (mantido pelo doc-sync)
.husky/                   # hooks de git: pre-commit (gitleaks + lint-staged), commit-msg (commitlint), pre-push (check)
.claude/agents/           # definições de agentes
.claude/agent-memory/     # memória dos agentes (versionada)
scripts/require-ci.mjs    # trava: deploy:production só com CI definido
.github/workflows/       # CI: checks.yml (reutilizável), pull-request.yml (deploy dev), main.yml (deploy produção)
scripts/smoke-health.sh   # smoke pós-deploy: exige /api/health 200 em ~60s
.nvmrc                    # Node 24 (local e CI)
wrangler.jsonc            # 3 ambientes: local (topo), env.dev, env.production [protegido]
src/app/                  # rotas (App Router) — layout.tsx, page.tsx, globals.css (boilerplate), api/health, api/auth/[...nextauth], api/interno/limpeza (POST da limpeza diária, só com CRON_SECRET)
  (public)/               # catálogo público + sacola          [planejado]
  painel/                 # área das administradoras: entrar/ (pública) e (protegido)/ (layout, page, bfcache-reload, categorias/ com lista, nova, [id]/renomear, [id]/remover; produtos/ com lista, novo (cadastro em 2 passos: cadastro-produto.tsx; sugestao.tsx com useSugestao e AvisoSugestao; textos-sugestao.ts sem dependências, FR-034), [id], [id]/editar, [id]/remover, [id]/fotos (gerenciar-fotos.tsx), _fotos/ com escolher-foto, recorte-foto, lista-fotos, usar-envio e tipos); painel/fotos/[arquivo]/route.ts (GET da foto, guard por sessão)
src/components/ui/        # componentes base — única fonte de primitivos (button, campo-texto, area-texto, selecao, caixa-marcacao, mensagem-campo, aviso); campo-texto, area-texto e selecao têm a prop opcional dica
src/test/conformance/     # testes que negam por padrão: guard (painel-guard, categorias-guard, produtos-paginas-guard, fotos-rota-guard) e acesso (categorias-acesso, produtos-acesso, fotos-acesso, ia-acesso)
cloudflare/               # worker próprio (SF12): worker.ts (fetch do OpenNext + scheduled da limpeza) e open-next-worker.d.ts; wrangler `main` e `alias` apontam para cá [protegido]
src/lib/db/               # Drizzle: client, health, schema (categorias, produtos, produto_fotos, fotos_envio, ia_uso), categorias.ts, produtos.ts e fotos.ts e ia-uso.ts (SQL), contexto.ts, locks.ts, erros-pg.ts, migrations/ (0000, 0001, 0002) [protegido]
src/lib/categorias/       # categorias: index.ts (barrel só leitura), painel.ts, actions.ts, nome/erros/mensagens
src/lib/produtos/         # produtos: actions.ts, sugestao.ts (sugerirProduto, SF13), painel.ts, validacao/preco/codigo, erros/mensagens
src/lib/fotos/aparelho/   # pipeline da foto só de navegador (SF8): detectar-tipo, suporta-webp, recortar, codificar, preparar-foto; sem server-only/r2/db/auth/next (fronteira.test.ts)
src/lib/fotos/            # fotos: actions.ts (pedirEnvio, confirmarEnvio, adicionarFoto, trocarFoto, removerFoto, moverFoto), conjunto.ts (regra pura), limpeza.ts (executarLimpeza, SF12), tipos, mensagens, erros, validacao, exibicao (server-only)
src/test/db/              # fixtures de integração (categorias-fixtures.ts, produtos-fixtures.ts, fotos-fixtures.ts) e medição (produtos-medicao.int.test.ts)
vitest.probe.config.mts   # só o probe do db.batch e o fk-produtos (CI do PR, Neon dev)
vitest.perf.config.mts    # só a medição de produtos (npm run test:perf, banco local)
vitest.ia.config.mts      # só a medição manual da IA (npm run test:ia; src/lib/ai/medicao.ia.test.ts)
drizzle.config.ts         # config do drizzle-kit
src/lib/auth/             # Auth.js v5 + allowlist + guards; UI importa só de index.ts (barrel) [protegido]
src/lib/r2/               # R2: config, chaves, assinatura (aws4fetch), bucket (binding, servirObjeto) e verificacao/ (JPEG/WebP); só o barrel é importável (eslint) [protegido]
infra/r2/                 # CORS dos buckets, versionado (cors.dev.json aplicado; cors.production.json com origem a preencher)
src/lib/ai/               # integração OpenAI (SF13): config (modelo/esforço provisórios, limites), sugestao (pedirSugestao: fetch à Responses API), index (barrel server-only); api.openai.com e OPENAI_API_KEY só aqui [protegido]
```

Estado atual: **Fase 0 concluída + feature 001 (autenticação das administradoras) + feature 002 (categorias) + feature 003 (produtos) em produção (merge pelo PR #17, deploy pelo PR #18)** — scaffold do OpenNext + Spec Kit adotado (constitution v1.0.0, ADRs 001, 002, 003, 004, 006, 007 e 008) + testes Vitest (unitários + integração + conformidade do guard) + hooks de git (husky, gitleaks, commitlint) + stack local de banco em Docker (`db:*`) + Drizzle/driver HTTP do Neon com `/api/health` (tabela `categorias` e migration `0000` com seed; ADR-008: sem transação interativa, `db.batch` + lock advisory) + `wrangler.jsonc` com ambientes local/dev/production + CI no GitHub Actions (checks, deploy dev por PR, deploy produção no push para main; runners fixados em `ubuntu-24.04`, migração para o Ubuntu 26 pendente em PR próprio) + produção no ar (`/api/health` = 200) + branch `main` protegido (relato do mantenedor) + login Google com allowlist `ADMIN_EMAILS`, sessão JWT e painel protegido sem middleware (`next-auth@5.0.0-beta.32`); CRUD de categorias no painel (`/painel/categorias`) e de produtos (`/painel/produtos`: cadastro, lista com filtro e busca, esgotado/disponível, destaque com teto de 8; tabelas `produtos`/`produto_fotos`, migration `0001`, FK `ON DELETE RESTRICT`), com probe do `db.batch` e da FK de produtos no Neon dev pelo CI; catálogo público, fotos, sacola e IA ainda não existem em produção. Feature 004 (fotos de produto) em andamento no branch `feature/004-fotos-produto`: SF1 (schema: migration `0002` com `fotos_envio`, `ia_uso`, `produtos.fotos_versao`/`fotos_operacao` e extensões de `produto_fotos`; locks 4001/4002), SF2 (verificação do arquivo, JPEG/WebP por lista de permitidos), SF3 (R2: config Zod, chaves, URL pré-assinada via `aws4fetch` 1.0.20, binding; `R2_S3_ENDPOINT` por ambiente; CORS de dev em `infra/r2/`; `wrangler` fixado em 4.147.0), SF4/SF5 (SQL de envios e do conjunto em `src/lib/db/fotos.ts`; `inserirComFotos` em `produtos.ts`) e SF6/SF7 (actions `pedirEnvio`/`confirmarEnvio` em `src/lib/fotos/`; rota `GET /painel/fotos/[arquivo]` com sessão, 404 e 304; `criarProduto` exige 1 a 3 fotos; `removerProduto` apaga os objetos no R2; lint proíbe importar submódulos de `@/lib/r2/*`; SF7: regra pura `conjunto.ts` e as actions `adicionarFoto`/`trocarFoto`/`removerFoto`/`moverFoto`), SF8 (pipeline da foto no aparelho em `src/lib/fotos/aparelho/`: tipo pelos bytes, orientação, recorte 1:1 de 400 a 1200 px, WebP ou JPEG até 1 MiB; `prepararFoto` nunca rejeita) e SF9 (telas do cadastro em `/painel/produtos/novo`: passos Fotos → Dados, recorte com `react-easy-crop` 6.2.3, envio direto ao R2, lista com capa, arrasto e botões; roteiro T093 aprovado no `preview`) foram construídas. O cadastro pela tela agora envia de 1 a 3 fotos. SF10 feita (prova com Chrome Android real no dev: lista de permitidos e regra do ICC fechadas, fixture do perfil ICC em `src/test/fixtures/fotos/aparelho/`, modo registro desligado de novo; Safari iOS, HEIF e os apertos só de JPEG ficam como risco aceito, a refazer antes de liberar uma administradora com iPhone). SF11 feita (tela `/painel/produtos/[id]/fotos`: adicionar, trocar, mover e remover gravam na hora, uma ação por vez; fotos no detalhe com a capa primeiro, capa na lista e aviso na remoção do produto; `src/lib/produtos/painel.ts` expõe `capaUrl`, `fotos` e `fotosVersao` com URL pela rota com sessão; roteiro T107 aprovado no `preview`). SF12 feita (limpeza diária: worker próprio `cloudflare/worker.ts`, cujo `scheduled` chama em processo `POST /api/interno/limpeza` com `CRON_SECRET` e lança se o status não for 200; OpenNext importado como `open-next-worker` por `alias` no `wrangler.jsonc`, `.open-next` no exclude do `tsconfig`; `executarLimpeza` em `src/lib/fotos/limpeza.ts` expira envios com 24 h ou mais e apaga órfãos do R2 com mais de 25 h; cron `0 6 * * *`, 03:00 de Brasília, nos três ambientes; `CRON_SECRET` cadastrado no dev, produção na SF15; prova local aprovada). Pendência T118b: prova do cron no `roseshop-dev` (PR #19); conferir em roseshop-dev → Logs após a primeira execução das 03:00 de Brasília; falha ou ausência volta ao tech-lead antes da SF15. SF13 feita (IA só no servidor, sem tela: `src/lib/ai/` com `pedirSugestao` por `fetch` à Responses API, `store: false`, saída estrita, 20 s; contador `consumirSugestao` em `src/lib/db/ia-uso.ts` sob o lock 4002 (30 por pessoa e 100 por dia de Brasília, consumido antes da chamada); action `sugerirProduto` em `src/lib/produtos/sugestao.ts`, que não grava nada; modelo `gpt-6-luna` e esforço `none` PROVISÓRIOS; teto de gasto do projeto OpenAI dev aplicado em 2026-10-12, T014b fechada; medição manual em `npm run test:ia`). SF14 feita (tela da sugestão no passo Dados do cadastro: `novo/sugestao.tsx` e `novo/textos-sugestao.ts`; pedida uma vez ao tocar em "Continuar", preenche só campos vazios com o marcador "Sugestão — confira", que some ao editar; prop `dica` nos primitivos de campo; roteiros do preview e do dev aprovados na T139, 2026-10-12). Risco aceito (T139): `sugerirProduto` mediu 21 ms de CPU no dev, acima dos 10 ms do Workers Free, sem falha; sinal de alerta é o Erro 1102 nos logs, contingência é o Workers Paid com emenda da constitution VII (ADR-010; `docs/operacao.md`). Próximo passo: SF15 da feature 004 (fechamento: quickstart completo, produção, docs e observação), com as pendências T118b (prova do cron no roseshop-dev), T120a (prova técnica do gpt-5.4-mini por `node .spike/r5.mjs`), T132 (medição com fotos reais, humano) e T133 (escolha de modelo e esforço com os números, aprovada pelo humano, e emenda do ADR-010 em commit próprio). Pendências de entrega: observação da mãe usando sozinha (SC-005 da 001, SC-007 da 002, SC-001 a SC-003 da 003) e e-mail dela no ADMIN_EMAILS de produção.

## Fluxo de feature (obrigatório)

1. A feature tem spec em `specs/NNN-nome/spec.md` com critérios de aceite
   Given/When/Then. Sem spec aprovada, não há implementação.
2. Testes escritos a partir dos critérios de aceite, ANTES da implementação
   (Red → Green → Refactor).
3. Implementação mínima para os testes passarem.
4. "Pronto" = lint + typecheck + testes passando, com output real.
5. Commit da feature em Conventional Commits, sem trailer de co-autoria.
6. Se a mudança for significativa (ver "Documentação"), acionar o
   `doc-sync-onboarding` e commitar os docs em commit próprio (`docs(...)`).

## Spec Kit

Constitution em `.specify/memory/constitution.md` (versionada; emenda só por
humano, via `/speckit-constitution`). Ordem por feature:

1. `/speckit-specify` → `specs/NNN-nome/spec.md`
2. `/speckit-clarify` → resolve ambiguidades antes do plano (**obrigatório**)
3. `/speckit-plan` → `plan.md` (passa pelo Constitution Check)
4. `/speckit-tasks` → `tasks.md`
5. `/speckit-analyze` → consistência entre spec, plano e tarefas (**obrigatório**)
6. Implementação segundo o "Fluxo de feature" acima (testes primeiro).

## Documentação

`docs/` é mantido pelo agente `doc-sync-onboarding` (`.claude/agents/`).
Ele roda **só em mudança estrutural ou significativa**, nunca a cada alteração.

**Aciona** quando a mudança inclui ao menos um destes itens:
- Feature da spec fechada (FXX concluída).
- Schema Drizzle ou migration alterados.
- Rota, Server Action ou route handler criados ou removidos.
- Variável de ambiente ou binding novo/alterado (`wrangler.jsonc`, `.dev.vars.example`).
- Dependência de runtime adicionada ou removida.
- Mudança em zona protegida (auth, R2, IA, middleware).
- Mudança em build, deploy, CI ou hooks de git.
- Diretório ou módulo novo em `src/`.

**Não aciona**: texto/copy, estilo, refactor interno sem mudança de contrato,
mudança só em testes, bump patch de dependência, fix que não altera comportamento
documentado. Várias pequenas mudanças acumuladas ou pedido explícito do humano
também justificam uma sync.

## Orquestração de agentes

Delegue pelo tipo de tarefa e passe o `model` correspondente. Em dúvida sobre
complexidade, suba um nível.

### Tech-lead — `opus`
- Decide quem executa cada tarefa e revisa tudo antes de considerar concluído.
- Escreve/atualiza specs e ADRs (com aprovação humana).
- Dono exclusivo das zonas protegidas: `src/lib/auth/`, `src/lib/r2/`,
  `src/lib/ai/`, `src/lib/db/` (schema e migrations), `src/middleware.ts`,
  `wrangler.jsonc`, `.dev.vars*`.
- Define o contrato que os demais consomem: tipos, Server Actions, componentes base.
- Decide quando acionar o `doc-sync-onboarding`, pelos critérios acima.

### Escritor de testes — `sonnet`
- Escreve testes (unitários, integração, componentes) a partir dos critérios
  de aceite da spec.
- Não altera código de produção. Achou bug: reporta ao tech-lead.

### Dev de UI — `sonnet`
- Implementa páginas e componentes em `src/app/(public)/` e `src/app/painel/`.
- Consome apenas o contrato existente: Server Actions, tipos e
  `src/components/ui/`. Não cria action, não importa Drizzle, não toca `src/lib/`.
- Precisa de campo ou action que não existe: para e reporta.

### Documentação — `sonnet` (`doc-sync-onboarding`)
- Sincroniza `docs/` e as seções "Comandos"/"Estrutura" deste arquivo.
- Nunca edita `specs/`, código, testes ou configs.

### Redator — `haiku`
- Mensagens de commit, changelog, atualização de `README.md`.
- Ajustes triviais de texto/typo/classe Tailwind simples.

### Júnior — `haiku`
- Rodar comandos de verificação (`lint`, `typecheck`, `test`, `preview`) e
  devolver o output real, sem interpretar como sucesso o que falhou.
- Não instala dependências, não cria/edita `.dev.vars*`, não roda migrations.
  Tarefa que se revelar complexa ou crítica volta ao tech-lead.

## Regras gerais

- Merge em `main` só por humano.
- Nunca simular output de comando. Sem output real, a tarefa não está concluída.
- Agentes não commitam documentação sozinhos: propõem a mensagem, o humano commita.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
