import Link from "next/link";

import { requireAdminPage } from "@/lib/auth";

export default async function PainelPage() {
	const admin = await requireAdminPage("/painel");

	return (
		<div className="flex flex-col gap-6">
			<h1 className="text-3xl">{`Olá, ${admin.name ?? admin.email}`}</h1>
			<Link
				href="/painel/produtos"
				className="inline-flex min-h-12 items-center justify-center rounded-pilula bg-acao px-6 py-3 text-base font-bold text-white hover:bg-acao-forte sm:self-start"
			>
				Produtos
			</Link>
			<Link
				href="/painel/categorias"
				className="inline-flex min-h-12 items-center justify-center rounded-pilula bg-acao px-6 py-3 text-base font-bold text-white hover:bg-acao-forte sm:self-start"
			>
				Categorias
			</Link>
		</div>
	);
}
