# ADR-007 — Política de auditoria de dependências

**Status:** aceito
**Data:** 2026-10-03

## Contexto

O projeto depende de pacotes npm e roda em produção para clientes reais.
Vulnerabilidades conhecidas aparecem tanto em dependências de runtime (que vão
para o Worker) quanto em ferramentas de desenvolvimento, que nunca recebem
tráfego de clientes. Algumas não têm versão corrigida disponível.

## Decisão

- **Runtime** (`npm audit --omit=dev`): qualquer vulnerabilidade **high** ou
  **critical** bloqueia o PR no CI.
- **Desenvolvimento**: não bloqueia o CI. Cada vulnerabilidade aceita é
  registrada em `docs/operacao.md` com justificativa (por que não há exposição
  real) e data de revisão.
- Antes de aceitar, tentar nesta ordem: atualizar a dependência; `overrides`
  para uma versão corrigida, validado por teste; só então aceitar.
- `npm audit fix --force` não é usado: aplica mudanças major sem revisão.
- Script de instalação de pacote novo exige aprovação explícita
  (`allowScripts` no `package.json`).

## Consequências

- (+) O gate protege o que chega às clientes sem travar o projeto por alertas
  de ferramentas sem correção disponível.
- (+) Toda aceitação fica auditável e com prazo de revisão.
- (−) Vulnerabilidades de dev aceitas dependem de revisão periódica humana.
