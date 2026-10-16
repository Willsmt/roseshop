"use client";

import Link from "next/link";

import { limparRestauracoes } from "@/lib/catalogo/restauracao";

// Link do símbolo no topo: vai à loja do começo (como "Ver o catálogo", F3). Sem useRouter: o
// topo também aparece em páginas renderizadas sem o roteador montado (a casca da /sacola).
export function LinkInicio({ rotulo, className, children }: { rotulo: string; className: string; children: React.ReactNode }) {
	return (
		<Link href="/" aria-label={rotulo} className={className} onClick={() => limparRestauracoes()}>
			{children}
		</Link>
	);
}
