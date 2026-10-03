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
