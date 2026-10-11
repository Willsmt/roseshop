"use client";

import { useRef, useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";

const MAXIMO = 3;
const PONTEIRO_GROSSO = "(pointer: coarse)";

type Props = { quantidade: number; onEscolher: (arquivo: File) => void; desabilitado?: boolean };

function assinarPonteiro(avisar: () => void): () => void {
	if (typeof window.matchMedia !== "function") return () => {};
	const consulta = window.matchMedia(PONTEIRO_GROSSO);
	consulta.addEventListener?.("change", avisar);
	return () => consulta.removeEventListener?.("change", avisar);
}

function lerPonteiroGrosso(): boolean {
	return typeof window.matchMedia === "function" && window.matchMedia(PONTEIRO_GROSSO).matches;
}

// No servidor e na hidratação vale o desktop; depois, o que o aparelho informa.
function lerNoServidor(): boolean {
	return false;
}

export function EscolherFoto({ quantidade, onEscolher, desabilitado = false }: Props) {
	const celular = useSyncExternalStore(assinarPonteiro, lerPonteiroGrosso, lerNoServidor);
	const camera = useRef<HTMLInputElement>(null);
	const galeria = useRef<HTMLInputElement>(null);
	const arquivo = useRef<HTMLInputElement>(null);

	const cheio = quantidade >= MAXIMO;
	const indisponivel = cheio || desabilitado;

	function aoMudar(evento: React.ChangeEvent<HTMLInputElement>) {
		const entrada = evento.currentTarget;
		const escolhido = entrada.files?.[0];
		entrada.value = "";
		if (escolhido) onEscolher(escolhido);
	}

	return (
		<div className="flex flex-col gap-3">
			{celular ? (
				<div className="flex flex-col gap-3 sm:flex-row">
					<Button type="button" variant="primary" disabled={indisponivel} onClick={() => camera.current?.click()}>
						Tirar foto
					</Button>
					<Button type="button" variant="secondary" disabled={indisponivel} onClick={() => galeria.current?.click()}>
						Escolher da galeria
					</Button>
					<input
						ref={camera}
						type="file"
						accept="image/*"
						capture="environment"
						className="hidden"
						tabIndex={-1}
						data-testid="entrada-camera"
						onChange={aoMudar}
					/>
					<input
						ref={galeria}
						type="file"
						accept="image/*"
						className="hidden"
						tabIndex={-1}
						data-testid="entrada-galeria"
						onChange={aoMudar}
					/>
				</div>
			) : (
				<div className="flex flex-col gap-3 sm:flex-row">
					<Button type="button" variant="primary" disabled={indisponivel} onClick={() => arquivo.current?.click()}>
						Escolher arquivo
					</Button>
					<input
						ref={arquivo}
						type="file"
						accept="image/*"
						className="hidden"
						tabIndex={-1}
						data-testid="entrada-arquivo"
						onChange={aoMudar}
					/>
				</div>
			)}
			{cheio ? <p className="text-base text-neutral-700">Máximo de 3 fotos</p> : null}
		</div>
	);
}
