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
# PENDENTE (Fase 0): npm run typecheck, npm test, npm run check, migrations Drizzle
```

Valide no `preview` tudo que toca runtime (bindings, R2, auth, IA): o `dev`
roda em Node e pode mascarar incompatibilidades do workerd.

## Estrutura

```
specs/                    # fonte de verdade: specs de feature (NNN-nome/) e ADRs (adr/)
.specify/                 # Spec Kit: constitution (memory/), templates e scripts
docs/                     # onboarding: o que FOI construído (mantido pelo doc-sync)
.claude/agents/           # definições de agentes
.claude/agent-memory/     # memória dos agentes (versionada)
src/app/                  # rotas (App Router) — hoje só layout.tsx, page.tsx, globals.css (boilerplate)
  (public)/               # catálogo público + sacola          [planejado]
  painel/                 # área das administradoras           [planejado]
src/components/ui/        # componentes base — única fonte de primitivos [planejado]
src/lib/db/               # schema e queries Drizzle            [planejado, protegido]
src/lib/auth/             # Auth.js + allowlist                 [planejado, protegido]
src/lib/r2/               # URLs pré-assinadas                  [planejado, protegido]
src/lib/ai/               # integração OpenAI                   [planejado, protegido]
```

Estado atual: scaffold do OpenNext + Spec Kit adotado (constitution v1.0.0, ADRs 002 e 006); nenhuma feature em `specs/NNN-nome/` ainda.

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
2. `/speckit-clarify` → resolve ambiguidades antes do plano
3. `/speckit-plan` → `plan.md` (passa pelo Constitution Check)
4. `/speckit-tasks` → `tasks.md`
5. `/speckit-analyze` → consistência entre spec, plano e tarefas
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
