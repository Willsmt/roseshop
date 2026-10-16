# Data Model: Sacola e pedido pelo WhatsApp (006)

Sem tabela nova, sem migration. Nada da sacola nem do pedido é gravado no servidor (FR-006,
SC-007). As entidades abaixo vivem no aparelho ou só na memória da tela.

## 1. Sacola (aparelho, `localStorage["roseshop.sacola"]`)

Formato gravado (JSON):

```json
{ "v": 1, "t": 1760600000000, "i": [ { "c": "0042", "q": 2, "p": 600, "a": false } ] }
```

| Campo | Tipo | Regra | Origem |
|---|---|---|---|
| `v` | `1` | versão do formato; outro valor ⇒ vazia | FR-007 |
| `t` | inteiro (ms UTC) | última alteração; `agora − t > 7 dias` ⇒ vazia; `t` no futuro além de 1 dia ⇒ vazia | FR-007 |
| `i` | lista | 0 a 15 itens, códigos sem repetição | FR-003 |
| `i[].c` | string | código canônico `^(?:\d{4}|[1-9]\d{4,8})$`, ≠ `"0000"` | FR-006, research D6 |
| `i[].q` | inteiro | 1 a 10 | FR-005 |
| `i[].p` | inteiro ou `null` | preço visto em centavos, 1 a 9.999.999; `null` = sem preço | FR-006 |
| `i[].a` | booleano | "a partir de" visto | FR-006 |

Chave extra em qualquer nível ⇒ vazia (o formato é fechado). Nada além disso é guardado: sem
nome, sem observação, sem dado pessoal.

Tipo em memória (`src/lib/sacola/sacola.ts`):

```ts
type Item = { codigo: string; quantidade: number; precoVisto: number | null; aPartirDe: boolean };
type Sacola = { versao: 1; alteradaEm: number; itens: Item[] };
```

### Transições (todas por `alterarSacola`, sobre a sacola relida; research D4/D5)

| Operação | Efeito | Recusa |
|---|---|---|
| `adicionar(codigo, preco, aPartirDe)` | entra com `q = 1` e o preço visto; já presente ⇒ sem mudança | 15 produtos diferentes no resultado ⇒ `limite_produtos` |
| `mudarQuantidade(codigo, q)` | troca `q` | fora de 1–10 ⇒ `quantidade_fora`; ausente ⇒ `nao_esta` |
| `remover(codigo)` | tira o item | ausente ⇒ sem mudança |
| `limpar()` | `itens = []` (grava; remove a chave só se vazia) | — |
| `aplicarConferencia(resultado)` | por código coberto: `inexistente` remove; `ok`/`esgotado` com preço diferente atualiza `p`/`a`; não cobertos intactos | — |

Toda gravação atualiza `t`. Leitura nunca grava (sacola vencida só é sobrescrita na próxima
alteração).

## 2. Resultado da conferência (resposta da rota; só memória)

Ver [contracts/conferencia.md](./contracts/conferencia.md).

```ts
type ProdutoConferido = {
  nome: string; href: string; precoCentavos: number | null; aPartirDe: boolean;
  capa: { url: string; alt: string } | null;
};
type ItemConferencia =
  | { codigo: string; estado: "ok"; produto: ProdutoConferido }
  | { codigo: string; estado: "esgotado"; produto: ProdutoConferido }
  | { codigo: string; estado: "inexistente" };
```

## 3. Item conferido (tela)

Junção do `Item` guardado com o `ItemConferencia` (research D4). Nunca é guardado.

| Campo | Regra |
|---|---|
| `estado` | `ok` / `esgotado` (fora do subtotal e da mensagem, sem quantidade, com "Remover") |
| `precoAlterado` | `true` se o atual difere do visto em valor, `a` ou ausência; aviso junto do item (R2: não volta depois de recarregar) |
| `precoUnitario` | `precoPublico(precoCentavos, aPartirDe)` da 005 |
| `valorLinha` | `quantidade × precoCentavos` (inteiro), formatado; sem preço ⇒ "Consulte o valor" |

Itens `inexistente` saem da sacola e geram o aviso "O produto #0042 não está mais no catálogo."

## 4. Total (`src/lib/sacola/total.ts`)

Sobre os itens `ok`:

- `subtotal = Σ quantidade × precoCentavos` dos itens com preço (inteiro; teto 15 × 10 ×
  9.999.999 = 1.499.999.850 < 2^53).
- `aPartirDe = algum item com preço tem a = true` ⇒ texto "a partir de R$ …".
- `aConsultar = nº de itens ok sem preço` ⇒ "+ 1 item a consultar" / "+ N itens a consultar".
- Nenhum com preço ⇒ subtotal "Consulte o valor".

## 5. Mensagem do pedido (memória, no toque de enviar)

Formato e orçamento em [research D3](./research.md#d3-mensagem-e-orçamento-montarpedido) e
[contracts/sacola.md §4](./contracts/sacola.md#4-mensagemts). Entradas: itens `ok`, observação
normalizada, número E.164 válido. Saída: `ok` (URL ≤ 1800) ou `excede`.

## 6. Observação (memória, só o campo)

Texto bruto do campo; normalizado por `normalizarObservacao` em todos os usos (FR-015a). Nunca
gravado (US2.8: recarregar ⇒ vazio).

## 7. Marca de envio (histórico do navegador)

`history.state.sacolaEnviada === true` na entrada da `/sacola` depois de tocar em enviar.
Booleano, sem dado do pedido; some ao "Limpar sacola" ou ao navegar para outra entrada.

## 8. Servidor

- `conferirProdutos(db, ids)` em `src/lib/db/catalogo.ts`: leitura de `produtos` +
  `produto_fotos` (capa), uma consulta com `IN`. Sem escrita.
- `ProdutoPublico` (005) ganha `sacola: { codigo: string; precoCentavos: number | null;
  aPartirDe: boolean } | null` (`null` se esgotado), só para a ilha do detalhe.
- `EventoFalha`/`RotaFalha` (`falha.ts`) ganham a rota `"/api/catalogo/conferencia"`.
