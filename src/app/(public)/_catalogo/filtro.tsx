import Link from "next/link";

import type { CategoriaFiltro } from "@/lib/catalogo";

import { textos } from "./textos";

// Categorias como botões grandes de topo em arco (lição da direção Letreiro): um toque do polegar
// leva à categoria. Continuam links (cada categoria é um endereço filtrado no servidor), com
// aria-current na escolhida.
const link =
	"flex min-h-14 w-full items-center justify-center rounded-t-[1.75rem] rounded-b-suave px-4 pt-2 pb-1.5 text-center font-bold leading-tight " +
	"bg-superficie-2 text-texto hover:bg-linha " +
	"aria-[current=page]:bg-texto aria-[current=page]:text-superficie";

export function Filtro({ categorias, escolhida }: { categorias: CategoriaFiltro[]; escolhida: string | null }) {
	if (categorias.length === 0) return null;
	return (
		<nav aria-label={textos.filtrarPorCategoria}>
			<ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
				<li>
					<Link href="/" className={link} aria-current={escolhida === null ? "page" : undefined}>
						{textos.todas}
					</Link>
				</li>
				{categorias.map((c) => (
					<li key={c.slug}>
						<Link
							href={`/?categoria=${encodeURIComponent(c.slug)}`}
							className={link}
							aria-current={escolhida === c.slug ? "page" : undefined}
						>
							{c.nome}
						</Link>
					</li>
				))}
			</ul>
		</nav>
	);
}
