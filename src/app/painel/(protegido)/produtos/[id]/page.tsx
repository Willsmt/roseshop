import Link from "next/link";

import { requireAdminPage } from "@/lib/auth";
import { obterProdutoDoPainel } from "@/lib/produtos/painel";

import { AcoesProduto } from "./acoes-produto";

const linkBotao =
	"inline-flex min-h-12 items-center justify-center rounded-lg border-2 border-neutral-900 px-4 py-3 text-base font-semibold underline";

export default async function DetalheProdutoPage({
	params,
	searchParams,
}: {
	params: Promise<{ id: string }>;
	searchParams: Promise<{ voltar?: string | string[] }>;
}) {
	const { id } = await params;
	const { voltar } = await searchParams;
	await requireAdminPage(`/painel/produtos/${id}`);
	const p = await obterProdutoDoPainel(id, voltar);

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

	const emDestaque = p.destaqueVaga !== null;
	return (
		<div className="flex flex-col gap-6">
			<Link href={p.voltarHref} className="inline-flex min-h-12 items-center self-start text-base font-semibold underline">
				Voltar à lista
			</Link>
			<div className="flex flex-col gap-2">
				<p className="text-base font-semibold">{p.codigo}</p>
				<h1 className="text-2xl font-bold">{p.nome}</h1>
				<p className="text-base">{p.categoriaNome}</p>
				<p className="text-lg font-bold">{p.preco ?? "Sem preço"}</p>
				<div className="flex gap-2">
					{p.esgotado ? <span className="text-base font-semibold">Esgotado</span> : null}
					{emDestaque ? <span className="text-base font-semibold">Em destaque</span> : null}
				</div>
			</div>
			<div className="flex min-h-32 items-center justify-center rounded-lg border-2 border-dashed border-neutral-400 text-base">
				sem foto
			</div>
			{p.descricao ? <p className="whitespace-pre-line text-base">{p.descricao}</p> : null}
			<AcoesProduto
				id={p.id}
				versao={p.versao}
				esgotado={p.esgotado}
				emDestaque={emDestaque}
				podeDestacar={p.podeDestacar}
			/>
			<div className="flex gap-3">
				<Link href={`/painel/produtos/${p.id}/editar`} className={linkBotao}>
					Editar
				</Link>
				<Link href={`/painel/produtos/${p.id}/remover`} className={linkBotao}>
					Remover
				</Link>
			</div>
			<div className="flex flex-col gap-1 text-base">
				<p>{`Cadastrado por ${p.criadoPor}`}</p>
				<p>{`Última alteração por ${p.atualizadoPor}`}</p>
			</div>
		</div>
	);
}
