# Research: Sacola e pedido pelo WhatsApp (006)

**Data**: 2026-10-16 | **Plan**: [plan.md](./plan.md) | **Spec**: [spec.md](./spec.md)

Fontes conferidas nesta sessão: código da 005 no branch (`src/lib/catalogo/`, `cloudflare/publico.ts`,
`src/app/(public)/`, `eslint.config.mjs`, `vitest.config.mts`), `src/lib/produtos/preco.ts`
(teto de 9.999.999 centavos) e medição do orçamento por script Node (§4).

## 1. Restrições do humano (entrada do plan, não reabrir)

| # | Restrição | Onde vira decisão |
|---|---|---|
| H1 | Stack e processo das features anteriores; **sem dependência nova** | todas |
| H2 | Decisões da spec e dos Clarifications fechadas | — |
| H3 | Núcleo puro separado de UI e rota: normalização da observação (uma função para contador, campo e mensagem), construtor da mensagem e da URL (1800 sobre a URL codificada, corte por code point, nomes encolhem primeiro), operações puras (adicionar, quantidade, remover, limpar, aplicar conferência), armazenamento (reler, aplicar, validar, gravar, em try/catch) | D1–D5 |
| H4 | Conferência: POST JSON, corpo ≤ 1 KB recusado antes de parsear, um item por código (`ok`, `esgotado`, `inexistente`), uma query com `IN`, `no-store`, sem sessão, sem log nem eco; ADR próprio; CPU na SC-004 | D6–D8, ADR-012 |
| H5 | UI: botão e contador só após hidratar, em espaço reservado; `/sacola` com estados sem JS, armazenamento bloqueado e número inválido (`aria-disabled` + `aria-describedby`, sem `href`); foco após Remover/Limpar no título com `aria-live="polite"`; evento `storage` só atualiza a tela | D9–D13 |
| H6 | Testes: pior caso da URL, injeção pela observação, concorrência com armazenamento falso, regressão do HTML da 005 (SC-005), conformidade de log; `test:int` em série | D14 |
| H7 | Fases por sub-fase, commit próprio, fechadas com output real; tasks por test-writer, ui-dev e tech-lead | plan §Subfeatures |
| H8 | Riscos explícitos: atomicidade do `localStorage`, aviso de preço que some ao recarregar, limite da URL em aparelhos reais | §5 |

## 2. Decisões técnicas

### D1. Módulo `src/lib/sacola/`: puro e importável pelo cliente

- **Decision**: domínio novo em `src/lib/sacola/`, **sem** `server-only`, sem banco, sem `next/*`,
  sem `@/lib/auth`, sem `@/lib/r2` e sem o barrel `@/lib/catalogo`. Pode importar só módulos puros:
  `@/lib/produtos/preco` (formatação), `@/lib/catalogo/exibicao` (`precoPublico`) e `zod/mini`.
  Arquivos: `observacao.ts`, `sacola.ts` (tipos, limites, operações), `total.ts`, `mensagem.ts`,
  `conferencia.ts` (esquema da resposta e aplicação), `armazenamento.ts`, `textos.ts`. Um teste de
  fronteira (`fronteira.test.ts`, no molde de `src/lib/fotos/aparelho/`) lê os imports e falha em
  qualquer outro.
- **Rationale**: FR-019 pede as regras separadas da apresentação; a sacola vive no aparelho, então
  as regras rodam no cliente. Puro = testável sem DOM nem banco.
- **Alternatives**: regras dentro de `src/lib/catalogo/` (barrel server-only, o cliente não poderia
  importar); montar a mensagem no servidor (exigiria mandar a observação ao servidor e custaria CPU
  por toque no contador; o contador precisa da conta a cada tecla).

### D2. Normalização da observação: `normalizarObservacao`

- **Decision**: função única em `observacao.ts`, na ordem: CRLF/CR → LF; remover surrogate sem
  par (`/[\uD800-\uDFFF]/gu`: com a flag `u` um par válido é um só code point e não casa, então
  emoji, U+200D e U+FE0E/U+FE0F ficam); `normalize("NFC")`;
  remover `[\u0000-\u0009\u000B-\u001F\u007F-\u009F]` (controle, exceto LF) e
  `[\u200B\u200C\u200E\u200F\u202A-\u202E\u2060\u2066-\u2069\uFEFF]` (preserva U+200D, U+FE0E,
  U+FE0F); `trim()`; `\n{3,}` → `\n\n`. `contarCaracteres(s) = [...s].length` (code points).
  O campo guarda o texto **bruto** que a cliente digitou (para não mover o cursor), e o contador, o
  bloqueio do campo e a mensagem usam **sempre** `normalizarObservacao(bruto)`. O campo não usa
  `maxLength` (conta UTF-16).
- **Rationale**: FR-015a exige resultado idêntico nos três pontos; idempotência
  (`n(n(x)) === n(x)`) é testada. O passo do surrogate sem par (2026-10-16) vem antes do NFC e
  do `trim()` porque um surrogate solto faz o `encodeURIComponent` da mensagem lançar
  `URIError`, e removido depois do `trim()` deixaria espaço nas pontas.
- **Alternatives**: normalizar no `onChange` reescrevendo o campo (pula o cursor e apaga espaços
  no meio da digitação).

### D3. Mensagem e orçamento: `montarPedido`

- **Decision**: `mensagem.ts` exporta `montarPedido({ numero, itens, observacao })`, que devolve
  `{ tipo: "ok", url, texto } | { tipo: "excede", excesso }`, e `orcamentoObservacao(...)`, que
  devolve o que ainda cabe. Regras:
  - **Formato** (texto exato, ajustável só aqui):
    ```
    Olá! Quero fazer este pedido:
    2x Meia (#0042) — R$ 12,00
    1x Guarda-chuva (#0007) — a partir de R$ 10,00
    1x Pano (#0010) — Consulte o valor
    Subtotal: a partir de R$ 22,00
    + 1 item a consultar

    Observação:
    <texto normalizado>
    ```
    Nome cortado a zero vira `2x (#0042) — R$ 12,00` (sem espaço duplo). Linhas separadas por LF.
    Esgotados não entram.
  - **Medida**: `comprimento = ("https://wa.me/" + dígitos + "?text=" + encodeURIComponent(texto)).length`;
    teto `ORCAMENTO_URL = 1800`.
  - **Nomes** (FR-015/FR-016): primeiro cada nome é cortado a 40 code points; se a URL passa de
    1800, procura-se o maior `L` em `[0, 40]` (busca binária, função monotônica) tal que, cortando
    **todos** os nomes a `min(len, L)` code points, a URL caiba. Corte por `Array.from`, nunca por
    índice UTF-16; sem reticências (custariam orçamento e confundiriam o nome).
  - **Observação**: entra inteira ou a função devolve `excede` (nunca corta). O texto vai depois de
    `\n\nObservação:\n`; normalizada vazia ⇒ sem o bloco.
  - **Orçamento da observação** (contador do campo): `restante = min(200 − contarCaracteres(obs),
    1800 − comprimento(com nomes em L = 0 e com obs))`. Negativo ⇒ excesso exibido e envio
    desabilitado. **Ajuste do humano (tasks, 2026-10-16)**: a tela mostra "N de 200" enquanto o
    teto de 200 manda e, quando o orçamento da URL passa a mandar, "Espaço da mensagem quase
    cheio" com barra de progresso, sem expor a conta codificada (`medidorObservacao`,
    contracts/telas.md §3); o campo não passa do limite; a troca de modo é anunciada uma vez,
    na transição, por `#obs-conta` (`aria-live="polite"`); o número exato fica nos testes.
  - **Número inválido**: `montarPedido` nunca é chamado (FR-017); a tela decide antes.
- **Rationale**: o orçamento é garantido pela construção (a função só devolve `ok` se mediu ≤ 1800)
  e provado por teste do pior caso (§4).
- **Alternatives**: medir em bytes UTF-8 (a medida da spec é a URL codificada); cortar a observação
  (proibido); encolher só os nomes maiores primeiro (a spec diz "por igual").

### D4. Operações puras da sacola

- **Decision**: `sacola.ts` define `Sacola = { versao: 1; alteradaEm: number; itens: Item[] }`,
  `Item = { codigo: string; quantidade: number; precoVisto: number | null; aPartirDe: boolean }` e
  operações `(sacolaRelida, ..., agora) => Resultado` puras:
  `adicionar(s, {codigo, precoCentavos, aPartirDe})`, `mudarQuantidade(s, codigo, q)`,
  `remover(s, codigo)`, `limpar()`, `aplicarConferencia(s, resultado)`. Cada uma devolve
  `{ ok: true, sacola } | { ok: false, motivo: "limite_produtos" | "quantidade_fora" | "nao_esta" }`
  e confere os limites (15 produtos, 1 a 10) **sobre o resultado**. `adicionar` de código já
  presente não muda nada (US1.3). `aplicarConferencia` toca só os códigos cobertos pela resposta:
  `inexistente` remove; `ok`/`esgotado` atualizam `precoVisto`/`aPartirDe` para o atual e marcam
  aviso de preço quando diferia; códigos não cobertos ficam como estão (FR-008a).
- **Rationale**: FR-008a (por operação, sobre a sacola relida); testável sem armazenamento.

### D5. Armazenamento: `alterarSacola(op)` relê, aplica, valida, grava

- **Decision**: `armazenamento.ts` recebe um `Storage` injetável (padrão `window.localStorage`,
  acessado dentro de `try`). Chave `roseshop.sacola`. API:
  - `lerSacola(storage, agora)`: `{ disponivel: false }` se o acesso lança; senão a sacola validada
    por Zod (`zod/mini`): versão 1, ≤ 15 itens, códigos canônicos e sem repetição, quantidade 1–10,
    preço inteiro 1–9.999.999 ou `null`; vencida (> 7 dias de `alteradaEm`), ausente, corrompida ou
    inválida ⇒ vazia (FR-007), **sem gravar** na leitura.
  - `alterarSacola(storage, op, agora)`: lê de novo **imediatamente antes** de gravar, aplica `op`,
    grava `JSON.stringify` com `alteradaEm = agora`, e dispara um evento local
    (`roseshop:sacola`) para a própria aba. Toda chamada a `getItem`/`setItem`/`removeItem` fica em
    `try/catch`; falha na gravação ⇒ resultado `{ ok: false, motivo: "armazenamento" }`, a tela
    não muda.
  - `assinarSacola(callback)`: escuta `storage` (outras abas, só chave `roseshop.sacola` ou
    `key === null`) e `roseshop:sacola` (mesma aba); o callback **só relê e atualiza a tela**.
  - Formato gravado (nomes curtos poupam espaço, não escondem dado):
    `{"v":1,"t":1760600000000,"i":[{"c":"0042","q":2,"p":600,"a":false}]}`.
- **Rationale**: FR-006 (só código, quantidade, preço visto e "a partir de", mais versão e data),
  FR-007, FR-008a. Sem `navigator.locks` (H8, R1).
- **Alternatives**: `navigator.locks` (atomicidade estrita, fora do escopo); IndexedDB (async,
  mais código, mesmo problema entre abas).

### D6. Código de referência no aparelho, no corpo e na resposta

- **Decision**: o código circula como **string canônica sem "#"**, a mesma da URL do detalhe
  (`codigoCanonico`: 4 dígitos com zeros à esquerda, ou mais dígitos sem zero à esquerda; ex.
  `"0042"`, `"12345"`). Regex `^(?:\d{4}|[1-9]\d{4,9})$`, excluindo `"0000"` e valores acima de
  2.147.483.647, o mesmo limite do `lerProduto` (`^\d{1,10}$` + `MAX_ID`, teto do `integer` do
  Postgres). A tela mostra `#0042`. **Nota (analyze L3, 2026-10-16)**: o worker da 005
  (`SO_DIGITOS = /^\d{1,9}$/` em `cloudflare/publico.ts`) e a busca do painel
  (`interpretarCodigoBusca`) param em 9 dígitos; a sacola segue o `lerProduto`, que é o limite
  mais largo, e o pior caso da URL foi medido com 10 dígitos (§4).
- **Rationale**: é o código público da 003/005, nunca o id cru de banco (FR-006). Comparação
  textual exata evita duplicata `"42"`/`"0042"`.

### D7. Rota `POST /api/catalogo/conferencia`

- **Decision** (detalhe em [contracts/conferencia.md](./contracts/conferencia.md) e ADR-012):
  - Só `POST` exportado; `dynamic = "force-dynamic"`; não lê `cookies()`/`headers()` de sessão nem
    importa `@/lib/auth`.
  - Ordem: (1) `Content-Type` sem `application/json` ⇒ **415**; (2) `Content-Length` > 1024 ⇒
    **413**; (3) leitura do corpo por `getReader()` com teto de 1024 bytes, abortando ao passar
    (cobre corpo sem `Content-Length`) ⇒ **413**; (4) `JSON.parse` + Zod
    (`{ codigos: string[] }`, 1 a 15, regex D6, sem repetição, sem chave extra) ⇒ **400**;
    (5) uma consulta; (6) **200** com um item por código, na ordem pedida.
  - Todas as respostas: `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`; erros com
    corpo `{}` (nunca o motivo, nunca códigos).
  - Banco fora ⇒ **503** `{}` + `registrarFalha({ evento: "catalogo.banco_indisponivel", rota:
    "/api/catalogo/conferencia", causa: "banco" })` (lista fechada, sem corpo nem códigos).
  - O worker (`cloudflare/publico.ts`) já deixa passar métodos que não leem sem alterar a resposta:
    a rota define os próprios cabeçalhos.
- **Rationale**: FR-011/FR-013; GET poria os códigos na URL, que o `observability` do wrangler
  grava (nota da spec).

### D8. Consulta única com `IN`

- **Decision**: `conferirProdutos(db, ids: number[])` em `src/lib/db/catalogo.ts` [protegido]:
  `SELECT p.id, p.nome, p.preco_centavos, p.a_partir_de, p.esgotado, <CAPA> AS capa_chave FROM
  produtos p WHERE p.id IN (${sql.join(ids)})`, reaproveitando o subselect `CAPA` da 005. A leitura
  `lerConferencia(codigos)` em `src/lib/catalogo/leitura.ts` converte código → id, chama uma vez e
  monta a resposta com `cartao()` + `precoCentavos`/`aPartirDe`; ausente ⇒ `inexistente`. Sem
  índice novo (PK), sem migration.
- **Rationale**: FR-013 ("uma única consulta"); a capa vem pela rota pública de fotos da 005.

### D9. Botão e contador só depois de hidratar

- **Decision**: o estado cliente da sacola é lido por `useSyncExternalStore` com
  `getServerSnapshot = () => null`: no servidor e na hidratação o componente devolve `null`. Depois
  de hidratar, `lerSacola` decide: armazenamento indisponível ⇒ continua `null` (sem erro, FR-002a).
  - **Cabeçalho**: `src/app/(public)/layout.tsx` ganha um único elemento reservado
    `<div data-sacola="cabecalho" class="mx-auto flex h-12 max-w-xl justify-end px-4">` com a ilha
    `AcessoSacola` dentro (link "Sacola, 2 produtos" para `/sacola`, `aria-live="polite"` no
    número). Altura fixa ⇒ a tela não pula.
  - **Detalhe**: produto disponível ganha `<div data-sacola="detalhe" class="min-h-12">` com a ilha
    `BotaoSacola` antes de `BotaoWhatsapp`. Esgotado não ganha o espaço (US1.4).
  - O detalhe passa à ilha `produto.sacola = { codigo, precoCentavos, aPartirDe } | null` (campo
    novo em `ProdutoPublico`, `null` se esgotado).
- **Rationale**: FR-002a e SC-005 (HTML do servidor igual ao da 005, exceto o espaço reservado).
- **Alternatives**: `useEffect` + `useState` (equivalente, mas não sincroniza entre abas sem mais
  código); `<noscript>` no detalhe (mudaria o HTML).

### D10. Página `/sacola`

- **Decision**: `src/app/(public)/sacola/page.tsx`, `force-dynamic`, Server Component que lê só
  `configCatalogo().whatsapp` (log uma vez por isolate já existe, FR-017) e renderiza:
  `<noscript>` com "Ative o JavaScript para usar a sacola" + link ao catálogo, e a ilha
  `TelaSacola` (cliente, `null` no servidor). `robots` herdado do layout `(public)` e
  `X-Robots-Tag` pelo worker (D15). Estados da ilha, em ordem: armazenamento indisponível (texto
  próprio, o de contracts/telas.md §3: "Não foi possível abrir a sacola neste navegador. Você
  ainda pode perguntar por cada produto no WhatsApp."), vazia, conferindo, falha ao abrir ("Não
  foi possível conferir a sacola agora." + "Tentar de novo"), lista conferida (com avisos), falha
  no envio (lista conferida mantida, D11), confirmação pós-envio. Detalhe em
  [contracts/telas.md](./contracts/telas.md).
- **Rationale**: FR-009, FR-010, US4.6.

### D11. Envio: conferir, depois navegar na mesma aba

- **Decision**: "Enviar pedido pelo WhatsApp" é `<button type="button">`, nunca `<a href>`. Toque:
  `normalizarObservacao` → nova conferência → `aplicarConferencia` por `alterarSacola`. Se algo
  mudou (inexistente, esgotado novo, preço), mostra os avisos e não abre. Senão `montarPedido`;
  `history.replaceState({ ...history.state, sacolaEnviada: true }, "")` e
  `location.assign(url)` (mesma aba, sem `window.open`, que o bloqueador de pop-up barra depois de
  um `await`). Na volta (`pageshow`, inclusive do bfcache), `history.state.sacolaEnviada` mostra a
  confirmação com "Limpar sacola" e "Voltar" (FR-018). Nada do pedido é guardado: só a marca
  booleana no histórico daquela entrada.
  - Número inválido: o botão tem `aria-disabled="true"` e `aria-describedby` para o texto do
    FR-017; o clique não faz nada; `montarPedido` não é importado nesse ramo de render.
  - Envio desabilitado também quando: todos esgotados (texto próprio), observação passou do limite
    (contador mostra o excesso), conferência pendente ou falha.
  - **Ajuste do humano (tasks, 2026-10-16)**: se a conferência do envio passar de 4 s, falhar por
    rede ou responder 400/5xx (ou fora do esquema), o envio é **bloqueado** com "Não consegui
    conferir agora, tente de novo." (`role="alert"`) e a sacola fica intacta; a lista conferida
    continua na tela e o próprio botão de envio, ainda ativo, é a nova tentativa (estado "Falha
    no envio (lista conferida mantida)", contracts/telas.md §3). Nunca se envia com dados não
    conferidos (SC-003).
- **Rationale**: US2.7, US2.9, US3.5, FR-017, FR-018. A navegação dentro da ativação transitória
  (≈ 5 s no Chrome) depois do toque mantém o atalho para o app (R3).

### D12. Foco e anúncios

- **Decision**: depois de "Remover" e de confirmar "Limpar sacola", o foco vai para o título da
  lista (`<h1 id="sacola-titulo" tabIndex={-1}>`) ou, se a sacola ficou vazia, para o título do
  estado vazio. Uma região `<p role="status" aria-live="polite">` anuncia contador, subtotal e
  avisos ("Produto removido. Subtotal: R$ 22,00"). O confirmar de "Limpar sacola" é um diálogo
  `<dialog>` nativo com `showModal()`, texto "Todos os produtos vão sair da sacola." e botões
  "Limpar" e "Cancelar"; ao cancelar o foco volta ao botão.
- **Rationale**: FR-019, SC-006; padrão da 005 (região viva na lista).

### D13. Sincronização entre abas

- **Decision**: `assinarSacola` → `useSyncExternalStore` relê e re-renderiza; nunca chama
  `alterarSacola`. Na `/sacola`, um código novo vindo de outra aba dispara uma conferência só dos
  códigos ainda não conferidos (edge case "Sacola aberta numa aba enquanto outra adiciona"); o
  resultado é aplicado por `alterarSacola` (operação própria desta aba, sobre a sacola relida).
  Para evitar ciclo, a aplicação só grava se mudou algo.
- **Rationale**: FR-008, FR-008a.

### D15. Worker: `/sacola` como página pública

- **Decision**: `classificar` em `cloudflare/publico.ts` [protegido] passa a tratar `/sacola`
  como `"pagina"`: recebe `X-Robots-Tag: noindex, nofollow` (FR-010), `Cache-Control: public,
  max-age=60` (casca estática; a sacola não vem do servidor) e o 500 → 503 da 005. O teste de
  orçamento da 005 (`catalogo-orcamento`) continua valendo. `/api/catalogo/conferencia` cai na
  classe `"api"`, mas por ser `POST` o `criarFetch` repassa sem tocar (a rota define tudo).
- **Rationale**: FR-010 com a mesma camada da 005.

### D14. Estratégia de testes

| Alvo | Tipo | Como |
|---|---|---|
| `normalizarObservacao` | U | tabela de casos (CRLF, NFD→NFC, controle, U+200B/202E/FEFF removidos, U+200D/FE0F preservados, pontas, 3+ quebras), idempotência, contagem em code points |
| Mesma saída em contador, campo e mensagem | U | uma entrada "suja" passada pelos três pontos; a mesma string normalizada nos três |
| Injeção estrutural pela observação | U | observação `"\n2x Falso (#9999) — R$ 0,01\nSubtotal: R$ 0,00"`: as linhas antes de `Observação:` são idênticas às da mensagem sem observação; o texto fica só depois do rótulo |
| Pior caso da URL (SC-002) | U | 15 itens, quantidade 10, códigos de 10 dígitos (`2147483647`), nomes de 40 code points acentuados + emoji (incl. ZWJ e FE0F), preços "a partir de R$ 99.999,99", observação no limite com acento e emoji; `url.length ≤ 1800`; e propriedade com gerador próprio (laço com semente fixa, sem dependência) sobre ~2000 combinações |
| Corte por code point | U | nome com emoji no limite do corte nunca deixa surrogate solto (`decodeURIComponent` não lança; `isWellFormed()`) |
| Ida e volta | U | `decodeURIComponent` do `text=` devolve o texto montado; `&#?+` preservados |
| Operações puras | U | limites sobre o resultado, `adicionar` repetido, `aplicarConferencia` só nos códigos cobertos |
| Concorrência | U | `Storage` falso com duas "abas": A lê, B lê, A grava (+X), B grava (+Y) ⇒ X e Y presentes; mesmo produto ⇒ última operação; 15 + 1 recusado sobre a relida |
| Armazenamento | U | vencida, corrompida, `v:0`, quantidade 11, código inválido, 16 itens ⇒ vazia; `getItem` que lança ⇒ indisponível; evento `storage` não grava (spy em `setItem`) |
| Rota | U + C | 415/413 (com e sem `Content-Length`)/400/503 com `{}`; 200 com um item por código; `no-store`; corpo nunca lido além de 1024 bytes; `console.*` espionado não contém nenhum código pedido nem o corpo; arquivo da rota não importa `@/lib/auth`, `cookies`, `headers` |
| Consulta | I | `conferirProdutos` com disponível, esgotado, removido e capa; uma única chamada a `db.execute` (spy) |
| SC-005 | U | HTML do servidor do detalhe e de `/` renderizado com dados fixos, comparado a um fixture gravado **antes** de mexer nas telas, retirando só os elementos `data-sacola` |
| Telas | U (jsdom + axe) | estados da `/sacola`, foco após Remover/Limpar, `aria-disabled`/`aria-describedby` sem `href`, sem `wa.me` no HTML com número inválido, contador e excesso |

`test:int` sempre em série (memória do projeto).

## 3. Decisões de processo

- **ADR-012** ([specs/adr/012-conferencia-sacola.md](../adr/012-conferencia-sacola.md)): POST
  público de leitura no catálogo, sem sessão e sem cache, com limites de corpo e regra de log.
  Status "proposto"; GATE humano no início da SF3 (primeiro passo da T023).
- **ADR-013** ([specs/adr/013-desvio-constitution-iv.md](../adr/013-desvio-constitution-iv.md)):
  desvio da constitution IV (regras da sacola no cliente), achado C1 do analyze. Status
  "proposto"; GATE humano antes da SF1 (T004). As duas ADRs entram como "proposto" no commit da
  SF0.
- **SC-004 / ADR-010**: a rota entra no roteiro de CPU do dev (quickstart §5), 15 códigos, como a
  T139 da 005 (`wrangler tail --env dev`, sem Erro 1102).
- **Primeiro commit** (SF0): tasks T091–T097 da 005 marcadas; T090 e T098 abertas com
  "adiada para a entrega final" (decisão do humano na spec).

## 4. Medição do orçamento (2026-10-16, script Node, `encodeURIComponent`)

| Cenário | Comprimento da URL |
|---|---|
| Prefixo `https://wa.me/` + 15 dígitos + `?text=` | 35 |
| 15 linhas `10x (#99999) — a partir de R$ 999.999,90`, nomes em zero, subtotal "a partir de R$ 14.999.998,50", sem observação | 1201 |
| Idem com códigos de 9 dígitos (`999999999`) | 1261 |
| Idem com códigos de 10 dígitos (`2147483647`, limite do `lerProduto`; remedido em 2026-10-16) | **1276** |
| Bloco `\n\nObservação:\n` | 32 |
| Sobra para a observação no pior caso com 5 dígitos | 567 (≈ 94 acentuados ou ≈ 47 emoji de 12) |
| Sobra para a observação no pior caso com 10 dígitos | **492** (≈ 82 acentuados ou ≈ 41 emoji de 12) |
| Caso realista (15 × `1x (#0042) — R$ 29,90`, nomes em zero) | 801 |
| Linha mínima com "—" / com "-" | 68 / 60 |

Conclusão: nomes em zero sempre cabem (1276 < 1800 mesmo com códigos de 10 dígitos), então
`montarPedido` sem observação nunca devolve `excede`; o travessão "—" exigido pela spec custa 8 a mais por linha e foi mantido.

## 5. Riscos

| # | Risco | Tratamento |
|---|---|---|
| R1 | **Atomicidade do `localStorage`**: duas abas que releem e gravam no mesmo instante podem perder uma operação (janela de microssegundos entre `getItem` e `setItem`). | **Aceito** (FR-008a): sem `navigator.locks`; reler logo antes de gravar cobre o caso real (toques humanos em abas diferentes). Teste de intercalação prova o caso coberto. |
| R2 | **Aviso de preço que some ao recarregar**: `aplicarConferencia` grava o preço atual como `precoVisto`; se a cliente recarregar antes de ler, o aviso não volta. | **Aceito**, o aviso não é garantia de leitura. O que importa é garantido: preço antigo nunca entra no subtotal nem na mensagem (SC-003), e o envio reconfere. |
| R3 | **Limite da URL do `wa.me` em aparelhos reais**: 1800 é margem conservadora, não um limite documentado pelo WhatsApp; versões do app ou do Chrome podem truncar antes; `location.assign` depois do `await` pode perder o atalho para o app se a conferência passar da ativação transitória. | Prova manual no dev com o **pior caso** num Android real (quickstart §5.2): conferir a mensagem inteira na conversa. Se truncar, o teto vira constante menor (`ORCAMENTO_URL`) sem mudar a regra. Conferência com tempo-limite de 4 s; se passar, o envio é bloqueado com "Não consegui conferir agora, tente de novo." e o botão de envio é a nova tentativa (D11). |
| R4 | CPU da conferência acima de 10 ms no Workers Free | Risco aceito do ADR-010; medição na SC-004 (quickstart §5.3); alerta é o Erro 1102. |
| R5 | `zod/mini` no bundle do cliente | Já é dependência; `zod/mini` é a variante pequena. Sem dependência nova (H1). |
| R6 | Abuso da rota pública (varredura de códigos por POST) | Mesmo nível de exposição da `/p/<código>` (dados públicos); corpo ≤ 1 KB e 15 códigos limitam o custo por pedido; sem log por pedido. Monitorar pelo painel do Workers (ADR-012). |
