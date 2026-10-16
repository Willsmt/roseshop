import type { Metadata } from "next";

import { LogoMarca } from "@/components/ui/logo";
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
			{/* A janela (design/DIRECOES.md): o único lugar com luz. O espaço do símbolo tem tamanho
			    fixo, para o logo 3D (Fase 7) entrar depois no mesmo lugar sem mover nada. */}
			{/* pt-16: a faixa do topo, onde o acesso à sacola aparece (espaço do layout), como nas
			    outras páginas; a janela começa abaixo dela e nada a cobre. */}
			<header className="mx-auto w-full max-w-5xl px-4 pt-16">
				<div className="janela relative isolate overflow-hidden rounded-arco bg-ceu px-6 pt-12 pb-7 text-center">
					<div data-logo="janela" className="mx-auto size-14 text-acao">
						<LogoMarca className="size-14" traco={3.5} />
					</div>
					<h1 className="mt-2 text-5xl lowercase sm:text-6xl">{textos.nomeSite}</h1>
					<p className="mx-auto mt-2 max-w-[30ch] text-texto-suave">{textos.chamada}</p>
				</div>
			</header>
			<main className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 pt-8 pb-12">
				<Destaques itens={vitrine.destaques} />
				<section aria-labelledby="produtos" className="flex flex-col gap-4">
					<div className="flex flex-col gap-1">
						<h2 id="produtos" className="text-3xl">
							{textos.produtos}
						</h2>
						{vitrine.categorias.length > 0 ? <p className="text-texto-suave">{textos.produtosChamada}</p> : null}
					</div>
					<ListaCatalogo key={bloco.categoria ?? "todas"} categorias={vitrine.categorias} inicial={bloco} />
				</section>
			</main>
			<footer className="mx-auto w-full max-w-5xl px-4 pb-10">
				<p className="border-t border-linha pt-6 text-center text-texto-suave">{textos.rodape}</p>
			</footer>
		</>
	);
}
