---
name: feedback-docs-style
description: Feedback do humano (2026-10-02) sobre nível de detalhe e duplicação nos docs
metadata:
  type: feedback
---

Priorizar conhecimento operacional (pegadinhas de ambiente, erros comuns) na seção Troubleshooting de `docs/operacao.md`, e evitar duplicação entre docs: cada informação (ex.: bindings) fica detalhada em um único doc; os outros apenas linkam.

**Why:** o bootstrap listou bindings em `architecture.md` e `operacao.md`, e faltaram armadilhas de WSL/Git/lint.

**How to apply:** antes de escrever, checar se o conteúdo já existe em outro doc e linkar. Copiar versões exatamente como em `package.json` (com `^`). Só afirmar o que é confirmável em arquivos; o resto marcar como orientação do mantenedor.
