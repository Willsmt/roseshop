"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { removerCategoria } from "@/lib/categorias/actions";
import { mensagem } from "@/lib/categorias/mensagens";

const LISTA = "/painel/categorias";

export function ConfirmarRemocao({
	id,
	versao,
	nome,
}: {
	id: number;
	versao: number;
	nome: string;
}) {
	const router = useRouter();
	const [erro, setErro] = useState<string | null>(null);
	const [enviando, setEnviando] = useState(false);

	async function remover() {
		setEnviando(true);
		setErro(null);
		try {
			const r = await removerCategoria({ id, versao });
			if (r.ok) {
				router.push(LISTA);
				return;
			}
			setErro(r.mensagem);
		} catch {
			setErro(mensagem("falha_geral"));
		}
		setEnviando(false);
	}

	return (
		<div className="flex flex-col gap-4">
			<p className="text-base">
				{`Você vai remover a categoria "${nome}". Esta ação não pode ser desfeita.`}
			</p>
			<div className="flex flex-col gap-3 sm:flex-row">
				<Button type="button" variant="primary" disabled={enviando} onClick={remover}>
					Remover
				</Button>
				<Button type="button" variant="secondary" onClick={() => router.push(LISTA)}>
					Cancelar
				</Button>
			</div>
			{erro ? (
				<p role="alert" className="text-base font-semibold text-red-700">
					{erro}
				</p>
			) : null}
		</div>
	);
}
