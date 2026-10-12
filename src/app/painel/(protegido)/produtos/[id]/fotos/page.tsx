import Link from "next/link";

import { requireAdminPage } from "@/lib/auth";
import { obterProdutoDoPainel } from "@/lib/produtos/painel";

import { GerenciarFotos } from "./gerenciar-fotos";

export default async function FotosProdutoPage({ params }: { params: Promise<{ id: string }> }) {
	const { id } = await params;
	await requireAdminPage(`/painel/produtos/${id}/fotos`);
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
			<Link
				href={`/painel/produtos/${p.id}`}
				className="inline-flex min-h-12 items-center self-start text-base font-semibold underline"
			>
				Voltar ao produto
			</Link>
			<div className="flex flex-col gap-2">
				<h1 className="text-2xl font-bold">Fotos</h1>
				<p className="text-base font-semibold">{`${p.codigo} ${p.nome}`}</p>
			</div>
			<GerenciarFotos produtoId={p.id} inicial={{ fotosVersao: p.fotosVersao, fotos: p.fotos }} />
		</div>
	);
}
