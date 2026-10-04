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

## Para quem mantém o sistema

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
