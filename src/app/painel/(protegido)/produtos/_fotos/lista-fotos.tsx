"use client";

import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { CONFIRMAR_REMOCAO_FOTO, mensagemFoto } from "@/lib/fotos/mensagens";

import type { FotoLocal } from "./tipos";

type Props = {
	fotos: FotoLocal[];
	onRemover: (chave: string) => void;
	onMover: (de: number, para: number) => void;
	onTentarDeNovo: (chave: string) => void;
	confirmarRemocao?: boolean;
	// SF11: presente ⇒ cada item ganha "Trocar foto". Ausente (cadastro) ⇒ nada muda.
	onTrocar?: (chave: string) => void;
	// SF11: false ⇒ sem o botão "Remover" (produto com 1 foto só).
	podeRemover?: boolean;
	// SF11: true ⇒ todos os botões do item e o arrasto ficam travados.
	desabilitado?: boolean;
};

// `total` = quantas fotos havia ao começar: se mudar no meio, o arrasto é desfeito.
type Arrasto = { origem: number; destino: number; ponteiro: number; total: number };

const NAO_ENVIADA = mensagemFoto("nao_enviada");

// Rótulos sem quebra numa tela de 360 px; `!` vence o `sm:w-auto` do primitivo.
const BOTAO_ITEM = "px-3! whitespace-nowrap sm:w-full!";

function Lixeira() {
	return (
		<svg
			aria-hidden="true"
			viewBox="0 0 24 24"
			width="20"
			height="20"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
			strokeLinecap="round"
			strokeLinejoin="round"
			className="mr-2 shrink-0"
		>
			<path d="M3 6h18" />
			<path d="M8 6V4h8v2" />
			<path d="M6 6l1 14h10l1-14" />
		</svg>
	);
}

export function ListaFotos({ fotos, onRemover, onMover, onTentarDeNovo, confirmarRemocao = false, onTrocar, podeRemover = true, desabilitado = false }: Props) {
	const lista = useRef<HTMLOListElement>(null);
	const [arrastoBruto, setArrasto] = useState<Arrasto | null>(null);
	// Alça do arrasto em curso: serve para saber se ela ainda tem a captura do ponteiro.
	const alcaArrasto = useRef<HTMLDivElement | null>(null);
	// Uma foto entrou ou saiu durante o arrasto: as posições já não valem.
	const arrasto = arrastoBruto && arrastoBruto.total === fotos.length ? arrastoBruto : null;

	// Destino = quantos OUTROS itens têm o centro vertical acima do ponteiro.
	function destinoPara(clientY: number, origem: number): number {
		const itens = Array.from(lista.current?.children ?? []);
		let destino = 0;
		itens.forEach((el, i) => {
			if (i === origem) return;
			const r = el.getBoundingClientRect();
			if (r.top + r.height / 2 < clientY) destino += 1;
		});
		return destino;
	}

	function aoApertar(evento: React.PointerEvent<HTMLDivElement>, indice: number) {
		if (desabilitado) return;
		if (arrasto && emCurso(arrasto, evento.pointerId)) return; // 2º dedo/ponteiro não toma o lugar
		if (!evento.isPrimary || evento.button !== 0) return;
		if (fotos.length < 2) return;
		evento.preventDefault();
		const alca = evento.currentTarget;
		if (typeof alca.setPointerCapture === "function") {
			try {
				alca.setPointerCapture(evento.pointerId);
			} catch {
				// sem captura: o arrasto segue pelos eventos da própria alça
			}
		}
		alcaArrasto.current = alca;
		setArrasto({ origem: indice, destino: indice, ponteiro: evento.pointerId, total: fotos.length });
	}

	// Outro ponteiro com a captura ainda ativa na alça ⇒ o arrasto segue. O mesmo ponteiro
	// apertando de novo (mouse com o pointerup perdido) ou outro sem captura ativa ⇒ o arrasto
	// velho se perdeu e é descartado.
	function emCurso(atual: Arrasto, ponteiro: number): boolean {
		if (atual.ponteiro === ponteiro) return false;
		const alca = alcaArrasto.current;
		return typeof alca?.hasPointerCapture === "function" && alca.hasPointerCapture(atual.ponteiro);
	}

	function aoMoverPonteiro(evento: React.PointerEvent<HTMLDivElement>) {
		if (!arrasto || arrasto.ponteiro !== evento.pointerId) return;
		const destino = destinoPara(evento.clientY, arrasto.origem);
		if (destino !== arrasto.destino) setArrasto({ ...arrasto, destino });
	}

	function aoSoltar(evento: React.PointerEvent<HTMLDivElement>) {
		if (!arrastoBruto || arrastoBruto.ponteiro !== evento.pointerId) return;
		setArrasto(null);
		if (!arrasto) return;
		const destino = destinoPara(evento.clientY, arrasto.origem);
		if (destino !== arrasto.origem) onMover(arrasto.origem, destino);
	}

	function aoDesistir(evento: React.PointerEvent<HTMLDivElement>) {
		if (arrastoBruto && arrastoBruto.ponteiro === evento.pointerId) setArrasto(null);
	}

	function remover(chave: string) {
		if (confirmarRemocao && !window.confirm(CONFIRMAR_REMOCAO_FOTO)) return;
		onRemover(chave);
	}

	return (
		<ol ref={lista} aria-label="Fotos do produto" className="flex flex-col gap-3">
			{fotos.map((foto, i) => {
				const numero = i + 1;
				const ultimo = i === fotos.length - 1;
				const { estado } = foto;
				const origem = arrasto?.origem === i;
				const destino = arrasto !== null && arrasto.destino !== arrasto.origem && arrasto.destino === i;
				return (
					<li
						key={foto.chave}
						aria-label={`Foto ${numero}`}
						data-destino={destino ? "true" : undefined}
						className={
							"flex gap-3 rounded-lg border-2 bg-white p-2 " +
							(destino ? "border-blue-700 ring-2 ring-blue-700" : origem ? "border-blue-700 bg-blue-50" : "border-neutral-300")
						}
					>
						<div
							data-testid="alca-foto"
							className="flex w-24 shrink-0 cursor-grab touch-none select-none flex-col gap-2 sm:w-40"
							onPointerDown={(e) => aoApertar(e, i)}
							onPointerMove={aoMoverPonteiro}
							onPointerUp={aoSoltar}
							onPointerCancel={aoDesistir}
							onLostPointerCapture={aoDesistir}
						>
							{foto.previa ? (
								// eslint-disable-next-line @next/next/no-img-element -- blob URL local ou /painel/fotos/..., sem otimização
								<img
									src={foto.previa}
									alt={`Foto ${numero}`}
									width={160}
									height={160}
									draggable={false}
									className="aspect-square h-auto w-full rounded-md object-cover"
								/>
							) : (
								// Espaço reservado do mesmo tamanho até existir a miniatura.
								<div aria-hidden="true" className="aspect-square w-full rounded-md bg-neutral-200" />
							)}
							{i === 0 ? (
								<span className="self-start rounded bg-neutral-900 px-2 py-1 text-base font-semibold text-white">Capa</span>
							) : null}
						</div>
						<div className="flex min-w-0 flex-1 flex-col gap-2">
							<div role="status">
								{estado.tipo === "enviando" ? <p className="text-base text-neutral-700">Enviando…</p> : null}
								{estado.tipo === "nao_enviada" ? (
									<>
										<p className="text-base font-semibold text-red-800">{NAO_ENVIADA}</p>
										{estado.mensagem !== NAO_ENVIADA ? (
											<p className="text-base text-red-800">{estado.mensagem}</p>
										) : null}
									</>
								) : null}
							</div>
							{estado.tipo === "nao_enviada" && estado.podeTentar ? (
								<Button type="button" disabled={desabilitado} variant="primary" className={BOTAO_ITEM} onClick={() => onTentarDeNovo(foto.chave)}>
									Tentar de novo
								</Button>
							) : null}
							{i > 0 ? (
								<Button type="button" disabled={desabilitado} variant="secondary" className={BOTAO_ITEM} onClick={() => onMover(i, 0)}>
									Usar como capa
								</Button>
							) : null}
							{i > 0 ? (
								<Button type="button" disabled={desabilitado} variant="secondary" className={BOTAO_ITEM} onClick={() => onMover(i, i - 1)}>
									Mover para cima
								</Button>
							) : null}
							{!ultimo ? (
								<Button type="button" disabled={desabilitado} variant="secondary" className={BOTAO_ITEM} onClick={() => onMover(i, i + 1)}>
									Mover para baixo
								</Button>
							) : null}
							{onTrocar ? (
								<Button type="button" disabled={desabilitado} variant="secondary" className={BOTAO_ITEM} onClick={() => onTrocar(foto.chave)}>
									Trocar foto
								</Button>
							) : null}
							{podeRemover ? (
								<Button type="button" disabled={desabilitado} variant="secondary" className={BOTAO_ITEM} onClick={() => remover(foto.chave)}>
									<Lixeira />
									Remover
								</Button>
							) : null}
						</div>
					</li>
				);
			})}
		</ol>
	);
}
