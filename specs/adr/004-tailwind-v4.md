# ADR-004 — Estilo: Tailwind CSS v4

**Status:** aceito
**Data:** 2026-10-03 (registra decisão tomada em 2026-10-01)

## Contexto

O projeto precisa de um sistema de estilos rápido de manter por agentes e por
humanos, compatível com Server Components e com a biblioteca de componentes
de UI (ADR-005, pendente).

## Decisão

- **Tailwind CSS v4** via `@tailwindcss/postcss` (configuração do scaffold).
- Tokens de design (cores, tipografia, raios) definidos como variáveis CSS no
  tema do Tailwind, fonte única para painel e catálogo.

## Alternativas descartadas

- **SASS modules**: mais familiar, mas sem integração com a biblioteca de
  componentes escolhida no ADR-005.
- **Bootstrap + SASS**: estética padronizada, difícil de diferenciar no catálogo
  e pesada para o bundle do Worker.

## Consequências

- (+) Estilos colocados junto dos componentes; sem CSS morto.
- (+) Base direta para shadcn/ui (ADR-005).
- (−) A detecção automática de classes do v4 varre o projeto (respeitando o
  `.gitignore`): material de terceiros, como sites de referência baixados,
  fica fora do repositório.
