# Roseshop — Documentação de onboarding

Este diretório descreve **o que foi construído** no Roseshop até agora. Para o
que o sistema **deve** fazer (produto, regras, decisões de arquitetura), a
fonte de verdade é `specs/` (specs de feature e ADRs) e a constitution em
`.specify/memory/constitution.md` — comece sempre por ela.

> Estado atual do projeto: **Fase 0 — scaffold**. Só existe o esqueleto gerado
> pelo template do OpenNext para Cloudflare; nenhuma feature de produto
> (catálogo, sacola, login, painel, upload de imagem, IA) foi implementada.
> Por isso este índice é deliberadamente curto: só existem documentos para o
> que já tem código real por trás.

## Ordem de leitura sugerida

1. **`.specify/memory/constitution.md`** — propósito do produto, stack fechada,
   regras de segurança e arquitetura, UX da persona administradora e as três
   camadas de ambiente. Seções numeradas em algarismos romanos (I a VIII).
2. **[architecture.md](./architecture.md)** — como o código atual (scaffold
   Next.js + OpenNext) builda e viraria um Worker Cloudflare: stack, estrutura
   de pastas, pipeline de build/deploy, bindings já configurados.
3. **[operacao.md](./operacao.md)** — comandos do dia a dia (`dev`, `preview`,
   `lint`, `typecheck`, `test`, `check`, `cf-typegen`), infra de testes
   (Vitest), dependências com ressalvas (`esbuild`, `allowScripts`), bindings, variáveis de ambiente e troubleshooting.

## O que ainda não existe aqui

Não há `docs/database.md` (sem schema Drizzle ainda) nem `docs/features/`
(nenhuma feature implementada; as specs agora vivem em `specs/NNN-nome/`,
ainda sem nenhuma criada). Esses documentos
devem ser criados pelo `doc-sync-onboarding` na primeira sync que tocar
schema de banco ou fechar uma feature, respectivamente — não antes.
