"use client";

import { useEffect, useId, useState } from "react";
import Cropper from "react-easy-crop";
import type { Area, Point } from "react-easy-crop";

import { Button } from "@/components/ui/button";
import { type AreaRecorte, LADO_MINIMO } from "@/lib/fotos/aparelho/recortar";

type Props = { arquivo: File; onUsar: (area: AreaRecorte) => void; onCancelar: () => void };

const ZOOM_MIN = 1;
const ZOOM_MAX = 4;

const limitar = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

// Só escolhe a área 1:1: nada é enviado aqui (FR-007); quem recebe onUsar envia.
export function RecorteFoto({ arquivo, onUsar, onCancelar }: Props) {
	const idZoom = useId();
	const [imagem, setImagem] = useState<string | null>(null);
	const [posicao, setPosicao] = useState<Point>({ x: 0, y: 0 });
	const [zoom, setZoomBruto] = useState(ZOOM_MIN);
	// Até a imagem carregar não há como saber o quanto dá para aproximar: 1.
	const [zoomMax, setZoomMax] = useState(ZOOM_MIN);
	const [area, setArea] = useState<AreaRecorte | null>(null);

	useEffect(() => {
		// A blob URL é recurso externo: criada e revogada no mesmo efeito para resistir ao
		// duplo efeito do StrictMode (useMemo + revogação deixaria a URL morta em dev).
		const url = URL.createObjectURL(arquivo);
		// eslint-disable-next-line react-hooks/set-state-in-effect -- sincroniza com a blob URL criada acima
		setImagem(url);
		return () => URL.revokeObjectURL(url);
	}, [arquivo]);

	function setZoom(valor: number) {
		setZoomBruto(limitar(valor, ZOOM_MIN, zoomMax));
	}

	function aoCarregar({ naturalWidth, naturalHeight }: { naturalWidth: number; naturalHeight: number }) {
		// Aproximar além disso deixaria a área com menos de LADO_MINIMO px da foto original.
		const max = limitar(Math.min(naturalWidth, naturalHeight) / LADO_MINIMO, ZOOM_MIN, ZOOM_MAX);
		setZoomMax(max);
		setZoomBruto((atual) => limitar(atual, ZOOM_MIN, max));
	}

	function aoCompletar(_area: Area, pixels: Area) {
		setArea({
			x: Math.round(pixels.x),
			y: Math.round(pixels.y),
			lado: Math.round(Math.min(pixels.width, pixels.height)),
		});
	}

	return (
		<div className="flex flex-col gap-4">
			<div className="relative aspect-square w-full max-w-md overflow-hidden rounded-lg bg-neutral-900">
				{imagem ? (
					<Cropper
						image={imagem}
						crop={posicao}
						zoom={zoom}
						aspect={1}
						minZoom={ZOOM_MIN}
						maxZoom={zoomMax}
						restrictPosition
						objectFit="contain"
						onCropChange={setPosicao}
						onZoomChange={setZoom}
						onCropComplete={aoCompletar}
						onMediaLoaded={aoCarregar}
					/>
				) : null}
			</div>
			<div className="flex max-w-md flex-col gap-2">
				<label htmlFor={idZoom} className="text-base font-semibold text-neutral-900">
					Aproximar
				</label>
				<input
					id={idZoom}
					type="range"
					min={ZOOM_MIN}
					max={zoomMax}
					step={0.1}
					value={zoom}
					onChange={(e) => setZoom(Number(e.currentTarget.value))}
					className="h-12 w-full accent-neutral-900"
				/>
			</div>
			<div className="flex flex-col gap-3 sm:flex-row">
				<Button type="button" variant="primary" disabled={!area} onClick={() => area && onUsar(area)}>
					Usar esta foto
				</Button>
				<Button type="button" variant="secondary" onClick={onCancelar}>
					Cancelar
				</Button>
			</div>
		</div>
	);
}
