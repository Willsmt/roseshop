# Contrato — módulo `src/lib/sacola/` (núcleo puro)

Importável por componentes cliente. Sem `server-only`, banco, `next/*`, auth, R2 nem barrel
`@/lib/catalogo`. Imports permitidos: `@/lib/produtos/preco`, `@/lib/catalogo/exibicao`,
`zod/mini` e os arquivos do próprio módulo (`fronteira.test.ts` trava; regra de lint
`proibirSubmoduloCatalogo` ganha a exceção só para `exibicao`, que já existe). Research D1–D6.

## 1. `observacao.ts`

```ts
export const OBSERVACAO_MAX = 200;
export function normalizarObservacao(bruto: string): string;   // FR-015a, research D2
export function contarCaracteres(texto: string): number;       // code points
```

Única regra. Contador, campo e mensagem importam daqui; nenhum outro arquivo normaliza.

## 2. `sacola.ts`

```ts
export const MAX_PRODUTOS = 15, QTD_MIN = 1, QTD_MAX = 10, VALIDADE_MS = 7 * 24 * 3600 * 1000;
export type Item, Sacola;                                      // data-model §1
export type Operacao = (relida: Sacola, agora: number) => Resultado;
export type Resultado = { ok: true; sacola: Sacola; mudou: boolean }
  | { ok: false; motivo: "limite_produtos" | "quantidade_fora" | "nao_esta" };
export function adicionar(p: { codigo: string; precoCentavos: number | null; aPartirDe: boolean }): Operacao;
export function mudarQuantidade(codigo: string, quantidade: number): Operacao;
export function remover(codigo: string): Operacao;
export function limpar(): Operacao;
export function aplicarConferencia(itens: ItemConferencia[]): Operacao;
export function estaNaSacola(s: Sacola, codigo: string): boolean;
export function cheia(s: Sacola): boolean;
```

- `mudarQuantidade` com a quantidade que o item já tem devolve `{ ok: true, mudou: false }` com a
  sacola relida, e `alterarSacola` não grava nem dispara o evento (§6). Registrado na T074,
  conforme o código da SF1 (`90cd379`).

## 3. `total.ts`

```ts
export type LinhaPedido = { quantidade: number; nome: string; codigo: string;
  precoCentavos: number | null; aPartirDe: boolean };
export function valorLinha(l: LinhaPedido): string;            // "R$ 12,00" | "a partir de …" | "Consulte o valor"
export function resumo(linhas: LinhaPedido[]): { subtotal: string; aConsultar: string | null };
```

## 4. `mensagem.ts`

```ts
export const ORCAMENTO_URL = 1800, NOME_MAX = 40;
export function montarPedido(e: { numero: string; linhas: LinhaPedido[]; observacao: string })
  : { tipo: "ok"; url: string; texto: string } | { tipo: "excede"; excesso: number };
export function restanteObservacao(e: { numero: string; linhas: LinhaPedido[]; observacao: string }): number;
export function medidorObservacao(e: { numero: string; linhas: LinhaPedido[]; observacao: string })
  : { limite: "caracteres"; usados: number; maximo: 200 }
  | { limite: "mensagem"; fracao: number; excede: boolean };
```

- `numero` é o E.164 já validado pelo servidor; a função usa só os dígitos.
- Nas **três** funções (`montarPedido`, `restanteObservacao` e `medidorObservacao`), `observacao`
  é a **observação bruta**, como está no campo; cada função chama `normalizarObservacao` (mesma
  regra do campo e do contador). Quem chama nunca passa texto já normalizado como se fosse outro.
- `restanteObservacao = min(200 − code points, 1800 − comprimento com nomes em 0)`; negativo é
  excesso.
- `medidorObservacao` (o que a tela mostra, contracts/telas.md §3): `limite: "caracteres"` quando
  `200 − code points ≤ 1800 − comprimento com nomes em 0` (o teto de 200 manda), com `usados` =
  code points do texto normalizado; senão `limite: "mensagem"`, com `fracao` = parte do espaço da
  observação já usada, em `[0, 1]` (1 quando passa), e `excede = restanteObservacao < 0`. Não
  expõe o comprimento codificado; o número exato fica em `restanteObservacao` e nos testes.
- Garantia: `tipo: "ok"` ⇒ `url.length ≤ ORCAMENTO_URL`.
- Texto exato e corte dos nomes: research D3.

## 5. `conferencia.ts`

```ts
export type ItemConferencia;                                   // data-model §2; declarado em sacola.ts (SF1), reexportado aqui
export function lerRespostaConferencia(json: unknown): ItemConferencia[] | null;  // zod/mini
export async function conferir(codigos: string[], opcoes?: { fetch?: typeof fetch; timeoutMs?: number })
  : Promise<ItemConferencia[] | "falha">;                      // POST, 4 s
export function juntar(sacola: Sacola, itens: ItemConferencia[]): ItemConferido[];
export function houveMudanca(antes: Sacola, itens: ItemConferencia[],
  anteriores?: ItemConferencia[]): boolean;                    // US3.5
```

- `conferir` devolve `"falha"` (nunca lança) quando: passa de 4 s (`AbortController`), o `fetch`
  rejeita (rede), o status não é 200 (inclui 400, 413, 415 e 5xx), a resposta sai do esquema ou
  **não traz exatamente um item por código, na ordem pedida** (mesmo tamanho e mesmo código em
  cada posição).
  Quem chama não grava nada nesse caso; no envio, o WhatsApp não abre (contracts/telas.md §3).
- `houveMudanca(antes, itens, anteriores)`: `anteriores` é a conferência que a tela já mostra.
  Com ela, conta como mudança o inexistente, a troca de estado em qualquer sentido (inclusive o
  esgotado que volta) e o preço diferente do visto; sem ela, todo esgotado conta como novo.
  Registrado na T074, conforme o código da SF4 (`835754f`).

## 6. `armazenamento.ts`

```ts
export const CHAVE = "roseshop.sacola", EVENTO_LOCAL = "roseshop:sacola";
export type Leitura = { disponivel: false } | { disponivel: true; sacola: Sacola };
export function lerSacola(storage: () => Storage, agora: number): Leitura;
export function alterarSacola(storage: () => Storage, op: Operacao, agora: number)
  : Resultado | { ok: false; motivo: "armazenamento" };
export function assinarSacola(alvo: Window, aoMudar: () => void): () => void;
```

- `storage` é uma função para que o acesso (`window.localStorage`, que pode lançar) fique dentro
  do `try`.
- `alterarSacola`: `getItem` → validar → `op` → se `mudou`, `setItem` (ou `removeItem` se vazia) →
  `dispatchEvent(new Event(EVENTO_LOCAL))`. Sem `mudou`, não grava.
- `assinarSacola` nunca grava (FR-008a).

## 7. `textos.ts`

Textos das telas e da mensagem (cabeçalho "Olá! Quero fazer este pedido:", "Subtotal:",
"Observação:", avisos). Sem dependências, como `_catalogo/textos.ts`.
