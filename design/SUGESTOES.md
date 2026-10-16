# Ideias fora deste trabalho

Nenhuma delas foi feita. As de "dado novo" pedem mudança em `src/lib/catalogo/`, em `src/lib/db/`,
no pipeline de fotos ou numa action; as de "zona protegida" mexem em área que só muda com tarefa
explícita e revisão humana (constitution III.7).

## Pedem dado novo

1. **Número de fotos no cartão.** `ProdutoCartao` não diz quantas fotos o produto tem. Com esse
   número, o cartão mostraria pontos discretos (como a Sézane), avisando que há mais fotos antes
   de abrir o detalhe.
2. **Categoria no cartão.** Sem ela, a lista "Todas" não pode indicar a categoria de cada item.
   Ajudaria quem rola a lista inteira, e permitiria a cor por categoria da direção Letreiro, se
   um dia fizer sentido.
3. **Imagem por categoria.** Com a capa do produto mais recente de cada categoria em
   `CategoriaFiltro`, os botões de categoria mostrariam uma foto pequena dentro do arco (como as
   linhas da Brigade), o que ajuda quem reconhece por imagem antes de ler.
4. **Contagem por categoria.** "Meias (16)" ajudaria a cliente a saber onde há mais escolha.
   Pede uma consulta a mais por página, então antes seria preciso medir a CPU de novo.
5. **Novidade.** Um selo "Chegou agora" para produtos cadastrados nos últimos dias pede a data de
   cadastro no cartão (hoje ela só ordena a lista).
6. **Miniatura da foto (a medida que fecha o LCP).** Hoje o catálogo serve o arquivo original de
   cada foto (FR-008 da 005: "sem versão reduzida nesta feature"), de 400 a 1200px e até 1 MiB. Com
   uma foto de cerca de 240 KB, o detalhe dá LCP de 3,3 s e a página inicial, mesmo só com 2 fotos
   eager, 6,6 s em Slow 4G (`VALIDACAO.md`). Proposta:
   - gerar no próprio aparelho, na hora do envio (a compressão já acontece no cliente, constitution
     VII), uma segunda versão menor: cerca de 480px para o cartão e 800px para a primeira foto do
     detalhe, em WebP;
   - guardar a chave dela ao lado da original (R2 e `produto_fotos`) e servi-la no cartão e na
     primeira foto do detalhe, deixando a original para quem amplia;
   - pede emenda da FR-008 da 005, mudança no pipeline da 004 (`src/lib/fotos/aparelho/`), schema,
     limpeza dos órfãos e um ADR (zona R2 e banco). Como ordem de grandeza: uma WebP de 480px fica na
     casa de 30 a 50 KB, perto de cinco vezes menos que as fotos usadas na medição.

## Zona protegida (auth)

7. **`noindex` em `/painel/entrar`.** As páginas públicas têm `noindex` (meta e `X-Robots-Tag`),
   mas a tela de entrar do painel não: o Lighthouse a considera indexável (SEO 91, sem a falha
   `is-crawlable` que as públicas mostram de propósito). Bastaria `robots: { index: false,
   follow: false }` no metadata da página (ou um `X-Robots-Tag` para `/painel/*`), mas a página é
   da área de auth: fica para decisão humana. Já era assim antes do redesenho.
