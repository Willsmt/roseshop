import { requireAdminPage } from "@/lib/auth";
import { listarCategorias } from "@/lib/categorias";

import { FormProduto } from "../form-produto";

export default async function NovoProdutoPage() {
	await requireAdminPage("/painel/produtos/novo");
	const categorias = await listarCategorias();

	return (
		<div className="flex flex-col gap-6">
			<h1 className="text-2xl font-bold">Novo produto</h1>
			<FormProduto modo="cadastro" categorias={categorias} />
		</div>
	);
}
