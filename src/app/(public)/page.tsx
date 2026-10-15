import type { Metadata } from "next";

import { configCatalogo, lerVitrine } from "@/lib/catalogo";

import { Destaques } from "./_catalogo/destaques";
import { ListaCatalogo } from "./_catalogo/lista-catalogo";
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
					<ListaCatalogo key={bloco.categoria ?? "todas"} categorias={vitrine.categorias} inicial={bloco} />
				</section>
			</main>
		</>
	);
}
