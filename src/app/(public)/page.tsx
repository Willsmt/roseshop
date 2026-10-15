import type { Metadata } from "next";

import { configCatalogo, lerVitrine } from "@/lib/catalogo";

import { CartaoProduto } from "./_catalogo/cartao-produto";
import { Destaques } from "./_catalogo/destaques";
import { Filtro } from "./_catalogo/filtro";
import { textos } from "./_catalogo/textos";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
	const { siteUrl } = configCatalogo();
	return siteUrl === null ? {} : { metadataBase: new URL(siteUrl) };
}

type Props = { searchParams: Promise<{ categoria?: string | string[] }> };

export default async function Home({ searchParams }: Props) {
	const { categoria } = await searchParams;
	const vitrine = await lerVitrine(typeof categoria === "string" ? categoria : undefined);
	const { bloco } = vitrine;
	const nomeEscolhida = vitrine.categorias.find((c) => c.slug === bloco.categoria)?.nome;

	return (
		<>
			<header className="mx-auto max-w-xl p-4">
				<h1 className="text-2xl font-bold">{textos.nomeSite}</h1>
			</header>
			<main className="mx-auto flex max-w-xl flex-col gap-6 p-4">
				<Destaques itens={vitrine.destaques} />
				<section aria-labelledby="produtos" className="flex flex-col gap-3">
					<h2 id="produtos" className="text-lg font-bold">
						{textos.produtos}
					</h2>
					<Filtro categorias={vitrine.categorias} escolhida={bloco.categoria} />
					<p aria-live="polite">
						{nomeEscolhida ? `${textos.mostrandoDe} ${nomeEscolhida}` : textos.mostrandoTodos}
					</p>
					{bloco.itens.length === 0 ? (
						<p>{textos.semProdutos}</p>
					) : (
						<ul className="grid grid-cols-2 gap-3">
							{bloco.itens.map((p, i) => (
								<li key={p.href}>
									<CartaoProduto produto={p} eager={i < 4} />
								</li>
							))}
						</ul>
					)}
				</section>
			</main>
		</>
	);
}
