import type { ProdutoCartao } from "@/lib/catalogo";

import { CartaoProduto } from "./cartao-produto";
import { textos } from "./textos";

export function Destaques({ itens }: { itens: ProdutoCartao[] }) {
	if (itens.length === 0) return null;
	return (
		<section aria-labelledby="destaques">
			<h2 id="destaques" className="text-lg font-bold">
				{textos.destaques}
			</h2>
			<ul className="grid grid-cols-2 gap-3">
				{itens.map((p) => (
					<li key={p.href}>
						<CartaoProduto produto={p} eager />
					</li>
				))}
			</ul>
		</section>
	);
}
