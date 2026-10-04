# Contrato: autenticação (001)

Contrato que o tech-lead define e os demais agentes consomem. Tudo em `src/lib/auth/`
é zona protegida (constitution III.7) e é implementado pelo tech-lead. O `ui-dev`
consome apenas o que está listado aqui.

## Rotas

| Rota | Acesso | Descrição |
|------|--------|-----------|
| `/api/auth/*` | público | Handlers do Auth.js (callback do Google em `/api/auth/callback/google`) |
| `/painel/entrar` | público | Tela de entrada. Query: `callbackUrl?` (caminho interno), `error?` (código do Auth.js) |
| `/painel` | protegido | Página inicial mínima: saudação + "Sair" |
| `/painel/**` (exceto `/entrar`) | protegido | Toda página futura do painel vive em `src/app/painel/(protegido)/` |
| todo o resto (`/`, catálogo, sacola, `/api/health`) | público | Sem verificação de sessão, sem link para o painel (FR-011, FR-018) |

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

// index.ts: instância do Auth.js
export { handlers, auth, signIn, signOut }

// guard.ts: servidor apenas
type AdminSession = { email: string; name: string | null }
requireAdminPage(currentPath: string): Promise<AdminSession>
  // sem sessão válida ou e-mail fora da lista atual → redirect("/painel/entrar?callbackUrl=...")
requireAdminAction(): Promise<AdminSession>
  // sem sessão válida ou e-mail fora da lista atual → lança UnauthorizedError (sem efeitos, sem dados)

// actions.ts ("use server"): Server Actions consumidas pela UI
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
- `(protegido)/layout.tsx` e cada `page.tsx` em `(protegido)` chamam `requireAdminPage`
  (o teste de conformidade cobra isso).
- Toda Server Action nova do painel começa com `await requireAdminAction()`.
- Não importa nada de `next-auth` diretamente; só de `@/lib/auth`.

## Textos (revisão final pelo redator)

| Situação | Texto |
|----------|-------|
| Título da entrada | "Painel da loja" |
| Botão principal | "Entrar com Google" |
| Recusa | "Esta conta Google não tem acesso ao painel. Tente entrar com outra conta." |
| Botão na recusa | "Entrar com outra conta" |
| Falha/cancelamento | "Não foi possível entrar agora. Tente de novo em instantes." |
| Saudação | "Olá, {nome ou e-mail}" |
| Botão sair | "Sair" |
