import type { Metadata } from "next";

import { textos } from "./_catalogo/textos";
import { AcessoSacola } from "./_sacola/acesso-sacola";

// metadataBase (siteUrl) é definido no generateMetadata de cada página (inicial e detalhe), que lê a config.
export const metadata: Metadata = {
	title: textos.nomeSite,
	robots: { index: false, follow: false },
	openGraph: { siteName: textos.nomeSite },
};

// O espaço da sacola (feature 006, CT§1) é o único acréscimo ao HTML da 005: vazio no servidor e com
// altura fixa, para a tela não pular quando o acesso aparece depois de hidratar. Fica sobreposto ao
// canto direito do topo de cada página; só o acesso recebe toques (o resto deixa passar).
export default function LayoutPublico({ children }: Readonly<{ children: React.ReactNode }>) {
	return (
		<>
			<div
				data-sacola="cabecalho"
				className="pointer-events-none absolute inset-x-0 top-0 z-10 mx-auto flex h-16 max-w-5xl items-center justify-end px-4"
			>
				<AcessoSacola />
			</div>
			{children}
		</>
	);
}
