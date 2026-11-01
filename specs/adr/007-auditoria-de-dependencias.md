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

## Adendo (2026-11-01): auditoria de novembro (branch `fix/deps-audit-nov`)

- `undici` (via `miniflare`/`wrangler`): corrigido subindo o `wrangler` para
  4.156.0, cujo `miniflare` traz `undici` 7.30.1. O override temporário
  `overrides.miniflare.undici` foi testado e **removido**; `npm ls undici`
  confirma 7.30.1 sem override.
- `overrides["@node-minify/core"].glob` = 10.5.0: o `@opennextjs/cloudflare`
  1.20.15 trouxe `glob` 10.3.3 (fixado pelo `@node-minify/core` 9.0.2), afetado
  pelo GHSA-5j98-mcp5-4vw2 (high, CLI). Override no mesmo major, temporário:
  remover quando o upstream trouxer `glob` >= 10.5.0.
- **Risco aceito (runtime, moderate)**: GHSA-3g3m-2fjr-6pw4 (`glob` <= 14.0.1)
  e GHSA-g3hv-75wg-m249 (`minimatch` < 11.0.1), via `@opennextjs/cloudflare`.
  A correção exige major diferente e depende do upstream (OpenNext e
  node-minify); sem override. Moderate não bloqueia o CI. Aceito em
  2026-11-01; **revisar em 2026-12-01**. Detalhes em `docs/operacao.md`.
- **Risco aceito (só desenvolvimento)**, sem atualizar, por decisão do humano;
  aceito em 2026-11-01, **revisar em 2026-12-01**:
  - `undici` 8.11.2 via `jsdom` (high; correção no 8.12.2): só no ambiente de
    teste do Vitest.
  - `vite` 8.3.2 via `vitest` e `@vitejs/plugin-react` (high; afeta 8.3.0 a
    8.3.2): só para rodar os testes, sem servidor do vite exposto.
  - `fast-uri` 3.1.8 via `ajv` <- `@commitlint/config-validator` (moderate;
    correção no 3.1.9): só no hook de commit.
  Advisories listados em `docs/operacao.md`. Nenhum vai para o Worker.
