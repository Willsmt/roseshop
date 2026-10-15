"use client";

import { useRouter } from "next/navigation";
import { startTransition } from "react";

import { textos } from "./_catalogo/textos";

export default function ErroPublico({ reset }: { error: Error; reset: () => void }) {
	const router = useRouter();
	return (
		<main className="p-4">
			<h1 className="text-xl font-bold">{textos.erroTitulo}</h1>
			<p>{textos.erroTexto}</p>
			<button
				type="button"
				className="mt-4 min-h-12 border px-4"
				onClick={() => {
					startTransition(() => {
						router.refresh();
						reset();
					});
				}}
			>
				{textos.tentarDeNovo}
			</button>
		</main>
	);
}
