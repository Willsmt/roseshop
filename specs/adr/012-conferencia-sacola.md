# ADR-012 — Conferência pública da sacola por POST (feature 006)

**Status:** aceito (2026-10-16, humano)
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

## Notas da revisão

**2026-10-16, revisão do tech-lead (T003).** Status mantido: proposto. Nada do corpo deste ADR
nem de outro artefato foi alterado; os achados abertos ficam para decisão humana no GATE da T023.

Conferido e coerente:

- Método, rota e sessão: `POST` público, sem sessão nem `@/lib/auth`, `no-store` (CC§1, CC§3,
  D7, FR-011, FR-013).
- Fronteira na ordem 415 → 413 (`Content-Length`) → 413 (stream com teto de 1024) → 400 (JSON +
  Zod), erros com `{}` (CC§1, D7). Zod no servidor atende a constitution III.3.
- Entrada: 1 a 15 códigos canônicos, sem repetição, sem chave extra (CC§1, D6, FR-013). O ADR
  resume; o detalhe ("0000" e teto 2.147.483.647) está no CC§1 e na D6, sem conflito.
- Resposta `ok` / `esgotado` / `inexistente`, só dados públicos da 005 mais `precoCentavos` e
  `aPartirDe`, ambos já deriváveis do texto público (CC§2, FR-013). A justificativa do preço em
  centavos está nas Consequências.
- Uma única consulta `WHERE id IN (...)` em `src/lib/db/catalogo.ts`, sem migration (CC§5, D8,
  FR-013).
- Log só no 503 com evento, rota e causa fechados, e conformidade espionando o `console` (CC§4,
  FR-013, SC-007). `registrarFalha` (`src/lib/catalogo/falha.ts`) já tem esse formato; a SF3 só
  acrescenta `"/api/catalogo/conferencia"` ao tipo fechado `RotaFalha`.
- Worker: `criarFetch` em `cloudflare/publico.ts` repassa métodos que não são GET/HEAD sem tocar
  na resposta (conferido no código), como dizem as Consequências, o CC§3 e a D15.
- SC-004: CPU medida no dev com 15 códigos, critério do ADR-010 (Decisão; research R4).
- SC-007: códigos só no corpo, nunca na URL nem no log (Contexto, Alternativas).
- Ajuste A1: a rota responde 400/413/415/503 com `{}` e nunca devolve resultado parcial; o
  bloqueio do envio (4 s, rede, 400, 5xx, fora do formato) é do cliente (CC§6, ADR-013) e não
  contradiz este ADR. O CC§6 trata qualquer status diferente de 200 como falha, o que inclui 405,
  413 e 415, além do 400/5xx citado no A1 e no FR-011.
- GATE antes da SF3 (Status) bate com o A3 e com a T023.

Achados abertos (decisão humana; nenhum foi corrigido aqui):

1. **"Antes de ler o corpo" (FR-013) x leitura em stream.** Sem `Content-Length`, ou com um
   valor menor que o corpo real, só dá para recusar depois de ler até 1024 bytes. O ADR diz "antes
   de qualquer parse" e o CC§1 diz "leitura cancelada"; o FR-013 diz "antes de ler o corpo". O
   comportamento do ADR é o possível. Opções: (a) ajustar a redação do FR-013 para "antes de
   interpretar o corpo, lendo no máximo 1 KB"; (b) manter e registrar a leitura limitada como
   interpretação aceita.
2. **Cabeçalhos do 405.** O CC§3 exige `no-store` e `nosniff` em "todas as respostas", mas o CC§1
   deixa o 405 com o padrão do Next. Num `GET`, o worker só acrescenta `X-Robots-Tag` à classe
   `api`, então o 405 sai sem os dois cabeçalhos. Risco baixo, mas o texto se contradiz. Opções:
   (a) o CC§3 abre exceção para o 405; (b) a rota exporta os outros métodos com 405 `{}` e os
   cabeçalhos do CC§3.
3. **Erro inesperado que não é do banco.** O CC§1 e o ADR só tratam o banco indisponível (503).
   Uma exceção que não é do banco cai no 500 padrão do Next, o worker não converte `POST`, e o Next
   pode registrar a mensagem e a pilha da exceção no `console`, fora da lista fechada do CC§4.
   Opções: (a) a rota captura qualquer exceção e responde 503 `{}` com `causa: "inesperado"`
   (evento `catalogo.erro_inesperado`), e a conformidade cobre esse caso; (b) aceitar o 500 padrão.
   Recomendação do tech-lead: (a), porque fecha a SC-007 também nesse caminho.
4. **Menores (redação, sem efeito no contrato):** (i) a Decisão não diz "na ordem pedida" nem cita
   `X-Content-Type-Options: nosniff`, que estão no CC§2 e no CC§3; (ii) na lista de estados, o
   parêntese "com os dados públicos" aparece só depois de `esgotado`, mas o `ok` também leva
   `produto` (CC§2); (iii) em Alternativas, "a constitution reserva Server Actions para mutações"
   lê mais do que a IV diz ("Mutações via Server Actions"), embora a alternativa continue
   descartada pelos outros motivos.
