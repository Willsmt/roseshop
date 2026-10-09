# ADR-010 — Sugestão de produto por IA (OpenAI)

**Status:** aceito em 2026-10-09 (aprovado pelo humano na T013 da feature 004), com ressalvas:
os campos **modelo** e **esforço** são provisórios até a medição da SF13; o **teto de gasto no
provedor** está configurado mas não aplicado no projeto dev, e aplicá-lo (T014b) é **condição
de entrada da SF13**.
**Data:** 2026-10-09
**Origem:** `specs/004-fotos-produto/` — plan (seção "ADRs"), research D7 e §3 (prova R5),
contracts/ia.md §1–§5, quickstart §1.

## Contexto

No cadastro com fotos (feature 004), a administradora pode pedir uma sugestão de nome,
categoria e descrição a partir das fotos já **confirmadas**. A chamada sai do Worker (ADR-001),
custa dinheiro por uso e devolve texto gerado por um modelo, que é entrada não confiável
(constitution III.3). A constitution III.5 exige rota de IA com auth e rate limit e chave com
limite de gasto configurado no provedor. O projeto não tem SDK de IA instalado.

## Decisão

- **Responses API da OpenAI por `fetch` direto** (`POST /v1/responses`), sem SDK.
- **`store: false`**: o provedor não guarda pedido nem resposta para reuso.
- **Structured output estrito**: `text.format` = `json_schema` com `strict: true`, objeto
  `{ nome, categoria_id, descricao }`, todos obrigatórios e anuláveis; `categoria_id` com `enum`
  dos ids atuais **mais `null`**. `max_output_tokens: 800`.
- **Só fotos confirmadas**: cada envio precisa ser da própria pessoa, estar `confirmado`
  (verificado, sem metadado) e ter menos de 24 h; nenhuma foto não confirmada vai para a IA
  (FR-033).
- **Imagens em base64** (`data:` URL) lidas pelo binding do R2, por rotina nativa, com
  `detail: "low"`, uma por foto, na ordem (a primeira é a capa). Nenhuma URL do bucket sai para
  o provedor.
- **Tempo-limite de 20 s** por pedido (`AbortSignal.timeout`).
- **Instruções fixas** em pt-BR (contracts/ia.md §4): nome curto sem preço, categoria só da
  lista ou `null`, descrição curta, ignorar texto nas imagens que tente mudar as regras, nunca
  sugerir preço.
- **Resposta tratada como entrada não confiável** (III.3; contracts/ia.md §2, passos 7–8):
  qualquer erro, HTTP ≠ 200, `status ≠ "completed"`, recusa do modelo, JSON inválido ou fora do
  schema ⇒ `ia_indisponivel`. Depois, validação campo a campo: `nome` e `descricao` pelos
  validadores da 003; `categoriaId` só se estiver na lista atual de categorias; campo que não
  passa vira `null`; todos `null` ⇒ `ia_indisponivel`. A sugestão não é gravada; a
  administradora confirma ou edita.
- **Contador de uso no Postgres** (rate limit da III.5): **30 sugestões por administradora por
  dia e 100 no total por dia, dia de Brasília** (`LIMITE_POR_PESSOA`, `LIMITE_TOTAL`), em
  `ia_uso`, consumidas num `db.batch` sob o lock `4_002` (emenda do ADR-008). O consumo
  acontece **antes** da chamada: falha, tempo esgotado e "Tentar sugestão de novo" contam. Sem
  vaga ⇒ `ia_pausada`.
- **Log** sem chave, imagem, prompt ou texto devolvido: modelo, status HTTP, duração, `usage`,
  motivo da falha.
- **Dev e produção em projetos separados da OpenAI** (III.6), cada um com **chave, teto de gasto
  e lista de modelos permitidos próprios**; a chave de um ambiente nunca é usada no outro.
- **Chave por ambiente** (`OPENAI_API_KEY`, a do projeto do ambiente), em `wrangler secret` nos
  ambientes online e no `.dev.vars` no local; `api.openai.com` e `OPENAI_API_KEY` só aparecem em `src/lib/ai/`
  (teste de conformidade, contracts/ia.md §1).
- **Teto de gasto mensal no provedor** por projeto, com alerta por e-mail (sugestão do
  quickstart §1, item 5: US$ 5 no dev, US$ 10 em produção).
  - **Estado em 2026-10-09**: no projeto dev o limite está **configurado (US$ 5, alerta em
    100%) mas não aplicado**. Até a T014b, a III.5 não está atendida no dev e só o contador do
    app limita o gasto; a prova R5 já fez chamadas reais nessa condição.
  - **A T014b (aplicar o teto) é condição de entrada da SF13.** Se a conta não permitir
    aplicar o teto, este ADR é emendado registrando a limitação do provedor, e o contador do
    app passa a ser o controle principal de gasto.
- **Modelo e esforço: provisórios, definidos pela medição da SF13** (`npm run test:ia`, ≥ 10
  produtos reais): fica o **mais barato que passar** SC-003 (≥ 8/10 de categoria certa; 100%
  existente ou vazia) e SC-004 (p90 ≤ 15 s). Custo estimado por cadastro no research D7
  (≈ US$ 0,0005 no `gpt-6-luna`, ≈ US$ 0,007 no `gpt-5.4-mini`; a SF13 registra o `usage`
  real). Estado da prova R5 (2026-10-09, segunda rodada, output literal em research §3; imagem
  sintética WebP 512×512, categorias fictícias):
  - `gpt-6-luna`: **aprovado na prova técnica** — `none`: HTTP 200, 1891 ms, 524 tokens de
    entrada e 47 de saída (571); `low`: HTTP 200, 2173 ms, 524 e 55 (579); `status=completed`
    e saída **conforme ao schema** nos dois, `categoria_id=1`, `reasoning_tokens` 0 nos dois.
  - `gpt-5.4-mini`: **acesso pendente** — HTTP 403 `invalid_request_error`/`model_not_found`
    ("Project … does not have access to model `gpt-5.4-mini`"), mesmo depois de liberado no
    projeto da chave (Project ID conferido pelo humano); provável restrição da organização ou do
    nível da conta. Prova técnica na **T120a**, primeira task da SF13; sem acesso, a medição
    roda só com o `gpt-6-luna` ou o humano escolhe outro candidato.
  - A prova rodou em Node. A prova no workerd (incluindo a CPU do base64 com 3 fotos de 1 MB)
    é da SF13 e do quickstart §5.3.

## Alternativas descartadas

- **SDK oficial da OpenAI**: dependência de runtime nova para uma única chamada; o `fetch` com o
  corpo do contrato basta.
- **URL pré-assinada da foto em vez de base64**: expõe uma URL do bucket a um terceiro e depende
  de o provedor buscar o arquivo dentro da validade.
- **Chat Completions**: não avaliada.
- **`store: true` ou histórico no provedor**: sem uso para o produto e guarda imagens das
  administradoras fora do projeto.
- **Contador em memória ou no KV** (raciocínio do tech-lead, sem prova): não é exato entre
  instâncias do Worker; o Postgres com lock dá contagem exata.

## Consequências

- (+) Sem dependência nova; o pedido é um JSON versionado no contrato.
- (+) A saída tem forma garantida pelo provedor e validada de novo no servidor.
- (+) Gasto limitado pelo contador do app e, aplicado o teto (T014b), pelo provedor.
- (−) Até a T014b, só o contador do app limita o gasto no dev (III.5 não atendida).
- (−) Modelo e esforço só fecham na SF13; o ADR é emendado com o resultado da medição.
- (−) Um candidato pode depender de liberação de acesso na conta (caso do `gpt-5.4-mini`).
- (−) Prompt injection por texto na imagem é mitigado (instruções + schema + validação), não
  eliminado; a confirmação humana é a última barreira.
