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
5. Feature 001: `docs/features/F01-autenticacao.md`. Feature 002 (sync de 2026-10-04):
   `docs/database.md` e `docs/features/F02-categorias.md` criados.
6. Dívidas da 002 (FK RESTRICT, 23001 no Neon dev, `contarProdutosDaCategoria` em SQL cru): RESOLVIDAS
   na 003 (sync de 2026-10-08); `fk-produtos.int.test.ts` roda no Neon dev pelo CI. Não reabrir.
   Feature 003: `docs/features/F03-produtos.md`. Dívida ativa: comentário de `pull-request.yml`
   (~linha 50) diz que o probe é "sem tabelas"; fora do escopo do doc-sync (registrado em `architecture.md`).
7. Decisão N1 (docs coerentes): app, migration e probe usam o mesmo `DATABASE_URL` direto do Neon
   dev, sem pooler. Nunca reintroduzir "pooled" nos docs.

**Como aplicar**: ler antes de escrever o resumo final.
