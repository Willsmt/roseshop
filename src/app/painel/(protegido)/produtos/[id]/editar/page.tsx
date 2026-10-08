import Link from "next/link";

import { requireAdminPage } from "@/lib/auth";
import { listarCategorias } from "@/lib/categorias";
import { obterProdutoDoPainel } from "@/lib/produtos/painel";

import { FormProduto } from "../../form-produto";

export default async function EditarProdutoPage({ params }: { params: Promise<{ id: string }> }) {
	const { id } = await params;
	await requireAdminPage(`/painel/produtos/${id}/editar`);
	const p = await obterProdutoDoPainel(id, undefined);

	if (p === null) {
		return (
			<div className="flex flex-col gap-4">
				<p role="alert" className="text-base font-semibold text-red-700">
					Produto não encontrado
				</p>
				<Link href="/painel/produtos" className="inline-flex min-h-12 items-center text-base font-semibold underline">
					Voltar à lista
				</Link>
			</div>
		);
	}

	const categorias = await listarCategorias();
	return (
		<div className="flex flex-col gap-6">
			<h1 className="text-2xl font-bold">{`Editar ${p.codigo}`}</h1>
			<FormProduto
				modo="edicao"
				categorias={categorias}
				id={p.id}
				versao={p.versao}
				inicial={{
					nome: p.nome,
					categoriaId: String(p.categoriaId),
					descricao: p.descricao ?? "",
					// centavos em dígitos: a máscara do campo formata ("1290" ⇒ "12,90")
					preco: p.precoCentavos === null ? "" : String(p.precoCentavos),
					aPartirDe: p.aPartirDe,
				}}
			/>
		</div>
	);
}
