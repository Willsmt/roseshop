# Quickstart — validação da feature 002

Roteiro para provar a feature ponta a ponta depois de implementada (decisões D1–D5
tomadas; ver `research.md`).

## Pré-requisitos

- `npm run db:up`; `.dev.vars` local configurado (ver `.dev.vars.example`).
- Migrations aplicadas no banco local (`npm run db:migrate`; também antes do `test:int` e
  no job `integration` do CI, D5-A).
- Admin de teste na `ADMIN_EMAILS`.

## Cenários

1. **Seed (US1, SC-001/008)**: banco recém-migrado ⇒ `/painel/categorias` lista
   Bolsas, Guarda-chuvas, Meias, Panos de prato, Tupperware (nessa ordem). Remover
   uma, renomear outra, rodar migrate de novo e (no `preview`) novo deploy ⇒ nada volta.
2. **Criar/duplicado (US2, SC-003)**: criar "Bolsas de Praia" ⇒ aparece como
   "Bolsas de Praia". Tentar "panos de prato", "GUÁRDA-chuvas", " Meias " ⇒ recusado
   com "Já existe uma categoria chamada …"; "Guarda-chuva" ⇒ aceito.
3. **Validação (SC-010)**: vazio, 1 caractere, 41 caracteres, "Bolsas!", "Meias 😀"
   ⇒ mensagens da tabela de `contracts/categorias.md`; texto digitado permanece no campo.
4. **Renomear (US3)**: "bolsas" → "Bolsas" aceito; "Meias" → "bolsas" recusado;
   posição alfabética atualizada.
5. **Remover (US4, SC-009)**: confirmação ≥48px; cancelar não muda nada; confirmar
   remove; com produtos vinculados (tabela temporária de teste até a 003) bloqueia com
   a contagem; remover a última é bloqueado.
6. **Concorrência (FR-019/020, SC-009)**: teste de integração com duas chamadas
   simultâneas (D3-B: batch com lock): criar nomes equivalentes (1 vence); renomear a mesma categoria (1 vence,
   outra `alterada`); remover as duas últimas (1 vence, outra `ultima`).
7. **Acesso (SC-004/006)**: sem sessão, página ⇒ `/painel/entrar`; actions chamadas
   direto ⇒ recusadas; `exigirCategoriaValida(id inexistente)` rejeita; teste de
   conformidade FR-015 passa.
8. **Runtime real**: repetir 1–5 em `npm run preview` (workerd) e, no PR, no `dev` online.

## Comandos de "pronto"

```bash
npm run check      # lint + typecheck + unitários + conformidade
npm run test:int   # integração (db:up + migrations aplicadas)
```
