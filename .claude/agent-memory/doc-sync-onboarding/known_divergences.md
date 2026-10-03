---
name: known-divergences
description: Divergências código x spec; ADR-006 totalmente resolvido (CI no branch chore/ci; produção após merge); dívida ativa NEON_FETCH_ENDPOINT
metadata:
  type: project
---

Divergências já sinalizadas ao tech-lead na sync de bootstrap (2026-10-02),
documentadas em `docs/architecture.md` e `docs/operacao.md`. Não as reporte
como achado novo em syncs futuras — só verifique se ainda existem e, se
resolvidas, remova a nota dos docs (e desta memória).

1. **ADR-006 (ambientes) vs repositório**: `env` no `wrangler.jsonc`
   **RESOLVIDO** (sync de 2026-10-03, branch `chore/wrangler-envs`, commit
   `fffa3fe`; `docker-compose.yml` também existe). **CI RESOLVIDO neste branch** (sync de 2026-10-03, `chore/ci`:
   `.github/workflows/`); a produção só passa a existir após o merge (primeiro
   deploy; smoke dá 503 até cadastrar secrets de runtime). Doc em
   `docs/operacao.md` ("CI") e `docs/architecture.md`; não reabrir. (Branch Neon `main` x `production`: RESOLVIDA em
   2026-10-03, ADRs corrigidos para `production`; não reabrir.)

2. ~~`.dev.vars.example` ausente~~ **RESOLVIDA** (sync de 2026-10-03,
   branch `chore/local-db`): o arquivo existe (`NEXTJS_ENV`, `DATABASE_URL`,
   `NEON_FETCH_ENDPOINT`) e `docs/operacao.md` tem a tabela de variáveis.
   Ao ganhar R2/OpenAI/Auth.js, só estender a tabela.

3. **Parcial no item 1**: o `docker-compose.yml` (ADR-002) existe e é
   consistente com o ADR. `env` e CI já resolvidos (ver item 1).

4. ~~Risco `global_fetch_strictly_public` x proxy local~~ **RESOLVIDO**
   (sync de 2026-10-03, branch `chore/drizzle-setup`): validado no `preview`,
   `/api/health` 200. Não reabrir.

5. ~~`passWithNoTests`~~ **RESOLVIDO**: removido em `vitest.config.mts`.

6. **Dívida ativa**: `cloudflare-env.d.ts` tipa `NEON_FETCH_ENDPOINT` como
   obrigatória (gerada do `.dev.vars` local); `DbEnv` a trata como opcional.
   Documentada em `docs/architecture.md`.

**Como aplicar**: ao fazer a próxima sync incremental, leia estas duas notas
antes de escrever o resumo final — se o código já resolveu alguma, remova a
divergência dos docs e desta memória em vez de listar como "nova".
