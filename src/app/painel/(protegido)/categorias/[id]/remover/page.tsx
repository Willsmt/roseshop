import Link from "next/link";

import { requireAdminPage } from "@/lib/auth";
import { mensagem } from "@/lib/categorias/mensagens";
import { obterCategoriaDoPainel } from "@/lib/categorias/painel";

import { ConfirmarRemocao } from "./confirmar-remocao";

export default async function RemoverCategoriaPage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const { id } = await params;
	await requireAdminPage(`/painel/categorias/${id}/remover`);
	const c = await obterCategoriaDoPainel(id);

	if (c === null) {
		return (
			<div className="flex flex-col gap-4">
				<p role="alert" className="text-base font-semibold text-red-700">
					{mensagem("nao_existe")}
				</p>
				<Link
					href="/painel/categorias"
					className="inline-flex min-h-12 items-center text-base font-semibold underline"
				>
					Voltar para a lista
				</Link>
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-6">
			<h1 className="text-2xl font-bold">Remover categoria</h1>
			<ConfirmarRemocao id={c.id} versao={c.versao} nome={c.nome} />
		</div>
	);
}
