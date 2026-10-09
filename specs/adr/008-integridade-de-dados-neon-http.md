# ADR-008 — Integridade de dados com driver neon-http sem transação interativa

**Status:** aceito
**Data:** 2026-10-04
**Emenda (2026-10-04, aprovada pelo humano):** a migration não usa `generate --custom`
(o modo custom grava um snapshot sem a tabela). É gerada pelo `drizzle-kit generate` e
editada à mão: função antes do `CREATE TABLE`, seed depois. A decisão não muda.
**Emenda (2026-10-04, segunda análise da feature 002, aprovada pelo humano):**
- Probe no Neon dev: roda em passo de CI com o mesmo `DATABASE_URL` do environment `dev`
  que a migration e o app usam (connection string direta, sem pooler). Além do mesmo txid e
  do lock mantido até o fim do batch, verifica isolamento `read committed`. **Se o app passar
  a usar a string pooled, o probe deve ser repetido com ela** antes da troca chegar a produção.
- Nomenclatura: na camada db, as remoções que afetam 0 linhas devolvem os resultados
  `ausente` / `versao_diferente` / `ultima`; os motivos de domínio exibidos ao usuário são
  `nao_existe` / `alterada` / `ultima` (tradução em `src/lib/categorias/erros.ts`). O texto
  da Decisão 2 abaixo usa os motivos de domínio.
**Emenda (2026-10-04, abertura da SF4 da feature 002, aprovada pelo humano):**
- Fato 1: o erro de um statement dentro do `db.batch` chega como `NeonDbError` sem embrulho
  (SQLSTATE em `error.code`, sem `cause`); em statement isolado chega como `DrizzleQueryError`
  com o SQLSTATE em `error.cause.code`. Decisão: `codigoSqlstate` (`src/lib/db/erros-pg.ts`)
  lê `error.cause.code` ou, somente quando `error instanceof NeonDbError`, `error.code`;
  `code` no topo de qualquer outro erro é ignorado.
- Fato 2: a FK `ON DELETE RESTRICT` recusa o `DELETE` com `23001` (restrict_violation);
  `23503` só é produzido por `NO ACTION` (confirmado no psql, PG 18.6). Decisão: o bloqueio
  por produtos (FR-011) é reconhecido só por `23001`.
**Emenda (2026-10-07, plano da feature 003, aprovada pelo humano):** aplicações da regra
geral, sem mudar a Decisão (origem: D1, D4 e D9 de `specs/003-produtos/research.md` §3).
- Teto de 8 destaques (FR-018 da 003) é **constraint, não lock advisory**:
  `produtos.destaque_vaga smallint NULL CHECK (BETWEEN 1 AND 8)` + índice único parcial
  `ON (destaque_vaga) WHERE destaque_vaga IS NOT NULL`, e `CHECK (NOT (esgotado AND
  destaque_vaga IS NOT NULL))`. Destacar é um único `UPDATE` que escolhe a menor vaga livre
  (`generate_series(1, 8)` menos as ocupadas) e só grava se ela existir. Mesma vaga
  disputada ⇒ o índice único faz o segundo esperar o commit do primeiro e falhar com
  `23505`, traduzido em "tente de novo" (`vaga_disputada`), **sem retry automático**.
  Nenhuma chave nova em `locks.ts`. Descartados: `db.batch` + lock + contagem (teto só na
  aplicação, e o banco consegue expressá-lo) e trigger. Consequências: (+) teto e "esgotado
  fora do destaque" valem contra qualquer writer; (+) a vaga pode ordenar o carrossel do
  catálogo; (−) recusa espúria possível com duas pessoas destacando ao mesmo tempo e mais
  de uma vaga livre (aceito: 3 administradoras, nada é alterado); (−) em `destacar`,
  `23505` é sempre a vaga porque o `SET` não toca `nome` — se o statement passar a gravar
  outra coluna única, a tradução deve distinguir pela constraint.
- Equivalência compartilhada: `produtos.chave` é `GENERATED ALWAYS AS
  (categoria_chave(nome)) STORED` com `UNIQUE`, reusando a função da Decisão 1 sem wrapper;
  lookup após `23505` e busca por parte do nome (`strpos(chave, categoria_chave($1)) > 0`)
  usam a mesma função. Consequência: mudar a regra exige recriar as colunas geradas e os
  índices de **`categorias` e `produtos`** na mesma migration.
- Prova da FK `RESTRICT` ⇒ `23001` no Neon dev (contrato §5 da 002): o probe do CI ganha
  um teste que, num único `db.batch`, insere categoria e produto com marcador único e tenta
  apagar a categoria; o `23001` aborta a transação inteira e nada persiste. Include literal
  no `vitest.probe.config.mts`; sem `TRUNCATE`. Resíduo por configuração da FK: com
  `NO ACTION` o batch aborta com `23503` (sem resíduo; o teste falha pelo código); com
  `CASCADE` o `DELETE` apaga categoria e produto (nada sobra; o teste falha por não haver
  erro); **só FK inexistente deixa resíduo** (produto órfão), e a limpeza do teste apaga o
  produto pelo marcador. Consequência: o probe do dev deixa de ser só leitura; todo teste
  nele precisa ter escrita revertida pelo próprio erro esperado.
- O probe com escrita roda **só no CI do PR contra o Neon dev**, nunca contra produção (nem
  no deploy do `main`): mesmo revertido, o insert consome valores das identities.
  Verificado em 2026-10-07: o probe está só em `.github/workflows/pull-request.yml`
  (environment `dev`); `main.yml` não o executa.
**Emenda (2026-10-09, SF0 da feature 004, aceita em 2026-10-09, aprovada pelo humano na
T013):** aplicações da regra geral às fotos e à IA, sem mudar a Decisão (origem: D5 e D7 de
`specs/004-fotos-produto/research.md` §2 e §4, data-model da 004 "Registro de locks" e
"Invariantes", contracts/fotos.md §2 e contracts/ia.md §3, plan "Complexity Tracking").
- **Chaves novas** no registro único de `src/lib/db/locks.ts`: `4_001` (`LOCK_FOTOS`) — toda
  escrita em `produto_fotos` e todo **consumo** de `fotos_envio` (cadastro com fotos, ações de
  fotos, remoção de produto, limpeza); `4_002` (`LOCK_IA_USO`) — consumo do limite de
  sugestões. Emissão, confirmação e descarte de `fotos_envio` ficam **fora** do lock (não
  consomem envio nem tocam `produto_fotos`).
- **Lock de fotos global** (não por produto): com ele, nenhum writer de fotos intercala com
  outro nem com a limpeza, e a pré-condição avaliada no primeiro statement que decide continua
  verdadeira até o fim do batch (D5); a disputa é desprezível com 3 administradoras e a lista
  de chaves a apagar no R2 na remoção é exata (research §4). Um lock por produto não serviria:
  no cadastro o produto ainda não existe, e `fotos_envio` e a limpeza não pertencem a um
  produto (contracts/fotos.md §2.2 e §6).
- **Token de operação**: `produtos.fotos_versao integer NOT NULL DEFAULT 1` e
  `produtos.fotos_operacao uuid NULL`; cada chamada gera um `tok` (uuid novo). Os statements
  depois do que decide só agem com a guarda `G(tok) = EXISTS (SELECT 1 FROM produtos WHERE
  id = $p AND fotos_operacao = $tok)`. O token evita o falso positivo de guardar por
  `fotos_versao = $v + 1` quando outra pessoa já tinha chegado a `v + 1` antes do lock (D5;
  "Complexity Tracking"). 0 linhas no statement que decide ⇒ a guarda é falsa, nada mais muda,
  e uma leitura posterior só escolhe a mensagem.
- **Formas por writer** (contracts/fotos.md §2):
  - *Ações do conjunto* (`substituirConjunto`: adicionar, trocar, remover, mover):
    `db.batch([ lock 4_001, UPDATE produtos SET fotos_versao = fotos_versao + 1,
    fotos_operacao = $tok, atualizado_por, atualizado_em WHERE id = $p AND fotos_versao = $v
    AND <conjunto atual = o lido> AND <envio VALIDO, se houver> RETURNING fotos_versao,
    DELETE FROM fotos_envio WHERE id = $envio AND G(tok) (só em adicionar/trocar),
    DELETE FROM produto_fotos WHERE produto_id = $p AND G(tok), INSERT INTO produto_fotos …
    FROM unnest(…) WHERE G(tok) ])`. `VALIDO` = da própria pessoa, `confirmado` e com menos
    de 24 h; é checado no `UPDATE`, e os valores inseridos vêm da leitura anterior, garantidos
    pela igualdade do conjunto no `UPDATE`. **Chave nova amarrada ao envio** (acréscimo de
    2026-10-09, revisão da SF5, aprovado pelo humano): o mesmo `UPDATE` exige que toda chave da
    lista nova esteja no conjunto atual ou seja a do envio `VALIDO` informado, e que, com envio,
    essa chave esteja na lista; sem envio, nenhuma chave nova entra. Recusa só por isso ⇒ a
    função lança (bug de quem chama), sem alterar nada (contracts/fotos.md §2.3).
  - *Cadastro com fotos* (`inserirComFotos`): `lock 4_001` + `INSERT INTO produtos … SELECT …
    WHERE (count dos envios VALIDO) = $n` gravando `fotos_operacao = $tok` (sem `UPDATE` nem
    `fotos_versao`), seguido da **adoção por `DELETE FROM fotos_envio … RETURNING` numa CTE**
    que alimenta o `INSERT INTO produto_fotos`, com `VALIDO` **repetido** no `DELETE` (TL-11) e
    guarda pelo token. O envio é adotado no máximo uma vez (a linha deixa de existir).
  - *Remoção de produto*: `lock 4_001` + CTE que captura as chaves e faz `DELETE FROM produtos
    WHERE id = $id AND versao = $v` (otimista da 003, sem token).
  - *Limpeza*: `lock 4_001` + `DELETE FROM fotos_envio WHERE criado_em <= now() - 24 h
    RETURNING chave`. Como a adoção exige `criado_em > now() - 24 h`, as duas não disputam o
    mesmo envio.
- **Toda mudança de conjunto = apagar todas as linhas do produto e reinserir a lista nova**
  (posições 1..n sem buraco), em vez de atualizar posições: `UNIQUE (produto_id, posicao)` é
  **não adiável** e o Postgres o confere linha a linha (research F10), então um statement que
  troca posições colidiria no meio (plan, "Complexity Tracking"). Consequência: o `id` e o
  `criado_em` da linha da foto mudam a cada mudança de conjunto; nada referencia o `id`.
- **Emenda da convenção da 003**: "todo writer de `produtos` incrementa `versao`" passa a ser
  "todo writer que altera **campos, status ou destaque** incrementa `versao`; o writer de fotos
  altera **só** `fotos_versao`, `fotos_operacao`, `atualizado_por` e `atualizado_em`, e nunca
  `versao`" (FR-026). Seguro porque `saiuDoDestaque` (CTE `antes`) e a precedência após 0
  linhas leem só `versao`, `esgotado` e `destaque_vaga`, que o writer de fotos não toca; um
  `UPDATE` da 003 que espera o lock de linha de um writer de fotos reavalia `versao = $v`
  (inalterada) e segue. O data-model da 003 e o comentário de `src/lib/db/produtos.ts:177-179`
  são atualizados na SF5.
- **READ COMMITTED aplicado às fotos**:
  - `chavesConhecidas` (limpeza) é **um único statement** (`UNION ALL` das duas tabelas, um só
    snapshot); dividir em duas consultas abriria janela durante uma adoção (TL-12).
  - `23505` dentro do batch do cadastro só vira `nome_repetido` se a constraint for
    `produtos_chave_unique` (comparação exata do nome); qualquer outra propaga, inclusive as de
    `produto_fotos` (`produto_fotos_objeto_unique`) (ressalva da 003).
- **Limite de sugestões**: `consumirSugestao` é `db.batch([ lock 4_002, INSERT INTO ia_uso …
  ON CONFLICT (dia, email) DO UPDATE … WHERE n < $pessoa AND total do dia < $total RETURNING
  n ])`, com o dia de Brasília calculado uma vez numa CTE; o lock torna os dois limites exatos
  (contracts/ia.md §3).
- Continua valendo: nenhum código usa `db.transaction()`.

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
- Bloqueio por produtos (FR-011) é da FK `ON DELETE RESTRICT` da feature 003 (SQLSTATE
  `23001`, ver emenda da SF4), não deste mecanismo.

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
