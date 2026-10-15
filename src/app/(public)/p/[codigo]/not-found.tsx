import Link from "next/link";
import { textos } from "../../_catalogo/textos";

export default function ProdutoNaoEncontrado() {
	return (
		<main className="p-4">
			<h1 className="text-xl font-bold">{textos.naoEncontrado}</h1>
			<Link href="/" className="mt-4 inline-flex min-h-12 items-center underline">
				{textos.verOCatalogo}
			</Link>
		</main>
	);
}
