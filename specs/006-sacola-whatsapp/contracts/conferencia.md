# Contrato — `POST /api/catalogo/conferencia`

Arquivo: `src/app/api/catalogo/conferencia/route.ts`. Leitura: `lerConferencia` do barrel
`@/lib/catalogo` → `conferirProdutos` em `src/lib/db/catalogo.ts`. Decisão: ADR-012, research
D7/D8. Requisitos: FR-011, FR-013, US3.8, SC-004, SC-007.

## 1. Pedido

```
POST /api/catalogo/conferencia
Content-Type: application/json
Content-Length: <≤ 1024>

{"codigos":["0042","0007","12345"]}
```

| Regra | Falha |
|---|---|
| Método ≠ `POST` | 405 (padrão do Next; só `POST` exportado) |
| `Content-Type` sem `application/json` (mídia antes do `;`, sem diferenciar maiúsculas) | **415** `{}` |
| `Content-Length` presente e > 1024 | **413** `{}`, corpo não lido |
| Corpo lido por stream passa de 1024 bytes (com ou sem `Content-Length`) | **413** `{}`, leitura cancelada |
| JSON inválido; objeto com chave diferente de `codigos`; `codigos` fora de 1–15; item fora de `^(?:\d{4}|[1-9]\d{4,9})$`, `"0000"` ou acima de `2147483647` (limite do `lerProduto` e do `integer` do Postgres); repetido | **400** `{}` |
| Banco indisponível | **503** `{}` + registro (§4) |
| Qualquer outro erro (leitura do corpo, montagem da resposta etc.) | **500** `{}` + registro só com o nome da classe (§4) |

Não lê cookie, sessão nem `Authorization`; não importa `@/lib/auth`.

## 2. Resposta 200

```json
{
  "itens": [
    { "codigo": "0042", "estado": "ok",
      "produto": { "nome": "Meia", "href": "/p/0042", "precoCentavos": 600, "aPartirDe": false,
                   "capa": { "url": "/fotos/<arquivo>", "alt": "Meia" } } },
    { "codigo": "0007", "estado": "esgotado",
      "produto": { "nome": "Guarda-chuva", "href": "/p/0007", "precoCentavos": null,
                   "aPartirDe": false, "capa": null } },
    { "codigo": "12345", "estado": "inexistente" }
  ]
}
```

- Um item por código pedido, **na ordem pedida**.
- Chaves permitidas (conformidade, como `catalogo-acesso`): `itens`, `codigo`, `estado`,
  `produto`, `nome`, `href`, `precoCentavos`, `aPartirDe`, `capa`, `url`, `alt`. Nunca id interno,
  categoria, versão, `destaque_vaga`, datas, e-mail.

## 3. Cabeçalhos (todas as respostas)

`Cache-Control: no-store` e `X-Content-Type-Options: nosniff`. O worker não altera respostas
de `POST` (research D15).

## 4. Registro

No 503: `registrarFalha({ evento: "catalogo.banco_indisponivel", rota:
"/api/catalogo/conferencia", causa: "banco" })`. No 500 (qualquer erro que não é
`BancoIndisponivel`; decisão do humano em 2026-10-16): `registrarFalha({ evento:
"catalogo.erro_inesperado", rota: "/api/catalogo/conferencia", causa: "inesperado", classe })`,
com `classe` = nome do construtor do erro (identificador; fora do formato ou valor que não é
`Error` ⇒ `"Desconhecida"`). Nenhum outro `console.*` na rota. Nunca o
corpo, os códigos, o `Content-Length`, a mensagem da exceção nem cabeçalhos (FR-013, SC-007).
A conformidade espiona `console.log/info/warn/error/debug` durante todos os casos e falha se
qualquer código pedido ou trecho do corpo aparecer.

## 5. Consulta

`conferirProdutos(db, ids: number[]): Promise<ConferenciaDb[]>`, uma chamada ao banco:

```sql
SELECT p.id, p.nome, p.preco_centavos, p.a_partir_de, p.esgotado, <CAPA> AS capa_chave
FROM produtos p WHERE p.id IN ($1, …, $n)
```

`<CAPA>` é o subselect já usado pela 005. Sem `ORDER BY` (a ordem vem do pedido).

## 6. Cliente

`src/lib/sacola/conferencia.ts` valida a resposta com `zod/mini` (fronteira). Resposta fora do
esquema, status ≠ 200, rede fora ou mais de 4 s (`AbortController`) ⇒ "não foi possível conferir"
(US3.7), sem alterar a sacola guardada.
