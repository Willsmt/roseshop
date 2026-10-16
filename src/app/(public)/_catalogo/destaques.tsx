import type { ProdutoCartao } from "@/lib/catalogo";

import { CartaoProduto } from "./cartao-produto";
import { textos } from "./textos";

// Destaques em uma fileira com rolagem lateral (ADR-005): ocupa a altura de um cartão, para o
// filtro não ficar duas telas abaixo. No celular os cartões têm 42% da largura da fileira, então
// o último visível fica sempre cortado na borda (indício de que há mais). Só a fileira rola: a
// margem negativa é igual ao recuo da página (sem 100vw), e a página não ganha rolagem lateral.
// Cada cartão é um link: o Tab percorre a fileira em ordem e o navegador rola até o foco
// (scroll-padding igual ao recuo). No desktop vira grade e não há rolagem.
// LCP (design/VALIDACAO.md): no celular só os 2 primeiros destaques aparecem inteiros na primeira
// tela. Eles carregam logo (o primeiro com prioridade alta); o resto espera chegar perto da tela,
// para não disputar a banda do 4G com a foto que conta para o LCP (FR-008).
const DESTAQUES_EAGER = 2;

export function Destaques({ itens }: { itens: ProdutoCartao[] }) {
	if (itens.length === 0) return null;
	return (
		<section aria-labelledby="destaques" className="flex flex-col gap-1">
			<h2 id="destaques" className="text-3xl">
				{textos.destaques}
			</h2>
			<p className="text-texto-suave">{textos.destaquesChamada}</p>
			<ul className="-mx-4 mt-3 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto overscroll-x-contain px-4 pt-1.5 pb-4 [scrollbar-width:none] md:mx-0 md:grid md:snap-none md:grid-cols-4 md:gap-x-5 md:gap-y-8 md:overflow-visible md:px-0">
				{itens.map((p, i) => (
					<li key={p.href} className="w-[42%] shrink-0 snap-start sm:w-[30%] md:w-auto">
						<CartaoProduto produto={p} eager={i < DESTAQUES_EAGER} prioridade={i === 0} />
					</li>
				))}
			</ul>
		</section>
	);
}
