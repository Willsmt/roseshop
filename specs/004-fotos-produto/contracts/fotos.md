# Contrato — Fotos de produto (feature 004)

**Data**: 2026-10-08 | Decisões: [research.md](../research.md) | Modelo: [data-model.md](../data-model.md)

Zonas protegidas tocadas: `src/lib/db/` (schema, migration, SQL), `src/lib/r2/`,
`wrangler.jsonc`, `.dev.vars.example`. Toda a §2, §4, §6 e §7 é revisada pelo tech-lead.

## 1. Camadas e fronteiras

```text
navegador ──PUT assinado──────────────────────────────► R2 (fotos/<uuid>.<ext>)
   │                                                     ▲   ▲
   │ Server Actions                                      │   │ binding PRODUCT_IMAGES
   ▼                                                     │   │
src/lib/fotos/actions.ts ─► src/lib/r2 (assinatura, bucket, verificação) ─┘   │
   │                     └► src/lib/db/fotos.ts, produtos.ts (SQL)            │
src/lib/produtos/actions.ts (criarProduto, removerProduto alterados) ─────────┤
src/app/painel/fotos/[arquivo]/route.ts (exibição) ───────────────────────────┤
src/app/api/interno/limpeza/route.ts ◄── cloudflare/worker.ts (scheduled) ────┘
```

| Módulo | Pode importar | Não pode ser importado por |
|---|---|---|
| `src/lib/r2/` (barrel `index.ts`, `server-only`) | `aws4fetch`, `@opennextjs/cloudflare` | qualquer coisa fora de `src/lib/fotos/`, `src/lib/produtos/`, `src/app/painel/fotos/`, `src/app/api/interno/` |
| `src/lib/db/fotos.ts` | schema, locks, contexto | qualquer coisa fora de `src/lib/fotos/`, `src/lib/produtos/` |
| `src/lib/fotos/actions.ts` (`"use server"`) | auth (barrel), r2 (barrel), db/fotos, domínio de fotos | — |
| `src/lib/fotos/aparelho/` (código do navegador) | só APIs do navegador e `src/lib/fotos/mensagens.ts` | nada de `server-only`, nada de `src/lib/db`, `src/lib/r2`, `src/lib/auth` |
| `src/lib/fotos/mensagens.ts`, `tipos.ts` | nada | — (seguros para o client) |

Teste de conformidade novo `src/test/conformance/fotos-acesso.test.ts` (nega por padrão, mesmo
padrão de `produtos-acesso`): as fronteiras acima; `insert(produtos)` só em
`inserirComFotos`; nenhum import de `aws4fetch` fora de `src/lib/r2/`.

## 2. Camada SQL — `src/lib/db/fotos.ts` e alterações em `src/lib/db/produtos.ts`

Todas as funções recebem `db` (padrão da 003). `$me` = `sessao.email`. `G(tok)` =
`EXISTS (SELECT 1 FROM produtos WHERE id = $p AND fotos_operacao = $tok)`.
`VALIDO(e)` = `id = e AND enviado_por = $me AND estado = 'confirmado' AND criado_em > now() - interval '24 hours'`.

**Parâmetros** (TL-3): no template `sql` do Drizzle, um array JS vira lista `($1, $2, …)`.
Todo array vai como **um** parâmetro: `${sql.param(ids)}::uuid[]`, `${sql.param(chaves)}::text[]`,
`${sql.param(datas)}::timestamptz[]` (de `Date[]`, com teste de integração). O lock segue o código
atual: `pg_advisory_xact_lock(${LOCK_FOTOS}::bigint)`. Nos blocos abaixo, `4001` e `$ids` são
abreviações dessa forma.

### 2.1 Envios

```ts
emitirEnvio(db, sessao, { id: string; formato: "webp" | "jpeg"; tamanho: number })
  : Promise<{ tipo: "ok"; chave: string } | { tipo: "muitos_pendentes" }>
// INSERT INTO fotos_envio (id, formato, tamanho, enviado_por)
//   SELECT $id, $formato, $tamanho, $me
//   WHERE (SELECT count(*) FROM fotos_envio WHERE enviado_por = $me
//          AND criado_em > now() - interval '24 hours') < 20
//   RETURNING chave
// (teto de 20 aproximado sob concorrência da mesma pessoa; aceito, D13)

obterEnvio(db, sessao, id): Promise<EnvioLinha | undefined>        // filtra enviado_por = $me
marcarConfirmado(db, sessao, id): Promise<boolean>                 // estado 'emitido' → 'confirmado', confirmado_em = now()
descartarEnvio(db, sessao, id): Promise<string | undefined>        // DELETE … estado = 'emitido' RETURNING chave
enviosValidos(db, sessao, ids): Promise<Set<string>>               // ids que são VALIDO agora (TL-10)
```

`enviosValidos` serve à precedência de `foto_expirada` (§2.2) e ao passo 3 de `sugerirProduto`
(ia.md §2).

### 2.2 Cadastro com fotos — `inserirComFotos` (substitui `inserir` da 003)

```ts
inserirComFotos(db, sessao, campos: CamposProduto, envioIds: string[] /* 1..3, únicos, em ordem */)
  : Promise<{ tipo: "ok"; id: number } | NomeRepetido | CategoriaAusente
           | { tipo: "foto_expirada"; envioIds: string[] }>
```

```sql
-- db.batch, tok = uuid novo
SELECT pg_advisory_xact_lock(4001);
INSERT INTO produtos (…campos…, criado_por, atualizado_por, fotos_operacao)
  SELECT …, $me, $me, $tok
  WHERE (SELECT count(*) FROM fotos_envio WHERE id = ANY($ids) AND <VALIDO por linha>) = $n
  RETURNING id;
WITH e AS (
  DELETE FROM fotos_envio WHERE id = ANY($ids) AND <VALIDO por linha>   -- repetido (TL-11)
    AND EXISTS (SELECT 1 FROM produtos WHERE fotos_operacao = $tok)
  RETURNING id, chave, enviado_por, criado_em)
INSERT INTO produto_fotos (produto_id, posicao, chave_objeto, enviado_por, enviado_em)
  SELECT (SELECT id FROM produtos WHERE fotos_operacao = $tok), o.ord, e.chave, e.enviado_por, e.criado_em
  FROM e JOIN unnest($ids::uuid[]) WITH ORDINALITY AS o(id, ord) ON o.id = e.id;
```

- `envioIds` é normalizado para minúsculas na entrada (o Postgres devolve o uuid em
  minúsculas; sem isso um id válido em maiúsculas sairia em `foto_expirada` e o mesmo uuid em
  duas grafias passaria pela checagem de repetidos). A action também normaliza no Zod (SF6).
- `23505` aborta o batch inteiro: só vira `nome_repetido` se a constraint for
  `produtos_chave_unique` (campo `constraint` do `NeonDbError`, já lido por `nomeConstraint`
  em `erros-pg.ts`); qualquer outra ⇒ propaga (ADR-008, ressalva da 003).
  `23503` só vira `categoria_ausente` se a constraint for exatamente a FK de categoria
  (`produtos_categoria_id_categorias_id_fk`); qualquer outra ⇒ propaga.
- **Testes obrigatórios (TL-4)**: mesmo nome com envios válidos diferentes ⇒ `nome_repetido`
  vindo do `23505` do batch; `23505` de outra constraint ⇒ propaga, **inclusive as de
  `produto_fotos`** (`produto_fotos_objeto_unique`); só `produtos_chave_unique`, por
  **comparação exata** do nome da constraint, vira `nome_repetido`; categoria removida ⇒
  `categoria_ausente` vindo do `23503`.
- 0 linhas no `INSERT produtos` (sem erro) ⇒ leitura posterior, nesta precedência:
  1. já existe produto com a mesma chave de nome ⇒ `nome_repetido` com o código. É o caso do
     **duplo toque em "Salvar"**: o segundo pega o lock depois do primeiro, os envios já foram
     consumidos, o `WHERE count = n` dá falso e o `INSERT` não chega a violar o `UNIQUE` — o
     resultado para a pessoa é o mesmo da spec (recusa por nome repetido);
  2. senão, lista quais `envioIds` não são `VALIDO` ⇒ `foto_expirada` com esses ids (a tela marca
     as fotos que faltam).
     **Lista vazia** (`foto_expirada` com `envioIds: []`) é corrida: algum envio estava
     `emitido` no batch e foi confirmado entre o batch e a leitura. Não há foto a marcar; a
     action responde `falha_geral` ("Tente de novo em instantes", da 003), com `valores`.
     **Nome em conflito sumido**: se o produto com o mesmo nome é removido ou renomeado entre o
     batch e a leitura do passo 1, a leitura não o acha e o resultado cai no passo 2. No duplo
     "Salvar" os envios já foram adotados pelo primeiro, então todos os ids saem em
     `foto_expirada`. Reação esperada: a tela marca essas fotos e a pessoa as envia de novo e
     salva outra vez (nada é gravado pela segunda chamada; benigno, sem tratamento próprio).

### 2.3 Conjunto de fotos de produto existente

```ts
lerConjunto(db, produtoId): Promise<{ fotosVersao: number; fotos: FotoLinha[] } | undefined>
// FotoLinha = { posicao; chave: string; enviadoPor: string; enviadoEm: Date }

substituirConjunto(db, sessao, entrada: {
  produtoId: number;
  fotosVersao: number;          // a que a tela tinha
  atuais: string[];             // chaves lidas por lerConjunto na MESMA versão, em ordem
  novas: FotoLinha[];           // lista final, 1..3, em ordem (posicao = índice + 1)
  envioId?: string;             // presente em adicionar/trocar: a linha nova vem dele
}): Promise<{ tipo: "ok"; fotosVersao: number } | { tipo: "ausente" } | { tipo: "alterado" }
          | { tipo: "foto_expirada" }>
```

```sql
-- db.batch, tok = uuid novo
SELECT pg_advisory_xact_lock(4001);
UPDATE produtos
   SET fotos_versao = fotos_versao + 1, fotos_operacao = $tok,
       atualizado_por = $me, atualizado_em = now()
 WHERE id = $p AND fotos_versao = $v
   AND (SELECT coalesce(array_agg(chave_objeto ORDER BY posicao), '{}')
          FROM produto_fotos WHERE produto_id = $p) = $atuais::text[]
   AND $chaves::text[] <@ ($atuais::text[]
                           || ARRAY(SELECT chave FROM fotos_envio WHERE VALIDO($envio)))
   AND ($envio::uuid IS NULL OR EXISTS (SELECT 1 FROM fotos_envio
                                        WHERE VALIDO($envio) AND chave = ANY($chaves::text[])))
 RETURNING fotos_versao;
DELETE FROM fotos_envio WHERE id = $envio AND G(tok);            -- só com envioId
DELETE FROM produto_fotos WHERE produto_id = $p AND G(tok);
INSERT INTO produto_fotos (produto_id, posicao, chave_objeto, enviado_por, enviado_em)
  SELECT $p, o.ord, o.chave, o.por, o.em
  FROM unnest($chaves::text[], $por::text[], $em::timestamptz[]) WITH ORDINALITY AS o(chave, por, em, ord)
  WHERE G(tok);
```

- `$chaves` são as chaves de `novas`, em ordem (as mesmas do `INSERT`).
- **Chave nova amarrada ao envio** (emenda de 2026-10-09, achado 1 da revisão da SF5, opção ii,
  aprovada pelo humano): toda chave de `novas` está em `atuais` ou é a chave do envio `VALIDO`
  informado, e com `envioId` essa chave está em `novas`. Sem `envioId`, nenhuma chave fora de
  `atuais` entra. A garantia é do próprio `UPDATE` que decide, não só da action.
- A precedência após 0 linhas (leitura posterior): produto inexistente ⇒ `ausente`;
  `fotos_versao ≠ $v` ou conjunto diferente ⇒ `alterado`; envio inválido ⇒ `foto_expirada`;
  versão, conjunto e envio em ordem mas chave nova fora da regra acima ⇒ **lança** `Error` (bug
  de quem chama: a action monta `novas` com `obterEnvio`). Envio confirmado depois do batch, com
  as chaves em ordem, continua `foto_expirada` (corrida).
- `novas` com 0 ou mais de 3 itens, posições diferentes de 1..n em ordem ou chaves repetidas ⇒
  **lança** `Error` antes do batch, sem tocar o banco (FR-003).
- `versao` (003) não é tocada.
- Os valores de `novas` vêm de `lerConjunto` (fotos existentes, imutáveis e de chave única) e de
  `obterEnvio` (foto nova); a igualdade de `atuais` e a regra da chave nova no `UPDATE` garantem
  que as chaves são as do banco. `enviadoPor` e `enviadoEm` continuam vindo de quem chama.

### 2.4 Leitura (alterações em `produtos.ts`)

- `listar`: `LEFT JOIN produto_fotos f ON f.produto_id = p.id AND f.posicao = 1` ⇒ campo `capa:
  string | null` (chave). `null` só é possível em produto legado (não deve existir, D10).
- `obterPorId`: + `fotosVersao: number`, `fotos: { posicao; chave }[]` em ordem.

### 2.5 Remoção de produto (alteração de `remover`)

```sql
-- db.batch
SELECT pg_advisory_xact_lock(4001);
WITH f AS (SELECT chave_objeto FROM produto_fotos WHERE produto_id = $id),
     d AS (DELETE FROM produtos WHERE id = $id AND versao = $v RETURNING id)
SELECT (SELECT id FROM d) AS id, ARRAY(SELECT chave_objeto FROM f) AS chaves;
```

`id` nulo ⇒ `ausenteOuVersaoDiferente` (003). Senão `{ tipo: "removido", chaves }`.

### 2.6 Limpeza

```ts
expirarEnvios(db): Promise<string[]>
// batch: lock 4001; DELETE FROM fotos_envio WHERE criado_em <= now() - interval '24 hours' RETURNING chave
chavesConhecidas(db): Promise<Set<string>>
// SELECT chave_objeto FROM produto_fotos UNION ALL SELECT chave FROM fotos_envio
```

`chavesConhecidas` é **um único statement** (mesmo snapshot para as duas tabelas); proibido
dividir em duas consultas, o que abriria janela durante uma adoção (TL-12).

## 3. Server Actions — `src/lib/fotos/actions.ts` e alterações em `src/lib/produtos/actions.ts`

Ordem fixa (igual à 003): `requireAdminAction()` → Zod → leitura/SQL → R2. Chamadas
programáticas (objeto, não `FormData`), exceto `criarProduto`. Nunca redirecionam.

```ts
type FotoVista = { posicao: number; arquivo: string /* "<uuid>.<ext>" */; url: string /* /painel/fotos/<arquivo> */ };
type Conjunto = { fotosVersao: number; fotos: FotoVista[] };
type FalhaFoto = { motivo: MotivoFoto; mensagem: string; atual?: Conjunto };
type ResultadoFotos = ({ ok: true } & Conjunto) | ({ ok: false } & FalhaFoto);

pedirEnvio(e: { formato: "webp" | "jpeg"; tamanho: number })
  : Promise<{ ok: true; envioId: string; url: string; headers: Record<"content-type" | "if-none-match", string> }
          | ({ ok: false } & FalhaFoto)>          // grande | muitos_pendentes | falha_geral
confirmarEnvio(e: { envioId: string })
  : Promise<{ ok: true; envioId: string; arquivo: string } | ({ ok: false } & FalhaFoto)>
          // nao_enviada | formato | grande | pequena | nao_passou | falha_geral
adicionarFoto(e: { produtoId; fotosVersao; envioId }): Promise<ResultadoFotos>
trocarFoto(e: { produtoId; fotosVersao; posicao: 1|2|3; envioId }): Promise<ResultadoFotos>
removerFoto(e: { produtoId; fotosVersao; posicao: 1|2|3 }): Promise<ResultadoFotos>
moverFoto(e: { produtoId; fotosVersao; de: 1|2|3; para: 1|2|3 }): Promise<ResultadoFotos>
```

**`pedirEnvio`**: Zod (`tamanho` inteiro ≥ 1; `> 1_048_576` ⇒ `grande` sem SQL) → `id =
crypto.randomUUID()` → `emitirEnvio` → `assinarEnvio` (§7). O navegador faz o `PUT` com
exatamente os `headers` devolvidos (`content-type`, `if-none-match: *`) e o corpo de `tamanho`
bytes; o `content-length` é posto pelo navegador. Um segundo `PUT` na mesma URL recebe 412
(TL-1, prova no R1).

**`confirmarEnvio`** (FR-012, FR-014, FR-015, FR-016, FR-018):
1. `obterEnvio` (da pessoa). Inexistente ⇒ `falha_geral`. Já `confirmado` ⇒ devolve `ok` igual
   (idempotente).
2. `lerObjeto(chave)`: ausente ⇒ `nao_enviada` (a linha fica; "Tentar de novo" pede envio novo).
3. `tamanho do objeto > 1_048_576` ou `≠ fotos_envio.tamanho` ⇒ `grande`, **sem ler o corpo**.
4. `verificarImagem(bytes, { declarado, modo: modoVerificacao() })` (§4); `declarado` vem da
   extensão da chave; formato detectado `≠` declarado já sai como `formato`.
5. Recusa ⇒ **primeiro** `descartarEnvio` (`DELETE … WHERE estado = 'emitido' RETURNING
   chave`); **só se uma linha voltar**, `apagarObjetos([chave])` (TL-2: uma confirmação
   concorrente que já marcou `confirmado` não perde o objeto). Devolve o motivo. Modo registro
   (research D4): a própria verificação não recusa por `metadado` e segue até as dimensões;
   aceito em modo registro ⇒ log de aviso com `blocos` e segue para 6; **recusado em modo
   registro ⇒ log de aviso com `motivo`, `regra` e `blocos`** (nunca bytes) antes do descarte.
   Fora do modo registro, a recusa não grava log novo.
6. `marcarConfirmado` ⇒ `ok`.

Mapeamento de motivo da verificação para a action: `formato` ⇒ `formato`; `metadado`,
`animada`, `corrompida`, `dimensao` ⇒ `nao_passou`; `pequena` ⇒ `pequena`.

**Ações do conjunto**: Zod → `lerConjunto`; inexistente ⇒ `nao_existe`; `fotosVersao` lida `≠`
recebida ⇒ `alterado` com `atual`. Então a regra pura `src/lib/fotos/conjunto.ts` calcula
`novas`:

| Ação | Regra | Recusa sem SQL |
|---|---|---|
| adicionar | `[...atuais, nova]` | 3 fotos ⇒ `limite` |
| trocar | nova na `posicao`, demais iguais | posição inexistente ⇒ `falha_geral` |
| remover | sem a `posicao`, demais sobem | 1 foto ⇒ `ultima` |
| mover | tira de `de`, insere em `para` | posição inexistente ou `de = para` ⇒ `falha_geral` |

Depois `substituirConjunto`. `ok` ⇒ `revalidatePath` da lista e do detalhe; troca e remoção
apagam a chave que saiu com `apagarObjetos` em melhor esforço (FR-036; falha só é registrada).
Toda falha `alterado`/`limite`/`foto_expirada` traz `atual` (lido de novo) para a tela se
atualizar (FR-024).

**`criarProduto`** (003, alterada): `FormData` ganha `fotos` (repetido, envioIds em ordem).
Zod: 1..3 uuids únicos; 0 ⇒ falha `sem_foto` (mensagem do US1-AC8, sem `campo`). Ordem: guard
→ campos (003) → fotos → `exigirCategoriaValida` → `inserirComFotos`. `foto_expirada` traz
`envioIds` expirados; com `envioIds` vazio (corrida, §2.2) a action responde `falha_geral`.
Os uuids de `fotos` são normalizados para minúsculas no Zod. `valores` continua em toda falha
(003).

**`removerProduto`** (003, alterada): `remover` devolve `chaves` ⇒ `apagarObjetos(chaves)` em
melhor esforço depois do sucesso (FR-035).

## 4. Verificação do arquivo — `src/lib/r2/verificacao/`

```ts
verificarImagem(bytes: Uint8Array, opcoes: { declarado: "jpeg" | "webp"; modo: "recusar" | "registro" }):
  | { ok: true; formato: "jpeg" | "webp"; lado: number; blocos: string[] }
  | { ok: false; motivo: "formato" | "corrompida" | "metadado" | "animada" | "pequena" | "dimensao"; regra: RegraVerificacao; blocos: string[] }
```

Sem decodificar a imagem (VII). Percorre o **arquivo inteiro**. Ordem: assinatura (⇒ `formato`;
**PNG, GIF, SVG, HEIC, PDF e qualquer outra assinatura ⇒ `formato`**; detectado `≠`
`declarado` ⇒ `formato`) → estrutura completa (⇒ `corrompida`) → SOFn não permitido (⇒
`formato`) → blocos (⇒ `animada`, depois `metadado`; com `modo: "registro"` o `metadado` não
recusa e a verificação segue) → dimensões: largura `≠` altura ou lado
`> 1200` ⇒ `dimensao`; lado `< 400` ⇒ `pequena` (FR-016, FR-018). `blocos` lista os nomes
encontrados (para o log do modo registro; nunca bytes). `regra` é o subcódigo da primeira regra
que decidiu a recusa (para o log do modo registro na SF10; nunca bytes). Dentro de um mesmo
motivo, vale a primeira regra na ordem do arquivo, com uma exceção: no JPEG o perfil ICC é
remontado e julgado depois da passada, então `icc_tag`, `icc_tamanho` e `icc_estrutura` perdem
para as regras dos segmentos (no WebP o ICCP é julgado na sua posição). `jpeg_comprimento`
também cobre o arquivo que acaba dentro do campo de comprimento (logo depois do marcador);
`jpeg_truncado` fica para o fim no lugar de um marcador ou nos dados entrópicos. Upload cortado
pela rede não chega à verificação: o R2 recusa o `PUT` com tamanho diferente do assinado (R1).
O motivo não muda:

| Motivo | `regra` |
|---|---|
| `formato` | `assinatura`, `declarado`, `sof_tipo`, `sof_precisao` (≠ 8 e ≠ 0), `sof_componentes` |
| `corrompida` (JPEG) | `jpeg_marcador` (byte que não é marcador, `FF FF`, marcador inválido, RST fora dos dados, segundo SOI), `jpeg_comprimento`, `jpeg_truncado`, `jpeg_sem_sof_sos`, `jpeg_apos_eoi`, `jpeg_bloco_apos_sos`, `jpeg_dri`, `sof_duplicado`, `sof_estrutura`, `sof_precisao` (= 0), `sof_dimensao_zero`, `sos_estrutura`, `icc_sequencia` |
| `corrompida` (WebP) | `riff_tamanho`, `webp_chunk_truncado`, `vp8x_estrutura`, `vp8x_reservado`, `vp8x_dimensao`, `iccp_posicao`, `iccp_sem_flag`, `iccp_sem_chunk`, `alph_posicao`, `alph_sem_flag`, `alph_com_vp8l`, `imagem_duplicada`, `imagem_ausente`, `vp8_cabecalho`, `vp8l_cabecalho` |
| `corrompida` (ICC) | `icc_estrutura` |
| `animada` | `mpf`, `vp8x_animacao`, `anim` |
| `metadado` | `jfif_miniatura` (miniatura ou comprimento ≠ 16), `jfif_posicao` (fora da posição logo após o SOI, inclusive duplicado), `app0_outro` (JFXX ou outro APP0), `app1`, `app2_outro`, `appn`, `com`, `marcador_fora_da_lista`, `vp8x_flag_metadado`, `chunk_fora_da_lista`, `icc_tag`, `icc_tamanho` |
| `dimensao` | `nao_quadrada`, `lado_maior` |
| `pequena` | `lado_menor` |

| Formato | Permitidos | `animada` | `metadado` (qualquer outro) | `corrompida` |
|---|---|---|---|---|
| **JPEG** (`FF D8`) | SOI; APP0 `JFIF\0` **com comprimento 16 e miniatura 0×0** (TL-7), no máximo um e logo após o SOI; APP2 `ICC_PROFILE\0` (um ou mais pedaços, sequência válida; perfil conforme a regra do ICC abaixo); DQT; SOF0/SOF1/SOF2 (exatamente 1, precisão 8, 1 ou 3 componentes); DHT; DRI; SOS + dados entrópicos (com `FF 00` e RST0–7) — **progressivo: vários SOS, com DHT/DQT entre eles** (TL-18); EOI | APP2 `MPF\0` | APP1 (Exif, XMP), APP0 JFIF com miniatura, outro comprimento, duplicado ou fora da posição logo após o SOI, APP0 não-JFIF (JFXX), APP2 de outro tipo, APP3–APP15 (inclui APP14 "Adobe"; reavaliado na SF10), COM, DNL; demais SOFn e SOF com precisão `≠` 8 ou componentes fora de 1 e 3 ⇒ `formato` | segmento com comprimento além do fim; byte de preenchimento `FF FF`; marcador inválido; ausência de SOF/SOS/EOI; pedaços do ICC fora de sequência; **qualquer byte depois do EOI**; largura/altura 0; precisão 0 no SOF |
| **WebP** (`RIFF….WEBP`) | VP8 ou VP8L (simples); ou VP8X (flags só ICC e/ou alpha; bits e bytes reservados zerados) + ICCP (regra do ICC) + ALPH (só com a flag de alpha) + VP8/VP8L | flag de animação no VP8X; ANIM; ANMF | flags EXIF/XMP no VP8X; EXIF; XMP; qualquer outro chunk | tamanho do RIFF + 8 `≠` tamanho do arquivo (**bytes além do RIFF** ou truncado); chunk além do fim; dimensões do VP8X `≠` do bitstream; bit ou byte reservado do VP8X ligado; ALPH sem a flag de alpha ou antes de VP8L; ICCP sem a flag de ICC |

Os apertos da revisão da SF2 (JFIF único e logo após o SOI; SOF com precisão 8 e 1 ou 3
componentes; reservados do VP8X zerados; ALPH só com a flag de alpha e nunca antes de VP8L) são
**confirmados na SF10** com os arquivos reais dos aparelhos (T098): três deles recusam como
`formato`/`corrompida`, que o modo registro não relaxa, e por isso a recusa em modo registro
loga `motivo` e `regra` (§3, passo 5). Recusar bits e bytes reservados do VP8X é **mais estrito
que a spec do WebP** (que manda o leitor ignorá-los), por decisão deliberada da lista de
permitidos; a T098 pode afrouxar com dado real.

**Regra do ICC** (decisão C, TL-8): perfil completo de até **8 KB** (valor provisório, fechado na
SF10); cabeçalho de 128 bytes e tabela de tags consistentes (cada tag dentro do perfil). Tags
permitidas: `wtpt`, `bkpt`, `rXYZ`, `gXYZ`, `bXYZ`, `rTRC`, `gTRC`, `bTRC`, `chad`, `chrm`,
`lumi`, `desc`, `cprt`. Qualquer outra (inclusive `dmnd`, `dmdd`, `meta` e tags privadas) ⇒
`metadado`. Estrutura inconsistente (tamanho declarado `≠` real, sem `acsp`, tabela ou tag fora
do perfil) ⇒ `corrompida`. Lista final fechada com as fixtures reais da SF10.

- Dimensões: JPEG pelo SOF; WebP pelo VP8 (14 bits após `9D 01 2A`), VP8L (14+14 bits após
  `0x2F`) ou VP8X (24 bits + 1).
- Custo: uma passada linear; nos dados entrópicos do JPEG, o próximo `0xFF` é achado com
  `indexOf` (TL-9), sem laço byte a byte em JS. Medir o CPU da confirmação no dev (quickstart §5).
- Testes (SF2): fixtures sintéticas montadas no teste (todos os blocos da tabela, EXIF com GPS
  **falso**, XMP, IPTC, COM, JFIF com miniatura, ICC com `dmnd`/`dmdd`/`meta`/tag privada/acima
  do limite, JPEG progressivo, foto não quadrada, lado 1201, WebP animado, PNG, SVG, GIF, HEIC
  (`ftypheic`), PDF renomeado), variantes corrompidas (truncar em cada segmento, comprimento
  inflado, bytes após o fim, bloco proibido depois do SOS, ICC fora de sequência) e, a partir da
  SF10, os arquivos reais dos aparelhos.

`src/lib/r2/verificacao/modo.ts`: `modoVerificacao(): "recusar" | "registro"` — `"registro"`
só se `process.env.FOTOS_VERIFICACAO === "registro"` (exato). Teste unitário de todos os outros
valores ⇒ `"recusar"`. Conformidade (TL-17): lê `wrangler.jsonc` (parser JSONC do `typescript`)
e `.dev.vars.example`; falha se `FOTOS_VERIFICACAO` existir **em qualquer lugar** do
`wrangler.jsonc` (inclusive `env.dev`) ou no exemplo. Só durante a SF10 a conformidade permite
a variável nas `vars` do `env.dev` (ajuste na T094a) e volta à proibição total na T099. Toda
confirmação aceita em modo registro grava log de aviso.

## 5. Rota de exibição — `src/app/painel/fotos/[arquivo]/route.ts`

`GET` apenas.
1. `getAdminSession()`; sem sessão ⇒ **404** (é imagem, não redireciona).
2. `arquivo` deve casar `^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(webp|jpg)$`;
   senão 404 **sem tocar no binding**.
3. A chave `fotos/<arquivo>` precisa existir em `produto_fotos` ou em `fotos_envio` com
   `estado = 'confirmado'`; senão 404.
4. `bucket.get(chave, { onlyIf: If-None-Match })`: `null` ⇒ 404; objeto **sem `body`** (condição
   falhou) ⇒ 304; objeto com `body` ⇒ 200. O caso do 304 tem teste próprio (TL-19).
5. Headers: `Content-Type` pela extensão (`image/webp` | `image/jpeg`), `Cache-Control: private,
   max-age=31536000, immutable` (a chave nunca muda de conteúdo), `ETag`,
   `X-Content-Type-Options: nosniff`, `Content-Security-Policy: default-src 'none'`.

Conformidade: teste `fotos-rota-guard` exige `getAdminSession` antes de qualquer uso do barrel r2.

## 6. Limpeza

`src/lib/fotos/limpeza.ts` (`server-only`) — `executarLimpeza(agora)`:
1. **(a)** `expirarEnvios()` (sob lock 4_001) ⇒ `apagarObjetos(chaves)` (lotes de 1000;
   objeto inexistente não é erro).
2. **(b)** `listarObjetos("fotos/")` (paginado) ⇒ candidatos com `uploaded < agora − 25 h`.
3. **Depois** de listar, `chavesConhecidas()`; apaga os candidatos ausentes do conjunto.
4. Devolve e registra `{ enviosExpirados, orfaosApagados, falhas }`. Falha num `delete` só é
   registrada; a próxima execução tenta de novo.

**Por que não apaga foto viva (FR-038)**: (a) roda sob o lock 4_001, então nenhuma adoção
intercala; a adoção exige `criado_em > now() − 24 h` e a limpeza apaga `≤ now() − 24 h`. (b) um
objeto com mais de 25 h nunca mais pode ser adotado (a URL vale 5 min a partir da emissão e a
adoção exige envio com menos de 24 h); se ele não está em nenhuma das tabelas quando elas são
lidas, ninguém pode passar a referenciá-lo. A 1 h extra cobre diferença de relógio entre R2 e
Postgres.

**Rota** `src/app/api/interno/limpeza/route.ts`: só `POST`; `authorization: Bearer <CRON_SECRET>`.
Comparação (TL-16): SHA-256 (`crypto.subtle.digest`) do valor recebido e do `CRON_SECRET`,
comparados byte a byte com laço de tempo fixo sobre os 32 bytes — mesmo comprimento sempre,
mesmo código no Node (testes) e no workerd; sem `timingSafeEqual`. `CRON_SECRET` ausente,
header ausente ou errado, ou outro método ⇒ **404 sem corpo**, igual em todos os casos. Sucesso
⇒ 200 com as contagens.

**Worker** `cloudflare/worker.ts` (TL-6: sem `@ts-expect-error`; o módulo é declarado em
`cloudflare/open-next-worker.d.ts` com o tipo `ExportedHandler<CloudflareEnv>`, e `.open-next`
entra no `exclude` do `tsconfig`, para o `typecheck` dar o mesmo resultado com ou sem build local):

```ts
import { default as handler } from "../.open-next/worker.js";
export default {
  fetch: handler.fetch,
  async scheduled(_evento, env, ctx) {
    const resposta = await handler.fetch(
      new Request("https://interno.invalid/api/interno/limpeza", {
        method: "POST", headers: { authorization: `Bearer ${env.CRON_SECRET}` } }),
      env, ctx);
    console.log(JSON.stringify({ evento: "limpeza", status: resposta.status }));
    if (resposta.status !== 200) throw new Error(`limpeza: status ${resposta.status}`);
  },
} satisfies ExportedHandler<CloudflareEnv>;
```

O `scheduled` aguarda a resposta e falha se não for 200, para o cron aparecer como falha no
painel (TL-16).

`wrangler.jsonc`: `"main": "cloudflare/worker.ts"`; `"triggers": { "crons": ["0 6 * * *"] }` no
nível de cima, em `env.dev` e em `env.production` (spike R3 decide se a chamada em processo
funciona; reserva em research D6).

## 7. R2 — `src/lib/r2/`

| Arquivo | Conteúdo |
|---|---|
| `config.ts` | Zod sobre `process.env`: `R2_S3_ENDPOINT` (URL, sem barra final, inclui o bucket; `http` só com host `localhost`/`127.0.0.1`, senão `https`), `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`. Ausente ⇒ erro ⇒ `falha_geral` na action |
| `chaves.ts` | `chaveDoEnvio(id, formato)`, `ARQUIVO_VALIDO` (regex da §5), `chaveDoArquivo`, `arquivoDaChave` |
| `assinatura.ts` | `assinarEnvio({ chave, formato, tamanho })` ⇒ `{ url, headers }` com `new AwsV4Signer({ service: "s3", region: "auto", … }).sign()` (não `AwsClient.sign`, que monta um `Request` com `content-length` e não foi provado no workerd), `method: "PUT"`, headers `content-type`, `content-length` e `if-none-match: *` (TL-1), `signQuery: true`, `allHeaders: true`; `tamanho` inteiro de 1 a 1_048_576, senão lança (defesa em profundidade; a action já recusa na emissão); `X-Amz-Expires=300` posto na URL **antes** de assinar (o padrão do `aws4fetch` é 86400). Teste: `X-Amz-SignedHeaders` = `content-length;content-type;host;if-none-match`, `X-Amz-Expires=300`, nenhuma credencial na URL além do Access Key ID. Sem o R1 confirmar, valem as reservas do research D2 |
| `bucket.ts` | via `getCloudflareContext().env.PRODUCT_IMAGES`: `lerObjeto(chave)` (⇒ `{ tamanho, bytes() }` \| `null`; `tamanho` disponível antes de ler o corpo), `apagarObjetos(chaves)`, `listarObjetos(prefixo)` (async iterável com `chave` e `uploaded`) |
| `verificacao/` | §4 |
| `index.ts` | barrel `server-only` |

**Configuração por ambiente**

| | Local (nível de cima) | `env.dev` | `env.production` |
|---|---|---|---|
| `R2_S3_ENDPOINT` (`vars`) | `http://localhost:8787/cdn-cgi/local/r2/s3/roseshop-local` | `https://<account>.r2.cloudflarestorage.com/roseshop-dev` | `https://<account>.r2.cloudflarestorage.com/roseshop-prod` |
| `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` | `.dev.vars`: `roseshop-local` / `roseshop-local-nao-secreto`, iguais a `local_dev.experimental_s3_credentials` | `wrangler secret --env dev` (token do bucket dev) | `wrangler secret --env production` (token do bucket prod) |
| `CRON_SECRET` | `.dev.vars` (qualquer valor local) | `wrangler secret --env dev` | `wrangler secret --env production` |
| `FOTOS_VERIFICACAO` (`vars`) | — | `registro` **só durante a SF10** (entra na T094a, sai na T099) | **nunca** |
| CORS | não precisa (mesma origem) | `infra/r2/cors.dev.json` | `infra/r2/cors.production.json` |

`<account>` é o Account ID (não secreto) preenchido pelo humano. O CORS libera os headers
`content-type` e `if-none-match`. As credenciais locais são falsas por desenho e não são
segredo; se o gitleaks as acusar, entra exceção **pelo valor exato** (regex dos dois valores),
nunca pelo arquivo `wrangler.jsonc` inteiro (TL-21).
Depois de mudar `vars`, `main` ou `triggers`: `npm run cf-typegen` (o `CloudflareEnv` precisa
tipar `CRON_SECRET`, `R2_S3_ENDPOINT` e os demais).

## 8. Motivos e mensagens — `src/lib/fotos/mensagens.ts`

| Motivo | Mensagem | Origem |
|---|---|---|
| `formato` (aparelho e servidor) | Esse tipo de arquivo não é aceito. Use uma foto tirada pelo celular ou salva na galeria. | US2-AC3/AC4 |
| `nao_abre` (aparelho) | Não conseguimos abrir essa foto neste aparelho. Tente usar 'Tirar foto' ou escolha outra. | US2-AC7 |
| `grande` | Essa foto ficou grande demais. Tente de novo ou escolha outra. | US2-AC5 |
| `pequena` | Essa foto está muito pequena. Escolha outra com mais qualidade. | edge case |
| `nao_passou` (1ª) | Não deu para usar essa foto. Tente de novo ou use 'Tirar foto'. | US2-AC9 |
| `nao_passou` (2ª seguida, mesma tela) | Essa foto não está passando. Escolha outra ou peça ajuda. | US2-AC10 (estado da tela) |
| `nao_enviada` | selo "Não enviada" + botão "Tentar de novo" | US2-AC8 |
| `sem_foto` | Coloque pelo menos 1 foto do produto. | US1-AC8 |
| `foto_expirada` | Uma das fotos expirou. Envie de novo. | edge case |
| `alterado` | As fotos deste produto foram mudadas por outra pessoa. Veja como ficaram e faça de novo. | US5-AC1 |
| `limite` | Este produto já tem 3 fotos. Remova ou troque uma para colocar outra. | FR-025 |
| `ultima` | O produto precisa de pelo menos 1 foto. | US4-AC4 |
| `nao_existe` | a da 003 | US5-AC5 |
| `muitos_pendentes` | Você enviou muitas fotos sem salvar. Salve o produto que está cadastrando ou tente de novo amanhã. (aprovada pelo humano, decisão E; aparece na tela de fotos, no lugar da miniatura não enviada, sem "Tentar de novo") | D13 |
| `falha_geral` | a da 003 | — |
| sucesso | "Foto adicionada", "Foto trocada", "Foto removida", "Ordem salva" | FR-020 |
| confirmação de remoção de foto | Remover esta foto do produto? Ela será apagada. | US4-AC3 |
| remoção de produto (acréscimo) | As fotos do produto também serão apagadas. | FR-035 |
