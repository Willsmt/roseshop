# Quickstart — validar a feature 004 (fotos de produto)

Roteiro de validação. Detalhes de contrato em [contracts/](./contracts/), modelo em
[data-model.md](./data-model.md). Passos marcados **(humano)** são executados pelo mantenedor;
o agente pede o comando e recebe o output real.

## Pré-requisitos

- Stack local: `npm run db:up` e `npm run db:migrate` (inclui a `0002`).
- `.dev.vars` com as chaves novas de `.dev.vars.example`: `R2_ACCESS_KEY_ID=roseshop-local`,
  `R2_SECRET_ACCESS_KEY=roseshop-local-nao-secreto`, `CRON_SECRET` (qualquer valor local),
  `OPENAI_API_KEY` (chave **dev**, com teto de gasto).
- Wrangler na versão fixada do `package.json` (o R2 local depende de opção experimental, ADR-009).

## 1. Configuração única por ambiente online (humano)

Para `dev` e depois `production`, nesta ordem:

1. Painel R2 → **Manage API tokens** → token **Object Read & Write**, escopo **só** no bucket
   do ambiente (`roseshop-dev` / `roseshop-prod`), **sem expiração** (padrão nos dois
   ambientes; o do dev foi criado assim em 2026-10-09). Revogação **manual** no painel do R2
   em caso de suspeita de vazamento (ADR-009).
2. Segredos (um comando por chave, valor digitado no prompt):
   ```bash
   npx wrangler secret put R2_ACCESS_KEY_ID --env dev
   npx wrangler secret put R2_SECRET_ACCESS_KEY --env dev
   npx wrangler secret put CRON_SECRET --env dev        # openssl rand -base64 32
   npx wrangler secret put OPENAI_API_KEY --env dev     # se ainda não existir
   ```
   **Dev, estado em 2026-10-09 (SF0, T014a):** o token do bucket `roseshop-dev` criado para o
   spike R1 já está gravado como `R2_ACCESS_KEY_ID` e `R2_SECRET_ACCESS_KEY` no secret do
   `env.dev`; a SF3 **não** recria o token nem esses dois secrets (no dev faltam só
   `CRON_SECRET` e, se ainda não existir, `OPENAI_API_KEY`).
3. Preencher o Account ID em `R2_S3_ENDPOINT` de `env.dev`/`env.production` no `wrangler.jsonc`
   e a origem exata do ambiente em `infra/r2/cors.<env>.json` (commit pela SF3).
4. CORS do bucket:
   ```bash
   npx wrangler r2 bucket cors set roseshop-dev --file infra/r2/cors.dev.json
   npx wrangler r2 bucket cors list roseshop-dev
   ```
5. OpenAI → projeto do ambiente → **limite de gasto mensal** (sugestão: US$ 5 no dev, US$ 10 em
   produção) e alerta por e-mail.

## 2. Apagar os produtos da 003 sem foto (humano)

Quando: **antes do primeiro push que leva a SF6 (criação exige foto) ao deploy do dev** (o dev
é publicado a cada push no PR). Local: antes de rodar a SF6 no `preview`. Não há constraint de
foto no banco; a ordem só protege a tela e os testes.

**Local**
```bash
npm run db:psql
```
```sql
BEGIN;
SELECT id, nome, destaque_vaga FROM produtos p
 WHERE NOT EXISTS (SELECT 1 FROM produto_fotos f WHERE f.produto_id = p.id);
-- anotar N
DELETE FROM produtos p
 WHERE NOT EXISTS (SELECT 1 FROM produto_fotos f WHERE f.produto_id = p.id)
 RETURNING id, nome;
-- N linhas? COMMIT; senão ROLLBACK;
COMMIT;
```

**Dev online (Neon)**
1. Console do Neon → projeto → **Branches** → criar branch de backup a partir da branch dev
   (nome `backup-antes-004-AAAA-MM-DD`).
2. SQL Editor na branch **dev**: o mesmo bloco acima, com `BEGIN` explícito; conferir N antes do
   `COMMIT`.
3. Apagar a branch de backup só depois da validação da feature no dev.

**Produção**: só leitura, no console do Neon: `SELECT count(*) FROM produtos;` ⇒ esperado `0`.
A máquina local nunca acessa produção (VIII).

## 3. Gate automatizado

```bash
npm run check          # lint + typecheck + unitários + conformidade
npm run test:int       # banco local: envios, adoção, conjunto, concorrência (SC-007), limpeza
```
Esperado: tudo verde, com output real. Destaques: `fotos.concorrencia.int.test.ts` (0 produtos com
0 ou mais de 3 fotos, posições repetidas ou com buraco, destaque sem foto), `verificacao/*.test.ts`
(todos os forjados e corrompidos recusados; SC-006), `modo.test.ts` + conformidade do
`wrangler.jsonc` (recusa sempre ligada fora do dev).

## 4. Runtime real local (`npm run preview`)

Em `http://localhost:8787`, logada:

1. **Novo produto** ⇒ tela de fotos; "Continuar" indisponível.
2. Escolher JPEG grande ⇒ recorte 1:1 ⇒ "Usar esta foto" ⇒ miniatura com "Capa".
   No DevTools (Rede): `PUT` para `/cdn-cgi/local/r2/s3/roseshop-local/fotos/<uuid>.webp` com
   ≤ 1 MB (SC-005), seguido da confirmação.
3. Escolher um GIF ⇒ mensagem de formato, nada enviado. Uma imagem de 300×300 ⇒ "muito pequena".
4. Enviar 3 fotos ⇒ botões indisponíveis com "Máximo de 3 fotos"; arrastar e usar os botões de
   mover; remover uma (sem confirmação no cadastro).
5. "Continuar" ⇒ "Preenchendo a partir das fotos…" ⇒ campos sugeridos com "Sugestão — confira"
   (chave dev); completar preço ⇒ "Salvar" ⇒ detalhe com as fotos na ordem.
6. Detalhe ⇒ "Fotos": adicionar, trocar, mover para a capa, remover (com confirmação). Em outra
   janela, mudar as fotos e voltar à primeira ⇒ mensagem de "mudadas por outra pessoa" e tela
   atualizada.
7. Lista ⇒ miniatura da capa. Remover o produto ⇒ texto sobre as fotos; os objetos somem:
   ```bash
   npx wrangler r2 object get roseshop-local/fotos/<arquivo> --local --file /dev/null   # esperado: não encontrado
   ```
8. Limpeza local (comando confirmado na SF0):
   ```bash
   npx opennextjs-cloudflare build && npx wrangler dev --test-scheduled
   curl "http://localhost:8787/cdn-cgi/handler/scheduled?cron=0+6+*+*+*"
   ```
   E `curl -i -X POST http://localhost:8787/api/interno/limpeza` sem header ⇒ **404**.
9. Abrir `/painel/fotos/<arquivo>` numa janela anônima ⇒ **404**.

## 5. Dev online (deploy do PR)

1. **Envio assinado (R1)**: registrar o output do spike na SF0 (`PUT` com N±1 bytes ⇒ 403; com N
   ⇒ 200; **segundo `PUT` na mesma URL ⇒ 412**; `PUT` sem `if-none-match` ⇒ 403).
2. **Cron (R3)**: com o cron temporário `*/5 * * * *` no `env.dev`, `npx wrangler tail --env dev`
   mostra o `POST /api/interno/limpeza` e as contagens; depois volta para `0 6 * * *`.
3. **CPU**: painel Workers → `roseshop-dev` → Métricas: tempo de CPU das requisições de
   **confirmação** com foto de 1 MB e de **`sugerirProduto`** com 3 fotos de 1 MB, abaixo do
   limite do free tier.
4. **Aparelhos reais (SF10, R4)**, com `FOTOS_VERIFICACAO=registro` no `env.dev`:
   - Chrome Android e Safari iOS: 1 foto tirada na hora, 1 da galeria com localização ativa, e
     no iPhone 1 HEIC; cadastrar um produto com elas.
   - `npx wrangler tail --env dev` mostra os blocos de cada confirmação.
   - Baixar cada objeto e inspecionar:
     ```bash
     npx wrangler r2 object get roseshop-dev/fotos/<arquivo> --remote --file /tmp/<arquivo>
     exiftool -a -G1 /tmp/<arquivo>
     ```
   - Esperado: nenhum grupo EXIF/GPS/XMP/IPTC. Arquivos confirmados viram fixtures; a lista de
     permitidos é fechada; `FOTOS_VERIFICACAO` sai do `env.dev`.
5. **Medição da IA (SF13)**: `npm run test:ia` com a pasta `ia-medicao/` (contracts/ia.md §5).

## 6. Observação com a administradora (SC-001, SC-002)

Mesmo protocolo das features 001–003, no dev, pelo celular dela: cadastrar um produto a partir
de foto tirada na hora (≤ 4 min, sem ajuda) e trocar a capa de um produto existente (≤ 1 min).
Registrar tempo, onde hesitou e mensagens que não entendeu (SC-011).
