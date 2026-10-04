# Research: Autenticação das administradoras (001)

**Data**: 2026-10-03 | **Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

Cada item: Decisão / Justificativa / Alternativas. Itens marcados **[DECISÃO HUMANA]**
têm recomendação, mas dependem de aprovação antes de `/speckit-tasks`.

---

## R1. Versão do Auth.js **[DECISÃO HUMANA]**

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

- **Decisão recomendada**: `next-auth@5.0.0-beta.32` **com versão exata** (sem `^`),
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

## R2. Onde fica a primeira barreira (middleware / proxy) **[DECISÃO HUMANA]**

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

- **Justificativa da A**: a spec exige verificação em cada página e ação de qualquer
  forma. A barreira central seria só otimização de UX (redirecionar antes de
  renderizar), e o layout protegido já cobre isso. Evitar código experimental em zona
  de segurança.

## R3. Sessão: estratégia e validade

- **Decisão**: sessão JWT (ADR-003), `maxAge` = 30 dias, `updateAge` = 24 h.
- **Justificativa**: na clarificação, o humano escolheu "30 dias, renovados a cada uso". Com
  `updateAge` de 24 h, o cookie é reemitido no primeiro uso de cada dia. Na prática,
  quem usa o painel a intervalos menores que 30 dias nunca expira (US3-6). Renovar a
  cada request multiplicaria escritas de cookie sem ganho.
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
- **A verificar na implementação** (teste de integração no `preview`): qual código de
  erro o `@auth/core 0.41.3` gera quando a pessoa cancela no Google. Se for
  `AccessDenied`, a distinção entre recusa e cancelamento passa a vir de um parâmetro
  próprio, e não do código de erro.

## R7. Garantia de "toda página e ação protegida" (SC-003)

- **Decisão**: três camadas:
  1. `src/app/painel/(protegido)/layout.tsx` chama `requireAdminPage()`.
  2. Cada `page.tsx` em `(protegido)` também chama o guard. Layouts não re-renderizam
     em toda navegação, então o layout sozinho não basta.
  3. Cada Server Action do painel começa com `await requireAdminAction()`.
- **Teste de conformidade** (unitário, sem dependência nova): percorre
  `src/app/painel/(protegido)/**/page.tsx` e todo arquivo `"use server"` do painel, e
  falha se algum não chamar o guard. Assim, páginas futuras ficam protegidas por
  construção.
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
- **E2E com navegador (Playwright)**: fora deste plano. Seria dependência nova;
  fica como possível decisão futura.

## R11. Dependências novas

- `next-auth@5.0.0-beta.32` (exata): ADR-003.
- `zod` como dependência direta (hoje só transitiva): a constitution II exige Zod em
  toda fronteira (query `callbackUrl`/`error`, `ADMIN_EMAILS`, perfil do Google). Versão
  `latest` = 4.6.5.
- As duas precisam de `npm audit --omit=dev` limpo (ADR-007) no momento da instalação,
  com output real no relatório.

## R12. Runtime (workerd)

- O Auth.js v5 lê `AUTH_SECRET`, `AUTH_GOOGLE_ID` e `AUTH_GOOGLE_SECRET` de `process.env`, e o
  OpenNext preenche esse objeto a partir dos secrets do Worker. É necessário
  `trustHost: true` (o host vem do Worker e não há `AUTH_URL` fixo por ambiente).
- Nenhum binding novo no `wrangler.jsonc`, e os secrets já existem em dev e produção
  (`docs/operacao.md`). Não há alteração em zona protegida de configuração.
- **Risco a validar no `preview`**: `@auth/core` em workerd (Web Crypto/jose). O
  `wrangler.jsonc` não declara `nodejs_compat` explicitamente. Se o build ou o runtime
  falhar por isso, a correção toca o `wrangler.jsonc` (zona protegida) e volta ao
  humano.
