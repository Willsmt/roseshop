# Quickstart: validar a feature 001

Guia de validação ponta a ponta. Os detalhes de contrato estão em
[contracts/auth.md](./contracts/auth.md) e os de sessão em [data-model.md](./data-model.md).

## Pré-requisitos

- `.dev.vars` preenchido pelo humano (`AUTH_SECRET`, `AUTH_GOOGLE_ID`,
  `AUTH_GOOGLE_SECRET`, `ADMIN_EMAILS`). Agentes não leem esse arquivo.
- Três contas Google para o teste:
  1. **autorizada**: test user do cliente OAuth **e** presente em `ADMIN_EMAILS`;
  2. **test user fora da lista**: test user do cliente OAuth, **ausente** de `ADMIN_EMAILS`;
  3. (opcional) **não test user**: deve ser barrada pelo próprio Google.

## Automatizado (gate de "pronto")

```bash
npm run check       # lint + typecheck + testes unitários (inclui o teste de conformidade)
npm audit --omit=dev
```

## Manual: `npm run preview` (http://localhost:8787) e depois no dev online

| # | Passo | Esperado | Spec |
|---|-------|----------|------|
| 1 | Abrir `/` e `/api/health` sem sessão | Carregam, sem link para o painel nem para login | US5, FR-018 |
| 2 | Abrir `/painel` sem sessão | Vai para `/painel/entrar?callbackUrl=/painel` | US3-1 |
| 3 | Entrar com a conta **autorizada** | Chega a `/painel` com "Olá, …" e botão "Sair" | US1-1 |
| 4 | Abrir `/painel/entrar` já conectada | Vai direto a `/painel` | US1-3 |
| 5 | Tocar "Sair" | Volta à entrada, sem confirmação; "voltar" do navegador não mostra o painel | US4-2, US4-3 |
| 6 | Entrar com o **test user fora da lista** | Mensagem de recusa + "Entrar com outra conta"; nenhum cookie de sessão | US2-1, US2-2 |
| 7 | Conferir os logs do Worker (`wrangler tail` no dev) | Há `auth.signin.recusado` sem e-mail | US2-5, FR-015 |
| 8 | Cancelar na tela do Google | Volta à entrada com "Não foi possível entrar agora…" | US1-5 |
| 9 | Conectada, remover o e-mail de `ADMIN_EMAILS` (dev: `wrangler secret put`) e recarregar | Vai para a entrada | US3-3, FR-004 |
| 10 | Celular real (DevTools mobile no local) | Botões ≥ 48px, texto ≥ 16px, uma ação por tela | FR-012 |

## Emergência (validar só no dev online)

Trocar `AUTH_SECRET` do ambiente dev → todas as sessões do dev caem no próximo
acesso. Não executar em produção como teste.
