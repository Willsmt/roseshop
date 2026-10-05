"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { criarCategoria } from "@/lib/categorias/actions";
import { mensagem } from "@/lib/categorias/mensagens";

const LISTA = "/painel/categorias";

export function FormCriar() {
	const router = useRouter();
	const [nome, setNome] = useState("");
	const [erro, setErro] = useState<string | null>(null);
	const [enviando, setEnviando] = useState(false);

	async function aoEnviar(e: React.FormEvent<HTMLFormElement>) {
		e.preventDefault();
		setEnviando(true);
		setErro(null);
		try {
			const r = await criarCategoria({ nome });
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
		<form onSubmit={aoEnviar} className="flex flex-col gap-4">
			<div className="flex flex-col gap-2">
				<label htmlFor="nome" className="text-base font-semibold">
					Nome da categoria
				</label>
				<input
					id="nome"
					name="nome"
					type="text"
					value={nome}
					onChange={(e) => setNome(e.target.value)}
					aria-invalid={erro ? "true" : undefined}
					aria-describedby={erro ? "nome-erro" : undefined}
					className="min-h-12 w-full rounded-lg border-2 border-neutral-900 px-4 py-3 text-base"
				/>
				{erro ? (
					<p id="nome-erro" role="alert" className="text-base font-semibold text-red-700">
						{erro}
					</p>
				) : null}
			</div>
			<div className="flex flex-col gap-3 sm:flex-row">
				<Button type="submit" variant="primary" disabled={enviando}>
					Salvar
				</Button>
				<Button type="button" variant="secondary" onClick={() => router.push(LISTA)}>
					Cancelar
				</Button>
			</div>
		</form>
	);
}
