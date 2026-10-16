import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
	title: "Roseshop",
};

export const viewport: Viewport = {
	themeColor: "#fffbf8",
	colorScheme: "light",
};

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html lang="pt-BR">
			<head>
				<link rel="icon" href="/favicon.svg" type="image/svg+xml"></link>
				{/* Só a fonte do texto: a do título (80 KB) não disputa banda com a foto do LCP. */}
				<link
					rel="preload"
					href="/fonts/AtkinsonHyperlegibleNext-Regular.woff2"
					as="font"
					type="font/woff2"
					crossOrigin="anonymous"
				/>
			</head>
			<body className="antialiased">{children}</body>
		</html>
	);
}
