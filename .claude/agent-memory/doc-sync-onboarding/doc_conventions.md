---
name: doc-conventions
description: Convenções de formatação adotadas nos docs do Roseshop no bootstrap — seguir nas próximas syncs para manter consistência
metadata:
  type: project
---

Convenções fixadas na sync de bootstrap (2026-10-02, sem `docs/` prévio) para
manter consistência nas próximas syncs incrementais:

- Todo documento que descreve algo ainda incompleto (Fase 0 ou feature
  parcial) abre com uma linha de estado em blockquote logo após o H1, ex.:
  `> Estado: **Fase 0 — scaffold**. ...`. Atualizar/remover essa linha quando
  o documento deixar de ser parcial.
- Ordem fixa dentro de cada doc de feature/arquitetura: H1 → linha de estado
  (se aplicável) → `## Visão leiga` → `## Aprofundamento técnico`. Não
  inverter essa ordem nem pular a visão leiga mesmo em docs curtos.
- Tabelas Markdown para: comandos (`package.json`), bindings (`wrangler.jsonc`),
  stack/versões. Cabeçalho sempre em português.
- Diagramas `mermaid` só quando há fluxo real de mais de 2 passos (ex.: build
  → worker → deploy). Não forçar diagrama em lista de bindings estática.
- Divergências código × spec entram como subseção própria
  (`### Divergência com ADR-XXX (alerta ao tech-lead)`) dentro do doc mais
  relevante (ex. `architecture.md`), não só no resumo final da sync — assim
  quem lê o doc already vê o alerta, e a memória
  [[known-divergences]] evita reportar a mesma coisa duas vezes.
- `docs/index.md` lista explicitamente, numa seção "O que ainda não existe
  aqui", quais docs do mapa (`database.md`, `features/`) ainda não foram
  criados e por quê — evita que o próximo agente pense que foi esquecimento.

**Como aplicar**: seguir este padrão ao editar ou criar novos docs; só
divergir se o humano pedir explicitamente uma estrutura diferente (e aí
atualizar esta memória).
