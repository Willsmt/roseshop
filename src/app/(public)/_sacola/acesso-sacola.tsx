"use client";

import { textos } from "@/lib/sacola/textos";

import { useSacola } from "./usar-sacola";

// Acesso à sacola no cabeçalho (CT§1, US1.7, FR-004): conta produtos diferentes. Nada antes de
// hidratar nem sem armazenamento (FR-002a); o espaço do layout tem altura fixa.
export function AcessoSacola() {
	const sacola = useSacola();
	if (sacola === null) return null;
	return (
		<a href="/sacola" className="inline-flex min-h-12 items-center px-2 underline">
			{textos.sacola}, <span aria-live="polite">{textos.produtosNaSacola(sacola.itens.length)}</span>
		</a>
	);
}
