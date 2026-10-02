<!--
Sync Impact Report
- Version change: (template não preenchido) → 1.0.0
- Origem: migração de specs/00-constitution.md (seções 1 a 9), sem alteração de regras
- Princípios (antiga seção → novo título):
  2 → I. Fonte de verdade | 3 → II. Stack fechada | 4 → III. Segurança
  5 → IV. Arquitetura | 6 → V. UX — persona administradora
  7 → VI. Qualidade e entrega | 8 → VII. Ambiente e plataforma | 9 → VIII. Ambientes
- Seções adicionadas: Governança (estrutura do template; ver nota abaixo)
- Seções removidas: nenhuma (1 Propósito mantida como seção própria)
- Adaptação de convenção: specs/features/FXX-*.md → specs/NNN-nome/spec.md, plan.md, tasks.md
- Ajuste: VIII atualizado para três camadas (local/dev/produção), alinhado ao ADR-006 revisado
- TODOs adiados: nenhum
-->
# Roseshop — Constitution

Princípios não negociáveis do projeto. Todo agente, skill ou pessoa que contribuir
com código DEVE ler este arquivo antes de começar. Alterações aqui são feitas
somente por humano, via commit revisado.

## Propósito

Catálogo online de produtos de revenda (guarda-chuvas, Tupperware, panos de prato,
meias e afins). As clientes navegam, montam uma sacola e enviam o pedido pelo
WhatsApp. Não há checkout, pagamento online ou gestão de pedidos no sistema.

## Core Principles

### I. Fonte de verdade

- `specs/` é a fonte de verdade. O código implementa a spec, nunca o contrário.
- Divergência entre código e spec: atualiza-se a spec primeiro (com aprovação
  humana) e depois o código.
- Decisões de arquitetura ficam registradas em `specs/adr/`. Nenhuma troca de
  stack, lib central ou provedor sem novo ADR aprovado.
- Cada feature em `specs/NNN-nome/` (`spec.md`, `plan.md`, `tasks.md`) define
  critérios de aceite em Given/When/Then na sua `spec.md`.
  Cada critério corresponde a pelo menos um teste automatizado.

### II. Stack fechada

| Camada         | Escolha                                       | ADR |
|----------------|-----------------------------------------------|-----|
| Framework      | Next.js 16 (App Router) + TypeScript strict   | —   |
| Hosting        | Cloudflare Workers via OpenNext               | 001 |
| Banco / ORM    | Neon Postgres + Drizzle                       | 002 |
| Auth           | Auth.js v5, Google, allowlist de e-mails      | 003 |
| Estilo         | Tailwind CSS v4                               | 004 |
| Componentes UI | a definir                                     | 005 |
| Imagens        | Cloudflare R2                                 | —   |
| IA             | OpenAI (modelo com visão), structured output  | —   |
| Validação      | Zod em toda fronteira                         | —   |

Dependência nova exige justificativa no commit. Dependência que substitui algo
da tabela acima exige ADR.

### III. Segurança

1. Nenhum segredo no código, em commit, em log ou no bundle do client.
   Segredos de dev vivem em `.dev.vars` (ignorado pelo git); `.dev.vars.example`
   lista as chaves sem valores. Em produção, `wrangler secret`.
2. Acesso administrativo restrito à allowlist `ADMIN_EMAILS`, checada no
   callback de login E em toda rota/ação protegida (defesa em profundidade).
3. Toda entrada externa (form, query, resposta da IA, upload) é validada com
   Zod no servidor. A resposta da IA é tratada como entrada não confiável.
4. Upload: só imagem (`image/jpeg`, `image/png`, `image/webp`), tamanho
   máximo definido na spec F02 (a spec da feature de upload, em
   `specs/NNN-nome/spec.md`), envio direto ao R2 via URL pré-assinada de
   curta duração.
5. Rota de IA protegida por auth + rate limit. Chave da OpenAI com limite de
   gasto configurado no provedor.
6. Ambientes separados: credenciais de desenvolvimento (chave OpenAI de baixo
   limite, bucket R2 dev, branch Neon dev) nunca são as de produção.
7. Zonas protegidas — alteração só com tarefa explícita e revisão humana:
   `src/lib/auth/`, `src/lib/r2/`, `src/lib/ai/`, `src/middleware.ts`,
   `.dev.vars*`, `wrangler.jsonc`.

### IV. Arquitetura

- Server Components por padrão; Client Components só onde há interatividade.
- Mutações via Server Actions; nenhuma lógica de negócio no client.
- Acesso a banco somente em `src/lib/db/`; componentes não importam Drizzle
  diretamente.
- Preço armazenado em centavos (inteiro). Nunca float.
- Timestamps em UTC no banco; formatação pt-BR só na apresentação.
- Funções pequenas, single responsibility, nomes autoexplicativos.
  Comentário explica o porquê, não o quê.

### V. UX — persona administradora

As administradoras têm familiaridade variada com tecnologia; a principal usuária
tem baixa familiaridade. O painel DEVE:

- Ter fluxos lineares, uma tarefa por tela, sem menus aninhados.
- Usar alvos de toque de no mínimo 48px e texto de no mínimo 16px.
- Usar linguagem simples, sem jargão ("Publicar", não "Persistir"; "Esgotado",
  não "Inativo").
- Confirmar ações destrutivas com texto claro do que vai acontecer.
- Funcionar primeiro no celular (mobile-first); desktop é secundário.

### VI. Qualidade e entrega

- "Pronto" = lint + typecheck + testes passando, sem exceção.
- Commits seguem Conventional Commits (`feat(scope): ...`, `fix(scope): ...`).
  Proibido trailer `Co-Authored-By` ou identificação de sessão de agente.
- Um commit por funcionalidade fechada; nada acumulado sem commit.
- `README.md` atualizado sempre que entrar feature, variável de ambiente ou
  dependência nova.
- Merge em `main` somente por humano.

### VII. Ambiente e plataforma

- Desenvolvimento em Linux (WSL). Builds de produção rodam em Linux (CI).
  OpenNext não é suportado oficialmente em Windows nativo.
- Line endings LF em todo o repositório (`.gitattributes`).
- O projeto deve caber no free tier de Cloudflare Workers, R2 e Neon. Evitar
  qualquer solução que dependa de recurso pago, CPU por request elevada ou
  processamento pesado no servidor (ex.: redimensionar imagem no Worker);
  compressão de imagem acontece no client.

### VIII. Ambientes

Três camadas isoladas: local (Docker), dev online e produção (ver ADR-006 em
`specs/adr/`). Nada chega a produção sem ter passado pelo dev online. A máquina
local usa apenas recursos locais (Postgres em Docker, R2 simulado pelo wrangler)
e nunca acessa recursos do dev online nem de produção. Deploy de produção
acontece somente pelo merge em `main` via CI; deploy manual em produção é
proibido.

## Governança

Esta constitution prevalece sobre qualquer outra prática do projeto. Alterações
são feitas somente por humano, via commit revisado. A versão segue versionamento
semântico: MAJOR para remoção ou redefinição incompatível de princípio, MINOR para
princípio ou seção nova ou ampliação material, PATCH para esclarecimentos e
correções de redação. Todo plano (`plan.md`) DEVE passar pelo Constitution Check
contra este arquivo, e revisões de PR verificam conformidade. Os ADRs permanecem
em `specs/adr/`.

**Version**: 1.0.0 | **Ratified**: 2026-10-02 | **Last Amended**: 2026-10-02
