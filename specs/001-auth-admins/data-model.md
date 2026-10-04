# Data Model: Autenticação das administradoras (001)

**Sem tabelas novas e sem migration.** O ADR-003 define sessão JWT sem adapter de banco.
As entidades abaixo existem como configuração ou como token assinado.

## Lista de autorizadas (`ADMIN_EMAILS`)

| Aspecto | Regra |
|---------|-------|
| Origem | Secret por ambiente: `.dev.vars` no local, `wrangler secret` em dev e produção |
| Formato bruto | String com e-mails separados por vírgula |
| Parse (Zod) | `split(",")` → `trim()` → `toLowerCase()` → descarta vazios e e-mails inválidos → conjunto sem duplicatas |
| Vazia ou ausente | Conjunto vazio, ninguém entra (FR-014) + log `auth.allowlist.vazia` sem dados |
| Leitura | A cada chamada de `decideSignIn` e dos guards, nunca em cache de módulo. Assim uma troca do secret vale no próximo acesso |
| Exposição | Nunca é enviada ao client nem a logs (FR-015) |

## Administradora (identidade derivada do Google)

| Campo | Origem | Regra |
|-------|--------|-------|
| `email` | Perfil Google | Obrigatório; normalizado (`trim` + minúsculas); deve estar na lista |
| `emailVerified` | `profile.email_verified` | Deve ser `true`, senão o login é recusado (US2-4) |
| `name` | Perfil Google | Opcional; exibido na saudação; se ausente, mostra o e-mail |

Não há papéis (FR-013). Não há cadastro próprio.

## Sessão (JWT assinado com `AUTH_SECRET` do ambiente)

| Campo | Regra |
|-------|-------|
| `email`, `name` | Copiados no login |
| validade | `maxAge` 30 dias; reemitida no máximo 1×/24 h de uso (`updateAge`) |
| armazenamento | Cookie httpOnly, `Secure` em dev/produção, `SameSite=Lax` (padrão do Auth.js) |

### Estados

```
[sem sessão] --entrar (Google ok + e-mail verificado + na lista)--> [conectada]
[sem sessão] --entrar (fora da lista / não verificado / lista vazia)--> [sem sessão] + mensagem de recusa
[conectada]  --uso < 30 dias--> [conectada] (validade renovada)
[conectada]  --30 dias sem uso--> [sem sessão]
[conectada]  --Sair (este aparelho)--> [sem sessão]
[conectada]  --e-mail removido da lista--> tratada como [sem sessão] no próximo acesso
[conectada]  --troca do AUTH_SECRET do ambiente (emergência)--> [sem sessão] em todos os aparelhos
```
