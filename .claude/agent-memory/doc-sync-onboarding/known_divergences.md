---
name: known-divergences
description: Divergências código x spec; ADR-006 resolvido; dívidas ativas NEON_FETCH_ENDPOINT, formatador, definições de agentes
metadata:
  type: project
---

Divergências já sinalizadas ao tech-lead, documentadas em `docs/architecture.md`
e `docs/operacao.md`. Não as reporte como achado novo em syncs futuras; só
verifique se ainda existem e, se resolvidas, remova a nota dos docs e daqui.

1. **ADR-006 (ambientes, CI, produção)**: totalmente RESOLVIDO (2026-10-03). Não reabrir.
2. `.dev.vars.example`, `fetch` x proxy local, `passWithNoTests`: RESOLVIDOS.
3. **Dívida ativa**: `cloudflare-env.d.ts` tipa `NEON_FETCH_ENDPOINT` como
   obrigatória; `DbEnv` a trata como opcional (`docs/architecture.md`).
4. **Dívidas da feature 001** (sync de 2026-10-04, em "Dívidas técnicas" de
   `docs/architecture.md`): sem formatador (tabs x 2 espaços); definições dos
   agentes a ajustar (sem `npx` fora do projeto, sem fora do briefing, tech-lead
   reexecuta verificações do junior). Remover quando resolvidas em PR próprio.
5. Feature 001: `docs/features/F01-autenticacao.md` existe; `docs/database.md`
   continua inexistente (schema vazio, sessão JWT sem tabelas).

**Como aplicar**: ler antes de escrever o resumo final.
