import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { cache } from "react";

import { configCatalogo, lerProduto } from "@/lib/catalogo";

import { BotaoWhatsapp } from "../../_catalogo/botao-whatsapp";
import { Galeria } from "../../_catalogo/galeria";
import { LinkCatalogo } from "../../_catalogo/link-catalogo";
import { textos } from "../../_catalogo/textos";

export const dynamic = "force-dynamic";

// A página e o generateMetadata leem o mesmo produto: uma consulta por visita.
const ler = cache(lerProduto);

type Props = { params: Promise<{ codigo: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
	const { codigo } = await params;
	const produto = await ler(codigo);
	if (produto === "nao_encontrado") return { title: textos.naoEncontrado };
	const { siteUrl } = configCatalogo();
	return {
		...(siteUrl === null ? {} : { metadataBase: new URL(siteUrl) }),
		title: produto.nome,
		openGraph: {
			title: produto.nome,
			siteName: textos.nomeSite,
			// Sem metadataBase a URL relativa da capa não vira endereço válido: sem SITE_URL, sem imagem.
			...(produto.capa === null || siteUrl === null ? {} : { images: [produto.capa.url] }),
		},
	};
}

export default async function Detalhe({ params }: Props) {
	const { codigo } = await params;
	const produto = await ler(codigo);
	if (produto === "nao_encontrado") notFound();
	if (`/p/${codigo}` !== produto.href) permanentRedirect(produto.href);

	return (
		<main className="mx-auto max-w-xl p-4">
			<nav>
				<LinkCatalogo voltar>{textos.voltarAoCatalogo}</LinkCatalogo>
			</nav>
			<article className="flex flex-col gap-3">
				<h1 className="text-xl font-bold">{produto.nome}</h1>
				<p>
					{produto.codigo} · {produto.categoria}
				</p>
				<p>{produto.preco}</p>
				{produto.esgotado ? (
					<p>
						<strong>{textos.esgotado}</strong>
					</p>
				) : null}
				<Galeria fotos={produto.fotos} />
				{produto.descricao ? (
					<section aria-labelledby="descricao">
						<h2 id="descricao" className="font-bold">
							{textos.descricao}
						</h2>
						<p className="whitespace-pre-line">{produto.descricao}</p>
					</section>
				) : null}
				<BotaoWhatsapp whatsapp={produto.whatsapp} esgotado={produto.esgotado} />
			</article>
		</main>
	);
}
