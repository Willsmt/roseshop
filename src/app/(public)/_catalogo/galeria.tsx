import type { ProdutoPublico } from "@/lib/catalogo";

import { textos } from "./textos";

export function Galeria({ fotos }: Pick<ProdutoPublico, "fotos">) {
	return (
		<ul aria-label={textos.fotos} className="flex flex-col gap-2">
			{fotos.map((foto, i) => (
				<li key={foto.url}>
					{/* eslint-disable-next-line @next/next/no-img-element */}
					<img
						src={foto.url}
						alt={foto.alt}
						width={800}
						height={800}
						loading={i === 0 ? "eager" : "lazy"}
						className="h-auto w-full"
					/>
				</li>
			))}
		</ul>
	);
}
