# Contrato — telas da 006 (esqueleto funcional)

Regras da 005 (FR-022/FR-023): semântica, teclado, texto ≥ 16 px, alvos ≥ 48 px (`min-h-12`),
Android sem zoom, axe-core sem violação grave. Componentes em `src/app/(public)/_sacola/`;
regras só por `@/lib/sacola/*` (research D1). A feature de design troca estas telas sem mudar
as regras.

## 1. Espaços reservados (SC-005)

| Onde | HTML do servidor (único acréscimo à 005) | Depois de hidratar |
|---|---|---|
| `(public)/layout.tsx` | `<div data-sacola="cabecalho" class="mx-auto flex h-12 max-w-xl justify-end px-4"></div>` | `AcessoSacola`: `<a href="/sacola">Sacola, <span aria-live="polite">2 produtos</span></a>`; "1 produto" no singular; "0 produtos" com a sacola vazia; armazenamento indisponível ⇒ nada |
| `p/[codigo]/page.tsx` (só disponível) | `<div data-sacola="detalhe" class="min-h-12"></div>` antes de "Perguntar no WhatsApp" | `BotaoSacola` (abaixo) |

O teste da SC-005 remove os elementos `[data-sacola]` e compara com o fixture da 005.

## 2. `BotaoSacola` (detalhe)

| Estado | Render |
|---|---|
| Fora da sacola, < 15 | `<button>Adicionar à sacola</button>` (principal) |
| Na sacola | `<a href="/sacola">Na sacola</a>` (US1.3: leva à sacola, não soma) |
| Fora, sacola com 15 | `<button aria-disabled="true" aria-describedby="limite">Adicionar à sacola</button>` + `<p id="limite">A sacola chegou ao limite de 15 produtos. Remova algum para adicionar outro.</p>` |
| Armazenamento indisponível / antes de hidratar | nada |
| Falha ao gravar | texto curto "Não foi possível adicionar agora." |

"Perguntar no WhatsApp" da 005 fica como está, depois do espaço (ação secundária).

## 3. `/sacola` — `TelaSacola`

`page.tsx` (servidor): `<main>` com `<noscript><p>Ative o JavaScript para usar a sacola.</p><a
href="/">Ver o catálogo</a></noscript>` e `<TelaSacola whatsapp={string | null} />`.

Estados (um por vez):

| Estado | Conteúdo |
|---|---|
| Armazenamento indisponível | `<h1>Sacola</h1>` + "Não foi possível abrir a sacola neste navegador. Você ainda pode perguntar por cada produto no WhatsApp." + link ao catálogo |
| Vazia | `<h1 id="sacola-vazia" tabIndex=-1>Sua sacola está vazia</h1>` + link "Ver o catálogo"; sem envio |
| Conferindo | lista com o que está guardado, sem preços, texto "Conferindo a sacola…" (`role="status"`) |
| Falha da conferência | "Não foi possível conferir a sacola agora." + `<button>Tentar de novo</button>`; envio desabilitado; nada gravado |
| Conferida | abaixo |
| Confirmação (`history.state.sacolaEnviada`) | "Seu pedido foi aberto no WhatsApp." + `<button>Limpar sacola</button>` + `<a href="/">Voltar</a>`; a lista continua abaixo |

### Conferida

- `<h1 id="sacola-titulo" tabIndex=-1>Sacola</h1>`.
- Avisos no topo (`role="status"`): "O produto #0042 não está mais no catálogo."
- `<ul>`; cada `<li>`: capa (ou "Sem foto"), nome (link ao detalhe), "#0042", preço unitário,
  valor da linha. Disponível: quantidade com `<button aria-label="Diminuir quantidade de Meia">−</button>`
  `<output>2</output>` `<button aria-label="Aumentar quantidade de Meia">+</button>` (`disabled` em 1 e
  10), e "Remover". Esgotado: "Esgotado" em texto, sem quantidade, com "Remover". Preço alterado:
  "O preço mudou desde que você adicionou." junto do item.
- Resumo: "Subtotal: R$ 22,00" (ou "a partir de …" / "Consulte o valor") e "+ N itens a
  consultar"; região `aria-live="polite"`.
- Observação: `<label for="obs">Observação (opcional)</label>` `<textarea id="obs"
  aria-describedby="obs-conta">` sem `maxLength`; `<p id="obs-conta" aria-live="polite">` com o
  medidor de `medidorObservacao` (contracts/sacola.md §4), em um de três modos:
  - **teto de 200 manda** (`limite: "caracteres"`): "N de 200", N = code points do texto
    normalizado (ex.: "37 de 200");
  - **orçamento da URL manda** (`limite: "mensagem"`, sem excesso): "Espaço da mensagem quase
    cheio" + `<progress max="100" value={fracao × 100} aria-label="Espaço da mensagem usado">`;
    nunca mostra o número de caracteres codificados nem o que resta deles;
  - **excesso** (`limite: "mensagem"`, `excede: true`): "A observação não cabe mais na mensagem.
    Encurte para enviar." + a barra cheia; envio desabilitado.
  O número exato do orçamento fica só nos testes (`restanteObservacao`). Ao digitar, entrada que
  deixaria `restanteObservacao < 0` é desfeita (só quando o texto cresce); excesso causado por a
  sacola crescer é exibido e não cortado.
- `<button>Limpar sacola</button>` → `<dialog>` "Todos os produtos vão sair da sacola." com
  "Limpar" e "Cancelar".
- `<button>Enviar pedido pelo WhatsApp</button>`:
  - habilitado ⇒ fluxo do research D11;
  - número inválido ⇒ `aria-disabled="true"` + `aria-describedby="envio-indisponivel"` + `<p
    id="envio-indisponivel">O envio pelo WhatsApp está indisponível no momento. Tente mais
    tarde.</p>`; sem `href`, nenhum `wa.me` no DOM;
  - todos esgotados ⇒ mesmo padrão com "Todos os produtos da sacola estão esgotados.";
  - observação com excesso, conferindo ou falha ⇒ mesmo padrão com o texto do caso.
  - **conferência do envio sem resposta válida** (mais de 4 s, erro de rede, resposta 400 ou
    5xx, ou fora do esquema): o envio é **bloqueado**, nunca abre o WhatsApp com dados não
    conferidos (SC-003). Mostra `<p role="status">Não consegui conferir agora, tente de
    novo.</p>`; a sacola guardada fica intacta (nenhum `setItem`/`removeItem`), a lista e a
    observação continuam na tela e o botão de envio segue ativo para nova tentativa.

### Foco e anúncios (research D12)

| Ação | Foco | Anúncio (`aria-live="polite"`) |
|---|---|---|
| Remover (sobra item) | `#sacola-titulo` | "Produto removido. Subtotal: …" |
| Remover o último / Limpar confirmado | `#sacola-vazia` | "Sacola vazia." |
| Cancelar o Limpar | botão "Limpar sacola" | — |
| Quantidade | fica no botão | subtotal novo |
| Envio barrado por mudança | `#sacola-titulo` | avisos |
| Envio barrado por falha da conferência | fica no botão de envio | "Não consegui conferir agora, tente de novo." |

Mudança vinda de outra aba: só re-render e anúncio do contador; foco não se move.
