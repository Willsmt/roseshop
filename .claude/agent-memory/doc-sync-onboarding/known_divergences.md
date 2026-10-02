---
name: known-divergences
description: Divergências código x spec já registradas no bootstrap (2026-10-02) — não reportar de novo como "nova" até o código mudar
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

2. **`.dev.vars.example` ausente**: `.specify/memory/constitution.md` (princípio III.1; antes seção 4.1 de
   `specs/00-constitution.md`, que foi removido)
   diz que `.dev.vars.example` lista as chaves esperadas sem valor. O arquivo
   não existe no repo ainda (só `.dev.vars`, local e ignorado pelo git). Sem
   variável alguma exigida pelo app ainda, isso não bloqueia nada — mas na
   primeira feature que exigir segredo (banco, R2, IA, Auth.js), o repo
   precisa ganhar esse arquivo e `docs/operacao.md` precisa ganhar a tabela
   de variáveis.

**Como aplicar**: ao fazer a próxima sync incremental, leia estas duas notas
antes de escrever o resumo final — se o código já resolveu alguma, remova a
divergência dos docs e desta memória em vez de listar como "nova".
