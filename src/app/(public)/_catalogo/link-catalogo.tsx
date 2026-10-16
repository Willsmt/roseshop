"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { existeRestauracao, limparRestauracoes } from "@/lib/catalogo/restauracao";

const padrao = "inline-flex min-h-12 items-center gap-2 font-bold underline-offset-4 hover:underline";

// F3 / D15: ao ir para o catálogo por aqui, a lista começa do 1º bloco. Com `voltar` (detalhe), se
// a lista guardou o estado nesta aba para este mesmo item, volta pelo histórico (mantém filtro, blocos e posição).
export function LinkCatalogo({
	voltar = false,
	className = padrao,
	rotulo,
	children,
}: {
	voltar?: boolean;
	className?: string;
	/** Nome acessível quando o conteúdo é só imagem (o logo do topo). */
	rotulo?: string;
	children: React.ReactNode;
}) {
	const router = useRouter();
	return (
		<Link
			href="/"
			className={className}
			aria-label={rotulo}
			onClick={(e) => {
				if (voltar && existeRestauracao(window.location.pathname)) {
					e.preventDefault();
					router.back();
					return;
				}
				limparRestauracoes();
			}}
		>
			{children}
		</Link>
	);
}
