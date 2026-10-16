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
// altura fixa, para a tela não pular quando o acesso aparece depois de hidratar.
export default function LayoutPublico({ children }: Readonly<{ children: React.ReactNode }>) {
	return (
		<>
			<div data-sacola="cabecalho" className="mx-auto flex h-12 max-w-xl justify-end px-4">
				<AcessoSacola />
			</div>
			{children}
		</>
	);
}
