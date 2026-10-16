# ADR-013 — Regras da sacola no cliente: desvio da constitution IV (feature 006)

**Status:** proposto (aguarda aprovação humana; GATE antes da SF1 da 006)
**Data:** 2026-10-16
**Origem:** `specs/006-sacola-whatsapp/`: spec FR-006, FR-008a, FR-015a, FR-016, FR-019, SC-007;
plan "Constitution Check" (IV ⚠️) e "Complexity Tracking"; research D1–D5; achado C1 do
`/speckit-analyze` (2026-10-16).

## Contexto

- A constitution IV diz: "Mutações via Server Actions; nenhuma lógica de negócio no client". Ela
  não prevê exceção justificada; um desvio precisa de decisão registrada e aprovada pelo humano.
- A spec da 006 exige que a sacola fique **só no aparelho** e que **nada do pedido** seja gravado
  no servidor nem nos registros (FR-006, SC-007). Não existe mutação no servidor para uma Server
  Action executar.
- O medidor da observação (FR-016) recalcula a cada tecla o espaço que resta na URL do `wa.me`
  (1800 caracteres codificados), o que exige a regra da mensagem disponível no navegador.
- Toda alteração da sacola relê o armazenamento do aparelho, aplica a própria operação e confere
  os limites sobre o resultado (FR-008a); isso só pode acontecer onde a sacola está guardada.

## Decisão

- As regras da sacola rodam no cliente, num módulo **puro** `src/lib/sacola/` (research D1):
  limites (15 produtos, quantidade de 1 a 10), validade de 7 dias, operações sobre a sacola relida,
  aplicação do resultado da conferência, total em centavos inteiros, normalização da observação e
  montagem da mensagem e da URL com o orçamento de 1800.
- O desvio fica **restrito** a esse módulo e às três ilhas cliente que o consomem
  (`src/app/(public)/_sacola/`). Nenhuma outra regra de negócio sai do servidor.
- Os dados que valem vêm sempre do servidor: preço, "a partir de", disponibilidade e existência
  são conferidos pela rota pública `POST /api/catalogo/conferencia` (ADR-012) ao abrir a sacola e
  antes de cada envio; o preço guardado no aparelho serve só para o aviso de preço alterado e
  nunca entra no subtotal nem na mensagem (FR-011, SC-003).
- Salvaguardas:
  - módulo sem `server-only`, banco, `next/*`, auth, R2 nem barrel do catálogo, travado por
    `fronteira.test.ts` e por regra de lint;
  - regras separadas da apresentação (FR-019), testadas sem DOM nem banco (pior caso da URL,
    propriedade, intercalação de duas abas, normalização);
  - entrada do aparelho e resposta da conferência validadas com `zod/mini` (constitution III.3);
  - envio bloqueado quando a conferência falha (sem resposta em 4 s, rede, 400, 5xx ou fora do
    formato): nunca se envia com dados não conferidos.

## Consequências

- A constitution IV continua valendo para o resto do sistema (painel, catálogo, fotos, IA). Este
  ADR é a exceção nominal da 006, não um precedente geral; outra exceção exige outro ADR.
- A regra do pedido vive no bundle do cliente; quem a altera mexe em `src/lib/sacola/` com os
  testes do módulo, e a feature de design troca só as telas.
- Um cliente adulterado pode montar uma mensagem diferente, mas só para o próprio WhatsApp: o
  servidor não grava nada e a vendedora confere o pedido na conversa. O risco é o mesmo de a
  cliente digitar a mensagem à mão.
- Se a constitution for emendada para cobrir estado só do aparelho (via `/speckit-constitution`),
  este ADR passa a "substituído" pela emenda.

## Alternativas descartadas

- **Montar a mensagem no servidor (Server Action ou rota)**: exigiria mandar a observação (dado do
  pedido) ao servidor a cada tecla ou no envio, com custo de CPU no Workers Free e risco de log; o
  medidor ainda precisaria da regra no cliente.
- **Sacola no servidor com Server Actions**: contraria FR-006 e SC-007 (nada gravado no servidor)
  e exigiria identificar a cliente.
- **Emendar a constitution IV agora**: mudança de princípio fora do escopo da feature; fica como
  caminho futuro se outro caso aparecer.
