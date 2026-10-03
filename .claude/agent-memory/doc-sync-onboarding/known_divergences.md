---
name: known-divergences
description: Divergências código x spec registradas; item .dev.vars.example resolvido em 2026-10-03, ADR-006 sem env/CI segue aberta
metadata:
  type: project
---

Divergências já sinalizadas ao tech-lead na sync de bootstrap (2026-10-02),
documentadas em `docs/architecture.md` e `docs/operacao.md`. Não as reporte
como achado novo em syncs futuras — só verifique se ainda existem e, se
resolvidas, remova a nota dos docs (e desta memória).

1. **ADR-006 (ambientes, revisado em 2026-10-02 para três camadas) vs
   `wrangler.jsonc`**: a ADR decide local (Docker) + dev online
   (`roseshop-dev`) + produção (`roseshop`), com bindings por `env`. O
   `wrangler.jsonc` atual não tem bloco `env` nenhum, e também não há
   `docker-compose` (ADR-002) nem CI. Reavaliado na sync de 2026-10-02: a
   revisão NÃO resolveu a divergência, só ampliou o que falta. Já documentada
   em `docs/architecture.md` ("Ambientes decididos nos ADRs 002 e 006").
   Conferir de novo quando `wrangler.jsonc` ganhar `env`, ou quando surgir
   compose/CI.

2. ~~`.dev.vars.example` ausente~~ **RESOLVIDA** (sync de 2026-10-03,
   branch `chore/local-db`): o arquivo existe (`NEXTJS_ENV`, `DATABASE_URL`,
   `NEON_FETCH_ENDPOINT`) e `docs/operacao.md` tem a tabela de variáveis.
   Ao ganhar R2/OpenAI/Auth.js, só estender a tabela.

3. **Parcial no item 1**: o `docker-compose.yml` (ADR-002) existe e é
   consistente com o ADR. Continuam faltando `env` no `wrangler.jsonc` e CI.

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
