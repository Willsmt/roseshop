# Implementation Plan: Autenticação das administradoras

**Branch**: `feature/001-auth-admins` | **Date**: 2026-10-03 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-auth-admins/spec.md`

## Summary

Login das três administradoras com Google (Auth.js v5, sessão JWT de 30 dias renovada
com o uso) e allowlist `ADMIN_EMAILS` lida a cada acesso. A autorização é verificada
no callback de login e de novo em cada layout, página e Server Action do painel, por
guards em `src/lib/auth/`. Um teste de conformidade garante que toda página e ação
futura do painel use esses guards. O painel desta feature é mínimo (`/painel/entrar`
e `/painel` com saudação e "Sair"). O catálogo público não é tocado e não ganha link
para o painel. Sem tabelas, sem migration, sem binding novo.

## Technical Context

**Language/Version**: TypeScript strict, Node 24 (build), runtime workerd (Cloudflare Workers via OpenNext 1.20.8)

**Primary Dependencies**: Next.js 16.3.8 (App Router); **novas**: `next-auth@5.0.0-beta.32` (exata, ver research R1) e `zod` 4.x como dependência direta (R11)

**Storage**: N/A. Sessão em cookie JWT; allowlist em secret por ambiente

**Testing**: Vitest + Testing Library (unitários e componentes); validação manual do OAuth real no `preview` e no dev online (quickstart)

**Target Platform**: Cloudflare Workers (local `preview`, `roseshop-dev`, `roseshop`); navegador de celular como alvo principal

**Project Type**: aplicação web (Next.js monolito)

**Performance Goals**: entrada em ≤ 2 toques e < 15 s (SC-001); guard sem I/O de rede (só verificação do JWT e parse da allowlist)

**Constraints**: free tier da Cloudflare (CPU por request baixa); sem segredos/e-mails em log ou bundle; nenhum código experimental em zona de segurança

**Scale/Scope**: 3 usuárias; 2 telas; 2 Server Actions; 2 guards

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Princípio | Verificação | Status |
|-----------|-------------|--------|
| I. Fonte de verdade | Spec com Given/When/Then e clarificações; cada critério vira teste (unitário ou roteiro do quickstart) | OK |
| II. Stack fechada | Auth.js v5 + Google + allowlist (ADR-003). Zod entra como dependência direta, já prevista na tabela. v5 ainda `beta` (R1) | OK, com decisão humana pendente (R1) |
| III.1 Segredos | Só em `.dev.vars` e `wrangler secret`; nenhum log com e-mail (R5) | OK |
| III.2 Allowlist em login E em cada rota/ação | `decideSignIn` no callback + `requireAdminPage`/`requireAdminAction` + teste de conformidade (R7) | OK |
| III.3 Zod em toda fronteira | `ADMIN_EMAILS`, `callbackUrl`, `error`, `FormData` das actions, perfil do Google | OK |
| III.7 Zonas protegidas | `src/lib/auth/` é implementado pelo tech-lead. **Nenhum** `src/middleware.ts` na opção recomendada (R2). `wrangler.jsonc` e `.dev.vars*` sem mudança | OK (se R2 = A) |
| IV. Arquitetura | Server Components; client só no recarregador de bfcache (R8); mutações via Server Actions; nenhum acesso a banco | OK |
| V. UX | Uma tarefa por tela, `Button` ≥ 48px / ≥ 16px, textos simples (contracts/auth.md), mobile-first | OK |
| VI. Qualidade | `npm run check` com output real; Conventional Commits sem co-autoria; README com as dependências novas | OK |
| VII. Plataforma | Sem processamento pesado; sem recurso pago | OK; risco `nodejs_compat` a validar no preview (R12) |
| VIII. Ambientes | `AUTH_SECRET` próprio por ambiente; validação no dev online antes de produção | OK |

**Re-check pós-design**: sem violações. Complexity Tracking vazio.

## Project Structure

### Documentation (this feature)

```text
specs/001-auth-admins/
├── spec.md
├── plan.md              # este arquivo
├── research.md          # Fase 0 (R1–R12)
├── data-model.md        # Fase 1
├── quickstart.md        # Fase 1
├── contracts/auth.md    # Fase 1: contrato para ui-dev e test-writer
├── checklists/requirements.md
└── tasks.md             # /speckit-tasks (não criado aqui)
```

### Source Code (repository root)

```text
src/
├── lib/auth/                         # ZONA PROTEGIDA: tech-lead
│   ├── allowlist.ts                  # parseAllowlist, isAllowedEmail, decideSignIn (puras)
│   ├── allowlist.test.ts
│   ├── callback-path.ts              # safeCallbackPath (pura)
│   ├── callback-path.test.ts
│   ├── error-message.ts              # loginNoticeFromError (pura)
│   ├── error-message.test.ts
│   ├── config.ts                     # config do Auth.js: Google, callbacks, pages, session 30d, trustHost
│   ├── config.test.ts                # maxAge/updateAge, pages, callbacks delegando às funções puras
│   ├── index.ts                      # NextAuth(config) → handlers, auth, signIn, signOut
│   ├── guard.ts                      # requireAdminPage, requireAdminAction, UnauthorizedError
│   ├── guard.test.ts                 # auth() mockado: sem sessão, e-mail removido, válida
│   └── actions.ts                    # "use server": entrarComGoogle, sair
├── app/
│   ├── api/auth/[...nextauth]/route.ts   # export { GET, POST } de handlers
│   └── painel/
│       ├── entrar/page.tsx           # ui-dev: tela de entrada (pública)
│       ├── entrar/page.test.tsx      # test-writer
│       └── (protegido)/
│           ├── layout.tsx            # requireAdminPage + botão "Sair" + recarregador bfcache
│           ├── bfcache-reload.tsx    # "use client", mínimo (R8)
│           └── page.tsx              # /painel: saudação
├── components/ui/
│   └── button.tsx                    # primitivo 48px/16px
└── test/conformance/
    └── painel-guard.test.ts          # toda page/action do painel usa o guard (R7)
next.config.ts                        # header Cache-Control no-store em /painel/:path*
```

**Structure Decision**: monolito Next.js existente. A autenticação fica isolada em
`src/lib/auth/`, a UI do painel em `src/app/painel/` e o grupo `(protegido)` separa
a tela pública de entrada das páginas que exigem sessão.

### Divisão de trabalho (para `/speckit-tasks`)

| Quem | O quê |
|------|-------|
| test-writer (sonnet) | Testes de `allowlist`, `callback-path`, `error-message`, `guard`, `config`, conformidade e da tela de entrada, **antes** da implementação, a partir dos critérios da spec |
| tech-lead (opus) | `src/lib/auth/*`, route handler, `next.config.ts`, `package.json` (deps + `npm audit --omit=dev`) |
| ui-dev (sonnet) | `button.tsx`, `/painel/entrar`, `(protegido)/layout.tsx`, `page.tsx`, `bfcache-reload.tsx`, consumindo `contracts/auth.md` |
| redator (haiku) | Revisão dos textos e README (dependências novas, como incluir/remover administradora) |
| junior (haiku) | `npm run check`, `npm audit --omit=dev`, `npm run preview` com output real |
| doc-sync-onboarding | Ao fechar: rota nova, zona protegida, dependências, procedimento de emergência em `docs/operacao.md` |

### Mapa critério → teste

| Critério | Teste |
|----------|-------|
| US1-1, US1-3, US1-4 | `guard.test.ts`, `callback-path.test.ts`, quickstart 3–4 |
| US1-2 | `entrar/page.test.tsx` (sem senha, um botão principal) |
| US1-5 | `error-message.test.ts`, quickstart 8 |
| US2-1..4 | `allowlist.test.ts` (`decideSignIn`), `entrar/page.test.tsx`, quickstart 6 |
| US2-5 | `config.test.ts` (log sem dados no callback), quickstart 7 |
| US3-1..4 | `guard.test.ts`, conformidade, quickstart 2, 9 |
| US3-5, US3-6 | `config.test.ts` (maxAge 30 d, updateAge) |
| US4-1..4 | teste do layout (botão "Sair" visível), `actions` (`sair` sem confirmação), quickstart 5 |
| US5-1..3 | conformidade (nenhum guard fora de `/painel`), teste da home sem link para o painel, quickstart 1 |

## Pontos que precisam de decisão humana (antes de `/speckit-tasks`)

1. **R1: versão do Auth.js.** O v5 ainda é `beta` (`5.0.0-beta.32`). Recomendado: usar o
   v5 com versão exata, como diz o ADR-003. Alternativa: v4 `latest`, que exige
   emendar o ADR-003.
2. **R2: middleware/proxy.** Recomendado: nenhum; o guard fica em cada layout,
   página e ação, com teste de conformidade. Alternativas: `middleware.ts` edge
   (descontinuado no Next 16) ou `proxy.ts` (experimental no OpenNext, e exige emendar
   a constitution III.7).
3. **R11: `zod` como dependência direta** (exigido pela constitution II e III.3).
   Confirmar a inclusão; o `npm audit --omit=dev` roda na instalação.
4. **R10: sem E2E com navegador nesta feature.** O OAuth real é validado manualmente
   pelo quickstart. Playwright seria dependência nova (decisão futura).
5. **R12: risco de runtime.** Se o `preview` mostrar que falta `nodejs_compat`, a correção
   toca o `wrangler.jsonc` (zona protegida) e volta para aprovação.

## Complexity Tracking

Sem violações da constitution a justificar.
