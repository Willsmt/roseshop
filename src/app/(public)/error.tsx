"use client";

import { useRouter } from "next/navigation";
import { startTransition } from "react";

import { Button } from "@/components/ui/button";

import { textos } from "./_catalogo/textos";

export default function ErroPublico({ reset }: { error: Error; reset: () => void }) {
	const router = useRouter();
	return (
		<main className="mx-auto flex w-full max-w-md flex-col items-center gap-4 px-4 pt-20 pb-12 text-center">
			<span aria-hidden="true" className="block aspect-square w-32 rounded-arco border-[6px] border-superficie-2 bg-ceu" />
			<h1 className="text-4xl">{textos.erroTitulo}</h1>
			<p className="text-texto-suave">{textos.erroTexto}</p>
			<Button
				type="button"
				variant="primary"
				className="mt-2"
				onClick={() => {
					startTransition(() => {
						router.refresh();
						reset();
					});
				}}
			>
				{textos.tentarDeNovo}
			</Button>
		</main>
	);
}
