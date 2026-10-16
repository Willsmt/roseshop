# Ideias que precisam de dado novo (fora deste trabalho)

Nenhuma delas foi feita: todas pedem mudança em `src/lib/catalogo/`, em `src/lib/db/` ou numa
action, que estão fora do escopo do design.

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
