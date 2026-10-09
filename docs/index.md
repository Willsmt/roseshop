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
> lista, busca, status e destaque de produtos no painel, ainda sem fotos.
> Catálogo público, sacola, upload de imagem e IA ainda não existem; por isso este índice é deliberadamente curto: só existem
> documentos para o que já tem código real por trás.

## Ordem de leitura sugerida

1. **`.specify/memory/constitution.md`** — propósito do produto, stack fechada,
   regras de segurança e arquitetura, UX da persona administradora e as três
   camadas de ambiente. Seções numeradas em algarismos romanos (I a VIII).
2. **[architecture.md](./architecture.md)** — como o código atual (scaffold
   Next.js + OpenNext) builda e viraria um Worker Cloudflare: stack, estrutura
   de pastas, pipeline de build/deploy, bindings já configurados.
3. **[operacao.md](./operacao.md)** — comandos do dia a dia (`dev`, `preview`,
   `lint`, `typecheck`, `test`, `check`, `cf-typegen`), infra de testes
   (Vitest), hooks de git (husky: gitleaks, lint-staged, commitlint, pre-push) e
   instalação do gitleaks no WSL, banco local em Docker (`db:*`), Drizzle/migrations (fluxo `db:up` → `db:migrate` → `test:int`), testes unitários, de integração e de desempenho (`test:perf`; inclui recuperação de execução interrompida e o probe do CI, que cobre também a FK de produtos), auditoria de dependências (ADR-007), CI (GitHub Actions, environments, secrets do GitHub), dependências com ressalvas (`esbuild`,
   `allowScripts`), administradoras e emergência de acesso (trocar `AUTH_SECRET`), diagnóstico de login, bindings, ambientes e deploy (`deploy:dev`, `deploy:production` com trava de CI), secrets, variáveis de ambiente e troubleshooting.
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

## O que ainda não existe aqui

Só há doc de feature para a F01, a F02 e a F03; as demais serão criadas ao serem
fechadas (catálogo público, fotos, sacola, upload, IA).
