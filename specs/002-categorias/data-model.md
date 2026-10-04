# Data Model — Feature 002 (categorias)

Estado: **completo** (D1–D5 decididas em 2026-10-04; ver `research.md` e ADR-008).
Nenhuma migration foi escrita.

## Entidade: Categoria (`categorias`)

| Coluna | Tipo | Regra |
|--------|------|-------|
| `id` | `integer`, identity, PK | Identidade estável; é o que outras tabelas referenciam (FR-009) |
| `nome` | `text`, NOT NULL | Como digitado após normalizar espaços; 2–40 caracteres; letras (com acento), números, espaço, hífen (FR-008) |
| `chave` | `text`, NOT NULL, **UNIQUE** | Minúscula, sem acento, hífen→espaço, espaços colapsados e sem pontas. **Coluna gerada `STORED`**: `GENERATED ALWAYS AS (categoria_chave(nome))` (D2-B); nenhum writer a informa. Base da unicidade (FR-005) e da ordenação (FR-012) |
| `versao` | `integer`, NOT NULL, default 1 | Incrementa a cada rename; guarda de concorrência (FR-019) |
| `criado_em` | `timestamptz`, NOT NULL, default `now()` | UTC (constitution IV) |
| `atualizado_em` | `timestamptz`, NOT NULL, default `now()` | Atualizado no rename |

Constraints e índices:

- `UNIQUE (chave)` — única fonte de verdade da equivalência. Violação = `23505`.
- `CHECK (char_length(nome) BETWEEN 2 AND 40)`, `CHECK (nome = btrim(nome))`,
  `CHECK (nome !~ '\s{2,}')` — defesa em profundidade; o charset fica no Zod
  (regex de letras Unicode do PG depende de locale).
- Consulta de listagem: `ORDER BY chave COLLATE "C", id` (tabela de dezenas de linhas, sem índice extra).
- Mínimo de 1 linha (FR-020): `db.batch` com `pg_advisory_xact_lock` + `DELETE` condicional (D3-B); sem trigger.

Dados iniciais (FR-002/003): Bolsas, Guarda-chuvas, Tupperware, Panos de prato, Meias.
`INSERT` na mesma migration que cria a tabela (D1-A); o journal do `drizzle-kit` garante "uma única vez". Banco de teste: `db:migrate` antes do `test:int` (D5-A).

## Função `categoria_chave(text)` (D2-B)

`returns text`, `language sql`, `IMMUTABLE`, `STRICT`, `PARALLEL SAFE`; somente built-ins:
`lower` → `normalize(…, NFD)` → remove `U+0300–U+036F` → hífen vira espaço → `\s+` vira
um espaço → `btrim`. Usada pela coluna gerada `chave` e pelo lookup do nome existente
após `23505` (`WHERE chave = categoria_chave($1)`). Alterar a regra exige migration
que recria coluna e índice.

## Relações

- Futuro: `produtos.categoria_id integer NOT NULL REFERENCES categorias(id) ON DELETE RESTRICT`
  (feature 003; FR-011/013). Na 002 não existe tabela de produtos (D4-A): o teste de integração cria uma `produtos` **comum** (não `TEMP`; SQL cru, pelo helper `src/test/db/categorias-fixtures.ts`) com essa FK e a descarta ao fim; `contarProdutosDaCategoria` conta com um único `SELECT count(*)::int` (H3-A; sem `to_regclass`, pois só roda após `23001`). Fixture sobrada de execução interrompida: `npm run db:reset` + `npm run db:migrate` (local). A 1ª task da 003 cria a tabela pelo schema, troca o SQL cru da contagem e remove a fixture.

## Regras de validação (Zod, servidor)

1. `nome`: string; NFC; trim; colapsa espaços; vazio ⇒ "escreva um nome" (FR-007).
2. Tamanho 2–40 após normalizar (FR-008).
3. Charset: `\p{L}` (letras de qualquer alfabeto, incl. acentuadas), `\p{N}`, espaço, hífen (FR-008).
4. `id`: inteiro positivo; `versao`: inteiro positivo.

## Transições de estado (por operação)

| Operação | Pré-condições (no banco) | Efeito | Recusas |
|----------|--------------------------|--------|---------|
| Criar | `chave` (gerada) inédita | nova linha, `versao = 1` | `23505` ⇒ "Já existe uma categoria chamada X." |
| Renomear | linha existe com a `versao` informada; nova `chave` inédita **ou** é a da própria linha | `nome`, `chave` novos, `versao + 1` | duplicado; 0 linhas ⇒ "alterada por outra pessoa" / "não existe mais" |
| Remover | linha existe com a `versao`; sem produtos (FK); restar ≥ 1 categoria (batch com lock, D3-B) | linha apagada | 0 linhas; `23001` ⇒ "tem N produtos"; última ⇒ "precisa ter pelo menos uma" |
