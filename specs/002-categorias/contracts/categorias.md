# Contratos — Feature 002 (categorias)

Sem API HTTP pública. Interfaces: (1) leitura para consumidores (003, IA, catálogo
futuro); (2) Server Actions do painel; (3) contrato com a 003. Só assinaturas e
comportamento; sem implementação.

## 1. Leitura — `@/lib/categorias` (barrel somente leitura)

| Função | Retorno | Comportamento |
|--------|---------|---------------|
| `listarCategorias()` | `{ id: number; nome: string }[]` | Ordem alfabética (FR-012), fonte única |
| `obterCategoria(id)` | `{ id; nome } \| null` | `null` se não existe |
| `exigirCategoriaValida(id)` | `number` (o id) ou lança `CategoriaInvalidaError` | Rejeita id fora da lista; nunca cria (FR-014, SC-006) |

Regras: consumidores guardam **somente `id`**; o barrel não exporta criar/renomear/remover
nem o schema. Conformidade verifica (FR-015).

## 2. Server Actions — `src/lib/categorias/actions.ts`

Toda action começa com `requireAdminAction()` (`src/lib/auth/guard.ts:36`); sem sessão
⇒ `UnauthorizedError`, sem efeito e sem dados (FR-016). Entrada validada com Zod.

| Action | Entrada | Sucesso |
|--------|---------|---------|
| `criarCategoria` | `{ nome }` | `{ ok: true }` |
| `renomearCategoria` | `{ id, versao, nome }` | `{ ok: true }` |
| `removerCategoria` | `{ id, versao }` (a confirmação é da UI, com texto claro, antes de chamar) | `{ ok: true }` |

Falha: `{ ok: false, motivo, mensagem, campo? }` (texto sempre pt-BR; o campo preservado
na UI). Páginas: `requireAdminPage("/painel/categorias")` (`guard.ts:28`).

### Mensagens (FR-017; revisadas no SC-005)

| Motivo | Mensagem |
|--------|----------|
| `nome_vazio` | "Escreva um nome para a categoria." |
| `nome_tamanho` | "O nome precisa ter de 2 a 40 letras." |
| `nome_caracteres` | "Use só letras, números, espaço e hífen." |
| `nome_repetido` | "Já existe uma categoria chamada {nome existente}." |
| `nao_existe` | "Esta categoria não existe mais. Atualize a lista." |
| `alterada` | "Esta categoria foi alterada por outra pessoa. Atualize a lista e tente de novo." |
| `tem_produtos` | "Esta categoria tem {N} produtos. Mova esses produtos para outra categoria e tente remover de novo." (singular com N = 1) |
| `ultima` | "A loja precisa ter pelo menos uma categoria. Crie outra antes de remover esta." |
| `falha_geral` | "Não foi possível salvar agora. Tente de novo em instantes." |

Mapeamento (D2-B/D3-B): `23505` ⇒ `nome_repetido` (nome lido com
`WHERE chave = categoria_chave($1)`); `23503` ⇒ `tem_produtos`; remoção que devolve 0
linhas no `DELETE … RETURNING` ⇒ leitura posterior só para escolher entre `nao_existe`
(id ausente), `alterada` (`versao` diferente) e `ultima` (id e versão batem, mas só resta
1 categoria); o texto do banco nunca chega ao usuário.

## 3. Contrato com a feature 003 (produtos)

- `produtos.categoria_id integer NOT NULL REFERENCES categorias(id) ON DELETE RESTRICT`.
- Cadastro/edição valida o valor com `exigirCategoriaValida(id)`; IA sugere apenas
  entre `listarCategorias()` e o resultado passa pela mesma validação.
- 003 implementa `contarProdutosDaCategoria(categoriaId)` (usada na mensagem
  `tem_produtos`). Na 002 ela retorna 0 e o mecanismo é provado por uma tabela
  `produtos` temporária criada no teste de integração (SQL cru, FK `ON DELETE RESTRICT`)
  (D4-A).
- **A primeira task da 003 substitui o SQL cru dessa fixture pela referência ao schema
  Drizzle de `produtos` e remove a fixture** (e implementa `contarProdutosDaCategoria`).
- Nenhuma categoria criada, renomeada ou removida fora das actions da 002.
