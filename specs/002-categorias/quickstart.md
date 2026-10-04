# Quickstart — validação da feature 002

Roteiro para provar a feature ponta a ponta depois de implementada (decisões D1–D5
e das análises: H3-A, H4-A, H7-A, C1-A e N1–N17; ver `research.md` e `plan.md`).

## Pré-requisitos

- `npm run db:up`; `.dev.vars` local configurado (ver `.dev.vars.example`).
- Migrations aplicadas no banco local (`npm run db:migrate`; também antes do `test:int` e
  no job `integration` do CI, D5-A).
- Admin de teste na `ADMIN_EMAILS`.

## Telas (uma tarefa por tela)

`/painel/categorias` (lista) · `/painel/categorias/nova` · `/painel/categorias/[id]/renomear`
· `/painel/categorias/[id]/remover` (confirmação).

## Cenários

1. **Seed (US1, SC-001/008)**: banco recém-migrado ⇒ `/painel/categorias` lista
   Bolsas, Guarda-chuvas, Meias, Panos de prato, Tupperware (nessa ordem). Remover
   uma, renomear outra, rodar migrate de novo e (no `preview`) novo deploy ⇒ nada volta.
2. **Criar/duplicado (US2, SC-003)**: em "Nova categoria", criar "Bolsas de Praia" ⇒ volta à
   lista e aparece como "Bolsas de Praia". Tentar "panos de prato", "GUÁRDA-chuvas",
   " Meias " ⇒ recusado com "Já existe uma categoria chamada …"; "Guarda-chuva" ⇒ aceito.
3. **Validação (SC-010)**: vazio, 1 caractere, 41 caracteres, "Bolsas!", "Meias 😀"
   ⇒ mensagens da tabela de `contracts/categorias.md`; texto digitado permanece no campo.
4. **Renomear (US3)**: na tela de renomear, "bolsas" → "Bolsas" aceito; "Meias" → "bolsas"
   recusado; de volta à lista, posição alfabética atualizada.
5. **Remover (US4, SC-009)**: a tela de confirmação mostra o nome e que a ação não pode ser
   desfeita, com botões ≥ 48px; cancelar volta à lista sem mudar nada; confirmar remove;
   com produtos vinculados bloqueia com a contagem (na 002, provado pelo teste de
   integração com a tabela `produtos` de teste); remover a última é bloqueado.
6. **Concorrência (FR-019/020, SC-009)**: probe determinístico do batch (mesmo txid; lock
   visível em `pg_locks`, por polling com prazo, e bloqueando o segundo batch; isolamento
   `read committed`) e testes de integração com chamadas
   simultâneas: criar nomes equivalentes (1 vence); renomear a mesma categoria (1 vence,
   outra `alterada`); remover as duas últimas (1 vence, outra `ultima`).
7. **Acesso (SC-004/006)**: sem sessão, as quatro telas ⇒ `/painel/entrar`; actions chamadas
   direto ⇒ recusadas; `exigirCategoriaValida(id inexistente)` rejeita; teste de
   conformidade FR-015 passa.
8. **Runtime real**: repetir 1–5 em `npm run preview` (workerd) e, no PR em rascunho
   (aberto com SF1–SF5 fechadas; o 1º run aplica e congela a migration `0000` no Neon dev,
   confirmada pelo log do passo `Migrations (Neon dev)`), no `dev` online pelo navegador.
   A máquina local nunca conecta ao banco do dev: o probe do batch no Neon dev roda em
   passo de CI do `pull-request.yml`, com o mesmo `secrets.DATABASE_URL` do environment
   `dev` (string direta).
9. **SC-002 (manual)**: no celular, contar toques e tempo para criar, renomear e remover
   (no máximo 3 toques, sem contar a digitação; hoje 2 por ação, contando o "Remover" da
   confirmação; < 30 s); anotar no PR.
   SC-007 é validação adiada (vinculada ao SC-005 da 001), anotada no PR.

## Comandos de "pronto"

```bash
npm run check      # lint + typecheck + unitários + conformidade
npm run test:int   # integração (db:up + migrations aplicadas), inclui o probe do batch
```
