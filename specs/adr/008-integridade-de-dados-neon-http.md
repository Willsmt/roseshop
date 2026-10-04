# ADR-008 — Integridade de dados com driver neon-http sem transação interativa

**Status:** aceito
**Data:** 2026-10-04
**Emenda (2026-10-04, aprovada pelo humano):** a migration não usa `generate --custom`
(o modo custom grava um snapshot sem a tabela). É gerada pelo `drizzle-kit generate` e
editada à mão: função antes do `CREATE TABLE`, seed depois. A decisão não muda.

## Contexto

O ADR-002 fixa um único driver em todos os ambientes: `@neondatabase/serverless` via
HTTP (`drizzle-orm/neon-http`). Esse driver não tem transação interativa:
`db.transaction()` lança "No transactions support in neon-http driver". Só existem
statements isolados e `db.batch([...])`, que executa statements pré-montados numa única
transação (READ COMMITTED), sem decidir o próximo com base no resultado do anterior.

A feature 002 (categorias) precisa de duas garantias que o banco ou a aplicação devem
impor sob concorrência de três administradoras:

1. Unicidade por equivalência de nome (FR-005): nomes que diferem só em
   maiúsculas, acentos, espaços extras ou hífen×espaço são o mesmo nome.
2. Pelo menos uma categoria sempre (FR-020), inclusive com remoções simultâneas.

Fatos verificados no Postgres 18 local: `lower`, `normalize`, `regexp_replace`,
`replace` e `btrim` são `IMMUTABLE`; `unaccent` é `STABLE` e exige extensão. Um
`DELETE … WHERE (select count(*)) > 1` isolado não basta: dois deletes concorrentes
leem o mesmo snapshot (2 linhas) e ambos passam.

## Decisão

**1. Equivalência de nomes (D2): coluna gerada com função SQL `IMMUTABLE`.**
- Função `categoria_chave(text)` (`IMMUTABLE`, `STRICT`, `PARALLEL SAFE`), só com
  built-ins: `lower`, `normalize(…, NFD)`, `regexp_replace` removendo
  `U+0300–U+036F`, `replace` hífen→espaço, colapso de `\s+`, `btrim`.
- `categorias.chave` é `GENERATED ALWAYS AS (categoria_chave(nome)) STORED` com
  `UNIQUE(chave)`. Nenhum writer informa a chave; a unicidade é do banco.
- O lookup do nome existente após `23505` usa a mesma função
  (`WHERE chave = categoria_chave($1)`): uma só implementação da regra.
- A ordenação alfabética usa `ORDER BY chave COLLATE "C"`.
- No `schema.ts`, `chave` é declarada com `generatedAlwaysAs(sql`categoria_chave(nome)`)`
  para o `drizzle-kit` conhecer a coluna e não propor removê-la em gerações futuras;
  a função em si vive só na migration.

**2. Mínimo de uma categoria (D3): `db.batch` com lock advisory de transação.**
- Remoção = `db.batch([ SELECT pg_advisory_xact_lock(k), DELETE … WHERE id = $1 AND
  versao = $2 AND (SELECT count(*) FROM categorias) > 1 RETURNING id ])`.
- O lock serializa remoções concorrentes; como cada statement do batch toma
  snapshot novo em READ COMMITTED, o `DELETE` posterior enxerga o commit da outra
  remoção. 0 linhas ⇒ uma leitura posterior só escolhe a mensagem
  (`nao_existe` / `alterada` / `ultima`).
- A chave `k` do lock é uma constante nomeada, definida num registro único de chaves
  de lock advisory em `src/lib/db/`, para que invariantes futuros não colidam.
- Concorrência na mesma categoria (FR-019): coluna `versao` (otimista) no
  `WHERE` de `UPDATE` e `DELETE`.
- Bloqueio por produtos (FR-011) é da FK `ON DELETE RESTRICT` da feature 003, não
  deste mecanismo.

**Regra geral derivada**: com `neon-http`, invariantes de integridade vão para
constraints/colunas geradas/FKs sempre que o banco puder expressá-las; o que exigir
decisão entre statements usa `db.batch` com lock advisory de transação e não
depende de resultado intermediário. Nenhum código assume `db.transaction()`.

## Alternativas descartadas

- **Chave calculada na aplicação (coluna comum)**: o banco só garante unicidade do
  que recebe; SQL manual, seed ou outro writer poderiam contornar FR-005, e a regra
  existiria em duas implementações (TS e SQL).
- **Wrapper `IMMUTABLE` sobre `unaccent`**: declarar `IMMUTABLE` uma função `STABLE`
  engana o planner e pode corromper índice se o dicionário mudar; exige extensão em
  três ambientes e dificulta restore.
- **Trigger `BEFORE DELETE` com lock + contagem**: garantiria FR-020 para qualquer
  writer, mas introduz regra de negócio em plpgsql, padrão novo no projeto.
- **Driver WebSocket (`Pool`) com transação interativa**: reverte o "driver único"
  do ADR-002 (novo ADR), exige confirmar WebSocket no Worker e no proxy local e
  aumenta o risco no free tier.

## Consequências

- (+) Sem dependência, extensão, driver ou conexão persistente novos; mesmo código do
  local à produção.
- (+) FR-005 não pode ser contornado por nenhum caminho de escrita.
- (+) A regra de normalização tem uma única implementação, no banco.
- (−) FR-020 é garantido pela aplicação: um `DELETE` fora da função de remoção o
  contornaria (por exemplo, SQL manual no console do Neon). Mitigações: a única porta de escrita é a Server Action, e o teste de
  conformidade (FR-015) nega import das funções de escrita fora do módulo.
- (−) Mudar a regra de normalização exige migration que recria a coluna gerada e o
  índice; alterar só o corpo da função não recalcula valores gravados.
- (−) `drizzle-kit` não modela a função: a migration é gerada pelo `drizzle-kit generate`
  e editada à mão (função antes do `CREATE TABLE`, seed depois), e o diff do kit precisa
  ser conferido ("No schema changes" na geração seguinte).
- (−) Caracteres que o NFD não decompõe (`ß`, `æ`, `ø`, `ł`) ficam distintos.
- (−) Lock advisory e `db.batch` devem ser validados contra o proxy local e o Neon
  `dev` com concorrência real antes de produção (ADR-006).
- (−) Testes de integração de concorrência não podem rodar em paralelo entre
  arquivos que tocam `categorias`.
