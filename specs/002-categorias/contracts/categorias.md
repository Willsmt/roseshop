# Contratos — Feature 002 (categorias)

Sem API HTTP pública. Interfaces: (1) leitura para consumidores (003, IA, catálogo
futuro); (2) leitura do painel; (3) Server Actions do painel; (4) camadas internas
(db → domínio); (5) contrato com a 003. Só assinaturas e comportamento; sem implementação.

## 1. Leitura — `@/lib/categorias` (barrel somente leitura)

| Função | Retorno | Comportamento |
|--------|---------|---------------|
| `listarCategorias()` | `{ id: number; nome: string }[]` | Ordem alfabética (FR-012), fonte única |
| `obterCategoria(id)` | `{ id; nome } \| null` | `null` se não existe |
| `exigirCategoriaValida(id)` | `number` (o id) ou lança `CategoriaInvalidaError` | Rejeita id fora da lista; nunca cria (FR-014, SC-006) |
| `CategoriaInvalidaError` | classe (re-export de `erros.ts`) | Para consumidores tratarem a rejeição |

Regras: consumidores guardam **somente `id`**; o barrel não expõe `versao`, não exporta
criar/renomear/remover, nem o schema, nem o módulo do painel. Conformidade verifica (FR-015):
`@/lib/db/categorias` (funções de escrita da camada db) só é importado em
`src/lib/categorias/` e `src/lib/db/`; `@/lib/categorias/actions` só em `src/app/painel/**`
(proibido em `src/lib/ai/`, no barrel e no resto de `src/`).
Import relativo `../actions` vindo de subpasta de `src/lib/categorias/` não é alcançado pelo
ESLint; essa brecha é coberta pelo teste de conformidade (`categorias-acesso.test.ts`), que
resolve o caminho; a exceção por arquivo vale só para `actions.test.ts` e `actions.remocao.test.ts`.

O id de categoria é validado por um único schema em `src/lib/categorias/nome.ts`
(`idCategoria`), usado pelo barrel e por `obterCategoriaDoPainel`: aceita inteiro positivo até
2147483647 (teto do `integer` do Postgres) ou a string decimal canônica desse inteiro (`"3"`);
recusa `" 3"`, `"1e2"`, `"03"`, `"99999999999"`, `0`, negativo e não numérico.

## 2. Leitura do painel — `@/lib/categorias/painel` (H4-A)

| Função | Retorno | Comportamento |
|--------|---------|---------------|
| `listarCategoriasDoPainel()` | `{ id: number; nome: string; versao: number }[]` | Mesma ordem de `listarCategorias()` |
| `obterCategoriaDoPainel(id: string)` | `{ id; nome; versao } \| null` | `null` se não existe ou se o id é inválido (Zod) |

O `[id]` chega da URL como **string** e passa pelo schema rígido `idCategoria` de
`src/lib/categorias/nome.ts` (não mais `z.coerce` puro, que aceitaria `" 3"`, `"1e2"` e
`"03"`): só decimal sem formatação, positivo, até 2147483647. `"3"` ⇒ `3`; `" 3"`, `"1e2"`,
`"03"`, `"99999999999"`, `"0"`, negativo e não numérico (`"abc"`) ⇒ `null`.

Regras: `versao` é detalhe de concorrência (FR-019) e só serve aos formulários do painel.
Importável apenas por `src/app/painel/**` e `src/lib/categorias/**` (conformidade + ESLint).
A página chama `requireAdminPage` antes de ler.

## 3. Server Actions — `src/lib/categorias/actions.ts`

Toda action começa com `requireAdminAction()` (`src/lib/auth/guard.ts:36`); sem sessão
⇒ `UnauthorizedError`, sem efeito e sem dados (FR-016). Entrada validada com Zod.

| Action | Entrada | Sucesso |
|--------|---------|---------|
| `criarCategoria` | `{ nome }` | `{ ok: true }` |
| `renomearCategoria` | `{ id, versao, nome }` | `{ ok: true }` |
| `removerCategoria` | `{ id, versao }` (a confirmação é da UI, em tela própria, antes de chamar) | `{ ok: true }` |

Falha: `{ ok: false, motivo, mensagem, campo? }` (texto sempre pt-BR; o campo preservado
na UI). Sucesso chama `revalidatePath("/painel/categorias")`; a UI volta para a lista.

Páginas (H7-A, uma tarefa por tela), cada uma com `requireAdminPage(<rota>)` (`guard.ts:28`):

| Rota | Tarefa |
|------|--------|
| `/painel/categorias` | lista |
| `/painel/categorias/nova` | criar |
| `/painel/categorias/[id]/renomear` | renomear |
| `/painel/categorias/[id]/remover` | confirmar remoção |

### Mensagens (FR-017; revisadas no SC-005)

| Motivo | Mensagem |
|--------|----------|
| `nome_vazio` | "Escreva um nome para a categoria." |
| `nome_tamanho` | "O nome precisa ter de 2 a 40 letras." |
| `nome_caracteres` | "Use só letras, números, espaço e hífen." |
| `nome_sem_letra` | "O nome precisa ter pelo menos uma letra ou número." |
| `nome_repetido` | "Já existe uma categoria chamada {nome existente}." |
| `nao_existe` | "Esta categoria não existe mais. Atualize a lista." |
| `alterada` | "Esta categoria foi alterada por outra pessoa. Atualize a lista e tente de novo." |
| `tem_produtos` | "Esta categoria tem {N} produtos. Mova esses produtos para outra categoria e tente remover de novo." (N = 1: "Esta categoria tem 1 produto. Mova esse produto para outra categoria e tente remover de novo.") |
| `ultima` | "A loja precisa ter pelo menos uma categoria. Crie outra antes de remover esta." |
| `falha_geral` | "Não foi possível salvar agora. Tente de novo em instantes." |

O texto do banco nunca chega ao usuário.

## 4. Camadas internas (M3, M5)

- `src/lib/db/contexto.ts` — `dbDoContexto()`: `getCloudflareContext` → `createDb`. Única
  porta de obtenção do `db` para barrel, módulo do painel e actions. Testes de integração
  injetam `createDb(process.env)`.
- `src/lib/db/categorias.ts` — toda função **recebe `db`** como primeiro parâmetro e devolve
  **resultado discriminado**; não conhece motivos nem mensagens:

| Função | Resultados |
|--------|------------|
| `inserir(db, sessao, nome)` | `{ tipo: "ok", id }` · `{ tipo: "nome_repetido", nomeExistente }` |
| `renomear(db, sessao, id, versao, nome)` | `{ tipo: "ok" }` · `{ tipo: "nome_repetido", nomeExistente }` · `{ tipo: "ausente" }` · `{ tipo: "versao_diferente" }` |
| `remover(db, sessao, id, versao)` | `{ tipo: "removido" }` · `{ tipo: "ausente" }` · `{ tipo: "versao_diferente" }` · `{ tipo: "ultima" }` · `{ tipo: "tem_produtos", quantidade }` |

  O SQLSTATE do driver (`23505`, `23503`) é lido em `src/lib/db/erros-pg.ts` e não sai de
  `src/lib/db/`. Ele chega **somente** em `error.cause.code` (`DrizzleQueryError` embrulha o
  `NeonDbError`; observado em T002), nunca em `error.code`; `codigoSqlstate` lê só `cause.code`. `23505` ⇒ lookup
  `WHERE chave = categoria_chave($1)` para `nomeExistente`; `23503` ⇒
  `contarProdutosDaCategoria`; 0 linhas no `UPDATE`/`DELETE … RETURNING` ⇒ leitura por id
  para distinguir `ausente` / `versao_diferente` / `ultima`. Outros erros propagam.
- `src/lib/categorias/erros.ts` — traduz o resultado em `{ motivo, mensagem, campo? }`:
  `nome_repetido` ⇒ `nome_repetido` (`campo: "nome"`); `ausente` ⇒ `nao_existe`;
  `versao_diferente` ⇒ `alterada`; `ultima` ⇒ `ultima`; `tem_produtos` com
  `quantidade ≥ 1` ⇒ `tem_produtos`; `tem_produtos` com `quantidade ≤ 0` (produtos movidos
  entre a recusa e a contagem) ⇒ `falha_geral`; exceção desconhecida ⇒ `falha_geral`.

## 5. Contrato com a feature 003 (produtos)

- `produtos.categoria_id integer NOT NULL REFERENCES categorias(id) ON DELETE RESTRICT`.
- Cadastro/edição valida o valor com `exigirCategoriaValida(id)`; IA sugere apenas
  entre `listarCategorias()` e o resultado passa pela mesma validação.
- `contarProdutosDaCategoria(db, categoriaId)` (H3-A) já conta de verdade na 002, com um
  único `SELECT count(*)::int FROM produtos WHERE categoria_id = $1` em SQL cru. Só é
  chamada após `23503`, que já implica a existência de `produtos`; por isso não verifica a
  existência da tabela. Contagem ≤ 0 ou erro na contagem ⇒ `falha_geral`. Na 002 o mecanismo (FK + contagem + mensagem) é provado por
  uma tabela `produtos` **comum** criada e descartada pelo próprio teste de integração
  (`criarFixtureProdutos`/`descartarFixtureProdutos` em `src/test/db/categorias-fixtures.ts`).
- **Checklist da primeira task da 003**:
  1. Criar `produtos` pelo schema Drizzle com a FK acima.
  2. Trocar o SQL cru de `contarProdutosDaCategoria` pela referência ao schema Drizzle de
     `produtos` (mesmo comportamento: um único `count(*)`).
  3. Remover `criarFixtureProdutos`/`descartarFixtureProdutos` do helper (a criação da
     fixture falharia com a tabela real, de propósito) e passar o teste de bloqueio por
     produtos a usar a tabela real.
- Nenhuma categoria criada, renomeada ou removida fora das actions da 002.
