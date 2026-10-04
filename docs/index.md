# Roseshop — Documentação de onboarding

Este diretório descreve **o que foi construído** no Roseshop até agora. Para o
que o sistema **deve** fazer (produto, regras, decisões de arquitetura), a
fonte de verdade é `specs/` (specs de feature e ADRs) e a constitution em
`.specify/memory/constitution.md` — comece sempre por ela.

> Estado atual do projeto: **Fase 0 concluída** (fundação de infraestrutura:
> scaffold OpenNext, banco local, testes, hooks, CI, ambientes dev e produção no
> ar, branch `main` protegido) e **feature 001 (autenticação das
> administradoras) implementada**: login com Google, allowlist e painel
> protegido, sem middleware. Catálogo, sacola, upload de imagem e IA ainda não
> existem; por isso este índice é deliberadamente curto: só existem documentos
> para o que já tem código real por trás.

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
   instalação do gitleaks no WSL, banco local em Docker (`db:*`), Drizzle/migrations, testes unitários e de integração, auditoria de dependências (ADR-007), CI (GitHub Actions, environments, secrets do GitHub), dependências com ressalvas (`esbuild`,
   `allowScripts`), administradoras e emergência de acesso (trocar `AUTH_SECRET`), diagnóstico de login, bindings, ambientes e deploy (`deploy:dev`, `deploy:production` com trava de CI), secrets, variáveis de ambiente e troubleshooting.
4. **[features/F01-autenticacao.md](./features/F01-autenticacao.md)** — login
   das administradoras: rotas, como a proteção funciona sem middleware (guards e
   teste de conformidade), módulos de `src/lib/auth/` e pegadinhas.

## O que ainda não existe aqui

Não há `docs/database.md`: o schema Drizzle continua vazio (a sessão de login é
JWT, sem tabelas), então não há tabelas para documentar. Esse documento deve ser
criado pelo `doc-sync-onboarding` na primeira sync que tocar schema de banco.
Também só existe doc de feature para a F01; as demais serão criadas ao serem
fechadas.
