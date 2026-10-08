# Contrato — Telas e pipeline no aparelho (feature 004)

**Data**: 2026-10-08 | Consome: [fotos.md](./fotos.md) §3 e §8, [ia.md](./ia.md) §2 e §6.
Dono das telas: `ui-dev` (só contrato existente). Pipeline do aparelho: sessão principal.

## 1. Rotas

| Rota | Mudança | Guard |
|---|---|---|
| `/painel/produtos/novo` | passa a ter **dois passos na mesma página** (estado do client): **Fotos** → **Dados**. "Continuar" só com ≥ 1 foto confirmada e nenhum envio em curso (FR-005). Botão "Voltar às fotos" no passo Dados mantém o digitado. Recarregar ou sair começa vazio (edge case) | `requireAdminPage` (já existe) |
| `/painel/produtos/[id]` | mostra as fotos em ordem, capa primeiro (FR-040); botão "Fotos" | idem |
| `/painel/produtos/[id]/fotos` | **nova**: gerenciar fotos (US4/US5) | `requireAdminPage("/painel/produtos/<id>/fotos")` + conformidade `produtos-paginas-guard` |
| `/painel/produtos` | miniatura da capa no lugar do marcador "sem foto" (FR-039) | idem |
| `/painel/produtos/[id]/remover` | acrescenta "As fotos do produto também serão apagadas." (FR-035) | idem |
| `/painel/fotos/[arquivo]` | route handler de imagem (fotos.md §5) | sessão na rota |

## 2. Componentes (`src/app/painel/(protegido)/produtos/_fotos/`)

| Componente | Responsabilidade |
|---|---|
| `escolher-foto.tsx` | Celular (`(pointer: coarse)`): dois botões ≥ 48 px, "Tirar foto" (`<input type="file" accept="image/*" capture="environment">`) e "Escolher da galeria" (`accept="image/*"` sem `capture`). Desktop: um botão "Escolher arquivo". Com 3 fotos: indisponíveis + "Máximo de 3 fotos" (US1-AC4) |
| `recorte-foto.tsx` | `react-easy-crop`, moldura 1:1, mover e aproximar (pinça e controle deslizante), botões "Usar esta foto" e "Cancelar". Nada é enviado antes de "Usar esta foto" (FR-007) |
| `lista-fotos.tsx` | Miniaturas em ordem; selo "Capa" na 1ª; estados por miniatura: *enviando*, *Não enviada* + "Tentar de novo"; botão "Remover" (ícone de lixeira **com o texto** ao lado, FR-021); "Mover para a esquerda", "Mover para a direita", "Usar como capa" (≥ 48 px, FR-022); arrasto horizontal por pointer events (D8). No cadastro, remover não confirma (US1-AC6); na tela Fotos, confirma (US4-AC3) |
| `usar-envio.ts` (hook) | Uma foto: `prepararFoto` (§3) → `pedirEnvio` → `fetch(url, { method: "PUT", headers, body })` (exatamente os `headers` devolvidos, inclusive `if-none-match`) → `confirmarEnvio`. Guarda o último motivo `nao_passou` da tela para a 2ª mensagem (US2-AC10). Falha de rede ⇒ *Não enviada* (US2-AC8) |

Tela **Fotos** (`[id]/fotos`): cada ação chama a action e substitui o estado local pelo `Conjunto`
devolvido — no `ok` **e** nas falhas com `atual` (FR-024). Aviso curto com o primitivo `aviso`.
Produto com 1 foto: sem "Remover"; "Trocar foto" + "O produto precisa de pelo menos 1 foto."
(US4-AC4). "Trocar foto" usa o mesmo fluxo de escolha, recorte e envio e chama `trocarFoto`.

Passo **Dados** (`form-produto.tsx` da 003, modo cadastro): recebe os `envioIds` em ordem e os
envia como campos ocultos `fotos`; o botão "Salvar" fica indisponível enquanto houver envio em
curso. Em `foto_expirada`, volta ao passo Fotos com as miniaturas expiradas em *Não enviada*.
Sugestão (US3): ao entrar no passo Dados pela 1ª vez com aquele conjunto, chama `sugerirProduto`
**uma vez**; aviso "Preenchendo a partir das fotos…"; ao chegar, preenche só campos **ainda
vazios** com o marcador "Sugestão — confira" (o marcador some quando a pessoa edita o campo);
categoria só se o id existir nas opções. Os campos ficam editáveis o tempo todo (FR-027).

Imagens: miniaturas de fotos ainda não salvas usam a URL local do blob (`URL.createObjectURL`,
revogada ao sair); fotos salvas usam `FotoVista.url`. `<img>` simples com `width`/`height`
(sem `next/image`, que usaria transformação no servidor). Na lista de produtos, as miniaturas
usam `loading="lazy"` (research D17); o peso das capas é avaliado na observação do SC-001.

## 3. Pipeline no aparelho — `src/lib/fotos/aparelho/`

Código só de navegador; nada de `server-only` (fotos.md §1).

```ts
detectarTipo(cabecalho: Uint8Array): "jpeg" | "png" | "webp" | "heic" | "outro"   // pelos bytes, não pela extensão; PNG é aceito como ENTRADA e sai como WebP/JPEG
suportaWebp(): Promise<boolean>                                                 // canvas 1×1, uma vez por sessão (D4)
abrirImagem(arquivo: File): Promise<ImageBitmap>                                // createImageBitmap(arquivo, { imageOrientation: "from-image" }) (FR-017); falha ⇒ "nao_abre"
recortar(img, area: { x; y; lado }): { lado: number }                          // lado final = min(area.lado, 1200); area.lado < 400 ⇒ "pequena" (FR-018)
codificar(canvas, formato, qualidades = [0.82, 0.72, 0.62] | [0.85, 0.72, 0.62]): Promise<Blob>
  // confere blob.type === pedido; senão recodifica em JPEG; PNG nunca sai; > 1 MB na última ⇒ "grande"
prepararFoto(arquivo, area): Promise<{ blob: Blob; formato: "webp" | "jpeg" } | { motivo: "formato" | "nao_abre" | "pequena" | "grande" }>
```

- `detectarTipo` "outro" (SVG, GIF, PDF…) ⇒ mensagem `formato` antes de abrir (US2-AC3).
- Só a primeira imagem de arquivo animado ou com várias imagens é usada (o canvas desenha um
  quadro); o arquivo original nunca é enviado (FR-013).
- Testes unitários: `detectarTipo`, a matemática de `recortar` e o laço de `codificar` com
  codificador injetado (jsdom não tem canvas). Comportamento real: SF10 e quickstart §4.

## 4. Requisitos de UX (constitution V)

Uma tarefa por tela; alvos ≥ 48 px; texto ≥ 16 px; nenhuma palavra técnica ("upload", "EXIF",
"timeout", "MIME"); "Tirar" só em "Tirar foto"; toda mensagem vem de
`src/lib/fotos/mensagens.ts` ou de [ia.md §6](./ia.md#6-mensagens-tela).
