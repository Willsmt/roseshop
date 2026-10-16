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

## Notas da revisão

**2026-10-16, revisão do tech-lead (T003).** Status mantido: proposto. Nada do corpo deste ADR
nem de outro artefato foi alterado; os achados abertos ficam para decisão humana no GATE da T004.

Conferido e coerente:

- Citação literal da constitution IV ("Mutações via Server Actions; nenhuma lógica de negócio no
  client"). A Governança não prevê exceção: a alteração é só por humano, e a v1.0.0 não tem
  emenda. Por isso o desvio fica em ADR com GATE humano, sem tocar na constitution.
- Complexity Tracking do plan: mesma violação, mesmo "Why Needed" (FR-006, SC-007, FR-016, módulo
  puro, dados que valem vêm do servidor) e as mesmas duas alternativas rejeitadas (mensagem no
  servidor, sacola no servidor com Server Action). O ADR acrescenta a terceira (emendar a IV
  agora), sem conflito.
- D1: módulo puro `src/lib/sacola/` sem `server-only`, banco, `next/*`, auth, R2 nem barrel do
  catálogo, travado por `fronteira.test.ts` e por lint (plan, Structure: `eslint.config.mjs`;
  contracts/sacola.md). Os imports permitidos pela D1 (`@/lib/produtos/preco` e
  `@/lib/catalogo/exibicao`) são puros: conferido no código, `exibicao.ts` importa só `preco`, que
  não tem imports.
- D2 (normalização única), D3 (mensagem e orçamento de 1800 sobre a URL codificada), D4 (operações
  puras com limites sobre o resultado) e D5 (reler, aplicar, validar, gravar em `try/catch`): todos
  na lista da Decisão, com os mesmos números (15 produtos, 1 a 10, 7 dias, 1800).
- Restrição às três ilhas: o plan (Scale/Scope) fixa 3 ilhas cliente (contador, botão do detalhe,
  tela da sacola), e a Structure põe os arquivos em `src/app/(public)/_sacola/`.
- Dados que valem vêm do servidor (ADR-012); o preço guardado não entra no subtotal nem na mensagem
  (FR-006, FR-011, SC-003).
- Ajuste A1: a lista de falhas que bloqueiam o envio (4 s, rede, 400, 5xx, fora do formato) bate
  com o FR-011, a D11 e o CC§6.
- O restante da IV continua valendo: Server Components por padrão, SQL só em `src/lib/db/`, preço
  em centavos inteiros (o total é calculado em centavos).
- GATE antes da SF1 (Status) bate com a ordem de tasks.md (T004) e com o achado C1/A6 do analyze.

Achados abertos (decisão humana; nenhum foi corrigido aqui):

1. **Citação da constitution III.3.** A III.3 manda validar com Zod "no servidor" toda entrada
   externa. A validação com `zod/mini` no cliente (sacola do aparelho e resposta da conferência) é
   uma salvaguarda a mais, não o que a III.3 exige; o que cumpre a III.3 é o Zod da rota
   (ADR-012). Opções: (a) trocar a referência para "no espírito da III.3" ou "complementar à III.3,
   que a rota cumpre (ADR-012)"; (b) manter. Só redação, sem efeito na implementação.
2. **Escopo do desvio menor no plan que no ADR.** O Constitution Check do plan diz "(limites,
   total, mensagem)" e o Complexity Tracking diz "limites, total, conferência aplicada e mensagem".
   O ADR inclui também a validade de 7 dias, a normalização da observação e o armazenamento com
   releitura. O ADR é a lista completa e coerente com a D1 a D5. Opção: alinhar o texto do plan à
   lista do ADR na próxima mudança do plan, ou aceitar o ADR como fonte do escopo.
3. **Regra de lint da fronteira (nota para a SF1, não incoerência).** A regra precisa proibir o
   barrel `@/lib/catalogo` e permitir `@/lib/catalogo/exibicao`, como diz a D1. Se ela proibir o
   prefixo `@/lib/catalogo/*` inteiro, quebra a D1. Fica registrado para a T010 e para a regra do
   `eslint.config.mjs`.
