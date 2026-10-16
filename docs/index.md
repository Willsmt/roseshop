# Roseshop — Documentação de onboarding

Este diretório descreve **o que foi construído** no Roseshop até agora. Para o
que o sistema **deve** fazer (produto, regras, decisões de arquitetura), a
fonte de verdade é `specs/` (specs de feature e ADRs) e a constitution em
`.specify/memory/constitution.md` — comece sempre por ela.

> Estado atual do projeto: **Fase 0 concluída** (fundação de infraestrutura:
> scaffold OpenNext, banco local, testes, hooks, CI, ambientes dev e produção no
> ar, branch `main` protegido), **feature 001 (autenticação das
> administradoras)**: login com Google, allowlist e painel protegido, sem
> middleware, **feature 002 (categorias)**: primeira tabela do banco e
> telas de categorias no painel, e **feature 003 (produtos)**: cadastro,
> lista, busca, status e destaque de produtos no painel. A
> **feature 004 (fotos)** está construída (SF1 a SF14) e em fechamento (SF15),
> ainda **não em produção** (merge pendente): schema, verificação do arquivo, módulo R2,
> actions de envio e do conjunto, rota de exibição, cadastro com fotos, pipeline da foto no
> aparelho, telas do cadastro e da tela Fotos, limpeza diária e sugestão por IA (servidor e
> tela). A **feature 005 (catálogo público)** está construída (ramo FALLBACK: páginas
> dinâmicas, sem ISR) e pronta para o merge (PR #20), também **não em produção**: página
> inicial com destaques, filtro e "Carregar mais", detalhe com botão do WhatsApp, rota pública
> de fotos e `noindex`. A sacola ainda não existe; por isso este índice é deliberadamente
> curto: só existem documentos para o que já tem código real por trás.

## Ordem de leitura sugerida

1. **`.specify/memory/constitution.md`** — propósito do produto, stack fechada,
   regras de segurança e arquitetura, UX da persona administradora e as três
   camadas de ambiente. Seções numeradas em algarismos romanos (I a VIII).
2. **[architecture.md](./architecture.md)** — como o código atual (scaffold
   Next.js + OpenNext) builda e viraria um Worker Cloudflare: stack, estrutura
   de pastas, pipeline de build/deploy, bindings já configurados e o módulo R2
   (`src/lib/r2/`, feature 004 em andamento).
3. **[operacao.md](./operacao.md)** — comandos do dia a dia (`dev`, `preview`,
   `lint`, `typecheck`, `test`, `check`, `cf-typegen`), infra de testes
   (Vitest), hooks de git (husky: gitleaks, lint-staged, commitlint, pre-push) e
   instalação do gitleaks no WSL, banco local em Docker (`db:*`), Drizzle/migrations (fluxo `db:up` → `db:migrate` → `test:int`), testes unitários, de integração e de desempenho (`test:perf`; inclui recuperação de execução interrompida e o probe do CI, que cobre também a FK de produtos), auditoria de dependências (ADR-007), CI (GitHub Actions, environments, secrets do GitHub), dependências com ressalvas (`esbuild`, `wrangler` e `aws4fetch` fixados,
   `allowScripts`), R2 (chaves, endpoint, CORS, gravação de segredos sem expor o valor e revogação do token), limpeza diária (cron, `wrangler tail`), modo registro da verificação (desligado), limite de CPU do plano gratuito do Workers (risco aceito, Erro 1102), administradoras e emergência de acesso (trocar `AUTH_SECRET`), diagnóstico de login, bindings, ambientes e deploy (`deploy:dev`, `deploy:production` com trava de CI), secrets, variáveis de ambiente (incluindo `SITE_URL` e `WHATSAPP_NUMBER`), seeds do catálogo (`seed:*`), sinais e contingências do catálogo público (R2 Class A, compute do Neon, logs de 3 dias, troca do número do WhatsApp) e troubleshooting.
4. **[features/F01-autenticacao.md](./features/F01-autenticacao.md)** — login
   das administradoras: rotas, como a proteção funciona sem middleware (guards e
   teste de conformidade), módulos de `src/lib/auth/` e pegadinhas.
5. **[database.md](./database.md)** — schema Drizzle (tabelas `categorias`,
   `produtos`, `produto_fotos`, `fotos_envio` e `ia_uso`, função
   `categoria_chave`, migrations `0000` com seed, `0001` e `0002`), regras de
   integridade sem transação interativa (ADR-008), teto de 8 destaques e FK
   `ON DELETE RESTRICT`.
6. **[features/F02-categorias.md](./features/F02-categorias.md)** — cadastro de
   categorias no painel: rotas, actions, camadas (`src/lib/categorias/` e
   `src/lib/db/`), fronteira de acesso, fluxo de remoção e pegadinhas.
7. **[features/F03-produtos.md](./features/F03-produtos.md)** — produtos no
   painel: rotas e actions, camadas (`src/lib/produtos/`, `src/lib/db/produtos.ts`),
   concorrência otimista, destaque (teto de 8), busca com cursor, preço e
   pegadinhas.
8. **[features/F04-fotos.md](./features/F04-fotos.md)** — fotos de produto
   (construída, SF1 a SF14; fechamento SF15 e merge pendentes): telas do cadastro (Fotos → Dados), tela Fotos do produto existente, pipeline da foto no aparelho, prova com aparelho real, fluxo de envio e confirmação, actions do conjunto (adicionar,
   trocar, remover, mover), rota de exibição, limpeza diária (cron e worker próprio), sugestão por IA (servidor e tela do cadastro), cadastro com fotos, fronteira de acesso e pegadinhas.

9. **[features/F05-catalogo-publico.md](./features/F05-catalogo-publico.md)** — catálogo
   público (construída, pronta para o merge; ainda não em produção): rotas `/`, `/p/[codigo]`,
   `/fotos/[arquivo]` e `GET /api/catalogo/produtos`, módulo `src/lib/catalogo/`, restauração
   da lista ao voltar, seed de teste (`seed:local` e `seed:dev`) e pegadinhas. Cache, 503 e
   `noindex` em [architecture.md](./architecture.md#catálogo-público-feature-005); sinais de R2/Neon,
   CPU e troca do `WHATSAPP_NUMBER` em [operacao.md](./operacao.md#catálogo-público-sinais-e-contingências).

## O que ainda não existe aqui

Só há doc de feature para a F01 a F05 (a F04 e a F05 construídas, ainda não em produção); a
próxima será criada ao ser fechada (sacola).
