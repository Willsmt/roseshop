import Link from "next/link";

import { requireAdminPage } from "@/lib/auth";
import { obterProdutoDoPainel } from "@/lib/produtos/painel";

import { ConfirmarRemocao } from "./confirmar-remocao";

export default async function RemoverProdutoPage({ params }: { params: Promise<{ id: string }> }) {
	const { id } = await params;
	await requireAdminPage(`/painel/produtos/${id}/remover`);
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

	return (
		<div className="flex flex-col gap-6">
			<h1 className="text-2xl font-bold">Remover produto</h1>
			<ConfirmarRemocao id={p.id} versao={p.versao} codigo={p.codigo} nome={p.nome} />
		</div>
	);
}
