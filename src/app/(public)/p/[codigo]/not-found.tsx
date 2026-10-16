import { LinkCatalogo } from "../../_catalogo/link-catalogo";
import { textos } from "../../_catalogo/textos";
import { Topo } from "../../_catalogo/topo";

// Uma moldura em arco vazia diz "não tem nada aqui" sem precisar de imagem.
export default function ProdutoNaoEncontrado() {
	return (
		<>
			<Topo />
			<main className="mx-auto flex w-full max-w-md flex-col items-center gap-4 px-4 pt-6 pb-12 text-center">
				<span aria-hidden="true" className="block aspect-square w-40 rounded-arco border-[6px] border-superficie-2 bg-ceu" />
				<h1 className="text-4xl">{textos.naoEncontrado}</h1>
				<p className="text-texto-suave">{textos.naoEncontradoTexto}</p>
				<LinkCatalogo className="inline-flex min-h-12 w-full items-center justify-center rounded-pilula bg-acao px-6 py-3 font-bold text-white hover:bg-acao-forte">
					{textos.verOCatalogo}
				</LinkCatalogo>
			</main>
		</>
	);
}
