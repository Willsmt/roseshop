"use client";

import { useEffect, useRef, useState } from "react";

import { LogoMarca } from "@/components/ui/logo";

import type { ControleCena } from "./logo-3d/cena";
import { lerAmbiente, motivoSemTresD } from "./logo-3d/condicoes";

const TAMANHO = 56; // size-14: o mesmo espaço do SVG

// Depois que a página terminou de carregar (fotos da primeira tela incluídas) e o navegador ficou
// ocioso: o 3D nunca disputa banda nem CPU com os produtos.
function depoisDaPagina(f: () => void): () => void {
	let cancelar = () => {};
	const agendar = () => {
		// O tipo do DOM declara requestIdleCallback, mas o Safari não o tem.
		if (typeof window.requestIdleCallback === "function") {
			const id = window.requestIdleCallback(f, { timeout: 3000 });
			cancelar = () => window.cancelIdleCallback(id);
		} else {
			const id = window.setTimeout(f, 1500);
			cancelar = () => window.clearTimeout(id);
		}
	};
	if (document.readyState === "complete") agendar();
	else {
		window.addEventListener("load", agendar, { once: true });
		cancelar = () => window.removeEventListener("load", agendar);
	}
	return () => cancelar();
}

type Fase = "svg" | "carregando" | "3d";

// Logo da janela (ADR-005, Fase 7). O servidor e o primeiro desenho do cliente entregam só o SVG,
// igual ao de antes (o HTML sem JavaScript não muda). Se o aparelho aguenta e a pessoa não pediu
// menos movimento, o canvas entra por cima do SVG, invisível, e só aparece no primeiro quadro: o
// SVG continua segurando o espaço, então nada se move. Qualquer falha volta ao SVG.
export function LogoJanela() {
	const [fase, setFase] = useState<Fase>("svg");
	const caixa = useRef<HTMLDivElement>(null);
	const tela = useRef<HTMLCanvasElement>(null);
	const ativo = fase !== "svg";

	useEffect(() => {
		return depoisDaPagina(() => {
			if (motivoSemTresD(lerAmbiente()) === null) setFase("carregando");
		});
	}, []);

	useEffect(() => {
		if (!ativo) return;
		let controle: ControleCena | null = null;
		let vivo = true;
		let visivel = true;
		const reduzir = window.matchMedia("(prefers-reduced-motion: reduce)");

		const sincronizar = () => {
			if (!controle) return;
			if (visivel && document.visibilityState === "visible") controle.iniciar();
			else controle.parar();
		};
		const observador =
			typeof IntersectionObserver === "undefined"
				? null
				: new IntersectionObserver(([e]) => {
						visivel = e.isIntersecting;
						sincronizar();
					});
		// Pediu menos movimento no meio do caminho: desliga e volta ao SVG.
		const aoMudarMovimento = () => {
			if (reduzir.matches) setFase("svg");
		};

		import("./logo-3d/cena")
			.then(({ montarCena }) => {
				if (!vivo || !tela.current) return;
				controle = montarCena(tela.current, TAMANHO, () => {
					if (vivo) setFase("3d");
				});
				if (caixa.current && observador) observador.observe(caixa.current);
				document.addEventListener("visibilitychange", sincronizar);
				reduzir.addEventListener("change", aoMudarMovimento);
				sincronizar();
			})
			.catch(() => {
				if (vivo) setFase("svg");
			});

		return () => {
			vivo = false;
			observador?.disconnect();
			document.removeEventListener("visibilitychange", sincronizar);
			reduzir.removeEventListener("change", aoMudarMovimento);
			controle?.destruir();
		};
	}, [ativo]);

	return (
		<div
			ref={caixa}
			data-logo="janela"
			className="mx-auto size-14 text-acao"
			style={ativo ? { position: "relative" } : undefined}
		>
			<LogoMarca
				className="size-14"
				traco={3.5}
				estilo={fase === "3d" ? { opacity: 0, transition: "opacity 0.6s" } : undefined}
			/>
			{ativo ? (
				<canvas
					ref={tela}
					aria-hidden="true"
					width={TAMANHO}
					height={TAMANHO}
					className="absolute inset-0 size-full"
					style={{ opacity: fase === "3d" ? 1 : 0, transition: "opacity 0.6s" }}
				/>
			) : null}
		</div>
	);
}
