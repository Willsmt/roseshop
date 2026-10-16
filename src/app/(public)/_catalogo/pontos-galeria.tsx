"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

import { textos } from "./textos";

const nada = () => () => {};
const hidratado = () => true;
const noServidor = () => false;

// Pontos da galeria (ADR-005): mostram a foto visível e levam a cada uma. Só aparecem depois de
// hidratar: sem JavaScript, botões que não fazem nada seriam piores que nenhum (a lista continua
// rolável pelo dedo). A foto visível vem de um IntersectionObserver sobre a própria lista.
export function PontosGaleria({ idLista, total }: { idLista: string; total: number }) {
	const pronto = useSyncExternalStore(nada, hidratado, noServidor);
	const [atual, setAtual] = useState(0);

	useEffect(() => {
		const lista = document.getElementById(idLista);
		if (!lista || typeof IntersectionObserver === "undefined") return;
		const itens = [...lista.children];
		const observador = new IntersectionObserver(
			(entradas) => {
				for (const e of entradas) if (e.isIntersecting) setAtual(itens.indexOf(e.target));
			},
			{ root: lista, threshold: 0.6 },
		);
		for (const item of itens) observador.observe(item);
		return () => observador.disconnect();
	}, [idLista]);

	if (!pronto) return null;

	function irPara(i: number) {
		const item = document.getElementById(idLista)?.children[i];
		const suave = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
		item?.scrollIntoView({ behavior: suave ? "smooth" : "auto", block: "nearest", inline: "center" });
	}

	return (
		<div className="flex justify-center gap-1">
			{Array.from({ length: total }, (_, i) => (
				<button
					key={i}
					type="button"
					aria-label={textos.fotoDe(i + 1, total)}
					aria-current={i === atual ? "true" : undefined}
					onClick={() => irPara(i)}
					className="group inline-flex size-12 items-center justify-center rounded-pilula"
				>
					<span
						aria-hidden="true"
						className={
							"block h-2.5 rounded-pilula transition-[width,background-color] duration-[var(--mola-duracao)] ease-mola " +
							(i === atual ? "w-7 bg-acao" : "w-2.5 bg-texto-suave/40 group-hover:bg-texto-suave")
						}
					/>
				</button>
			))}
		</div>
	);
}
