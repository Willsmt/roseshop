# Banco de dados

> Estado: **cinco tabelas** — `categorias` (feature 002), `produtos` e
> `produto_fotos` (feature 003), `fotos_envio` e `ia_uso` (feature 004, SF1) — e
> uma função SQL (`categoria_chave`). A migration `0000` cria a função,
> `categorias` e o seed; a `0001` cria `produtos` e `produto_fotos`; a `0002`
> cria `fotos_envio` e `ia_uso` e estende `produtos` e `produto_fotos`. Só o
> schema existe; desde as SF4 a SF6 da feature 004, `fotos_envio` e `produto_fotos`
já são gravadas por código (`src/lib/db/fotos.ts`, `inserirComFotos` em
`produtos.ts`); `ia_uso` ainda não. A sessão de login
> é JWT e não tem tabelas ([F01](./features/F01-autenticacao.md)). Fonte do
> schema: `src/lib/db/schema.ts`.

## Visão leiga

O banco guarda a **lista de categorias da loja** (Bolsas, Meias,
Tupperware etc.) e os **produtos** de cada categoria. Cada categoria tem um nome e um número interno (`id`). O banco
mesmo impede duas categorias com "o mesmo nome" (ignorando maiúsculas, acentos,
espaços extras e hífen no lugar de espaço): "Panos de Prato" e "panos de prato"
são a mesma categoria. A migration já traz a lista inicial (cinco categorias),
então um banco recém-criado nunca nasce vazio.

Cada produto pertence a uma categoria, tem um nome único (mesma regra de
equivalência das categorias), descrição e preço opcionais, a marca de esgotado e
uma vaga de destaque (1 a 8, no máximo oito produtos em destaque). O banco
recusa nome fora de 3 a 80 letras, preço fora da faixa, destaque de produto
esgotado e uma categoria apagada enquanto tem produtos. A tabela de fotos já
existe, mas fica vazia até a feature 004. Para essa feature o banco também ganhou
(sem uso ainda) o registro dos **envios de foto** em andamento, o **contador
diário de sugestões da IA** por administradora e, em cada produto, uma versão do
conjunto de fotos.

## Aprofundamento técnico

### Modelo

```mermaid
erDiagram
  categorias {
    integer id PK "identity (GENERATED ALWAYS)"
    text nome "2 a 40 caracteres, sem pontas nem espaços duplos"
    text chave UK "gerada: categoria_chave(nome)"
    integer versao "concorrência otimista, começa em 1"
    timestamptz criado_em
    timestamptz atualizado_em
  }
  produtos {
    integer id PK "identity; também é o código de referência"
    integer categoria_id FK "ON DELETE RESTRICT"
    text nome
    text chave UK "gerada: categoria_chave(nome)"
    text descricao "opcional, até 1000"
    integer preco_centavos "opcional, 1 a 9999999"
    boolean a_partir_de
    boolean esgotado
    smallint destaque_vaga UK "1 a 8, nulo = fora do destaque"
    integer versao "concorrência otimista"
    text criado_por
    text atualizado_por
    timestamptz criado_em
    timestamptz atualizado_em
    integer fotos_versao "NOT NULL DEFAULT 1 (feature 004)"
    uuid fotos_operacao "nulo (feature 004)"
  }
  produto_fotos {
    integer id PK
    integer produto_id FK "ON DELETE CASCADE"
    smallint posicao "1 a 3, UNIQUE com produto_id"
    text chave_objeto UK "formato fotos/uuid-v4.webp|jpg"
    text enviado_por
    timestamptz enviado_em
    timestamptz criado_em
  }
  fotos_envio {
    uuid id PK "uuid v4"
    text formato "webp ou jpeg"
    text chave UK "gerada STORED a partir de id e formato"
    integer tamanho "1 a 1048576"
    text enviado_por
    text estado "emitido ou confirmado"
    timestamptz criado_em
    timestamptz confirmado_em "nulo enquanto emitido"
  }
  ia_uso {
    date dia PK "parte 1 da PK"
    text email PK "parte 2 da PK"
    integer n "maior ou igual a 1"
  }
  categorias ||--o{ produtos : "restrict"
  produtos ||--o{ produto_fotos : "cascade"
```

### Tabela `categorias`

Definida em `src/lib/db/schema.ts`; SQL real em
`src/lib/db/migrations/0000_naive_dragon_man.sql`.

| Coluna | Tipo | Regras |
|---|---|---|
| `id` | `integer` | PK, `GENERATED ALWAYS AS IDENTITY`. |
| `nome` | `text` | `NOT NULL`. Checks: `categorias_nome_tamanho` (`char_length` entre 2 e 40), `categorias_nome_sem_pontas` (igual ao `btrim`), `categorias_nome_sem_espacos_duplos` (sem `\s{2,}`). |
| `chave` | `text` | `GENERATED ALWAYS AS (categoria_chave(nome)) STORED`, `NOT NULL`, constraint `categorias_chave_unique`. Nenhum código a grava. |
| `versao` | `integer` | `NOT NULL DEFAULT 1`. Incrementada a cada renomeação; entra no `WHERE` do `UPDATE`/`DELETE` (FR-019). |
| `criado_em` / `atualizado_em` | `timestamptz` | `NOT NULL DEFAULT now()`. `atualizado_em` é atualizado pela query de renomear (não há trigger). |

### Função `categoria_chave(text)` e a regra de equivalência

`IMMUTABLE`, `STRICT`, `PARALLEL SAFE`, só com built-ins: minúscula, `normalize`
NFD, remoção das marcas combinantes `U+0300–U+036F`, hífen vira espaço, colapso
de espaços e `btrim`. Vive **só na migration** (o `drizzle-kit` não modela
funções); o `schema.ts` declara a coluna gerada com `generatedAlwaysAs` apenas
para o kit não propor removê-la. Decisão e alternativas descartadas:
[ADR-008](../specs/adr/008-integridade-de-dados-neon-http.md).

Consequências práticas:

- A unicidade é do banco (`UNIQUE(chave)`), inclusive sob concorrência. O código
  só reage ao SQLSTATE `23505` e busca o nome já gravado com
  `chave = categoria_chave($1)` (uma só implementação da regra).
- Alterar o **corpo** da função não recalcula valores já gravados: mudar a regra
  exige migration nova que recrie a coluna gerada e o índice.
- Caracteres que o NFD não decompõe (`ß`, `æ`, `ø`, `ł`) permanecem distintos.
- Listagem: `ORDER BY chave COLLATE "C", id`, independente do locale do servidor.

### Migration `0000` e seed

Gerada pelo `drizzle-kit generate` e **editada à mão** (emenda do ADR-008): a
função vem antes do `CREATE TABLE` e o seed depois, entre os marcadores
`-- seed:categorias:start` / `-- seed:categorias:end`. Seed: Bolsas,
Guarda-chuvas, Tupperware, Panos de prato, Meias. Como o seed é parte da
migration, ele roda uma única vez por banco (o drizzle registra a migration
aplicada): categoria removida ou renomeada **não volta** em deploys seguintes.
Os testes de integração leem o bloco entre os marcadores para recriar o estado
inicial (`src/test/db/categorias-fixtures.ts`).

Pegadinhas:

- Depois de editar uma migration gerada, rode `db:generate` de novo e confira
  que o kit diz "No schema changes" (a função manual não pode virar diff).
- A migration `0000` é **congelada** no Neon dev a partir do primeiro run do PR
  da feature 002 (CI aplica `db:migrate`); mudança posterior exige migration
  nova, nunca edição da `0000`.

### Tabela `produtos`

Definida em `src/lib/db/schema.ts`; SQL real em
`src/lib/db/migrations/0001_premium_boomerang.sql` (gerada pelo `drizzle-kit`,
sem edição manual; a `chave` reaproveita `categoria_chave` da `0000`).

| Coluna | Tipo | Regras |
|---|---|---|
| `id` | `integer` | PK, `GENERATED ALWAYS AS IDENTITY`. É o código de referência (`#0042` é só formatação). |
| `categoria_id` | `integer` | `NOT NULL`, FK para `categorias.id` com `ON DELETE RESTRICT` explícito (o padrão do Drizzle seria `NO ACTION`). Índice `produtos_categoria_id_idx`. |
| `nome` | `text` | `NOT NULL`. Checks `produtos_nome_tamanho` (3 a 80), `produtos_nome_sem_pontas`, `produtos_nome_sem_espacos_duplos`. |
| `chave` | `text` | Gerada (`categoria_chave(nome)`), `NOT NULL`, `produtos_chave_unique`. Nunca entra em `SET`. |
| `descricao` | `text` | Nulável; `produtos_descricao_tamanho` (até 1000). |
| `preco_centavos` | `integer` | Nulável; `produtos_preco_faixa` (1 a 9.999.999). |
| `a_partir_de` | `boolean` | `NOT NULL DEFAULT false`; `produtos_a_partir_de_com_preco` exige preço quando verdadeiro. |
| `esgotado` | `boolean` | `NOT NULL DEFAULT false`. |
| `destaque_vaga` | `smallint` | Nulável (fora do destaque). `produtos_destaque_vaga_faixa` (1 a 8) e índice único parcial `produtos_destaque_vaga_unique` (`WHERE destaque_vaga IS NOT NULL`): é isso que impõe o teto de 8 e a vaga única. `produtos_destaque_disponivel`: esgotado não pode ter vaga. |
| `versao` | `integer` | `NOT NULL DEFAULT 1`; todo writer soma 1 e a confere no `WHERE`. |
| `criado_por` / `atualizado_por` | `text` | `NOT NULL`; e-mail da sessão. |
| `criado_em` / `atualizado_em` | `timestamptz` | `NOT NULL DEFAULT now()`; `atualizado_em` é gravado pela query (sem trigger). |
| `fotos_versao` | `integer` | `NOT NULL DEFAULT 1` (migration `0002`). Versão do conjunto de fotos; só o writer de fotos a altera, nunca `versao` (comentário em `schema.ts`, "research D5" da spec 004). Nenhum código a usa ainda. |
| `fotos_operacao` | `uuid` | Nulável (migration `0002`). Idem: reservada ao writer de fotos da 004, sem uso ainda. |

### Tabela `produto_fotos`

Modelo da 003 estendido pela `0002`; gravada por `inserirComFotos` (cadastro) e `substituirConjunto` (`src/lib/db/fotos.ts`, ainda sem action), apagada em cascata por `remover`.
`id` identity; `produto_id` FK com `ON DELETE CASCADE` (remover produto leva as
fotos); `posicao` 1 a 3 (`produto_fotos_posicao_faixa`),
`UNIQUE(produto_id, posicao)`; `chave_objeto` `text NOT NULL` (chave do objeto no
R2); `criado_em`. A `0002` acrescentou:

| Coluna / constraint | Regra |
|---|---|
| `enviado_por` | `text NOT NULL`, sem default (quem enviou; e-mail da sessão). |
| `enviado_em` | `timestamptz NOT NULL`, sem default (diferente de `criado_em`, que tem `now()`). |
| `produto_fotos_objeto_unique` | `UNIQUE(chave_objeto)`: o mesmo objeto do R2 não serve a duas fotos. |
| `produto_fotos_objeto_formato` | `CHECK` por regex: `^fotos/<uuid v4 minúsculo>\.(webp\|jpg)$`, o mesmo formato de `fotos_envio.chave`. |

### Tabela `fotos_envio`

Registro de cada envio de foto emitido para a área temporária do R2 (feature 004).
A linha nasce `emitido` (`emitirEnvio`), vira `confirmado` (`marcarConfirmado`) e some
ao ser adotada pelo cadastro (`inserirComFotos`), recusada (`descartarEnvio`, só
`emitido`) ou limpa após 24 h (a **limpeza diária ainda não existe**). Teto de 20 envios
por pessoa em 24 h. Fluxo em [F04](./features/F04-fotos.md). SQL real em
`src/lib/db/migrations/0002_breezy_mentor.sql`.

| Coluna | Tipo | Regras |
|---|---|---|
| `id` | `uuid` | PK, sem default (a aplicação gera). `fotos_envio_id_v4`: `uuid_extract_version(id) = 4`. |
| `formato` | `text` | `NOT NULL`; `fotos_envio_formato`: `webp` ou `jpeg`. |
| `chave` | `text` | Gerada `STORED`: `'fotos/' \|\| id::text \|\| ('.webp' ou '.jpg')`; `UNIQUE` (`fotos_envio_chave_unique`). STORED porque coluna virtual (padrão do PG 18) não aceita `UNIQUE`; o cast `id::text` mantém o `\|\|` imutável, exigido em coluna gerada. |
| `tamanho` | `integer` | `NOT NULL`; `fotos_envio_tamanho`: 1 a 1.048.576 (1 MiB). |
| `enviado_por` | `text` | `NOT NULL`. |
| `estado` | `text` | `NOT NULL DEFAULT 'emitido'`; `fotos_envio_estado`: `emitido` ou `confirmado`. |
| `criado_em` | `timestamptz` | `NOT NULL DEFAULT now()`. |
| `confirmado_em` | `timestamptz` | Nulável; `fotos_envio_confirmacao` amarra: `estado = 'confirmado'` se e somente se `confirmado_em` não é nulo. |

### Tabela `ia_uso`

Contador diário de sugestões da IA por administradora (feature 004). `dia`
(`date`, data de Brasília calculada pelo writer sob `LOCK_IA_USO`) e `email`
(`text`) formam a PK `ia_uso_pkey`; `n` (`integer NOT NULL`) tem
`ia_uso_n_minimo` (`n >= 1`). Linhas antigas ficam (sem limpeza). Nada grava
nela ainda (a IA é de outra etapa).

### Regras de exclusão e integridade

| Regra | Onde é garantida |
|---|---|
| Nome único por equivalência (FR-005) | Banco: `UNIQUE(chave)` sobre coluna gerada. |
| Nome 2 a 40 caracteres, sem pontas/espaços duplos | Banco (checks) e Zod (`src/lib/categorias/nome.ts`). |
| Edição simultânea da mesma categoria (FR-019) | Coluna `versao` no `WHERE` de `UPDATE`/`DELETE`. |
| Sempre ao menos uma categoria (FR-020) | **Aplicação**: `db.batch` com `pg_advisory_xact_lock` + `DELETE ... WHERE (SELECT count(*)) > 1` em `remover` (`src/lib/db/categorias.ts`). Um `DELETE` por SQL manual contorna a regra. |
| Categoria com produtos não pode ser removida (FR-011) | Banco: FK `produtos.categoria_id` `ON DELETE RESTRICT` (SQLSTATE `23001`). |
| Nome de produto único por equivalência | Banco: `UNIQUE(chave)` (23505); o código busca o existente só para a mensagem. |
| No máximo 8 produtos em destaque, cada um em uma vaga | Banco: `destaque_vaga` 1 a 8 + índice único parcial; `destacar` escolhe a menor vaga livre no `UPDATE` ([F03](./features/F03-produtos.md#concorrência-destaque-e-status)). |
| Esgotado não fica em destaque | Banco (`produtos_destaque_disponivel`) e `esgotar`, que zera a vaga no mesmo `UPDATE`. |
| Edição simultânea de produto | Coluna `versao` no `WHERE` de `UPDATE`/`DELETE`. |

O driver é `neon-http`: **não há `db.transaction()`**. Só statements isolados e
`db.batch([...])` (uma transação `READ COMMITTED`, sem decidir o próximo
statement pelo resultado do anterior). Chaves de lock advisory ficam
registradas em `src/lib/db/locks.ts` (`LOCK_PROBE_BATCH = 2001`,
`LOCK_REMOCAO_CATEGORIAS = 2002`, `LOCK_FOTOS = 4001` e `LOCK_IA_USO = 4002`;
`LOCK_FOTOS` é usado pelos writers de fotos e `LOCK_IA_USO` ainda não); número nunca
é reutilizado.

### FK de produtos e a remoção de categorias

`BLOQUEIO_POR_PRODUTOS` em `src/lib/db/categorias.ts` só reconhece o SQLSTATE
**`23001`** (`restrict_violation`); o padrão `NO ACTION` geraria `23503`, não
tratado. Por isso a FK declara `RESTRICT` e `contarProdutosDaCategoria` usa o
schema Drizzle de `produtos`. O fato "FK `RESTRICT` ⇒ `23001`, e o `db.batch`
reverte tudo" é provado por `src/lib/db/fk-produtos.int.test.ts`, que roda no
proxy local (`npm run test:int`) **e no Neon dev pelo CI do PR**
(`vitest.probe.config.mts`; ver [operacao.md, "CI"](./operacao.md#ci)).

Pegadinhas do schema de produtos:

- A migration `0001` fica **congelada** no Neon dev a partir do primeiro run do
  PR da feature 003; mudança depois disso exige migration nova.
- Alterar o corpo de `categoria_chave` afeta categorias **e** produtos (duas
  colunas geradas); a regra de recriar coluna e índice vale para as duas.
- A migration `0002` adiciona `enviado_por`/`enviado_em` `NOT NULL` sem default a
  `produto_fotos`: qualquer INSERT (inclusive de teste) precisa informá-los e a
  `chave_objeto` precisa estar no formato novo (por isso os testes da 003
  foram ajustados).
- Regra geral: migration aplicada em ambiente online **não é editada**; correção
  só por migration nova (prática registrada no PR da feature 002, com a `0000`).
  A `0002` ainda não foi aplicada no Neon dev: a regra passa a valer para ela a
  partir do primeiro run do PR da feature 004 (CI aplica `db:migrate`).
- Premissa de código: todo writer de `produtos` que altera campos, status ou destaque
  incrementa `versao` (`saiuDoDestaque` e a precedência de mensagens dependem disso).
  O writer de fotos (`substituirConjunto`) altera só `fotos_versao`, `fotos_operacao`,
  `atualizado_por` e `atualizado_em`, nunca `versao` (emenda de 2026-10-09 do ADR-008).
- `inserirComFotos` e `remover` de produtos são `db.batch` sob `LOCK_FOTOS`; erros de
  FK e unicidade do cadastro só viram `categoria_ausente`/`nome_repetido` pelo **nome
  exato** da constraint (`produtos_categoria_id_categorias_id_fk`, `produtos_chave_unique`).

### Como o código acessa o banco

Camadas e proibições de import em
[F02-categorias.md](./features/F02-categorias.md#camadas-e-fronteira-de-acesso).
Cliente e health check em
[architecture.md, "Camada de banco"](./architecture.md#camada-de-banco-e-health-check).
Comandos (`db:generate`, `db:migrate`, `db:reset`) em
[operacao.md](./operacao.md#comandos-packagejson).
