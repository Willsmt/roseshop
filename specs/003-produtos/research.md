# Research — Feature 003 (produtos)

**Data**: 2026-10-07 | **Spec**: [spec.md](./spec.md) | **Plano**: [plan.md](./plan.md)

Este documento separa: (1) fatos e restrições herdados, que não são escolha;
(2) decisões fixadas pela constitution, pela spec ou pelo ADR-008; (3) decisões
D1–D10 e E1–E2, **tomadas pelo humano em 2026-10-07**, com as alternativas descartadas.

## 1. Fatos e restrições herdados

- **Driver `neon-http`, sem `db.transaction()`** (ADR-002, ADR-008). Só statements
  isolados e `db.batch([...])` (uma transação READ COMMITTED, sem decidir o próximo
  statement pelo resultado do anterior). Regra geral do ADR-008: invariante vai
  para constraint/coluna gerada/FK sempre que o banco puder expressá-la; o resto
  usa `db.batch` + `pg_advisory_xact_lock`, sem depender de resultado intermediário.
- **Leitura depois de 0 linhas** só escolhe a mensagem (padrão de `renomear`/`remover`
  em `src/lib/db/categorias.ts`); nunca decide se a escrita acontece.
- **Contrato §5 da 002**: `produtos.categoria_id integer NOT NULL REFERENCES
  categorias(id) ON DELETE RESTRICT`. Só `23001` vira `tem_produtos`; `NO ACTION`
  (`23503`) viraria `falha_geral`. Checklist da primeira task: criar `produtos` pelo
  schema, trocar o SQL cru de `contarProdutosDaCategoria` pela referência ao schema,
  remover `criarFixtureProdutos`/`descartarFixtureProdutos` de
  `src/test/db/categorias-fixtures.ts`, teste da FK gerando `23001` **no Neon dev via CI**.
- **Equivalência de nomes da 002**: função SQL `categoria_chave(text)` (`IMMUTABLE`,
  só built-ins), coluna `chave GENERATED ALWAYS ... STORED` + `UNIQUE`; lookup do
  existente após `23505` com `chave = categoria_chave($1)`. Hífen = espaço (clarificação
  da 003). Em TS, `normalizarNome` (`src/lib/categorias/nome.ts`) faz NFC + trim +
  colapso de espaços; hoje **não** está no barrel `@/lib/categorias` (ver D5).
- **Barrel `@/lib/categorias`** exporta `listarCategorias`, `obterCategoria`,
  `exigirCategoriaValida`, `CategoriaInvalidaError` (allowlist em
  `src/test/conformance/categorias-acesso.test.ts`). Regra 2 da conformidade: o
  binding `categorias` do schema só pode ser importado em `src/lib/categorias/` e
  `src/lib/db/`. O barrel importa `server-only` e `@/lib/db/contexto`.
- **Postgres**: uma tabela só pode ter **uma** coluna identity. Identity
  `GENERATED ALWAYS` recusa `UPDATE` para valor diferente de `DEFAULT` ("column can
  only be updated to DEFAULT") e não reaproveita valores (insert que falha consome o
  número: buracos, aceitos pelo FR-011).
- **FK no INSERT/UPDATE do lado referenciador**: o Postgres toma `FOR KEY SHARE` na
  categoria referenciada; um `DELETE` concorrente da categoria espera e falha com
  `23001`, ou o insert falha com `23503` se a categoria sumiu antes. Isso resolve a
  US7-AC3 inteira no banco, sem lock advisory.
- **Índice único e concorrência**: dois `UPDATE` em linhas diferentes gravando o mesmo
  valor num índice `UNIQUE` — o segundo espera o commit do primeiro e então falha com
  `23505`. É o que torna D1 atômico.
- **Constitution IV**: preço em centavos (inteiro), nunca float; timestamps UTC.
- **Escala**: ~500 produtos (SC-007). Varredura sequencial de 500 linhas é desprezível;
  nenhuma extensão (`pg_trgm`, `unaccent`) é necessária.

## 2. Decisões fixadas (sem trade-off real)

| # | Tema | Decisão | Fonte |
|---|---|---|---|
| F1 | Unicidade de nome sob concorrência | `UNIQUE` sobre a chave de equivalência; o código só reage a `23505` e busca o código do existente | ADR-008 D2, FR-004/005 |
| F2 | Código sem repetir | Identity do Postgres (atômico por construção) | FR-011, D2 |
| F3 | Concorrência otimista | `versao integer NOT NULL DEFAULT 1` no `WHERE` de todo `UPDATE`/`DELETE`, `versao + 1` no `SET`, inclusive status e destaque; 0 linhas ⇒ leitura só para escolher `ausente`/`versao_diferente` | FR-026, padrão `renomear` |
| F4 | Esgotado tira do destaque | Um único `UPDATE ... SET esgotado = true, destaque_vaga = NULL, versao = versao + 1` | FR-017 |
| F5 | Esgotado nunca em destaque | `CHECK (NOT (esgotado AND destaque_vaga IS NOT NULL))` | FR-018, SC-005 |
| F6 | Aviso "saiu do destaque" | CTE `antes` no **mesmo statement** do `UPDATE` devolve se havia vaga; com a `versao` igual, o estado anterior é o que a tela mostrou | FR-017 |
| F7 | Categoria inexistente no cadastro/edição | `exigirCategoriaValida(id)` antes do SQL (mensagem amigável) + FK como garantia; `23503` no INSERT/UPDATE de `produtos` ⇒ `categoria_ausente` | FR-007, US1-AC8, US7-AC3 |
| F8 | Bloqueio de remoção de categoria | Só a FK `ON DELETE RESTRICT`; `remover` da 002 não muda | FR-029, contrato §5 |
| F9 | Preço | `preco_centavos integer NULL`, `CHECK BETWEEN 1 AND 9999999`; `a_partir_de boolean NOT NULL DEFAULT false` com `CHECK (NOT a_partir_de OR preco_centavos IS NOT NULL)` | Constitution IV, FR-006 |
| F10 | Fotos | `produto_fotos` com `posicao smallint CHECK BETWEEN 1 AND 3` e `UNIQUE (produto_id, posicao)`: no máximo 3 por construção. Sem upload, action ou tela | FR-013 |
| F11 | Autoria | `criado_por`/`atualizado_por` (`text NOT NULL`, e-mail da sessão); `atualizado_por` gravado em todo `UPDATE` de FR-026 | FR-027 |
| F12 | Busca por nome | `strpos(chave, categoria_chave($busca)) > 0` — mesma função da equivalência, sem curingas de `LIKE` | FR-022, US3-AC5 |
| F13 | Busca por código | Entrada que casa `^#?\d{1,9}$` também filtra `id = n` (OR com o nome) | FR-022, US3-AC4 |
| F15 | Índices | `produtos(categoria_id)` (FK sem índice deixa `RESTRICT`, contagem e filtro em varredura); a ordem usa a PK | SC-007 |
| F16 | Tamanho da página | 20 | Assumptions |
| F17 | Testes de concorrência | `*.int.test.ts` em série; arquivos novos que tocam `produtos` seguem a regra | ADR-008 |

## 3. Decisões tomadas (humano, 2026-10-07)

### D1 — Máximo de 8 destaques: **C, vagas numeradas**

- `destaque_vaga smallint NULL CHECK (destaque_vaga BETWEEN 1 AND 8)` com índice
  único parcial `produtos_destaque_vaga_unique ON (destaque_vaga) WHERE destaque_vaga
  IS NOT NULL`. "Em destaque" = `destaque_vaga IS NOT NULL`; não há coluna `destaque`.
- Teto de 8 garantido pelo banco contra qualquer writer, por construção. Nenhum lock
  advisory novo em `locks.ts`.
- `destacar` é **um único `UPDATE`** que escolhe a menor vaga livre:
  `UPDATE produtos SET destaque_vaga = livre.vaga, ... FROM (SELECT min(s) AS vaga FROM
  generate_series(1, 8) s WHERE s NOT IN (SELECT destaque_vaga FROM produtos WHERE
  destaque_vaga IS NOT NULL)) livre WHERE id = $1 AND versao = $2 AND NOT esgotado AND
  destaque_vaga IS NULL AND livre.vaga IS NOT NULL`.
- Resultado: linha atualizada ⇒ `ok`; `23505` ⇒ `vaga_disputada` (mensagem "tente de
  novo"); 0 linhas ⇒ leitura escolhe `ausente` / `versao_diferente` / `esgotado` /
  `limite`.
- **Sem retry automático** — avaliado e sem problema que o justifique: a colisão só
  ocorre com duas pessoas destacando no mesmo instante (3 administradoras), a recusa não
  altera nada e o segundo toque resolve. Único `UNIQUE` atingível pelo `SET` de
  `destacar` é o da vaga (nome não muda), então `23505` ali não é ambíguo. Na US5-AC6
  (7 destaques + 2 simultâneos) a perdedora recebe `vaga_disputada`; ao tentar de novo,
  `limite`.
- A vaga pode virar a ordem do carrossel no catálogo (decisão daquela feature).
- Descartadas: A (batch + lock: garantia só da aplicação), B (trigger: padrão novo,
  pediria ADR-009). Registrado na emenda de 2026-10-07 ao ADR-008.

### D2 — Id × código: **A, uma coluna**

`id integer GENERATED ALWAYS AS IDENTITY` é o identificador interno e o código
(`#` + `lpad(id, 4, '0')`). Imutável e não reaproveitado pelo banco. Rotas usam o id
(`/painel/produtos/42`). Descartadas: B (imutabilidade do código ficaria com a
aplicação), C (uuid divergente de `categorias`).

### D3 — Paginação: **B, keyset por código decrescente, com "Ver mais"**

- Ordem: `ORDER BY id DESC`. Como o id é identity, a ordem decrescente de código é a
  ordem de cadastro (FR-020); editar não move. A única diferença possível em relação a
  `criado_em` são dois cadastros no mesmo instante, cuja ordem relativa é irrelevante.
- Página: `WHERE id < $antes ... ORDER BY id DESC LIMIT 21` (21 para saber se há próxima).
  A PK atende a ordem; nenhum índice extra.
- **Cursor na URL — decidido**: `/painel/produtos?antes=42&categoria=3&situacao=esgotado&busca=...`.
  Cada "Ver mais produtos" é um link para a página seguinte (substitui, não acumula —
  Server Component puro, sem estado no client); "Voltar ao começo" remove `antes`.
  Motivo: voltar do detalhe (botão do navegador ou "Voltar à lista") cai exatamente na
  mesma página e filtros, e a URL pode ser compartilhada entre as administradoras.
- "Voltar à lista" no detalhe: a lista passa sua query string em `?voltar=`; o detalhe
  a revalida pelo **mesmo schema Zod do filtro** e remonta o link para o caminho fixo
  `/painel/produtos` (sem redirecionamento aberto; parâmetro inválido ⇒ lista sem filtro).
- Descartada: offset (repete/pula itens com cadastro ou remoção entre páginas, US3-AC2).

### D4 — Chave do nome: **A, coluna gerada `UNIQUE` com `categoria_chave`**

`chave text GENERATED ALWAYS AS (categoria_chave(nome)) STORED`, constraint
`produtos_chave_unique`. Uma só implementação da regra para categorias e produtos.
Consequência: mudar a regra exige recriar as colunas geradas **das duas tabelas**
(registrado na emenda de 2026-10-07 ao ADR-008). Descartados: índice de expressão, wrapper
`produto_chave`.

### D5 — Normalização em TS: **B, exportar pelo barrel `@/lib/categorias`**

- `normalizarNome` passa a ser exportado pelo barrel; nenhum código da 002 é movido.
- Muda a allowlist `EXPORTS_PERMITIDOS` de `categorias-acesso.test.ts` e o §1 do
  contrato da 002 (`specs/002-categorias/contracts/categorias.md`), em SF3.
- A regex de caracteres da categoria **não** é reutilizada (estreita demais para
  produto, ver D10); `idCategoria`/`versaoCategoria` também não: `validacao.ts` define
  `idProduto`/`versaoProduto` (inteiro positivo ≤ 2³¹−1, mesma forma).
- Consequência: `src/lib/produtos/validacao.ts` importa o barrel, que é `server-only` e
  carrega `@/lib/db/contexto`; a validação de produto fica só no servidor (o que a
  constitution já exige). Nos unitários, `server-only` já é mockado no `vitest.setup.ts`.

### D6 — Status: **A, `esgotado boolean NOT NULL DEFAULT false`**

### D7 — Fotos ao remover produto: **A, `ON DELETE CASCADE`**

A limpeza dos objetos no R2 é responsabilidade da 004.

### D8 — Entrada do preço: **C**

Remove "R$" e espaços. Aceita:
- sem separador ("12") ⇒ reais inteiros;
- **um** separador (`,` ou `.`) seguido de 1 ou 2 dígitos ⇒ decimal ("12,90", "12.90", "12,9");
- formato pt-BR completo: grupos de milhar com `.` e decimal com `,` ("1.290,00", "1.290,5").

Recusa: um único separador seguido de exatamente 3 dígitos ("1.290", "1,290") como
**ambíguo** (`preco_ambiguo`); qualquer outra combinação de separadores, sinais, letras,
zero ou acima de 99.999,99 (`preco_invalido`). Conversão para centavos sem float
(aritmética sobre as partes inteiras da string).

**Emendas (SF3, 2026-10-08)**:
- espaço entre dígitos ("12 90") também é `preco_ambiguo` (sem a emenda viraria R$ 1.290,00);
  espaços nas pontas e depois de "R$" continuam ignorados;
- "R$" só vale como prefixo; em qualquer outra posição ("12R$90", "12,90R$") ⇒ `preco_invalido`.

### D9 — Teste da FK no Neon dev: **A, batch revertido**

Um `db.batch` insere categoria e produto com marcador único e tenta apagar a categoria;
o próprio `23001` aborta a transação inteira ⇒ zero resíduo no Neon dev, mesmo se o
runner morrer. Prova também a forma do erro no batch (a mesma de `remover`). Include
literal no `vitest.probe.config.mts`. Resíduo por configuração da FK: `NO ACTION` aborta com
`23503` (sem resíduo; o teste falha pelo código); `CASCADE` apaga categoria e produto
(nada sobra; o teste falha por não haver erro); só FK inexistente deixa produto órfão,
que a limpeza do teste apaga pelo marcador. Roda **só no CI do PR contra o Neon dev**,
nunca contra produção (mesmo revertido, consome as identities); verificado: `main.yml`
não executa o probe, então não há task extra na SF2. Registrado na emenda de 2026-10-07
ao ADR-008.

### D10 — Regras menores (confirmadas em bloco)

1. Nome do produto: normalização da 002, 3–80 code points, pelo menos uma letra ou
   dígito, sem caracteres de controle (categoria Unicode `Cc`) nem de formatação invisível
   (`Cf`, ex.: U+200B, U+202E), ambos ⇒ `nome_invalido` (emenda SF3, 2026-10-08);
   demais caracteres livres.
2. Descrição: `\r\n` → `\n`, trim nas pontas, vazio ⇒ `NULL`, até 1000 code points;
   exibida como texto puro com `white-space: pre-line`.
3. Apagar o preço desmarca "a partir de" no servidor.
4. "Destacar" some para produto esgotado; a action recusa mesmo assim.

### E1 — Execução

Todas as sub-fases são implementadas em **sonnet** (sessão principal, `test-writer`,
`ui-dev`). O **tech-lead (opus) só revisa** o diff de tudo que toca `src/lib/db/` antes
de cada commit. Diverge do CLAUDE.md ("tech-lead dono exclusivo das zonas protegidas"):
vale para esta feature por decisão do humano.

### E2 — Primitivos de formulário

Criados em `src/components/ui/` para reaproveitar nas próximas features (campo de
texto, área de texto, seleção, caixa de marcação, mensagem de erro do campo, aviso de
sucesso/erro). Estilo mínimo com Tailwind e as regras da constitution V; a fundação
visual (ADR-005) reestiliza depois sem mudar a API.
