import Link from "next/link";

import { requireAdminPage } from "@/lib/auth";
import { listarCategoriasDoPainel } from "@/lib/categorias/painel";

const linkClasse =
	"inline-flex min-h-12 items-center justify-center rounded-lg border-2 border-neutral-900 px-4 py-3 text-base font-semibold underline";

export default async function CategoriasPage() {
	await requireAdminPage("/painel/categorias");
	const categorias = await listarCategoriasDoPainel();

	return (
		<div className="flex flex-col gap-6">
			<Link
				href="/painel"
				className="inline-flex min-h-12 items-center self-start text-base font-semibold underline"
			>
				Voltar ao painel
			</Link>
			<h1 className="text-2xl font-bold">Categorias</h1>
			<Link
				href="/painel/categorias/nova"
				className="inline-flex min-h-12 items-center justify-center rounded-lg bg-neutral-900 px-6 py-3 text-base font-semibold text-white sm:self-start"
			>
				Nova categoria
			</Link>
			<ul className="flex flex-col gap-4">
				{categorias.map((c) => (
					<li
						key={c.id}
						className="flex flex-col gap-3 rounded-lg border border-neutral-300 p-4"
					>
						<span className="text-lg font-bold">{c.nome}</span>
						<div className="flex gap-3">
							<Link
								href={`/painel/categorias/${c.id}/renomear`}
								aria-label={`Renomear ${c.nome}`}
								className={linkClasse}
							>
								Renomear
							</Link>
							<Link
								href={`/painel/categorias/${c.id}/remover`}
								aria-label={`Remover ${c.nome}`}
								className={linkClasse}
							>
								Remover
							</Link>
						</div>
					</li>
				))}
			</ul>
		</div>
	);
}
