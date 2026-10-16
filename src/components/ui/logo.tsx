// Símbolo da Roseshop: a "rosa de arcos" (ADR-005, design/DIRECOES.md). Três arcos sobre um
// parapeito, traço único, uma cor (currentColor). Decorativo por padrão: quem dá nome ao link é o
// `aria-label` de quem o usa. Sem <title> nem <text>: a /sacola sem JavaScript não pode ter texto
// no HTML do servidor (catalogo-html-005.test.tsx).
export function LogoMarca({
	className,
	traco = 4,
	estilo,
}: {
	className?: string;
	traco?: number;
	/** Estilo em linha (ex.: o esmaecimento quando o logo 3D assume o lugar). */
	estilo?: React.CSSProperties;
}) {
	return (
		<svg
			style={estilo}
			viewBox="0 0 64 64"
			fill="none"
			stroke="currentColor"
			strokeWidth={traco}
			strokeLinecap="round"
			aria-hidden="true"
			focusable="false"
			className={className}
		>
			<path d="M9 57V31a23 23 0 0 1 46 0v26" />
			<path d="M19 57V37a14 14 0 0 1 28 0v20" />
			<path d="M25 57V44a7.5 7.5 0 0 1 15 0v13" />
			<path d="M5 57h54" />
		</svg>
	);
}
