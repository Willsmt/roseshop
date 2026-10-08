"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";

import { Aviso } from "@/components/ui/aviso";
import { Button } from "@/components/ui/button";
import { removerProduto } from "@/lib/produtos/actions";

import { comFalhaGeral } from "../../com-falha-geral";

const LISTA = "/painel/produtos";

export function ConfirmarRemocao({
	id,
	versao,
	codigo,
	nome,
}: {
	id: number;
	versao: number;
	codigo: string;
	nome: string;
}) {
	const router = useRouter();
	const [estado, acao, enviando] = useActionState(comFalhaGeral(removerProduto), null);

	useEffect(() => {
		if (estado?.ok) router.push(`${LISTA}?aviso=removido`);
		else if (estado?.motivo === "nao_existe") router.push(`${LISTA}?aviso=nao_existe`);
	}, [estado, router]);

	const falha = estado && !estado.ok && estado.motivo !== "nao_existe" ? estado : null;

	return (
		<form action={acao} className="flex flex-col gap-4">
			<input type="hidden" name="id" value={id} />
			<input type="hidden" name="versao" value={versao} />
			<p className="text-base">{`O produto ${codigo} ${nome} será apagado de vez e não poderá ser recuperado`}</p>
			{falha ? <Aviso tipo="erro">{falha.mensagem}</Aviso> : null}
			<div className="flex flex-col gap-3 sm:flex-row">
				<Button type="submit" variant="primary" disabled={enviando}>
					Remover
				</Button>
				<Button type="button" variant="secondary" onClick={() => router.push(`${LISTA}/${id}`)}>
					Cancelar
				</Button>
			</div>
		</form>
	);
}
