import { LinkCatalogo } from "../../_catalogo/link-catalogo";
import { textos } from "../../_catalogo/textos";

export default function ProdutoNaoEncontrado() {
	return (
		<main className="p-4">
			<h1 className="text-xl font-bold">{textos.naoEncontrado}</h1>
			<LinkCatalogo>{textos.verOCatalogo}</LinkCatalogo>
		</main>
	);
}
