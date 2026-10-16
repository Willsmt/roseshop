import type { ProdutoCartao } from "@/lib/catalogo";

import { textos } from "./textos";

// Moldura em arco (design/DIRECOES.md): a borda igual em todos os cartões dá unidade a fotos
// caseiras de luz e fundo diferentes, e o arco esconde os cantos de cima, onde mora a bagunça.
// O `aspect-ratio` fica na imagem, não na moldura, para a moldura nunca crescer com a foto.
export const classesMoldura = "block rounded-arco bg-superficie-2 p-1.5";

// Só apresentação: "R$" e o valor não se separam na quebra de linha ("a partir de / R$ 28,40").
// O texto continua o mesmo; só o trecho do valor ganha white-space: nowrap.
export function PrecoInteiro({ preco }: { preco: string }) {
	const m = /^(.*?)(R\$ \S+)$/.exec(preco);
	if (m === null) return preco;
	return (
		<>
			{m[1]}
			<span className="whitespace-nowrap">{m[2]}</span>
		</>
	);
}

export function CartaoProduto({ produto, eager }: { produto: ProdutoCartao; eager: boolean }) {
	return (
		<a href={produto.href} className="group flex min-h-12 flex-col gap-1 rounded-suave">
			<span className={classesMoldura}>
				{produto.capa ? (
					// eslint-disable-next-line @next/next/no-img-element
					<img
						src={produto.capa.url}
						alt={produto.capa.alt}
						width={400}
						height={400}
						loading={eager ? "eager" : "lazy"}
						className={
							"block aspect-square h-auto w-full rounded-arco bg-linha object-cover" +
							(produto.esgotado ? " opacity-70 grayscale-[0.6]" : "")
						}
					/>
				) : (
					<span className="flex aspect-square w-full items-center justify-center rounded-arco bg-linha font-bold text-texto-suave">
						{textos.semFoto}
					</span>
				)}
			</span>
			<span className="mt-1.5 font-bold leading-snug group-hover:underline group-hover:underline-offset-4">
				{produto.nome}
			</span>
			<span className="text-[1rem] text-texto-suave">{produto.codigo}</span>
			<span className="font-titulo text-lg leading-tight text-acao"><PrecoInteiro preco={produto.preco} /></span>
			{produto.esgotado ? (
				<strong className="self-start rounded-pilula px-3 text-[1rem] font-bold text-texto shadow-[inset_0_0_0_2px_var(--cor-texto)]">
					{textos.esgotado}
				</strong>
			) : null}
		</a>
	);
}
