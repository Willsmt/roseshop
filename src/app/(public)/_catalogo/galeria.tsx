import type { ProdutoPublico } from "@/lib/catalogo";

import { PontosGaleria } from "./pontos-galeria";
import { textos } from "./textos";

const ID = "galeria-fotos";

// Fotos do detalhe em rolagem lateral com `scroll-snap` (ADR-005), cada uma no arco. Com mais de
// uma foto, a seguinte aparece na borda (88% da largura) e os pontos mostram onde se está. A lista
// rola sozinha, sem levar a página junto; é focável (tabIndex) para rolar pelo teclado.
export function Galeria({ fotos }: Pick<ProdutoPublico, "fotos">) {
	const varias = fotos.length > 1;
	return (
		<div className="flex flex-col gap-3">
			<ul
				id={ID}
				aria-label={textos.fotos}
				tabIndex={varias ? 0 : undefined}
				className={
					"flex snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain rounded-suave pb-1 [scrollbar-width:none]" +
					(varias ? " -mx-4 scroll-px-4 px-4 md:mx-0 md:px-0" : "")
				}
			>
				{fotos.map((foto, i) => (
					<li key={foto.url} className={(varias ? "w-[88%] md:w-full" : "w-full") + " shrink-0 snap-center"}>
						<span className="block rounded-arco bg-superficie-2 p-2">
							{/* eslint-disable-next-line @next/next/no-img-element */}
							<img
								src={foto.url}
								alt={foto.alt}
								width={800}
								height={800}
								loading={i === 0 ? "eager" : "lazy"}
								fetchPriority={i === 0 ? "high" : undefined}
								className="block aspect-square h-auto w-full rounded-arco bg-linha object-cover"
							/>
						</span>
					</li>
				))}
			</ul>
			{varias ? <PontosGaleria idLista={ID} total={fotos.length} /> : null}
		</div>
	);
}
