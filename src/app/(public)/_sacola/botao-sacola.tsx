"use client";

import { useEffect, useId, useRef, useState } from "react";

import type { ProdutoPublico } from "@/lib/catalogo";
import { alterarSacola } from "@/lib/sacola/armazenamento";
import { adicionar, cheia, estaNaSacola } from "@/lib/sacola/sacola";
import { textos } from "@/lib/sacola/textos";
import { Button } from "@/components/ui/button";

import { armazenamento, useSacola } from "./usar-sacola";

// Botão do detalhe (CT§2, US1.2–US1.6). Nada antes de hidratar nem sem armazenamento (FR-002a).
// Já na sacola, vira link para /sacola e nunca soma (US1.3). Os limites valem sobre a sacola relida
// no toque (FR-008a): quem decide é `alterarSacola`.
export function BotaoSacola({ sacola: produto }: { sacola: NonNullable<ProdutoPublico["sacola"]> }) {
	const sacola = useSacola();
	const [falhou, setFalhou] = useState(false);
	const [focar, setFocar] = useState(false);
	const link = useRef<HTMLAnchorElement>(null);
	const idLimite = useId();

	// Depois de adicionar, o botão some: o foco passa para o link que entrou no lugar dele.
	useEffect(() => {
		if (focar && link.current) {
			link.current.focus();
			setFocar(false);
		}
	}, [focar, sacola]);

	if (sacola === null) return null;

	if (estaNaSacola(sacola, produto.codigo)) {
		return (
			<a
				ref={link}
				href="/sacola"
				className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-pilula bg-sucesso-fundo px-6 py-3 sm:w-auto font-bold text-sucesso shadow-[inset_0_0_0_2px_var(--cor-sucesso)]"
			>
				<svg
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					strokeWidth={2.5}
					strokeLinecap="round"
					strokeLinejoin="round"
					aria-hidden="true"
					focusable="false"
					className="size-5"
				>
					<path d="M5 12.5l4.5 4.5L19 7.5" />
				</svg>
				{textos.naSacola}
			</a>
		);
	}

	const noLimite = cheia(sacola);

	function aoTocar() {
		if (noLimite) return;
		const r = alterarSacola(armazenamento, adicionar(produto), Date.now());
		setFalhou(!r.ok && r.motivo === "armazenamento");
		if (r.ok) setFocar(true);
	}

	return (
		<div className="flex flex-col gap-2">
			<Button
				type="button"
				variant="primary"
				onClick={aoTocar}
				className="aria-disabled:cursor-not-allowed aria-disabled:opacity-60"
				aria-disabled={noLimite ? true : undefined}
				aria-describedby={noLimite ? idLimite : undefined}
			>
				{textos.adicionarASacola}
			</Button>
			{noLimite ? (
				<p id={idLimite} className="text-texto-suave">
					{textos.limiteProdutos}
				</p>
			) : null}
			{falhou ? (
				<p role="status" className="font-bold text-erro">
					{textos.falhaAoAdicionar}
				</p>
			) : null}
		</div>
	);
}
