# Research — Feature 002 (categorias)

Fatos verificados em 2026-10-04 contra o ambiente local (Postgres 18.6 musl em Docker,
`drizzle-orm` 0.45.3, `@neondatabase/serverless` 1.2.0):

- `drizzle-orm/neon-http`: `db.transaction()` lança "No transactions support in
  neon-http driver"; `db.batch([...])` existe e roda os statements numa única
  transação (`client.transaction`), sem lógica condicional entre eles.
- Postgres: `lower`, `normalize(text, form)`, `regexp_replace`, `replace`, `btrim`,
  `translate` = `IMMUTABLE`. A extensão `unaccent` está disponível, mas não instalada
  e sua função é `STABLE`, logo não serve direto em coluna gerada nem índice.
- Não existe `src/lib/db/migrations/` nem journal. Os workflows só rodam
  `db:migrate` se o journal existir. O job `integration` do CI e
  `vitest.int.setup.ts` **não** aplicam migrations.
- `npm run db:up` é a base dos testes de integração (mesmo banco `roseshop` do dev local).

## Decisões determinadas (sem ADR)

| Tema | Decisão | Por quê | Alternativa descartada |
|------|---------|---------|------------------------|
| Identidade | `id integer generated always as identity`; referências por id | FR-009, US5-4; renomear não quebra vínculos | uuid: sem ganho aqui; slug: é assunto do catálogo público |
| Concorrência na mesma categoria | coluna `versao` + `WHERE id AND versao` | FR-019 exige recusar a 2ª alteração; funciona com HTTP stateless; recusa também formulário "velho" | "última gravação vence" (vetado na clarify); comparar por nome (sofre ABA) |
| Ordenação | `ORDER BY chave COLLATE "C", id` | independe de locale; uma query única | `Intl.Collator` no Worker (precisa de todos consumidores ordenarem); collation ICU (varia por ambiente) |
| Mapeamento de erro | `23505` ⇒ nome repetido (relê o nome existente p/ a mensagem); `23503` ⇒ bloqueio por produtos; 0 linhas ⇒ "mudou/não existe"; resto ⇒ "não foi possível salvar" | mensagens da spec | expor texto do banco (jargão e vazamento de host/usuário) |
| Acesso único | barrel só leitura + escrita só em actions | FR-014/015; mesmo padrão do barrel de auth | exportar tudo e confiar em convenção |
| Validação do nome | Zod no servidor: NFC, trim, colapso de espaços, 2–40, `\p{L}`/`\p{N}`/espaço/hífen (letras e números de qualquer alfabeto; clarify pós-análise); `CHECK` no banco para tamanho e espaços (defesa em profundidade) | constitution III.3 | validar só na UI |
| Erros do driver | verificar em teste de integração se o código SQLSTATE chega em `error.cause` (Drizzle 0.45 pode embrulhar) | evita mapear no escuro | — |

Premissa a validar em teste: NFD não decompõe `ß`, `æ`, `ø`, `ł`; esses ficam
distintos de `ss`, `ae`, `o`, `l`. Aceitável para nomes pt-BR (spec fala só de acento).

## Decisões D1–D5 (tomadas pelo humano em 2026-10-04)

Escolhidas: **D1-A** (seed na migration), **D2-B** (coluna gerada com built-ins,
expressão encapsulada na função SQL `categoria_chave(text)` `IMMUTABLE`, usada também
no lookup após `23505`), **D3-B** (`db.batch` com `pg_advisory_xact_lock` + `DELETE`
condicional com `RETURNING`; 0 linhas ⇒ leitura posterior só para a mensagem),
**D4-A** (contrato sem tabela; fixture `produtos` como tabela comum de teste, criada e descartada no teste de integração; contagem real refinada na análise, H3-A),
**D5-A** (`db:migrate` antes de `test:int`, local e CI; testes sem assumir tabela vazia).
D2 e D3 ⇒ [ADR-008](../adr/008-integridade-de-dados-neon-http.md) (aceito).
As tabelas abaixo ficam como **histórico**; a coluna "Estado" marca a escolhida.

Verificação adicional (2026-10-04, Postgres 18.6 local, transação revertida): função
`categoria_chave` `IMMUTABLE STRICT PARALLEL SAFE` aceita em coluna gerada `STORED` com
`UNIQUE`, e `WHERE chave = categoria_chave('GUÁRDA  chuvas')` encontra "Guarda-chuvas".

Efeitos práticos das escolhas, registrados para as tasks:
- D1-A/D5-A: `TRUNCATE` nos testes derruba o seed; helper de reset refaz o seed.
  Fixture `produtos` (D4-A) precisa ser descartada antes do `TRUNCATE`.
  `vitest.int.config.mts` precisa de `fileParallelism: false`.
- D2-B: mudar a regra exige migration recriando coluna e índice; `drizzle-kit` não
  modela a função (migration gerada pelo `drizzle-kit generate` e editada à mão: função
  antes do `CREATE TABLE`, seed depois; sem `--custom`, ver "Riscos").
- D3-B: FR-020 depende de todos os deletes passarem pela função de remoção; a atomicidade
  do batch é provada por probe determinístico no proxy local e no Neon dev (CI): mesmo
  txid, lock mantido até o fim do batch (polling em `pg_locks` com prazo) e isolamento
  `read committed`. No CI, o probe usa o mesmo `secrets.DATABASE_URL` do environment `dev`
  que a migration e o app usam (string **direta**, sem pooler; segunda análise, N1). Se o
  app passar a usar a string pooled, o probe é repetido com ela (ADR-008).
- D4-A: a fixture `produtos` é tabela comum (não `TEMP`). Refinamento da análise (H3-A):
  `contarProdutosDaCategoria` já conta de verdade, com um único `SELECT count(*)::int`
  (segunda análise, N10: sem `to_regclass`, pois só roda após `23503`). A 1ª task
  da 003 cria `produtos` pelo schema, troca o SQL cru da contagem e remove a fixture do helper.

## Opções avaliadas (histórico)

### D1 — Como criar a lista inicial uma única vez (FR-002, FR-003) — **escolhida: A**

| Opção | Como | Prós | Contras |
|-------|------|------|---------|
| **A. Seed dentro da migration** | `INSERT` das 5 linhas na mesma migration que cria a tabela | Roda uma vez por ambiente porque o journal do `drizzle-kit` marca como aplicada; atômica com a criação da tabela; segue o fluxo ADR-006 sem peça nova; local, dev e prod idênticos | Dado dentro de migration vira convenção nova (ADR-006 diz "produção só dados reais": as 5 categorias são reais, mas vale registrar); editar uma migration já aplicada não reexecuta (correto aqui); `db:reset` recria a lista (desejável) |
| **B. Seed em runtime com marcador** | tabela/linha `seed_aplicado`; primeira leitura ou rota interna insere se ausente | Independe do pipeline de migration | Corrida de dois Workers no 1º acesso (exige constraint no marcador); código de seed no caminho quente; mais superfície; prod pode ser lida antes do seed |
| **C. Script pós-migration no CI** | passo `db:seed` após `db:migrate` nos workflows | Separa schema de dado | Precisa do marcador de qualquer modo para "uma vez"; muda `.github/workflows` (CI); local depende de lembrar de rodar; dev/prod podem divergir se o passo falhar |

Banco de teste: nas três opções, o `integration` do CI e o local precisam **aplicar as
migrations** antes de `test:int` (hoje não aplicam). Ver D5.

### D2 — Onde vive a chave normalizada e quem a calcula (FR-005) — **escolhida: B (com função `categoria_chave`)**

Todas as opções criam `categorias.chave` com `UNIQUE`. Regra da chave: minúscula,
sem acento, hífen→espaço, espaços colapsados e sem pontas.

| Opção | Como | Prós | Contras |
|-------|------|------|---------|
| **A. Coluna comum calculada na aplicação** | TS calcula e grava `chave`; `UNIQUE(chave)` | Fácil de testar; lógica em um lugar | O banco só garante unicidade do que recebe: um writer que calcule errado (ou SQL manual/seed) fura a regra; duas implementações (TS e SQL do seed) a manter iguais |
| **B. Coluna gerada `STORED` com funções built-in** (verificado) | `GENERATED ALWAYS AS (btrim(regexp_replace(replace(regexp_replace(normalize(lower(nome), NFD), '[̀-ͯ]', '', 'g'), '-', ' '), '\s+', ' ', 'g')))` + `UNIQUE(chave)` | Banco calcula e garante: nenhum caminho (app, SQL, seed) contorna FR-005; sem extensão; sem wrapper; mesma expressão no seed | Expressão grande no schema do Drizzle (precisa `sql` raw e conferir o SQL gerado pelo `drizzle-kit`); cobertura de acentos é "tudo que o NFD decompõe"; depende de DB em UTF8 (Neon e local são); mudar a regra exige migration que recalcula a coluna |
| **C. Wrapper `IMMUTABLE` sobre `unaccent`** | `CREATE EXTENSION unaccent`; função própria marcada `IMMUTABLE` com dicionário qualificado; coluna gerada ou índice de expressão | Usa o dicionário oficial; índice de expressão dispensa coluna | Declarar `IMMUTABLE` é mentir ao planner: se o dicionário mudar, o índice corrompe silenciosamente; extensão em 3 ambientes (Neon permite `unaccent`, confirmar no projeto); `pg_dump`/restore frágil; mais risco que B pelo mesmo resultado |

Observação: B e C não precisam de cálculo em TS — o app só lê `chave`. Escolhida B com a
expressão encapsulada em função SQL para reuso no lookup após `23505`.

### D3 — Mínimo de 1 categoria sob remoções simultâneas (FR-020), sem transação interativa — **escolhida: B**

Problema: dois `DELETE` concorrentes, cada um com guarda `count(*) > 1`, veem o mesmo
snapshot (2 linhas) e ambos removem; a lista fica vazia. Precisa de serialização e de
snapshot novo depois do lock.

| Opção | Como | Prós | Contras |
|-------|------|------|---------|
| **A. Trigger no banco** | `BEFORE DELETE` (plpgsql): `pg_advisory_xact_lock(chave fixa)`; conta; `RAISE EXCEPTION` se ≤ 1 | Vale para **qualquer** writer, hoje e futuro (003, scripts); a app só mapeia o erro; um único statement no driver HTTP | Regra de negócio em plpgsql na migration (padrão novo no projeto, provável ADR); migration "custom" no drizzle-kit; teste só por integração |
| **B. `db.batch` na aplicação** | batch de 2 statements: (1) `SELECT pg_advisory_xact_lock(k)`; (2) `DELETE … WHERE id AND versao AND (count(*)>1) RETURNING` | Sem plpgsql; usa só o que o driver HTTP suporta (batch = 1 transação, READ COMMITTED, snapshot novo por statement); regra legível em TS | Só vale para quem usar essa função (outro caminho de delete fura FR-020); lock advisory de transação precisa funcionar no endpoint do Neon que o app usa (hoje a string direta; xact-level funciona também atrás do pooler; validar em dev pelo probe de CI) |
| **C. Driver WebSocket (`Pool`) com transação interativa** | `BEGIN; SELECT … FOR UPDATE; … COMMIT` | Modelo mental mais comum | **Muda o driver único do ADR-002** (novo ADR); WebSocket no Worker e no proxy local a confirmar; sai do "mesmo código do local à produção"; risco no free tier |

O que não precisa de D3: FR-011 (FK) e FR-019 (versão), que já são atômicos com o
driver atual.

### D4 — FR-011 antes de existir `produtos` (contrato com a 003) — **escolhida: A**

| Opção | Como | Prós | Contras |
|-------|------|------|---------|
| **A. Sem tabela na 002; contrato fixo** | 002 entrega remoção + tradução de `23503` + função de contagem com assinatura fixa (retorna 0 até a 003 implementá-la); teste de integração prova o mecanismo com tabela temporária que referencia `categorias` com `ON DELETE RESTRICT` | Não invade o schema da 003; mecanismo real testado no banco | A mensagem "N produtos" só fica viva de ponta a ponta na 003; a 002 depende de a 003 criar a FK corretamente (item no contrato e no checklist da 003) |
| **B. Tabela mínima `produtos` na 002** (`id`, `categoria_id` FK) | 003 estende | FR-011 completo e testável na 002 | Tabela fantasma que a 003 precisa reconciliar (expand/contract do ADR-006); vaza escopo da 003 |
| **C. Porta injetável** | `remover(id, { contarProdutos })` | Teste unitário simples | Não prova o banco; um consumidor que esqueça de injetar quebra a regra; troca regra de banco por regra de convenção |

Contrato para a 003 (determinado): `categoria_id integer NOT
NULL REFERENCES categorias(id) ON DELETE RESTRICT`; validar valor recebido com
`exigirCategoriaValida(id)`; nunca guardar o nome.

### D5 — Banco de teste (local e CI) — **escolhida: A**

Hoje `test:int` roda contra o banco local sem schema. Com tabela e seed:

| Opção | Como | Prós | Contras |
|-------|------|------|---------|
| **A. Migrar antes do `test:int`** | passo `npm run db:migrate` no job `integration` e doc do fluxo local; testes limpam/restauram o estado da tabela via helper | Simples; reaproveita o mesmo caminho das migrations (testa a migration e o seed de verdade, qualquer D1) | Muda `.github/workflows/checks.yml` (CI ⇒ doc-sync); testes compartilham o banco com o dev local (isolar por fixtures e transação/limpeza); o seed some quando o teste limpa a tabela — restaurar |
| **B. Banco/schema dedicado de teste** | `roseshop_test` (ou schema por arquivo), migrado no `globalSetup` do vitest | Isolamento total; não toca nos dados do dev | Mais peça (script de criação, `drizzle-kit`/migrator via TCP no setup); `docker-compose.yml`/proxy precisam apontar para o banco certo (o proxy usa a connection string por requisição, o que ajuda) |

## Riscos e pontos de atenção

- Primeira migration do projeto: valida pela primeira vez o passo `Migrations` dos
  workflows no Neon `dev` e `production`. Testar em dev antes (ADR-006).
- `drizzle-kit generate` não modela a função SQL. Fluxo: geração normal (o kit emite a
  tabela com a coluna gerada e grava o snapshot com ela) e edição à mão do SQL (função
  antes do `CREATE TABLE`, seed depois, separados por `--> statement-breakpoint`).
  **Não usar `generate --custom`**: conferido no `drizzle-kit` 0.31 instalado
  (`bin.cjs`), o modo custom grava um snapshot copiado do anterior, sem a tabela; a
  geração seguinte recriaria `categorias` e a conferência "No schema changes" falharia.
- Seed escrito em SQL deve produzir exatamente: Bolsas, Guarda-chuvas, Tupperware,
  Panos de prato, Meias (grafia da spec).
