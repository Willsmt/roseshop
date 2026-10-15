import type { ProdutoCartao } from "@/lib/catalogo";

import { textos } from "./textos";

export function CartaoProduto({ produto, eager }: { produto: ProdutoCartao; eager: boolean }) {
	return (
		<a href={produto.href} className="flex min-h-12 flex-col gap-1">
			{produto.capa ? (
				// eslint-disable-next-line @next/next/no-img-element
				<img
					src={produto.capa.url}
					alt={produto.capa.alt}
					width={400}
					height={400}
					loading={eager ? "eager" : "lazy"}
					className="aspect-square h-auto w-full object-cover"
				/>
			) : (
				<span className="flex aspect-square w-full items-center justify-center border">{textos.semFoto}</span>
			)}
			<span className="font-bold">{produto.nome}</span>
			<span>{produto.codigo}</span>
			<span>{produto.preco}</span>
			{produto.esgotado ? <strong>{textos.esgotado}</strong> : null}
		</a>
	);
}
