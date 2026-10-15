"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { existeRestauracao, limparRestauracoes } from "@/lib/catalogo/restauracao";

// F3 / D15: ao ir para o catálogo por aqui, a lista começa do 1º bloco. Com `voltar` (detalhe), se
// a lista guardou o estado nesta aba para este mesmo item, volta pelo histórico (mantém filtro, blocos e posição).
export function LinkCatalogo({ voltar = false, children }: { voltar?: boolean; children: React.ReactNode }) {
	const router = useRouter();
	return (
		<Link
			href="/"
			className="inline-flex min-h-12 items-center underline"
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
