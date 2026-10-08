# Contrato — Produtos (feature 003)

**Data**: 2026-10-07 | Modelo: [data-model.md](../data-model.md) | Decisões: [research.md](../research.md)

Assinaturas são de contrato (o que os outros consomem), não implementação.

## 1. Camadas e fronteiras

```text
src/app/painel/(protegido)/produtos/**   UI (Server Components + forms client)
        │ importa só
        ▼
src/lib/produtos/actions.ts   ("use server")  ── mutações
src/lib/produtos/painel.ts    (server-only)   ── leitura do painel
src/lib/produtos/{validacao,preco,codigo,erros,mensagens}.ts  ── domínio
        │
        ├──► @/lib/categorias (barrel: exigirCategoriaValida, listarCategorias, normalizarNome)
        ▼
src/lib/db/produtos.ts        ── único SQL de produtos (recebe `db`)
src/lib/db/schema.ts          ── tabelas `produtos`, `produto_fotos`
src/components/ui/            ── primitivos (button + formulário, E2)
```

Regras (novo teste `src/test/conformance/produtos-acesso.test.ts`, mesmo estilo
AST/nega-por-padrão do `categorias-acesso`):

1. `@/lib/db/produtos` só é importado em `src/lib/produtos/` e `src/lib/db/`.
2. Os bindings `produtos` e `produtoFotos` do schema só em `src/lib/produtos/` e
   `src/lib/db/`.
3. `@/lib/produtos/actions` só em `src/app/painel/` (exceção explícita para os testes
   unitários ao lado de `actions.ts`).
4. `@/lib/produtos/painel` só em `src/app/painel/` e `src/lib/produtos/`.
5. As regras da 002 continuam valendo: `src/lib/produtos/` acessa categorias **só** pelo
   barrel `@/lib/categorias`. `src/lib/db/produtos.ts` pode usar o schema `categorias`
   para o `JOIN` do nome (já permitido pela regra 2 da 002).

Mudança no contrato da 002 (D5): o barrel passa a exportar `normalizarNome(nome: string):
string` (NFC + trim + colapso de espaços). Atualizar o §1 de
`specs/002-categorias/contracts/categorias.md` e `EXPORTS_PERMITIDOS`.

Sem barrel público de produtos nesta feature: o catálogo (feature futura) define o seu.

## 2. Camada SQL — `src/lib/db/produtos.ts`

Toda função recebe `db: Db`; escrita recebe `sessao: AdminSession` (e-mail para
autoria). Resultado discriminado; erro inesperado propaga. SQLSTATE lido só por
`codigoSqlstate` (`src/lib/db/erros-pg.ts`).

```ts
type ProdutoDb = {
  id: number;               // = código (D2)
  categoriaId: number; categoriaNome: string;
  nome: string; descricao: string | null;
  precoCentavos: number | null; aPartirDe: boolean;
  esgotado: boolean;
  destaqueVaga: number | null;           // null = fora do destaque (D1)
  versao: number;
  criadoPor: string; atualizadoPor: string;
  criadoEm: Date; atualizadoEm: Date;
};

type CamposProduto = {      // já normalizados e validados pelo domínio
  nome: string; categoriaId: number; descricao: string | null;
  precoCentavos: number | null; aPartirDe: boolean;
};

type FiltroDb = {           // montado por painel.ts a partir de FiltroLista (§4)
  categoriaId?: number;
  esgotado?: boolean;       // situacao "esgotado" ⇒ true, "disponivel" ⇒ false
  busca?: {                 // ausente quando a busca normalizada é vazia
    texto: string;          // comparado por strpos(chave, categoria_chave(texto)) > 0
    codigo: number | null;  // de codigo.ts quando o texto casa ^#?\d{1,9}$; OR com o nome
  };
  antes?: number;           // cursor keyset (id < antes)
};                          // página fixa de 20 (LIMIT 21 para calcular haMais)

type NomeRepetido     = { tipo: "nome_repetido"; codigoExistente?: number };
  // sem código quando o lookup após 23505 não acha a linha (removida/renomeada no meio)
type CategoriaAusente = { tipo: "categoria_ausente" };          // 23503 no INSERT/UPDATE
type Ausente          = { tipo: "ausente" };
type VersaoDiferente  = { tipo: "versao_diferente" };

inserir(db, sessao, campos): Promise<{ tipo: "ok"; id: number } | NomeRepetido | CategoriaAusente>
editar(db, sessao, id, versao, campos): Promise<{ tipo: "ok" } | NomeRepetido | CategoriaAusente | Ausente | VersaoDiferente>
esgotar(db, sessao, id, versao): Promise<{ tipo: "ok"; saiuDoDestaque: boolean } | Ausente | VersaoDiferente>
disponibilizar(db, sessao, id, versao): Promise<{ tipo: "ok" } | Ausente | VersaoDiferente>
destacar(db, sessao, id, versao): Promise<{ tipo: "ok" } | Ausente | VersaoDiferente
  | { tipo: "esgotado" } | { tipo: "ja_em_destaque" } | { tipo: "limite" } | { tipo: "vaga_disputada" }>
tirarDoDestaque(db, sessao, id, versao): Promise<{ tipo: "ok" } | Ausente | VersaoDiferente>
remover(db, sessao, id, versao): Promise<{ tipo: "removido" } | Ausente | VersaoDiferente>

obterPorId(db, id): Promise<ProdutoDb | null>
listar(db, filtro: FiltroDb): Promise<{ itens: ProdutoDb[]; haMais: boolean }>
```

Garantias por função (todas num único statement; nenhuma usa lock advisory):

| Função | Statement | 0 linhas ⇒ |
|---|---|---|
| `inserir` | `INSERT ... RETURNING id`; `23505` ⇒ busca `id` por `chave = categoria_chave($nome)` (sem linha ⇒ `nome_repetido` sem `codigoExistente`); `23503` ⇒ `categoria_ausente` | — |
| `editar` | `UPDATE ... SET campos, versao+1, atualizado_por, atualizado_em WHERE id AND versao`; `23505`/`23503` como acima. `a_partir_de` forçado a `false` quando `preco_centavos` é `NULL` (defesa; o domínio em modo `edicao` já entrega `aPartirDe = false`, §3) | leitura escolhe `ausente`/`versao_diferente` |
| `esgotar` | `WITH antes AS (SELECT destaque_vaga IS NOT NULL AS estava ... WHERE id AND versao) UPDATE ... SET esgotado = true, destaque_vaga = NULL, versao+1 ... WHERE id AND versao RETURNING (SELECT estava FROM antes)` | idem |
| `disponibilizar` | `UPDATE ... SET esgotado = false ...` (não toca `destaque_vaga`) | idem |
| `destacar` | `UPDATE ... SET destaque_vaga = livre.vaga ... FROM (menor vaga livre de 1..8) livre WHERE id AND versao AND NOT esgotado AND destaque_vaga IS NULL AND livre.vaga IS NOT NULL`; `23505` ⇒ `vaga_disputada` (sem retry) | leitura escolhe, nesta precedência: `ausente` → `versao_diferente` → `esgotado` → `ja_em_destaque` → `limite` |
| `tirarDoDestaque` | `UPDATE ... SET destaque_vaga = NULL ...` | idem |
| `remover` | `DELETE ... WHERE id AND versao RETURNING id` (fotos em cascata) | leitura escolhe `ausente`/`versao_diferente` |
| `listar` | `SELECT ... JOIN categorias ... WHERE filtros AND (antes IS NULL OR id < antes) ORDER BY id DESC LIMIT 21` | — |

A leitura depois de 0 linhas **só escolhe a mensagem** (padrão da 002).

`contarProdutosDaCategoria(db, categoriaId)` continua em `src/lib/db/categorias.ts`, com a
mesma assinatura, agora sobre o schema `produtos`.

## 3. Server Actions — `src/lib/produtos/actions.ts`

Ordem fixa em cada action (igual à 002): `requireAdminAction()` antes de tudo (sem
sessão, `UnauthorizedError` propaga e a UI leva ao login), Zod antes de qualquer SQL,
`exigirCategoriaValida` antes de `inserir`/`editar`, então banco; sucesso ⇒
`revalidatePath` da lista e do detalhe.

```ts
type ResultadoAction<T = {}> = ({ ok: true } & T) | ({ ok: false } & Falha);
type Falha = {
  motivo: Motivo;
  mensagem: string;              // texto simples (§6)
  campo?: "nome" | "categoria" | "descricao" | "preco" | "aPartirDe";
  codigoExistente?: number;      // só em nome_repetido, quando o lookup achou (link para o detalhe)
  valores?: ValoresFormulario;   // só em criarProduto/editarProduto: o que foi enviado
};
type ValoresFormulario = {       // texto como digitado, para reidratar o formulário
  nome: string; categoriaId: string; descricao: string; preco: string; aPartirDe: boolean;
};

// Assinatura de useActionState: (estado anterior, FormData). O estado inicial é null.
// O FormData é a entrada externa: passa pelo Zod antes de qualquer uso.
criarProduto(anterior: ResultadoAction<{ id: number }> | null, formData: FormData): Promise<ResultadoAction<{ id: number }>>
editarProduto(anterior: ResultadoAction | null, formData: FormData): Promise<ResultadoAction>
marcarEsgotado(anterior: ResultadoAction<{ saiuDoDestaque: boolean }> | null, formData: FormData): Promise<ResultadoAction<{ saiuDoDestaque: boolean }>>
marcarDisponivel(anterior: ResultadoAction | null, formData: FormData): Promise<ResultadoAction>
destacarProduto(anterior: ResultadoAction | null, formData: FormData): Promise<ResultadoAction>
tirarProdutoDoDestaque(anterior: ResultadoAction | null, formData: FormData): Promise<ResultadoAction>
removerProduto(anterior: ResultadoAction | null, formData: FormData): Promise<ResultadoAction>
```

- `valores` vem preenchido em **toda** falha de `criarProduto`/`editarProduto` (validação,
  `nome_repetido`, `categoria_invalida`, `alterado`, `nao_existe`, `falha_geral`), com os
  textos exatamente como chegaram no `FormData` (`aPartirDe` = caixa marcada). O formulário
  reidrata os campos com `defaultValue`/`defaultChecked` a partir de `valores` (§5).
- `exigirCategoriaValida` lança `CategoriaInvalidaError` ⇒ falha `categoria_invalida`
  com `campo: "categoria"` (mesmo motivo de `categoria_ausente` vindo do banco).

Entradas (validadas no servidor):

| Action | Campos |
|---|---|
| `criarProduto` | `nome`, `categoriaId`, `descricao?`, `preco?` (texto digitado, D8), `aPartirDe?` |
| `editarProduto` | `id`, `versao` + os campos de `criarProduto` |
| demais | `id`, `versao` (campos ocultos; inválidos ⇒ `falha_geral`) |

O formulário preserva o que foi digitado em qualquer falha (FR-009): a action nunca
redireciona em erro.

Validação de domínio (`src/lib/produtos/validacao.ts`, server-only por importar o barrel)
é a mesma porta que a IA futura usará (FR-032): `validarCamposProduto(entrada: unknown,
modo: "cadastro" | "edicao")` ⇒ `{ ok: true; campos: CamposProduto } | { ok: false;
falhas: Falha[] }`.

**Ordem de validação** (a ordem do formulário): `id`/`versao` (só na edição; inválidos ⇒
`falha_geral`, sem `campo`) → `nome` → `categoria` → `descricao` → `preco` → `aPartirDe`.
`falhas[]` sai nessa ordem; a action devolve **só a primeira** (`falhas[0]`), com o
`campo` dela, e o formulário mostra só essa mensagem. Depois de passar na validação, a
ordem segue a fixa acima: `exigirCategoriaValida`, então banco.

A única diferença entre os modos é o "a partir de" sem preço:

- `cadastro`: caixa marcada e preço vazio ⇒ falha `a_partir_de_sem_preco` (US1-AC6).
- `edicao`: preço vazio ⇒ `aPartirDe = false` no resultado, sem falha (US4-AC2, FR-006).

`criarProduto` usa `cadastro`; `editarProduto` usa `edicao`. A IA (futura) usa `cadastro`.

## 4. Leitura do painel — `src/lib/produtos/painel.ts`

```ts
type FiltroLista = {
  categoria?: number;
  situacao?: "disponivel" | "esgotado";
  busca?: string;          // código ("42", "0042", "#0042") ou parte do nome
  antes?: number;          // cursor keyset: código do último item da página anterior (D3)
  aviso?: "removido" | "nao_existe"; // só exibição; nunca propagado em verMais/voltarAoComeco/href
};
listarProdutosDoPainel(searchParams: unknown): Promise<{
  itens: ItemLista[];
  verMais: string | null;      // href da próxima página (mesmos filtros, antes = último id)
  voltarAoComeco: string | null; // href sem `antes`, quando há cursor
  aviso: { tipo: "sucesso" | "erro"; texto: string } | null;
    // removido ⇒ sucesso, "Produto removido."; nao_existe ⇒ erro, "Este produto não existe mais." (§6)
}>
obterProdutoDoPainel(id: unknown, voltar: unknown): Promise<DetalheProduto | null>
```

- `searchParams` vem da URL e passa por um schema Zod único (`filtroLista`); valor
  inválido é ignorado (lista sem aquele filtro), nunca erro. **O cursor fica na URL**
  (`/painel/produtos?antes=42&categoria=3&situacao=esgotado&busca=meia`), então voltar
  do detalhe preserva página e filtros.
- Página de 20, `ORDER BY id DESC`; "Ver mais" substitui a página (não acumula).
- Busca: `strpos(chave, categoria_chave($busca)) > 0` OR (`$busca` casa `^#?\d{1,9}$` e
  `id = n`). Busca normalizada vazia ⇒ sem filtro.
- `ItemLista`: `id`, `codigo` formatado, `nome`, `categoriaNome`, `esgotado`,
  `emDestaque`, `preco` formatado ou `null`, `href` do detalhe com `?voltar=` (query
  string atual da lista).
- `DetalheProduto`: tudo de `ProdutoDb` + campos formatados (preço, código), `fotos: []`
  (marcador "sem foto"), `podeDestacar` (= não esgotado e fora do destaque), e-mails de
  autoria (`criadoPor`, `atualizadoPor`, exibidos no detalhe — US4-AC6), `voltarHref` = `/painel/produtos` + `voltar` revalidado pelo mesmo `filtroLista`
  (caminho fixo; inválido ⇒ lista sem filtro).

## 5. Rotas e telas (`src/app/painel/(protegido)/produtos/`)

| Rota | Tela | Ações |
|---|---|---|
| `/painel/produtos` | Lista (filtros categoria/situação, busca, "Ver mais produtos", "Voltar ao começo", vazio com "Novo produto", "nada encontrado" com "Limpar filtros") | — |
| `/painel/produtos/novo` | Formulário de cadastro | `criarProduto` ⇒ detalhe do novo produto |
| `/painel/produtos/[id]` | Detalhe "como a cliente veria" + ações admin; inexistente ⇒ "Produto não encontrado" com volta à lista | `marcarEsgotado`/`marcarDisponivel`, `destacarProduto`/`tirarProdutoDoDestaque` |
| `/painel/produtos/[id]/editar` | Formulário de edição (campos ocultos `id`, `versao`) | `editarProduto` |
| `/painel/produtos/[id]/remover` | Confirmação: "O produto #0042 Meia soquete listrada será apagado de vez e não poderá ser recuperado" | `removerProduto` ⇒ lista com mensagem de sucesso |

Cada `page.tsx` de produtos chama `requireAdminPage(<rota>)` (contrato da 001) antes de
qualquer leitura, com o caminho da própria página, incluindo o `id` dinâmico (ex.:
`` requireAdminPage(`/painel/produtos/${id}/editar`) ``). O layout `(protegido)` **não**
protege a página (ele só decide a moldura; quem redireciona é a página). Garantido pelo
`painel-guard` existente e pelo teste de conformidade `produtos-paginas-guard` (T056), que
nega por padrão: falha se alguma `page.tsx` em `src/app/painel/(protegido)/produtos/` não
chamar `requireAdminPage`.

### Navegação e avisos

- Formulários e botões de ação usam `useActionState(action, null)` com as assinaturas do §3;
  a UI não cria wrapper de action nem lógica de negócio.
- **Sucesso** (a action só faz `revalidatePath`; quem navega é a UI, como na 002):
  - `criarProduto` ⇒ `router.push("/painel/produtos/" + id)` (o detalhe é a confirmação);
  - `editarProduto` ⇒ `router.push("/painel/produtos/" + id)` com o `id` do formulário;
  - `removerProduto` ⇒ `router.push("/painel/produtos?aviso=removido")`; a lista mostra o
    `aviso` devolvido por `listarProdutosDoPainel` num `Aviso` do `tipo` dele;
  - status e destaque ficam no detalhe: `Aviso` de sucesso com o texto do §6 (com
    `saiuDoDestaque`, acrescenta "...e saiu do destaque."); o `revalidatePath` traz a
    `versao` nova para os campos ocultos.
- **Falha**: a tela continua onde está. Nos formulários, os campos são remontados (`key`
  derivada do estado) com `defaultValue`/`defaultChecked` = `valores`, e a **única**
  mensagem (a primeira falha, na ordem do §3) vai no `MensagemCampo` do `campo` dela ou
  num `Aviso` de erro quando não há `campo`; os demais campos ficam sem erro.
  `nome_repetido` com `codigoExistente` mostra o código como link para
  `/painel/produtos/{codigoExistente}`; sem `codigoExistente`, a mensagem sai sem link.
- **Remoção de produto que já não existe** (US6-AC6): a action devolve `nao_existe` (não
  redireciona); a UI faz `router.push("/painel/produtos?aviso=nao_existe")` e a lista
  mostra o `aviso` (tipo erro, "Este produto não existe mais.") num `Aviso` de erro.
- **Sessão expirada**: a action lança `UnauthorizedError` (não é `Falha`); a tela segue o
  mesmo tratamento das telas de categorias da 002 (volta ao login, nada salvo), verificado
  no `preview` (quickstart §3, passo 10).
- **Descrição**: exibida como texto puro com `white-space: pre-line` (quebras preservadas,
  nada interpretado como formatação, D10.2).

### Primitivos de formulário (`src/components/ui/`, E2)

Contrato estável para as próximas features; a fundação visual (ADR-005) muda só o estilo.

| Componente | Props essenciais | Regras |
|---|---|---|
| `CampoTexto` | `name`, `rotulo`, `defaultValue`, `erro?`, `inputMode?`, `maxLength?` | rótulo visível ligado ao input; erro abaixo, `aria-invalid` + `aria-describedby`; texto ≥ 16 px, alvo ≥ 48 px |
| `AreaTexto` | idem `CampoTexto` + `linhas?` | mesmo padrão de erro |
| `Selecao` | `name`, `rotulo`, `opcoes`, `defaultValue`, `erro?`, `vazio?` (texto da opção inicial) | nativa (`<select>`), sem menu customizado |
| `CaixaMarcacao` | `name`, `rotulo`, `defaultChecked`, `erro?` | área de toque inclui o rótulo |
| `MensagemCampo` | `id`, `children` | usada pelos campos; texto simples |
| `Aviso` | `tipo: "sucesso" \| "erro"`, `children` | `role="status"`/`role="alert"` |

## 6. Motivos e mensagens (`src/lib/produtos/mensagens.ts`)

| Motivo | Campo | Mensagem (rascunho, revisar no SC-008) |
|---|---|---|
| `nome_vazio` | nome | "Escreva o nome do produto." |
| `nome_tamanho` | nome | "O nome precisa ter de 3 a 80 letras." |
| `nome_invalido` | nome | "Use letras ou números no nome." |
| `nome_repetido` | nome | "Já existe um produto com esse nome: #0042." (código como link); sem `codigoExistente`: "Já existe um produto com esse nome." (sem link) |
| `categoria_obrigatoria` | categoria | "Escolha uma categoria." |
| `categoria_invalida` | categoria | "Essa categoria não existe mais. Escolha outra." |
| `descricao_tamanho` | descricao | "A descrição pode ter até 1000 letras." |
| `preco_invalido` | preco | "Escreva o preço assim: 12,90." |
| `preco_ambiguo` | preco | "Não deu para entender o preço. Escreva assim: 1.290,00 ou 12,90." |
| `a_partir_de_sem_preco` | aPartirDe | "Para usar \"a partir de\", escreva o preço ou desmarque a opção." |
| `nao_existe` | — | "Este produto não existe mais." |
| `alterado` | — | "Outra pessoa mudou este produto agora há pouco. Recarregue a página para ver como ele está e faça de novo." |
| `limite_destaques` | — | "Já existem 8 produtos em destaque. Tire um do destaque antes de destacar outro." |
| `vaga_disputada` | — | "Outra pessoa destacou um produto ao mesmo tempo. Tente de novo." |
| `esgotado_nao_destaca` | — | "Produto esgotado não pode ficar em destaque." |
| `ja_em_destaque` | — | "Este produto já está em destaque." |
| `falha_geral` | — | mesma da 002 |

Avisos de sucesso: "Produto marcado como esgotado." / "...e saiu do destaque." /
"Produto disponível de novo." / "Produto removido."

## 7. Contrato com features futuras

- **004 (fotos)**: `produto_fotos` existe; a 004 cria upload, action e a trava de ≥ 1 foto,
  e apaga os objetos do R2 na remoção do produto (a linha some por `CASCADE`).
- **Catálogo público**: lê `esgotado` e `destaque_vaga` (pode usar a vaga como ordem do
  carrossel); define seu próprio barrel de leitura.
- **IA**: sugere só entre `listarCategorias()`; o resultado passa por
  `validarCamposProduto` e `exigirCategoriaValida` antes de chegar ao formulário.
- **002**: `remover` de categorias e suas mensagens não mudam; o barrel ganha
  `normalizarNome`.
