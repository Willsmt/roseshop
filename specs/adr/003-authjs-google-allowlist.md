# ADR-003 — Autenticação: Auth.js v5 com Google e allowlist

**Status:** aceito
**Data:** 2026-10-03 (registra decisão tomada em 2026-10-01)

## Contexto

Somente três administradoras acessam o painel, com permissões iguais. A
principal usuária tem baixa familiaridade com tecnologia: o login precisa ser
o mais simples possível no celular. Clientes do catálogo não fazem login.

## Decisão

- **Auth.js v5**, provedor **Google** apenas.
- **Allowlist** em `ADMIN_EMAILS` (secret, por conter e-mails pessoais),
  comparada sem diferenciar maiúsculas e ignorando espaços. Verificada no
  callback de login **e** em toda rota/ação protegida (defesa em profundidade,
  constitution III.2).
- **Sessão JWT**, sem adapter de banco: não há tabelas de autenticação.
- `AUTH_SECRET` próprio por ambiente (local, dev, produção).
- Um único OAuth client no Google Cloud (projeto `roseshop`), app em modo
  **Testing** com as administradoras como test users, e callbacks
  `/api/auth/callback/google` em localhost:3000, localhost:8787, dev e produção.
- As três administradoras têm o mesmo poder; não há papéis.

## Alternativas descartadas

- **Better Auth**: mais moderno, mas sem ganho real para três usuárias.
- **E-mail/senha ou magic link**: pior para a usuária principal e exigiria
  infraestrutura de envio de e-mail.

## Consequências

- (+) Login de um toque no celular, com a conta Google já usada no aparelho.
- (+) Incluir ou remover administradora é só atualizar o secret, sem deploy de código.
- (−) Dependência do status de lançamento do Auth.js v5: confirmar a tag de
  distribuição (`latest` ou `beta`) no início da feature de autenticação.
- (−) Modo Testing limita a 100 test users (sem impacto para o projeto).

## Adendo — 2026-10-03 (feature 001)

**Status do adendo:** aceito pelo humano em 2026-10-03.

### Versão fixada

`npm view next-auth dist-tags` em 2026-10-03 mostrou `latest: '4.24.15'` e
`beta: '5.0.0-beta.32'`, ou seja, o v5 ainda não é estável. Decisão: usar
**`next-auth@5.0.0-beta.32` com versão exata** (sem `^`) no `package.json`. A
atualização é deliberada: só em PR próprio, após ler o changelog e rodar
`npm audit --omit=dev` (ADR-007). O v4 (`latest`) foi descartado por ser voltado ao
Pages Router e ter integração pior com App Router e workerd.

### Sem middleware/proxy

O Next 16 substituiu `middleware.ts` por `proxy.ts`, que roda só em runtime Node. O
`@opennextjs/cloudflare` trata middleware em Node como experimental e sem
manutenção oficial. Decisão: **nenhum `src/middleware.ts` nem `src/proxy.ts`**. A
autorização é verificada no callback de login e, em cada acesso, por guards de
`src/lib/auth/`:

- `requireAdminPage(caminho)` em toda página protegida;
- `requireAdminAction()` em toda Server Action e todo route handler;
- `getAdminSession()` nos layouts, que não redirecionam.

Um teste de conformidade **nega por padrão**: falha para qualquer `"use server"` ou
`route.ts` sem guard que não esteja na lista explícita de exceções públicas.

Consequências:
- (+) Nenhum código experimental em zona de segurança. Nenhum custo de CPU nas
  requisições públicas.
- (−) Não há filtro central. A cobertura depende do teste de conformidade, que
  precisa acompanhar novos padrões de arquivo.
- (−) Se no futuro o OpenNext suportar `proxy.ts` oficialmente, reavaliar com
  novo adendo. O guard por página continua obrigatório (constitution III.2).

### `trustHost: true`

**Decisão (aceita pelo humano em 2026-10-03):** manter `trustHost: true` na config do
Auth.js, sem `AUTH_URL` fixo. O Auth.js passa a derivar a URL base do host da
requisição. Esse host é confiável aqui porque:

- a Cloudflare roteia a requisição pelo host do Worker, então um host que não seja
  dele não chega ao Worker;
- o navegador não permite que uma página forje o header `X-Forwarded-Host`;
- o Google recusa qualquer `redirect_uri` que não esteja cadastrado no OAuth client,
  então um host forjado não completa o login;
- as respostas de `/painel` são `Cache-Control: private, no-store`, então uma resposta
  gerada com host forjado não fica em cache compartilhado;
- um `AUTH_URL` fixo quebraria o uso local, que roda em duas portas (3000 no `dev` e
  8787 no `preview`).

Consequência: (−) se o Worker passar a ficar atrás de um proxy que repasse
`X-Forwarded-Host` de forma não confiável, reavaliar com novo adendo.
