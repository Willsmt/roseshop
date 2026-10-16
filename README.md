# Roseshop

Catálogo online de produtos de revenda. As clientes navegam, montam uma sacola e enviam o pedido pelo WhatsApp.

## Para a loja

### Como entrar no painel

1. Abra https://roseshop.willsmt.workers.dev/painel no celular.
2. Toque em "Entrar com Google".
3. Escolha a conta Google autorizada.

Não há senha nova — é só pelo Google.

### Salvar o painel na tela inicial do celular

Depois de entrar:

- **No Android**: abra o menu do navegador (os três pontinhos) e escolha "Adicionar à tela inicial".
- **No iPhone**: toque no botão de compartilhar (seta para fora de um retângulo) e escolha "Adicionar à tela inicial".

Assim não precisa digitar o endereço toda vez.

### Se aparecer "Esta conta Google não tem acesso ao painel"

1. Toque em "Entrar com outra conta".
2. Escolha a conta correta.
3. Se continuar não funcionando, avise o Willians.

### Se aparecer "Não foi possível entrar agora"

1. Espere alguns segundos.
2. Tente entrar de novo.
3. Se o problema continuar, avise o Willians.

### Sair

O botão "Sair" fica no topo de todas as páginas do painel. Sair no celular não desconecta o computador, e vice-versa.

### Quanto tempo dura a sessão

Se você usa o painel pelo menos uma vez a cada 29 dias, continua conectada. Se passar 30 dias sem usar, é preciso entrar de novo.

### Para dar ou tirar o acesso de alguém

Avise o Willians. As administradoras têm todas o mesmo poder.

### Produtos no painel

Em `/painel/produtos` fica a lista dos produtos. Cada produto ganha um código (`#0001`, `#0002`…) que não se repete, nem depois de removido.

- **Cadastrar**: toque em "Novo produto". Primeiro vêm as fotos: de 1 a 3, com "Tirar foto" ou "Escolher da galeria"; ajuste o recorte quadrado e, se quiser, mude a ordem (a primeira é a capa). Toque em "Continuar": o sistema sugere nome, categoria e descrição a partir das fotos e marca os campos com "Sugestão — confira". Confira, corrija o que precisar e coloque o preço, se quiser. O preço pode ser "12,90" ou "R$ 12,90"; marque "a partir de" quando o valor varia. Sem preço, o produto aparece como "Sem preço".
- **Se a sugestão não vier**: preencha você mesma; o cadastro funciona do mesmo jeito. A sugestão tem um limite por dia e volta no dia seguinte.
- **Fotos de um produto já cadastrado**: no detalhe do produto, toque em "Fotos". Lá dá para colocar, trocar, mudar a ordem e remover fotos; cada mudança é salva na hora. O produto fica sempre com pelo menos 1 foto e no máximo 3.
- **Lista**: os mais novos aparecem primeiro. Use a busca (por nome ou pelo código, como "42" ou "#0042") e os filtros de categoria e de esgotado. "Ver mais produtos" mostra os próximos.
- **Esgotado**: no detalhe do produto, toque em "Marcar como esgotado". Para voltar, "Marcar como disponível".
- **Destaque**: no detalhe, "Destacar" põe o produto em destaque. O limite é de 8 destaques ao mesmo tempo; para destacar outro, tire um do destaque antes. Produto esgotado sai do destaque sozinho e não volta sozinho.
- **Editar e remover**: no detalhe do produto. Remover pede a confirmação com o código e o nome, e apaga também as fotos do produto.
- **Se duas pessoas mexerem no mesmo produto**: quem agir depois vê o aviso "Outra pessoa mudou este produto…"; recarregue a página e faça de novo.
- **Categoria com produtos** não pode ser removida: mude ou remova os produtos antes.

## Para quem mantém o sistema

### Categorias do catálogo (feature 002)

As administradoras gerenciam a lista de categorias no painel, em `/painel/categorias`.
Operações: listar, criar, renomear e remover (só administradoras logadas).

#### Categorias iniciais

No primeiro deploy de cada ambiente, o banco recebe automaticamente cinco categorias:
Bolsas, Guarda-chuvas, Tupperware, Panos de prato, Meias. A lista é criada uma única
vez; publicações futuras não recriam nem sobrescrevem categorias que as administradoras
alteraram (criadas, renomeadas ou removidas).

#### Fluxo local de banco

Para trabalhar com testes de integração:

```bash
npm run db:up          # sobe o Postgres 18 + proxy do Neon em Docker
npm run db:migrate     # aplica migrations no banco local
npm run test:int       # roda testes de integração (inclui probe do batch)
```

Se uma execução for interrompida antes do fim (Ctrl+C, timeout), dados de teste podem
sobrar no banco. Para recuperar:

```bash
npm run db:reset       # DESTRUTIVO: apaga dados e reinicia o banco local
npm run db:migrate     # reaplica migrations e seed
```

#### Sem variáveis nem secrets novos

A feature 002 não adiciona variáveis de ambiente nem secrets: o probe de transação
no Neon dev (CI) reutiliza `DATABASE_URL` do environment `dev`, o mesmo que a aplicação
e as migrations já usam.

### Produtos (feature 003)

Tabelas `produtos` e `produto_fotos` (migration `0001`); o código `#NNNN` vem de uma
sequência do banco. O teto de 8 destaques e a regra "esgotado não fica em destaque" são
garantidos pelo próprio banco (constraints), além das Server Actions. Sem variáveis nem
secrets novos. O CI do PR roda no Neon dev o teste da FK `ON DELETE RESTRICT`
(`src/lib/db/fk-produtos.int.test.ts`) junto do probe do `db.batch`.

Medição de desempenho da lista (SC-007, nível de banco; só no banco local, fora do
`test:int` e do `check`):

```bash
npm run test:perf      # popula 500 produtos, mede a lista, a próxima página, o filtro e a busca; limpa a massa
```

O comando imprime média e máximo de cada consulta (meta: < 2 s) e **recria as categorias**
do banco local, então não rode com dados que queira manter. A medição no `preview`
(rede "Fast 4G") é manual, descrita em `specs/003-produtos/quickstart.md` §4.

### Fotos e sugestão por IA (feature 004)

Todo produto tem de 1 a 3 fotos. O celular trata a foto antes de enviar (recorte quadrado,
sem localização nem dados da câmera, WebP ou JPEG de até 1 MiB) e envia direto ao R2 por uma
URL assinada; o servidor confere o arquivo antes de aceitar. As fotos ficam nos buckets
`roseshop-dev` e `roseshop-prod` e só aparecem para quem está logado no painel
(`/painel/fotos/...`). Uma limpeza diária às 03:00 de Brasília (Cron Trigger) apaga fotos
temporárias com 24 h ou mais e fotos que ficaram sem produto (ADR-009).

A sugestão de nome, categoria e descrição usa a OpenAI só no servidor, com as fotos já
conferidas, e não grava nada: a administradora confirma ou corrige. Limite de 30 sugestões por
pessoa e 100 no total por dia (dia de Brasília). O modelo em uso é provisório até a medição com
fotos reais (ADR-010).

#### Configuração por ambiente

Cada ambiente online precisa destes segredos (`npx wrangler secret put <NOME> --env <dev|production>`):

- `R2_ACCESS_KEY_ID` e `R2_SECRET_ACCESS_KEY`: token R2 **Object Read & Write** só no bucket do ambiente.
- `OPENAI_API_KEY`: chave do projeto OpenAI do ambiente (dev e produção em projetos separados, cada um com teto de gasto aplicado).
- `CRON_SECRET`: gerado com `openssl rand -base64 32`; ninguém precisa saber o valor.

Além disso: o `R2_S3_ENDPOINT` de cada ambiente fica no `wrangler.jsonc`, e o CORS de cada
bucket fica em `infra/r2/cors.<ambiente>.json`, aplicado com
`npx wrangler r2 bucket cors set <bucket> --file infra/r2/cors.<ambiente>.json`. Passo a passo
em `specs/004-fotos-produto/quickstart.md` §1. No local, as chaves esperadas estão no
`.dev.vars.example`.

#### Catálogo público (feature 005)

Duas variáveis novas, sem dependência de runtime nova:

- `SITE_URL`: endereço público do ambiente, fixo no `wrangler.jsonc` (não é segredo). Usada nos links e na prévia do WhatsApp.
- `WHATSAPP_NUMBER`: número da loja em E.164 (ex.: `+5511999999999`). Secret por ambiente: `npx wrangler secret put WHATSAPP_NUMBER --env <dev|production>`; no local, no `.dev.vars`. Sem ele (ou inválido), o botão "Perguntar no WhatsApp" some e o resto da página segue.
- Em produção, por enquanto, o número é o de teste do mantenedor; o da Rose entra só na entrega final.

O ramo é o FALLBACK (páginas dinâmicas com `Cache-Control: public, max-age=60`, ADR-011): não há bucket de cache, Durable Object nem permissão nova no token do CI. A verificação de acessibilidade automática usa `axe-core@4.13.0` (devDependency, versão exata) no `npm run check`. Para popular um catálogo de teste: `npm run seed:local` (banco local) e `npm run seed:dev` (`roseshop-dev`, com `.seed-dev.vars`); `npm run seed:dev:limpar` remove o que o seed criou.

#### Sacola e pedido pelo WhatsApp (feature 006)

A sacola fica guardada só no aparelho da cliente (localStorage), sem login e sem nada gravado no
servidor. Regras: até 15 produtos diferentes, quantidade de 1 a 10 por produto e validade de 7 dias
desde a última alteração. Sacola vencida, corrompida ou de formato antigo abre vazia, sem erro. Por
produto, guarda só o código, a quantidade, o preço visto e a marcação "a partir de"; nunca nome,
observação ou outro dado pessoal.

Rotas novas:

- `/sacola`: a página da sacola. Ao abrir e ao tocar em "Enviar pedido pelo WhatsApp", confere os
  produtos com o catálogo atual. Esgotado sai do subtotal e da mensagem; produto removido sai com
  aviso; preço alterado passa a usar o preço atual, com aviso. Se a conferência falhar (sem resposta
  em 4 s, erro de rede ou resposta fora do formato), o WhatsApp não abre e a sacola guardada não muda.
  A página leva `X-Robots-Tag: noindex, nofollow`. Sem JavaScript, mostra só "Ative o JavaScript para
  usar a sacola", com link ao catálogo.
- `POST /api/catalogo/conferencia`: recebe `{"codigos":["0042","0007"]}` no corpo, em JSON, com de 1 a
  15 códigos sem repetição (sem "#"). Devolve um item por código, na ordem pedida, com estado `ok`
  (nome, `href`, preço, "a partir de" e capa), `esgotado` (com os mesmos dados) ou `inexistente`. Não
  lê sessão. Os códigos ficam fora do endereço, para não aparecerem nos registros da plataforma.
  Todas as respostas levam `Cache-Control: no-store` e `X-Content-Type-Options: nosniff`, e os erros
  têm corpo `{}`:
  - 415: `Content-Type` que não é JSON;
  - 413: corpo com mais de 1 KB (pelo `Content-Length` ou durante a leitura);
  - 400: pedido inválido (JSON inválido, chave diferente de `codigos`, código fora do formato, `0000`,
    acima de 2.147.483.647 ou repetido);
  - 503: banco indisponível;
  - 500: qualquer outro erro.

  Nem o corpo nem os códigos vão para o log; no 503 e no 500 só se registra a causa (e, no 500, o nome
  da classe do erro).

Sem variável nem binding novos: a 006 usa o `WHATSAPP_NUMBER` e o `SITE_URL` da 005. Sem
`WHATSAPP_NUMBER` válido, a sacola continua funcionando, mas "Enviar pedido pelo WhatsApp" fica
desabilitado com o texto "O envio pelo WhatsApp está indisponível no momento. Tente mais tarde.", e a
falha é registrada uma vez por carregamento do servidor, sem o valor configurado.

#### Medição manual da IA

```bash
npm run test:ia        # lê as fotos de ia-medicao/ (fora do git) e usa a chave de dev
```

Faz chamadas reais e **gasta dinheiro**; fica fora do `check`, do `test:int` e do CI. Serve
para escolher modelo e esforço (SC-003 e SC-004 da 004).

#### Dependências novas da feature 004

- `aws4fetch@1.0.20` (versão exata): assinatura das URLs de envio ao R2.
- `react-easy-crop@6.2.3` (versão exata): recorte da foto no aparelho.

### Dependências novas da feature 001

- `next-auth@5.0.0-beta.32` (versão exata): Auth.js v5 com estratégia JWT; não usar `^` nem `~`; atualizar só em PR próprio, depois de ler o changelog e rodar `npm audit --omit=dev` (ADR-003 e ADR-007)
- `server-only@0.0.1` (versão exata): impede que código de autenticação vaze para o navegador
- `zod` (versão `^4.6.5` ou superior): validação em toda entrada externa

### Incluir ou remover uma administradora

**Dois passos — os dois são obrigatórios para incluir:**

**Passo 1:** Adicione o e-mail como *test user* no OAuth client do Google Cloud. O app está em modo Testing (ADR-003).

**Passo 2:** Atualize a lista de e-mails no secret `ADMIN_EMAILS` de cada ambiente:

```bash
npx wrangler secret put ADMIN_EMAILS --env production
npx wrangler secret put ADMIN_EMAILS --env dev
```

Digite os e-mails separados por vírgula, sem espaço. Exemplo: `pessoa1@example.com,pessoa2@example.com`

Vale no próximo acesso, sem deploy de código.

**Para remover:** faça só o Passo 2. A pessoa perde o acesso no próximo acesso, mesmo que a sessão já esteja aberta.

**No ambiente local:** a lista fica no `.dev.vars`. Depois de mudar, reinicie o `npm run preview` para que o `wrangler` leia o arquivo novo.

### Emergência: celular perdido ou conta comprometida

Troque o segredo de sessão do ambiente:

```bash
openssl rand -base64 32 | npx wrangler secret put AUTH_SECRET --env production
```

(Repita para `--env dev` se precisar.)

Todas as sessões daquele ambiente caem no próximo acesso. Todos precisam entrar de novo. Em seguida, revise o `ADMIN_EMAILS`.

### Mais informações

- **Operação e procedimentos**: veja `docs/operacao.md`
- **Comandos de desenvolvimento**: veja a seção "Comandos" em `CLAUDE.md`
