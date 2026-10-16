"use client";

import { textos } from "@/lib/sacola/textos";

import { useSacola } from "./usar-sacola";

// Acesso à sacola no cabeçalho (CT§1, US1.7, FR-004): conta produtos diferentes. Nada antes de
// hidratar nem sem armazenamento (FR-002a); o espaço do layout tem altura fixa.
export function AcessoSacola() {
	const sacola = useSacola();
	if (sacola === null) return null;
	return (
		<a
			href="/sacola"
			className="pointer-events-auto inline-flex min-h-12 items-center gap-2 rounded-pilula bg-superficie-2 px-4 font-bold text-texto shadow-[0_0_0_4px_var(--cor-superficie)] hover:bg-linha"
		>
			<svg
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				strokeWidth={2}
				strokeLinecap="round"
				strokeLinejoin="round"
				aria-hidden="true"
				focusable="false"
				className="size-5 shrink-0 text-acao"
			>
				<path d="M5 8h14l-1 12H6L5 8Z" />
				<path d="M9 8V6.5a3 3 0 0 1 6 0V8" />
			</svg>
			<span>
				{textos.sacola}, <span aria-live="polite">{textos.produtosNaSacola(sacola.itens.length)}</span>
			</span>
		</a>
	);
}
