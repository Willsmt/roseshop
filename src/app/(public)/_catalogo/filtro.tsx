import Link from "next/link";

import type { CategoriaFiltro } from "@/lib/catalogo";

import { textos } from "./textos";

const link = "inline-flex min-h-12 items-center px-3 underline";

export function Filtro({ categorias, escolhida }: { categorias: CategoriaFiltro[]; escolhida: string | null }) {
	if (categorias.length === 0) return null;
	return (
		<nav aria-label={textos.filtrarPorCategoria}>
			<ul className="flex flex-wrap gap-2">
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
