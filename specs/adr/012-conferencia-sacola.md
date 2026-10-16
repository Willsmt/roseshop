# ADR-012 — Conferência pública da sacola por POST (feature 006)

**Status:** proposto (aguarda aprovação humana; GATE antes da SF3 da 006)
**Data:** 2026-10-16
**Origem:** `specs/006-sacola-whatsapp/`: spec FR-011, FR-013, SC-004, SC-007 e Clarifications
(2026-10-16); research D6–D8; contracts/conferencia.md.

## Contexto

- A sacola vive só no aparelho (FR-006) e precisa ser conferida com o catálogo atual ao abrir e
  ao enviar (FR-011). É a primeira rota pública do projeto que recebe dado do cliente num corpo.
- As rotas públicas da 005 são todas `GET`. Um `GET` com os códigos na query poria a sacola da
  cliente na URL, que o `observability` do wrangler grava nos Workers Logs (SC-007).
- Workers Free: CPU por pedido é risco aceito com critério do ADR-010 (falhar por limite, Erro
  1102).

## Decisão

- `POST /api/catalogo/conferencia`, público, sem sessão, somente leitura, `Cache-Control:
  no-store`.
- Fronteira fechada antes de qualquer parse: `Content-Type: application/json` (senão 415) e
  corpo ≤ 1024 bytes, conferido pelo `Content-Length` e pela leitura em stream com teto (senão
  413). Zod: 1 a 15 códigos canônicos, sem repetição, sem chave extra (senão 400). Erros com
  corpo `{}`.
- Resposta com um item por código pedido: `ok`, `esgotado` (com os dados públicos da 005 e o
  preço em centavos) ou `inexistente`.
- Uma única consulta (`WHERE id IN (...)`) em `src/lib/db/catalogo.ts`.
- Log só no 503, com evento, rota e causa fechados; nunca corpo, códigos nem mensagem de
  exceção. Teste de conformidade espiona o `console`.
- CPU medida no dev com 15 códigos (SC-004), critério do ADR-010.

## Consequências

- O endereço e os logs da plataforma não contêm a sacola; nada do pedido fica no servidor.
- A rota expõe só o que `/p/<código>` já expõe (mais o preço em centavos, já derivável do texto
  público); varredura de códigos custa o mesmo que varrer `/p/<código>` e fica limitada a 15 por
  pedido.
- Sem cache: cada abertura da sacola e cada envio custam um pedido ao Worker e uma consulta ao
  Neon. Volume esperado baixo (loja pequena).
- O `cloudflare/publico.ts` não pós-processa `POST`; a rota é dona dos próprios cabeçalhos.

## Alternativas descartadas

- **GET com códigos na query**: logs da plataforma com a sacola; cache acidental.
- **Server Action**: o Next serializa a action com id e cabeçalhos próprios, mais difícil de
  limitar o corpo antes do parse e de garantir `no-store`; e a constitution reserva Server
  Actions para mutações.
- **Conferir pelo GET da lista da 005**: não busca por código e traria até 24 produtos por bloco.
- **Rate limit**: sem KV/DO no Free sem custo de escrita; limites de corpo e de códigos bastam
  para o risco atual (revisar se o painel do Workers mostrar abuso).
