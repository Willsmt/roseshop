import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { cache } from "react";

import { configCatalogo, lerProduto } from "@/lib/catalogo";

import { BotaoWhatsapp } from "../../_catalogo/botao-whatsapp";
import { PrecoInteiro } from "../../_catalogo/cartao-produto";
import { Galeria } from "../../_catalogo/galeria";
import { LinkCatalogo } from "../../_catalogo/link-catalogo";
import { textos } from "../../_catalogo/textos";
import { Topo } from "../../_catalogo/topo";
import { BotaoSacola } from "../../_sacola/botao-sacola";

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
		<>
			<Topo />
			<main className="mx-auto w-full max-w-5xl px-4 pb-12">
				<nav className="-ml-1 mb-2">
					<LinkCatalogo voltar>
						<svg
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth={2.5}
							strokeLinecap="round"
							strokeLinejoin="round"
							aria-hidden="true"
							focusable="false"
							className="size-5"
						>
							<path d="M15 5l-7 7 7 7" />
						</svg>
						{textos.voltarAoCatalogo}
					</LinkCatalogo>
				</nav>
				{/* Celular: foto, depois o resto. Desktop: foto à esquerda, compra à direita. */}
				<article className="grid gap-6 md:grid-cols-2 md:items-start md:gap-10">
					<Galeria fotos={produto.fotos} />
					<div className="flex flex-col gap-4">
						<div className="flex flex-col gap-2">
							<h1 className="text-4xl">{produto.nome}</h1>
							<p className="text-texto-suave">
								{produto.codigo} · {produto.categoria}
							</p>
						</div>
						<p className="font-titulo text-4xl text-acao">
							<PrecoInteiro preco={produto.preco} />
						</p>
						{produto.esgotado ? (
							<p>
								<strong className="inline-block rounded-pilula bg-texto px-4 py-1 font-bold text-superficie">
									{textos.esgotado}
								</strong>
							</p>
						) : null}
						{produto.sacola || produto.whatsapp ? (
							<div className="flex flex-col gap-3">
								{produto.sacola ? (
									// Espaço reservado da sacola (feature 006, CT§1): vazio no servidor, só para disponível.
									<div data-sacola="detalhe" className="min-h-12">
										<BotaoSacola sacola={produto.sacola} />
									</div>
								) : null}
								<BotaoWhatsapp whatsapp={produto.whatsapp} esgotado={produto.esgotado} />
							</div>
						) : null}
						{produto.descricao ? (
							<section aria-labelledby="descricao" className="mt-2 flex flex-col gap-2 border-t border-linha pt-5">
								<h2 id="descricao" className="text-2xl">
									{textos.descricao}
								</h2>
								<p className="whitespace-pre-line">{produto.descricao}</p>
							</section>
						) : null}
					</div>
				</article>
			</main>
		</>
	);
}
