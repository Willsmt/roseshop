import type { Metadata } from "next";

import { textos } from "./_catalogo/textos";

// metadataBase (siteUrl) é definido no generateMetadata da página do detalhe, que lê a config.
export const metadata: Metadata = {
	title: textos.nomeSite,
	robots: { index: false, follow: false },
	openGraph: { siteName: textos.nomeSite },
};

export default function LayoutPublico({ children }: Readonly<{ children: React.ReactNode }>) {
	return <>{children}</>;
}
