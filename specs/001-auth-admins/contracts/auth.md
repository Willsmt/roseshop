# Contrato: autenticação (001)

Contrato que o tech-lead define e os demais agentes consomem. Tudo em `src/lib/auth/`
é zona protegida (constitution III.7) e é implementado pelo tech-lead. O `ui-dev`
consome apenas o que está listado aqui.

Termos: "lista de autorizadas (`ADMIN_EMAILS`)" e "segredo de sessão (`AUTH_SECRET`)".

## Rotas

| Rota | Acesso | Descrição |
|------|--------|-----------|
| `/api/auth/*` | público (exceções `GET`/`POST` listadas por função no teste de conformidade) | Handlers do Auth.js (callback do Google em `/api/auth/callback/google`) |
| `/painel/entrar` | público | Tela de entrada. Query: `callbackUrl?` (caminho interno), `error?` (código do Auth.js) |
| `/painel` | protegido | Página inicial mínima: saudação + "Sair" |
| `/painel/**` (exceto `/entrar`) | protegido | Toda página futura do painel vive em `src/app/painel/(protegido)/` |
| páginas públicas (`/`, futuros catálogo e sacola) | público | Sem verificação de sessão, sem link para o painel (FR-011, FR-018) |
| `/api/health` | público (exceção `GET` listada por função no teste de conformidade) | Verificação de saúde |
| qualquer outro `route.ts` / handler | **protegido por padrão** | Cada handler exportado deve chamar `requireAdminAction()` e responder 401 sem corpo em `UnauthorizedError`, ou entrar, por função, na lista de exceções públicas do teste |

## Módulos em `src/lib/auth/` (tech-lead)

```ts
// allowlist.ts: funções puras, sem I/O
parseAllowlist(raw: string | undefined): ReadonlySet<string>
isAllowedEmail(email: string | null | undefined, raw: string | undefined): boolean
decideSignIn(input: { email?: string | null; emailVerified?: boolean | null },
             raw: string | undefined): boolean

// callback-path.ts: função pura
safeCallbackPath(raw: unknown): `/painel${string}`   // fallback "/painel"

// error-message.ts: função pura, textos em pt-BR simples
type LoginNotice = "recusada" | "falhou" | null
loginNoticeFromError(code: unknown): LoginNotice

// Arquivos só de servidor começam com `import "server-only"`: config.ts, index.ts,
// guard.ts, actions.ts. As funções puras (allowlist.ts, callback-path.ts,
// error-message.ts) não importam `server-only`.

// index.ts: instância do Auth.js
export { handlers, auth, signIn, signOut }

// guard.ts: servidor apenas
type AdminSession = { email: string; name: string | null }
getAdminSession(): Promise<AdminSession | null>
  // verifica sessão + lista de autorizadas ATUAL; nunca redireciona. Uso: layouts.
requireAdminPage(currentPath: string): Promise<AdminSession>
  // uso: toda page.tsx protegida, com o caminho da própria página (incluindo params dinâmicos)
  // sem sessão válida ou e-mail fora da lista atual → redirect("/painel/entrar?callbackUrl=" + safeCallbackPath(currentPath))
requireAdminAction(): Promise<AdminSession>
  // uso: toda Server Action e todo route handler protegido
  // sem sessão válida ou e-mail fora da lista atual → lança UnauthorizedError (sem efeitos, sem dados)

// Por que o layout não redireciona: no Next 16, layout e página renderizam em paralelo,
// e o layout não impede a página de rodar (node_modules/next/dist/docs/01-app/02-guides/
// authentication.md, "Layouts and auth checks"). Um redirect no layout disputaria
// com o da página e poderia perder o callbackUrl (US1-4). Quem redireciona é a página;
// o layout só decide se mostra a moldura (saudação, "Sair").

// actions.ts ("use server"): Server Actions consumidas pela UI.
// `entrarComGoogle` e `sair` são as ÚNICAS actions públicas, listadas POR FUNÇÃO no teste
// de conformidade: entrar não exige sessão, e sair sem sessão não tem efeito. Qualquer outra
// função exportada deste arquivo (ou de qualquer "use server") chama requireAdminAction().
entrarComGoogle(formData: FormData): Promise<void>
  // campos: callbackUrl? (validado com safeCallbackPath), trocarConta? ("1" → prompt=select_account)
sair(): Promise<void>
  // encerra a sessão deste aparelho e redireciona para /painel/entrar; sem confirmação
```

## Componentes base (`src/components/ui/`)

```tsx
// Button: único primitivo de botão nesta feature (até o ADR-005 definir a lib de UI)
<Button type="submit" variant="primary" | "secondary">…</Button>
// garante min-height 48px, font-size ≥ 16px, largura total no celular
```

## Regras para o ui-dev

- `/painel/entrar/page.tsx`: Server Component. Lê `searchParams`, chama
  `loginNoticeFromError` e `safeCallbackPath`, renderiza um `<form action={entrarComGoogle}>`.
  Nenhum campo de senha.
- `(protegido)/layout.tsx` chama `getAdminSession()`. Com sessão autorizada, renderiza a
  moldura (saudação + botão "Sair") e `children`. Sem sessão, renderiza só `children`
  (a página redireciona). Nunca mostra nome ou e-mail sem sessão autorizada.
- Cada `page.tsx` em `(protegido)` chama `requireAdminPage("<caminho da página>")` antes
  de qualquer outra coisa.
- Toda Server Action (`"use server"`) e todo `route.ts` em `src/` começam com
  `await requireAdminAction()`, função por função. O teste de conformidade **nega por
  padrão**: só passam sem guard as funções da lista explícita de exceções públicas (por
  função, nunca por arquivo) mantida no próprio teste.
- Tamanho mínimo em todas as telas: texto ≥ 16px (classe `text-base` ou maior; nunca
  `text-sm`/`text-xs`), alvos de toque ≥ 48px (só `Button`), um único botão principal
  (`variant="primary"`) por tela.
- Não importa nada de `next-auth` diretamente; só de `@/lib/auth`.

## Textos (revisão final pelo redator)

| Situação | Texto |
|----------|-------|
| Título da entrada | "Painel da loja" |
| Botão principal | "Entrar com Google" |
| Recusa | "Esta conta Google não tem acesso ao painel. Tente entrar com outra conta." |
| Botão na recusa | "Entrar com outra conta" |
| Falha/cancelamento | "Não foi possível entrar agora. Tente de novo em instantes." |
| Recusa e cancelamento indistinguíveis (decisão do humano) | "Não foi possível entrar com essa conta. Tente de novo ou use outra conta." + botão "Entrar com outra conta" |
| Saudação | "Olá, {nome ou e-mail}" |
| Botão sair | "Sair" |
