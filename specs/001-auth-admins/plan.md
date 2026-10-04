# Implementation Plan: Autenticação das administradoras

**Branch**: `feature/001-auth-admins` | **Date**: 2026-10-03 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-auth-admins/spec.md`

## Summary

Login das três administradoras com Google (Auth.js v5, sessão JWT que expira entre 29 e
30 dias sem uso) e lista de autorizadas (`ADMIN_EMAILS`) lida a cada acesso. A
autorização é verificada no callback de login e de novo em cada layout, página, Server
Action e route handler, por guards em `src/lib/auth/`. Um teste de conformidade que nega
por padrão garante que todo `"use server"` e todo `route.ts` futuros usem esses guards. O painel desta feature é mínimo (`/painel/entrar`
e `/painel` com saudação e "Sair"). O catálogo público não é tocado e não ganha link
para o painel. Sem tabelas, sem migration, sem binding novo.

## Technical Context

**Language/Version**: TypeScript strict, Node 24 (build), runtime workerd (Cloudflare Workers via OpenNext 1.20.8)

**Primary Dependencies**: Next.js 16.3.8 (App Router); **novas (aprovadas, instaladas só na implementação)**: `next-auth@5.0.0-beta.32` (exata, R1), `zod` 4.x como dependência direta e `server-only@0.0.1` (exata) (R11)

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
| II. Stack fechada | Auth.js v5 (`5.0.0-beta.32` exata, aprovada) + Google + allowlist (ADR-003). Zod entra como dependência direta (aprovada), já prevista na tabela | OK |
| III.1 Segredos | Só em `.dev.vars` e `wrangler secret`; nenhum log com e-mail (R5) | OK |
| III.2 Allowlist em login E em cada rota/ação | `decideSignIn` no callback + `getAdminSession` (layouts) + `requireAdminPage` (páginas) + `requireAdminAction` (actions e route handlers) + teste de conformidade que nega por padrão (R7) | OK |
| III.3 Zod em toda fronteira | `ADMIN_EMAILS`, `callbackUrl`, `error`, `FormData` das actions, perfil do Google | OK |
| III.7 Zonas protegidas | `src/lib/auth/` é implementado pelo tech-lead. **Nenhum** `src/middleware.ts` (R2 = A, aprovada). `wrangler.jsonc` só recebe `nodejs_compat` se o preview exigir (pré-aprovado); `.dev.vars*` sem mudança | OK |
| IV. Arquitetura | Server Components; client só no recarregador de bfcache (R8); mutações via Server Actions; nenhum acesso a banco | OK |
| V. UX | Uma tarefa por tela, `Button` ≥ 48px / ≥ 16px, textos simples (contracts/auth.md), mobile-first | OK |
| VI. Qualidade | `npm run check` com output real; Conventional Commits sem co-autoria e com justificativa das dependências novas no corpo; README com as dependências novas | OK |
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
│   ├── guard.ts                      # getAdminSession, requireAdminPage, requireAdminAction, UnauthorizedError
│   ├── guard.test.ts                 # auth() mockado: sem sessão, e-mail removido, válida
│   ├── actions.ts                    # "use server": entrarComGoogle, sair (exceções públicas por função; demais exports exigem guard)
│   └── actions.test.ts
├── app/
│   ├── api/auth/[...nextauth]/route.ts   # export { GET, POST } de handlers
│   └── painel/
│       ├── entrar/page.tsx           # ui-dev: tela de entrada (pública)
│       ├── entrar/page.test.tsx      # test-writer
│       └── (protegido)/
│           ├── layout.tsx            # getAdminSession + moldura (saudação, "Sair") + recarregador bfcache
│           ├── layout.test.tsx
│           ├── bfcache-reload.tsx    # "use client", mínimo (R8)
│           ├── bfcache-reload.test.tsx
│           ├── page.tsx              # /painel: requireAdminPage("/painel") + saudação
│           └── page.test.tsx
│   ├── page.tsx                      # home pública (inalterada salvo T040)
│   └── page.test.tsx                 # sem link para o painel (US5-2)
├── components/ui/
│   ├── button.tsx                    # primitivo 48px/16px
│   └── button.test.tsx
├── next-config.test.ts               # headers no-store em /painel/:path*
└── test/conformance/
    └── painel-guard.test.ts          # nega por padrão, por função exportada: "use server" e route.ts sem guard (R7)
next.config.ts                        # header Cache-Control no-store em /painel/:path*
vitest.setup.ts                       # mock de "server-only" para os testes
```

**Structure Decision**: monolito Next.js existente. A autenticação fica isolada em
`src/lib/auth/`, a UI do painel em `src/app/painel/` e o grupo `(protegido)` separa
a tela pública de entrada das páginas que exigem sessão.

### Divisão de trabalho (para `/speckit-tasks`)

| Quem | O quê |
|------|-------|
| test-writer (sonnet) | Testes de `allowlist`, `callback-path`, `error-message`, `guard`, `config`, conformidade e da tela de entrada, **antes** da implementação, a partir dos critérios da spec |
| tech-lead (opus) | `src/lib/auth/*`, route handler, `next.config.ts`, `package.json` (deps + `npm audit --omit=dev`), mock de `server-only` em `vitest.setup.ts` |
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
| US3-5, US3-6 | `config.test.ts` (maxAge 30 d, updateAge 24 h) |
| US4-1, US4-2 | `layout.test.tsx` (botão "Sair" visível), `actions.test.ts` (`sair` sem confirmação), quickstart 5 |
| US4-3 | `next-config.test.ts` (no-store), `bfcache-reload.test.tsx`, quickstart 5 |
| US4-4 | `config.test.ts` (`strategy: "jwt"` e sem `adapter`), quickstart 5 como complemento |
| US5-1..3 | conformidade (nenhum guard fora de `/painel`), teste da home sem link para o painel, quickstart 1 |

## Decisões do humano (2026-10-03)

1. **R1: Auth.js.** `next-auth@5.0.0-beta.32` com versão exata (ADR-003).
2. **R2: middleware.** Opção A: nenhum `middleware.ts`/`proxy.ts`. Guard no layout, em
   cada página e em cada action, com teste de conformidade.
3. **R11: `zod` como dependência direta.** Aprovado. As dependências só são instaladas na
   implementação (tarefa própria); `npm audit --omit=dev` roda logo depois e o output
   real vai no relatório.
4. **R10: sem E2E com navegador.** A validação do OAuth real é manual, pelo quickstart.
5. **R12: `nodejs_compat`.** Pré-aprovado **somente** se o `preview` falhar e a única
   correção for acrescentar `"nodejs_compat"` às `compatibility_flags`. Qualquer outra
   mudança no `wrangler.jsonc` volta ao humano.
6. **R6: recusa e cancelamento.** Se o Google devolver o mesmo código para os dois casos,
   a tela usa uma única mensagem: "Não foi possível entrar com essa conta. Tente de novo
   ou use outra conta."

## Complexity Tracking

Sem violações da constitution a justificar.
