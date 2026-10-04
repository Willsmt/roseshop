---
description: "Tarefas da feature 001: autenticação das administradoras"
---

# Tasks: Autenticação das administradoras

**Input**: documentos de design em `/specs/001-auth-admins/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/auth.md, quickstart.md

**Tests**: obrigatórios. A constitution I exige que cada critério Given/When/Then tenha pelo
menos um teste automatizado, e o fluxo do projeto é Red → Green → Refactor. Em cada fase, as
tarefas de teste (test-writer) vêm antes da implementação e **devem falhar** antes que a
implementação comece.

**Organization**: por user story, na ordem de prioridade da spec (P1: US1, US2, US3,
US5; P2: US4).

## Format: `[ID] [P?] [Story] Descrição (executor)`

- **[P]**: pode rodar em paralelo (arquivos diferentes, sem dependência pendente)
- **[Story]**: user story da spec (US1…US5)
- **Executor**: `tech-lead` (opus; dono exclusivo de `src/lib/auth/`, `next.config.ts`,
  `package.json`, `wrangler.jsonc`), `test-writer` (sonnet), `ui-dev` (sonnet), `redator`
  (haiku), `junior` (haiku), `humano`
- O tech-lead revisa toda entrega de outro agente antes de marcar a tarefa como concluída.
- `ui-dev` importa só de `@/lib/auth` e `@/components/ui`, nunca de `next-auth`
  diretamente (contracts/auth.md).
- Regras de UI de todas as telas (contracts/auth.md): texto ≥ 16px (`text-base` ou maior,
  nunca `text-sm`/`text-xs`), alvos de toque ≥ 48px (só `Button`), **um único** botão
  `variant="primary"` por tela.

## Path Conventions

Monolito Next.js. Código em `src/`, testes ao lado do código (`*.test.ts(x)`, Vitest,
`npm test`). Os testes de conformidade ficam em `src/test/conformance/`.

---

## Phase 1: Setup

**Purpose**: dependências aprovadas (R1, R11) e linha de base verde

- [x] T001 Rodar `npm run check` antes de qualquer mudança e devolver o output real, como linha de base (junior)
- [x] T002 Instalar com versão **exata** (sem `^`) `next-auth@5.0.0-beta.32` e `server-only@0.0.1`, e `zod` como dependência direta, em `package.json`/`package-lock.json`. Logo depois, rodar `npm audit --omit=dev` e registrar o output real no relatório (ADR-007). Se o audit acusar vulnerabilidade, parar e reportar ao humano (tech-lead)

---

## Phase 2: Foundational (pré-requisitos bloqueantes)

**Purpose**: núcleo de segurança do `src/lib/auth/`: allowlist, regra de login,
retorno seguro, instância do Auth.js, guards e botão base. Sem isso, nenhuma story
pode ser entregue com segurança, porque qualquer conta Google entraria.

**⚠️ CRITICAL**: nenhuma user story começa antes do fim desta fase.

### Testes (escrever primeiro e confirmar que falham)

- [ ] T003 Adicionar `vi.mock("server-only", () => ({}))` em `vitest.setup.ts`. O pacote lança erro fora da condição `react-server`, então sem o mock os testes de `config.ts`, `guard.ts` e `actions.ts` não carregam (test-writer)
- [ ] T004 [P] Testes de `parseAllowlist`, `isAllowedEmail` e `decideSignIn` em `src/lib/auth/allowlist.test.ts` (test-writer). Casos obrigatórios:
  - formato bruto "e-mails separados por vírgula";
  - `trim()` + `toLowerCase()` dos dois lados (US2-3, FR-003);
  - descarta entradas vazias e e-mails inválidos; remove duplicatas;
  - `undefined` ou `""` → conjunto vazio → ninguém entra (FR-014);
  - `decideSignIn` recusa e-mail ausente, `emailVerified !== true` (US2-4) e e-mail fora da lista (US2-1), e aceita e-mail verificado na lista (US1-1);
  - a allowlist é lida a cada chamada, sem cache de módulo: trocar o valor entre duas chamadas muda o resultado (US3-3).
- [ ] T005 [P] Testes de `safeCallbackPath` em `src/lib/auth/callback-path.test.ts` (test-writer). Aceita `/painel` e `/painel/...`. Para qualquer outro valor retorna `/painel`: `//evil.com`, `https://evil.com`, `/\evil`, `/`, `/painelx`, `javascript:`, não-string, `undefined`. Cobre FR-009, US1-4 e o caso-limite de retorno externo.
- [ ] T006 [P] Testes da config em `src/lib/auth/config.test.ts` (test-writer):
  - provedor só Google;
  - `session.strategy === "jwt"` **e** ausência de `adapter` na config. Cobre US4-4 (sair só neste aparelho: não há sessão no servidor para encerrar em outros aparelhos) e FR-017;
  - `session.maxAge` = 30 dias em segundos e `session.updateAge` = 24 h em segundos (FR-016: expira entre 29 e 30 dias sem uso; US3-5, US3-6);
  - `pages.signIn` e `pages.error` = `/painel/entrar`; `trustHost` = `true`;
  - callback `redirect` usa `safeCallbackPath`;
  - callback `signIn` delega a `decideSignIn` com o `email` e o `email_verified` do perfil Google;
  - callbacks `jwt`/`session` expõem só `email` e `name` (FR-013, sem papéis).
- [ ] T007 [P] Testes de `getAdminSession`, `requireAdminPage` e `requireAdminAction` em `src/lib/auth/guard.test.ts`, com `auth()` e `redirect` mockados (test-writer):
  - `getAdminSession`: retorna `{ email, name }` com sessão autorizada; `null` sem sessão, com sessão inválida ou com e-mail fora da lista **atual**; **nunca** chama `redirect`;
  - `requireAdminPage(currentPath)`: sem sessão → `redirect("/painel/entrar?callbackUrl=" + encodeURIComponent(safeCallbackPath(currentPath)))` (US3-1, US1-4, FR-006). Com `currentPath` externo → `callbackUrl=%2Fpainel`;
  - sessão sem e-mail ou com valor inválido → igual a sem sessão (US3-4);
  - sessão válida com e-mail removido de `ADMIN_EMAILS` → igual a sem sessão (US3-3);
  - allowlist vazia → recusa (FR-014);
  - `requireAdminAction` lança `UnauthorizedError` sem devolver dados (US3-2, FR-007);
  - sessão válida e autorizada → `requireAdminPage`/`requireAdminAction` retornam `{ email, name }`.
- [ ] T008 [P] Testes do `Button` em `src/components/ui/button.test.tsx` (test-writer): renderiza `<button>`, repassa `type`, tem as classes que garantem `min-height` de 48px, `font-size` de no mínimo 16px e largura total no celular (FR-012), com variantes `primary`/`secondary`.

### Implementação

- [ ] T009 [P] Implementar `parseAllowlist`, `isAllowedEmail` e `decideSignIn` com Zod em `src/lib/auth/allowlist.ts`. São funções puras, **sem** `server-only`, que leem o valor bruto passado como argumento (data-model.md) (tech-lead)
- [ ] T010 [P] Implementar `safeCallbackPath` em `src/lib/auth/callback-path.ts`, pura, sem `server-only` (tech-lead)
- [ ] T011 Implementar a config do Auth.js em `src/lib/auth/config.ts` e a instância em `src/lib/auth/index.ts` (exporta `handlers`, `auth`, `signIn`, `signOut`), ambos começando com `import "server-only"`, conforme T006. Ler `ADMIN_EMAILS`, `AUTH_SECRET`, `AUTH_GOOGLE_ID` e `AUTH_GOOGLE_SECRET` de `process.env` em tempo de request (R12). Sem `adapter`. Depende de T009 e T010 (tech-lead)
- [ ] T012 Criar o route handler `src/app/api/auth/[...nextauth]/route.ts` exportando `GET`/`POST` de `handlers`. Depende de T011 (tech-lead)
- [ ] T013 Implementar `getAdminSession`, `requireAdminPage`, `requireAdminAction` e `UnauthorizedError` em `src/lib/auth/guard.ts`, começando com `import "server-only"`. Todos reverificam a allowlist **atual** a cada chamada. `getAdminSession` nunca redireciona. Depende de T011 (tech-lead)
- [ ] T014 [P] Implementar o `Button` em `src/components/ui/button.tsx` com Tailwind (48px/16px, largura total no celular) (ui-dev)
- [ ] T015 Revisar T014 e confirmar T003 a T008 verdes com `npm test` (output real via junior) (tech-lead)

**Checkpoint**: núcleo de auth pronto, testes da fase verdes.

---

## Phase 3: User Story 1 - Entrar no painel com a conta Google (Priority: P1) 🎯 MVP

**Goal**: a administradora autorizada toca em "Entrar com Google" e chega a `/painel`
com saudação, sem senha.

**Independent Test**: com a conta autorizada, abrir `/painel/entrar` no celular (ou com o
DevTools no modo mobile) no `preview`, tocar no botão e chegar a `/painel` vendo "Olá, …"
(quickstart passos 3 e 4).

### Testes para US1 (escrever primeiro)

- [ ] T016 [P] [US1] Testes de `loginNoticeFromError` em `src/lib/auth/error-message.test.ts` (test-writer):
  - sem código → `null`;
  - `AccessDenied` → `"recusada"`;
  - qualquer outro código ou valor não-string → `"falhou"` (US1-5).
- [ ] T017 [P] [US1] Testes da action `entrarComGoogle` em `src/lib/auth/actions.test.ts`, com `signIn` mockado (test-writer):
  - chama `signIn("google", { redirectTo })` com `redirectTo = safeCallbackPath(callbackUrl)` (US1-4);
  - `callbackUrl` externo vira `/painel`;
  - valida o `FormData` com Zod.
- [ ] T018 [P] [US1] Testes da tela de entrada em `src/app/painel/entrar/page.test.tsx` (test-writer):
  - com `auth()` mockado sem sessão: exatamente um botão `variant="primary"` ("Entrar com Google"), nenhum `input[type=password]`, título "Painel da loja" (US1-2);
  - nenhum elemento com classe `text-sm` ou `text-xs` (FR-012);
  - campo oculto `callbackUrl` já sanitizado;
  - `error=OAuthCallbackError` → texto "Não foi possível entrar agora. Tente de novo em instantes." (US1-5);
  - com sessão autorizada → `redirect` para `safeCallbackPath(callbackUrl)` (US1-3).
- [ ] T019 [P] [US1] Testes da página inicial do painel em `src/app/painel/(protegido)/page.test.tsx` (test-writer):
  - chama `requireAdminPage("/painel")` antes de renderizar;
  - mostra "Olá, {nome}" ou "Olá, {e-mail}" quando não há nome (US1-1);
  - nenhum `text-sm`/`text-xs` (FR-012).
- [ ] T020 [P] [US1] Testes do layout protegido em `src/app/painel/(protegido)/layout.test.tsx` (test-writer):
  - chama `getAdminSession()` e **não** chama `redirect`;
  - com sessão autorizada, renderiza a moldura e `children`;
  - com `null`, renderiza só `children`, sem nome, e-mail nem moldura (H1).

### Implementação para US1

- [ ] T021 [US1] Implementar `loginNoticeFromError` em `src/lib/auth/error-message.ts`, pura, sem `server-only` (tech-lead)
- [ ] T022 [US1] Implementar a Server Action `entrarComGoogle` em `src/lib/auth/actions.ts` (`"use server"` + `import "server-only"`) e reexportar em `src/lib/auth/index.ts` (tech-lead)
- [ ] T023 [US1] Implementar `/painel/entrar` em `src/app/painel/entrar/page.tsx`: Server Component, `<form action={entrarComGoogle}>` com `Button`, textos de contracts/auth.md, mobile-first. Fica fora do grupo `(protegido)` (ui-dev)
- [ ] T024 [US1] Implementar `src/app/painel/(protegido)/layout.tsx` (`getAdminSession()`; moldura só com sessão autorizada; sem redirect) e `src/app/painel/(protegido)/page.tsx` (`requireAdminPage("/painel")` + saudação) (ui-dev)
- [ ] T025 [US1] Revisar T023 e T024 contra contracts/auth.md e o princípio V. Rodar `npm run check` e `npm run preview` (via junior, output real). Executar os passos 2 a 4 do quickstart com a conta autorizada (tech-lead + humano para o login real)

**Checkpoint**: US1 funcional e testada.

---

## Phase 4: User Story 2 - Recusar contas não autorizadas (Priority: P1)

**Goal**: uma conta test user fora da lista não entra e vê uma mensagem gentil com a
opção de usar outra conta. A recusa é logada sem dados pessoais.

**Independent Test**: no `preview`, entrar com uma conta **test user do cliente OAuth fora
de `ADMIN_EMAILS`**. Esperado: a mensagem de recusa e nenhum cookie de sessão
(quickstart passos 6 e 7).

### Testes para US2 (escrever primeiro)

- [ ] T026 [P] [US2] Ampliar `src/lib/auth/config.test.ts` (test-writer):
  - na recusa, o callback `signIn` retorna `false` e chama `console.warn("auth.signin.recusado")` **sem** segundo argumento e sem e-mail/nome em nenhum argumento (US2-5, FR-015);
  - com a allowlist vazia, também chama `console.warn("auth.allowlist.vazia")` sem dados.
- [ ] T027 [P] [US2] Ampliar `src/lib/auth/actions.test.ts`: `trocarConta=1` → `signIn("google", { redirectTo }, { prompt: "select_account" })` (US2-2) (test-writer)
- [ ] T028 [P] [US2] Ampliar `src/app/painel/entrar/page.test.tsx` (test-writer):
  - `error=AccessDenied` → "Esta conta Google não tem acesso ao painel. Tente entrar com outra conta." e exatamente um botão `variant="primary"` ("Entrar com outra conta", com `trocarConta=1`) (US2-1, US2-2, FR-012);
  - nenhum texto da tela contém "erro", "403", "OAuth", "callback", "allowlist", "AccessDenied" (FR-008);
  - nenhum `text-sm`/`text-xs`.

### Implementação para US2

- [ ] T029 [US2] Implementar no callback `signIn` (`src/lib/auth/config.ts`) os logs de recusa e de allowlist vazia, sem payload (tech-lead)
- [ ] T030 [US2] Implementar `trocarConta` → `prompt: "select_account"` em `src/lib/auth/actions.ts` (tech-lead)
- [ ] T031 [US2] Implementar o estado "recusada" em `src/app/painel/entrar/page.tsx` (mensagem + "Entrar com outra conta") (ui-dev)
- [ ] T032 [US2] Verificar no `preview` qual código de erro o `@auth/core` gera ao **cancelar** na tela do Google e registrar o resultado em `specs/001-auth-admins/research.md` (R6). Se for o mesmo da recusa (`AccessDenied`), aplicar a decisão do humano: mensagem única "Não foi possível entrar com essa conta. Tente de novo ou use outra conta." + botão "Entrar com outra conta". Nesse caso, ajustar nesta ordem: primeiro os testes T016/T018/T028 (test-writer), depois `error-message.ts` (tech-lead), depois `entrar/page.tsx` (ui-dev) (tech-lead coordena + humano faz o login real)
- [ ] T033 [US2] Executar os passos 6 a 8 do quickstart no `preview` e conferir no output do `wrangler`/console que o log de recusa não tem e-mail (tech-lead + humano)

**Checkpoint**: US1 e US2 funcionando de forma independente.

---

## Phase 5: User Story 3 - Proteger todas as páginas e ações do painel (Priority: P1)

**Goal**: nenhuma página, ação ou rota protegida funciona sem sessão autorizada **no
momento do acesso**. Isso fica garantido por construção, porque a conformidade nega por padrão.

**Independent Test**: sem sessão, abrir `/painel` direto; com sessão, remover o e-mail
da allowlist e recarregar (quickstart passos 2 e 9).

### Testes para US3 (escrever primeiro)

- [ ] T034 [P] [US3] Teste de conformidade **que nega por padrão** em `src/test/conformance/painel-guard.test.ts` (test-writer). Usa leitura de arquivos com `node:fs`, sem dependência nova, e percorre **todo `src/`**. Mantém no topo do arquivo uma constante `EXCECOES_PUBLICAS` **por função exportada, no formato `arquivo#export`, nunca por arquivo**, com o motivo de cada item em comentário:
  - `src/app/api/auth/[...nextauth]/route.ts#GET` e `#POST`: handlers do Auth.js;
  - `src/app/api/health/route.ts#GET`: verificação de saúde;
  - `src/lib/auth/actions.ts#entrarComGoogle`: entrar não pode exigir sessão;
  - `src/lib/auth/actions.ts#sair`: sair sem sessão não tem efeito.

  A verificação é uma função pura do próprio teste (ex.: `encontrarSemGuard(arquivos, excecoes)`), que recebe o conteúdo dos arquivos e devolve as violações no formato `arquivo#export`. Ela roda contra o `src/` real (esperado: nenhuma violação) **e** contra fixtures em memória, com dois casos obrigatórios:
  - um `src/lib/auth/actions.ts` de fixture com `entrarComGoogle`, `sair` e uma função exportada extra sem `requireAdminAction` → a violação `src/lib/auth/actions.ts#<extra>` é reportada;
  - uma exceção listada que não existe nos arquivos → falha ("exceção inexistente").

  Falha se:
  - alguma função exportada de arquivo com `"use server"` (no topo ou inline em função) não chamar `requireAdminAction` e não estiver nas exceções, **função por função**;
  - algum handler exportado de `route.ts` (`GET`, `POST`, `PUT`, `PATCH`, `DELETE`) não chamar `requireAdminAction` e não estiver nas exceções;
  - algum `page.tsx` em `src/app/painel/(protegido)/` não chamar `requireAdminPage(`;
  - algum `layout.tsx` em `src/app/painel/(protegido)/` não chamar `getAdminSession(` ou `requireAdminPage(`;
  - existir `page.tsx` em `src/app/painel/` fora de `(protegido)/` além de `entrar/page.tsx`;
  - existir `src/middleware.ts` ou `src/proxy.ts` (ADR-003, adendo);
  - um item da lista de exceções (`arquivo#export`) não existir mais, para a lista não ficar desatualizada.

  Cobre US3-1, US3-2, FR-005, FR-007 e SC-003.
- [ ] T035 [P] [US3] Teste dos headers em `src/next-config.test.ts` (test-writer). Importa `next.config.ts` com `@opennextjs/cloudflare` mockado e verifica que `headers()` devolve `Cache-Control: private, no-store` para `/painel/:path*` e nada para `/` (US4-3, R8).
- [ ] T036 [P] [US3] Teste do recarregador em `src/app/painel/(protegido)/bfcache-reload.test.tsx` (test-writer). Disparar `pageshow` com `persisted: true` → `location.reload` chamado uma vez. Com `persisted: false` → não chamado. Desmontar → o listener é removido (US4-3, R8, C2).

### Implementação para US3

- [ ] T037 [US3] Adicionar `headers()` em `next.config.ts` com `Cache-Control: private, no-store` para `/painel/:path*` (tech-lead)
- [ ] T038 [US3] Criar `src/app/painel/(protegido)/bfcache-reload.tsx` (`"use client"`, recarrega no `pageshow` com `persisted`) e incluí-lo em `(protegido)/layout.tsx` (ui-dev)
- [ ] T039 [US3] Executar os passos 2 e 9 do quickstart no `preview` (remover o e-mail do `.dev.vars` é tarefa **do humano**; agentes não editam `.dev.vars`) (tech-lead + humano)

**Checkpoint**: US1, US2 e US3 funcionando.

---

## Phase 6: User Story 5 - Catálogo público continua aberto (Priority: P1)

**Goal**: as páginas públicas seguem acessíveis sem sessão e sem link para o painel.

**Independent Test**: sem sessão, abrir `/` e `/api/health` no `preview` (quickstart passo 1).

### Testes para US5 (escrever primeiro)

- [ ] T040 [P] [US5] Ampliar `src/test/conformance/painel-guard.test.ts` (test-writer): `src/app/page.tsx` e `src/app/layout.tsx` não importam `@/lib/auth` (a página pública não depende de sessão), e `src/app/api/health/route.ts#GET` está em `EXCECOES_PUBLICAS`. Cobre US5-1, US5-3 e FR-011.
- [ ] T041 [P] [US5] Teste da home em `src/app/page.test.tsx` (test-writer): não renderiza `a[href^="/painel"]` nem `a[href^="/api/auth"]` nem texto "Entrar"/"Login" (US5-2, FR-018)

### Implementação para US5

- [ ] T042 [US5] Ajustar `src/app/page.tsx` só se T041 falhar (hoje é o boilerplate, sem link para o painel); não mexer em visual (ui-dev)
- [ ] T043 [US5] Executar o passo 1 do quickstart no `preview` (junior, output real do `curl -sI` em `/` e `/api/health`)

**Checkpoint**: todas as stories P1 prontas.

---

## Phase 7: User Story 4 - Sair do painel (Priority: P2)

**Goal**: botão "Sair" sempre visível nas páginas protegidas. Encerra só a sessão deste
aparelho, sem confirmação, e volta para a tela de entrada.

**Independent Test**: conectada, tocar em "Sair" e usar o "voltar" do navegador
(quickstart passo 5).

### Testes para US4 (escrever primeiro)

- [ ] T044 [P] [US4] Ampliar `src/lib/auth/actions.test.ts` (test-writer): `sair` chama `signOut({ redirectTo: "/painel/entrar" })` uma vez, sem etapa de confirmação (US4-2, FR-017)
- [ ] T045 [P] [US4] Ampliar `src/app/painel/(protegido)/layout.test.tsx` (test-writer):
  - com sessão autorizada, renderiza um `<form action={sair}>` com `Button` "Sair" visível, sem `details`/`dialog`/menu (US4-1, FR-010);
  - nenhum `text-sm`/`text-xs` (FR-012);
  - "Sair" **não** é o botão `primary` se a página já tiver um (no máximo um `primary` por tela).

### Implementação para US4

- [ ] T046 [US4] Implementar a Server Action `sair` em `src/lib/auth/actions.ts`, reexportada por `@/lib/auth` (tech-lead)
- [ ] T047 [US4] Adicionar o botão "Sair" (`variant="secondary"`) na moldura de `src/app/painel/(protegido)/layout.tsx` (ui-dev)
- [ ] T048 [US4] Executar o passo 5 do quickstart no `preview` e, como validação complementar ao T006, verificar US4-4 (sair no celular não derruba o computador) com dois navegadores (tech-lead + humano)

**Checkpoint**: todas as stories prontas.

---

## Phase 8: Polish & Cross-Cutting

- [ ] T049 Contingência R12: **só se** o `preview` falhar e a única correção for acrescentar `"nodejs_compat"` em `compatibility_flags` do `wrangler.jsonc`, aplicar (pré-aprovado). Qualquer outra mudança no `wrangler.jsonc` → parar e reportar ao humano (tech-lead)
- [ ] T050 [P] Revisar todos os textos das telas (contracts/auth.md, tabela "Textos") quanto a linguagem simples e ausência de jargão (redator, revisão do tech-lead)
- [ ] T051 [P] Atualizar `README.md`: dependências novas (`next-auth` beta exata, `zod`, `server-only`), como incluir/remover administradora (`ADMIN_EMAILS` + `wrangler secret put`), procedimento de emergência (trocar o `AUTH_SECRET` do ambiente), orientação de salvar `/painel` como atalho no celular (redator)
- [ ] T052 Conferir o mapa critério → teste do `plan.md`: cada cenário de US1-1 a US5-3 tem pelo menos um teste automatizado (constitution I), e o quickstart é só complemento; registrar as lacunas (tech-lead)
- [ ] T053 Rodar `npm run check`, `npm audit --omit=dev` e `npm run preview` e devolver o output real (junior)
- [ ] T054 Rodar `graphify update .` (tech-lead)
- [ ] T055 Propor ao humano a mensagem de commit em Conventional Commits, sem `Co-Authored-By`, com **justificativa no corpo para cada dependência nova** (`next-auth@5.0.0-beta.32` exata: ADR-003 e adendo; `zod`: constitution II/III.3; `server-only`: impedir vazamento de segredos para o bundle). O humano commita (tech-lead)
- [ ] T056 Acionar o `doc-sync-onboarding` (rota nova, zona protegida, dependências, procedimento de emergência em `docs/operacao.md`); docs em commit próprio `docs(...)`, feito pelo humano (tech-lead)
- [ ] T057 Abrir PR → deploy no dev online pelo CI → executar o quickstart completo no dev com o celular da dona, incluindo o passo 10 e o teste de emergência no dev. Merge só pelo humano (humano)

---

## Checkpoints com o humano (obrigatórios quando a implementação for liberada)

Ao fim de cada fase abaixo, parar, mostrar o output **real** e só seguir com o ok do humano:

- **Fim da Phase 1 (Setup)**: output do `npm audit --omit=dev` (T002).
- **Fim da Phase 2 (Foundational)**: output do `npm run check` (T015).
- **Fim da Phase 3 (US1, MVP)**: output do `npm run check` e do `npm run preview` (T025).

## Dependencies & Execution Order

- **Setup (T001–T002)** → **Foundational (T003–T015)** → stories.
- Dentro de cada fase: testes (test-writer) → implementação `src/lib/auth` (tech-lead) → UI (ui-dev) → verificação.
- **US1 (Phase 3)** depende só da Foundational. É o MVP.
- **US2 (Phase 4)** depende da US1, porque estende `entrar/page.tsx` e `actions.ts`.
- **US3 (Phase 5)** depende da US1, porque o layout `(protegido)` já existe.
- **US5 (Phase 6)** depende da Foundational e da T034 (o arquivo de conformidade); pode rodar em paralelo à US2.
- **US4 (Phase 7)** depende da US1 (layout).
- **Polish** depende de todas.

### Arquivos compartilhados (sem [P] entre si)

`src/lib/auth/actions.ts` (T022, T030, T046), `src/lib/auth/config.ts` (T011, T029),
`src/app/painel/entrar/page.tsx` (T023, T031, T032), `src/app/painel/(protegido)/layout.tsx`
(T024, T038, T047), `src/test/conformance/painel-guard.test.ts` (T034, T040),
`src/lib/auth/actions.test.ts` (T017, T027, T044), `src/app/painel/(protegido)/layout.test.tsx`
(T020, T045).

## Parallel Examples

```text
# Foundational, testes (test-writer; T003 primeiro, depois em lote):
T004 allowlist.test.ts | T005 callback-path.test.ts | T006 config.test.ts | T007 guard.test.ts | T008 button.test.tsx

# Foundational, implementação:
T009 allowlist.ts | T010 callback-path.ts | T014 button.tsx (ui-dev)

# US1, testes:
T016 error-message.test.ts | T017 actions.test.ts | T018 entrar/page.test.tsx | T019 (protegido)/page.test.tsx | T020 (protegido)/layout.test.tsx

# US3, testes:
T034 conformidade | T035 next-config.test.ts | T036 bfcache-reload.test.tsx
```

## Implementation Strategy

1. **MVP** = Setup + Foundational + US1. A regra de allowlist (`decideSignIn`) já está na
   Foundational, então mesmo o MVP nunca deixa uma conta não autorizada entrar.
2. Em seguida, US2 (mensagem de recusa e log) e US3 (conformidade que nega por padrão,
   cache e bfcache), que fecham os requisitos de segurança.
3. US5 confirma que o catálogo segue público. US4 entrega o "Sair".
4. Polish, revisão e entrega ao humano (commit, doc-sync, PR, validação no dev).
5. A feature só fica "pronta" com `npm run check` verde (output real) e com o quickstart
   executado no `preview` e no dev online.
