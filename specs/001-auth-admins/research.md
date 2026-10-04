# Research: Autenticação das administradoras (001)

**Data**: 2026-10-03 | **Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

Cada item: Decisão / Justificativa / Alternativas. Os itens marcados **[DECIDIDO PELO HUMANO
2026-10-03]** foram aprovados pelo humano antes do `/speckit-tasks`.

---

## R1. Versão do Auth.js **[DECIDIDO PELO HUMANO 2026-10-03]**

Output real de `npm view next-auth dist-tags` em 2026-10-03:

```
{
  canary: '3.24.0-canary.0',
  next: '4.0.0-next.26',
  'next-auth-3': '3.29.10',
  experimental: '0.0.0-manual.2824fa11',
  latest: '4.24.15',
  beta: '5.0.0-beta.32'
}
```

O v5 **continua `beta`** (`5.0.0-beta.32`, publicado em 2026-07-20). O `latest` é o v4.
Os peerDependencies do `5.0.0-beta.32` aceitam `next ^16.0.0` e `react ^19`, e ele
depende de `@auth/core 0.41.3`.

- **Decisão (aprovada)**: `next-auth@5.0.0-beta.32` **com versão exata** (sem `^`),
  conforme o ADR-003. Atualizar só de forma deliberada, olhando o changelog.
- **Justificativa**: o v5 foi feito para o App Router (`auth()` funciona em Server
  Components, Server Actions e route handlers), roda em runtimes Web (workerd) e é o que
  o ADR-003 decidiu. A linha beta é usada em produção há anos. A versão exata elimina
  surpresas entre betas.
- **Alternativas**:
  - `next-auth@4.24.15` (`latest`): estável, mas pensado para Pages Router e
    `getServerSession`. A integração com App Router e workerd é pior, e seria
    preciso mudar o ADR-003.
  - Esperar o v5 estável: bloqueia a feature por tempo indeterminado.

## R2. Onde fica a primeira barreira (middleware / proxy) **[DECIDIDO PELO HUMANO 2026-10-03: opção A]**

Fatos verificados no repositório:
- O Next 16 descontinuou `middleware.ts` e passou a usar `proxy.ts`
  (`node_modules/next/dist/docs/01-app/02-guides/upgrading/version-16.md`, linha 612).
  O `proxy` roda **só em runtime Node**. O `middleware` continua aceito, com aviso de
  descontinuação, e é o único caminho para runtime `edge`.
- O `@opennextjs/cloudflare` 1.20.8 avisa no build:
  *"Node.js middleware support is experimental in cloudflare, and not officially
  maintained by OpenNext maintainers. Use at your own risk."*
  (`dist/cli/build/build.js`, linha 68).
- A constitution (III.7) protege `src/middleware.ts` pelo nome.

Opções:

| Opção | Descrição | Prós | Contras |
|-------|-----------|------|---------|
| **A (recomendada)** | **Sem middleware/proxy.** Barreira em cada ponto: layout protegido, cada `page.tsx` e cada Server Action chamam o guard de `src/lib/auth/` | Nada experimental. A defesa já é obrigatória em cada ponto (III.2), e o guard faz exatamente isso. Nenhum custo de CPU em requests públicas (catálogo) | Sem filtro central. A garantia de "toda página/ação" depende de disciplina, então é coberta por um teste de conformidade (R7) |
| B | `src/middleware.ts` (runtime edge), filtro otimista por cookie + guard em cada ponto | Filtro central; caminho que o OpenNext suporta oficialmente | Convenção descontinuada no Next 16 (vai sumir numa versão futura). Roda em toda request, inclusive no catálogo, a menos que o `matcher` seja ajustado |
| C | `src/proxy.ts` (Node) + guard em cada ponto | Convenção atual do Next 16 | Experimental e sem manutenção no OpenNext/Cloudflare. A constitution cita `middleware.ts`, então a zona protegida precisaria de emenda |

- **Decisão (aprovada)**: opção A. Não haverá `src/middleware.ts` nem `src/proxy.ts`
  nesta feature.
- **Justificativa da A**: a spec exige verificação em cada página e ação de qualquer
  forma. A barreira central seria só otimização de UX (redirecionar antes de
  renderizar), e o layout protegido já cobre isso. Evitar código experimental em zona
  de segurança.

## R3. Sessão: estratégia e validade

- **Decisão**: sessão JWT (ADR-003), `maxAge` = 30 dias, `updateAge` = 24 h.
- **Justificativa**: na clarificação, o humano escolheu "30 dias, renovados a cada uso". Com
  `updateAge` de 24 h, o cookie é reemitido no máximo uma vez por dia. Por isso a
  expiração efetiva fica **entre 29 e 30 dias sem uso**, janela aceita pelo humano no
  pós-analyze (FR-016 reescrita; US3-6 usa "intervalos menores que 29 dias"). Renovar a
  cada request multiplicaria escritas de cookie sem ganho.
- **US4-4 (sair só neste aparelho)**: é consequência da estratégia JWT sem adapter (não há
  sessão no servidor para encerrar em outros aparelhos). O teste de config afirma
  `session.strategy === "jwt"` **e** ausência de `adapter`. O passo do quickstart
  continua como validação complementar (decisão do humano, C1).
- **Alternativas**: `updateAge: 0` (reemite em toda request; mais `Set-Cookie`, sem
  benefício); sessão em banco (contraria ADR-003, exigiria tabelas).

## R4. Revogação imediata e emergência

- **Decisão**: o guard consulta o valor **atual** de `ADMIN_EMAILS` a cada chamada e
  compara com o e-mail do token. Remover o e-mail do secret bloqueia no próximo acesso
  (US3-3, FR-005).
- **Emergência**: trocar `AUTH_SECRET` do ambiente invalida todos os tokens. Esse é um
  procedimento operacional, a documentar em `docs/operacao.md` pelo doc-sync.
- **Atualizar secret sem mudar código** (FR-004): `wrangler secret put ADMIN_EMAILS --env <amb>`
  cria uma nova versão do Worker sem alterar código e sem passar pelo CI. Já está documentado em
  `docs/operacao.md`.

## R5. Regras de autorização no login

- **Decisão**: o callback `signIn` delega para uma função pura
  `decideSignIn({ email, emailVerified }, allowlistRaw)`, que retorna `true` ou `false`.
  Recusa se: e-mail ausente, `email_verified !== true`, allowlist vazia/ausente (falha
  fechada, FR-014) ou e-mail fora da lista. A normalização é `trim` + `toLowerCase` dos
  dois lados (FR-003). O parse da allowlist usa Zod (string → lista de e-mails válidos;
  entradas inválidas são descartadas; lista vazia = ninguém entra).
- **Log**: na recusa, `console.warn("auth.signin.recusado")` sem payload. O horário vem
  do próprio log da plataforma (Workers Observability, já habilitado no `wrangler.jsonc`).
  Allowlist ausente gera um aviso distinto (`auth.allowlist.vazia`), também sem dados
  (Edge Case 1, FR-015).
- **Alternativas**: checar só no guard (viola III.2); logar o e-mail (rejeitado na
  clarificação Q4).

## R6. Telas e mensagens de erro

- **Decisão**: `pages.signIn` e `pages.error` do Auth.js apontam para `/painel/entrar`.
  Essa página lê `?error=` e `?callbackUrl=` (validados com Zod) e mostra:
  - `AccessDenied` → mensagem de recusa (US2) + botão "Entrar com outra conta".
  - qualquer outro código (cancelamento no Google, Google fora do ar, `Configuration`
    etc.) → "Não foi possível entrar agora. Tente de novo em instantes." + botão
    "Entrar com Google".
  - sem `error` → só o botão "Entrar com Google".
- "Entrar com outra conta" envia `prompt=select_account` ao Google, para o seletor de
  contas aparecer mesmo com uma conta já escolhida.
- **A verificar na implementação** (no `preview`): qual código de erro o
  `@auth/core 0.41.3` gera quando a pessoa cancela no Google.
- **Decisão do humano (2026-10-03) caso o código seja o mesmo** para recusa e
  cancelamento: **não** criar parâmetro próprio. Usar uma mensagem única e gentil para os
  dois casos: "Não foi possível entrar com essa conta. Tente de novo ou use outra conta.",
  com o botão "Entrar com outra conta". Se os códigos forem diferentes, valem as duas
  mensagens acima. O resultado da verificação fica registrado aqui antes do commit.
- **Resultado verificado (T032, 2026-10-04, `preview` local, login real pelo humano)**:
  - Cancelar na tela do Google: o Google volta para `/api/auth/callback/google?error=access_denied`
    **sem o parâmetro `iss`**. O `oauth4webapi` falha na validação do `iss` antes de
    reconhecer o erro do provedor, o `@auth/core` registra `CallbackRouteError` (tipo que não
    é seguro para o cliente) e redireciona para **`/painel/entrar?error=Configuration`**. A
    previsão pela leitura do código (`OAuthCallbackError`) não se confirmou.
  - Conta fora da lista: **`/painel/entrar?error=AccessDenied`**.
  - Os códigos são **diferentes**. Por isso valem as duas mensagens (recusa e falha), e a
    mensagem única da decisão do humano não se aplica. `loginNoticeFromError` já trata qualquer
    código diferente de `AccessDenied` como `"falhou"`, então nenhum código, teste ou texto mudou.
  - Consequência: no log do Worker, um cancelamento aparece como `[auth][error]
    CallbackRouteError` com a causa `response parameter "iss" (issuer) missing`. É ruído
    esperado, não falha de configuração. Uma falha real de configuração também chega à tela
    como `error=Configuration`, com a mesma mensagem genérica.
- **Log de recusa verificado (T033, mesma sessão)**: o callback `signIn` registrou
  `["auth.signin.recusado"]` (um argumento só). O `@auth/core` registrou
  `[auth][error] AccessDenied: AccessDenied`. Nenhum log do dia continha `@`, ou seja, não
  há e-mail no log, confirmado por consulta SQL na observabilidade local do `wrangler dev`.

## R7. Garantia de "toda página e ação protegida" (SC-003)

- **Decisão**: três camadas:
  1. `src/app/painel/(protegido)/layout.tsx` chama `getAdminSession()` (verifica, nunca
     redireciona) e só mostra a moldura com nome/e-mail e "Sair" se a sessão estiver
     autorizada. No Next 16, layout e página renderizam em paralelo e o layout não
     impede a página de rodar (`node_modules/next/dist/docs/01-app/02-guides/authentication.md`,
     "Layouts and auth checks"). Um redirect no layout disputaria com o da página e
     poderia perder o `callbackUrl` (US1-4).
  2. Cada `page.tsx` em `(protegido)` chama `requireAdminPage("<caminho>")`, que é quem
     redireciona com o `callbackUrl` correto.
  3. Toda Server Action e todo route handler começam com `await requireAdminAction()`.
     Route handlers respondem 401 sem corpo em `UnauthorizedError`.
- **Teste de conformidade, que nega por padrão** (unitário, sem dependência nova; decisão do humano,
  H2): percorre **todo `src/`**. Falha se:
  - alguma função exportada de arquivo com `"use server"` (no topo ou inline) não chamar
    `requireAdminAction`, **função por função**;
  - algum handler exportado de `route.ts` (`GET`, `POST` etc.) não chamar `requireAdminAction`;
  - algum `page.tsx` em `(protegido)` não chamar `requireAdminPage`;
  - algum `layout.tsx` em `(protegido)` não chamar `getAdminSession` ou `requireAdminPage`.

  A única saída é a **lista explícita de exceções públicas, por função exportada** (nunca
  por arquivo), mantida no próprio teste (aprovada pelo humano em 2026-10-03):
  - `src/app/api/auth/[...nextauth]/route.ts#GET` e `#POST`: handlers do Auth.js;
  - `src/app/api/health/route.ts#GET`: verificação de saúde;
  - `src/lib/auth/actions.ts#entrarComGoogle`: entrar não pode exigir sessão;
  - `src/lib/auth/actions.ts#sair`: sair sem sessão não tem efeito.

  Qualquer outra função exportada nesses mesmos arquivos precisa do guard. A lógica de
  verificação é uma função pura do próprio teste, exercitada também contra fixtures em
  memória. Um caso prova que uma função extra sem guard em `src/lib/auth/actions.ts` faz o
  teste falhar, e outro prova que uma exceção que não existe mais também faz o teste falhar.
- **Alternativas**: confiar só em revisão (frágil); E2E com browser (exige dependência
  nova, ver R10).

## R8. Botão "voltar" após sair (US4-3)

- **Decisão**: as respostas de `/painel/*` levam `Cache-Control: private, no-store`
  (header em `next.config.ts`). As páginas dinâmicas que leem cookies já não são
  cacheadas. Um Client Component mínimo no layout protegido recarrega a página
  quando ela vem do bfcache (evento `pageshow` com `persisted`). Assim o guard roda de
  novo e a pessoa vai para a entrada.
- **Justificativa**: navegadores recentes podem guardar no bfcache páginas com
  `no-store`. O `pageshow` fecha essa brecha sem lógica de negócio no client.
- **Teste** (C2): teste de componente que dispara `pageshow` com `persisted: true` e
  espera `location.reload()`; com `persisted: false`, não recarrega.
- **Verificado (2026-10-04, `preview` local, humano)**: depois de "Sair", o "voltar" do
  navegador não mostrou o painel (US4-3). O `curl -I` confirmou `Cache-Control: private,
  no-store` em `/painel` e `/painel/entrar`, e a home pública manteve o próprio cache.

## R9. Retorno após login (FR-009)

- **Decisão**: função pura `safeCallbackPath(raw)` aceita só caminhos relativos que
  começam com `/painel` (sem `//`, sem esquema, sem `\`). Qualquer outro valor vira
  `/painel`. Ela é usada no `redirect` callback do Auth.js e na página de entrada.

## R10. Testes

- **Unitários (Vitest, já no projeto)**: allowlist/`decideSignIn`, `safeCallbackPath`,
  guards (com `auth()` mockado: sem sessão, sessão de e-mail removido, sessão válida),
  config de sessão (30 d), mapeamento de erro → mensagem, componentes das telas
  (Testing Library: sem campo de senha, um botão principal, textos sem jargão) e o teste de
  conformidade (R7).
- **Validação manual no `preview` e no dev online** (quickstart): fluxo real com
  Google. O login OAuth real não é automatizável sem credenciais de teste.
- **E2E com navegador (Playwright)**: fora desta feature (decisão do humano,
  2026-10-03). A validação do OAuth real é manual, pelo quickstart.

## R11. Dependências novas

- `next-auth@5.0.0-beta.32` (exata): ADR-003 e adendo de 2026-10-03.
- `server-only@0.0.1` (exata; `latest` em 2026-10-03): falha o build se um módulo de
  servidor de `src/lib/auth/` (`config.ts`, `index.ts`, `guard.ts`, `actions.ts`) for
  importado por um Client Component. Isso protege `AUTH_SECRET`/`ADMIN_EMAILS` contra o
  vazamento para o bundle (FR-015). Aprovado pelo humano (M2). No Vitest, `server-only` é
  mockado no setup, porque o pacote lança erro fora da condição `react-server`.
- `zod` como dependência direta (hoje só transitiva): a constitution II exige Zod em
  toda fronteira (query `callbackUrl`/`error`, `ADMIN_EMAILS`, perfil do Google). Versão
  `latest` = 4.6.5.
- **Aprovado pelo humano (2026-10-03)**: as três dependências. A instalação acontece
  só na implementação (tarefa própria no `tasks.md`). Logo depois, roda-se
  `npm audit --omit=dev` (ADR-007) e o output real vai no relatório.

## R12. Runtime (workerd)

- O Auth.js v5 lê `AUTH_SECRET`, `AUTH_GOOGLE_ID` e `AUTH_GOOGLE_SECRET` de `process.env`, e o
  OpenNext preenche esse objeto a partir dos secrets do Worker. É necessário
  `trustHost: true` (o host vem do Worker e não há `AUTH_URL` fixo por ambiente).
- Nenhum binding novo no `wrangler.jsonc`, e os secrets já existem em dev e produção
  (`docs/operacao.md`). Não há alteração em zona protegida de configuração.
- **Risco a validar no `preview`**: `@auth/core` em workerd (Web Crypto/jose). O
  `wrangler.jsonc` não declara `nodejs_compat` explicitamente. Se o build ou o runtime
  falhar por isso, a correção toca o `wrangler.jsonc` (zona protegida).
- **Pré-aprovação do humano (2026-10-03)**: acrescentar `"nodejs_compat"` às
  `compatibility_flags` está autorizado **somente** se o `preview` falhar e essa for a
  única correção necessária. Qualquer outra mudança no `wrangler.jsonc` volta ao humano.
