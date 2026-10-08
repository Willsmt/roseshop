"use client";

import { useActionState, useState } from "react";

import { Aviso } from "@/components/ui/aviso";
import { Button } from "@/components/ui/button";
import {
	destacarProduto,
	marcarDisponivel,
	marcarEsgotado,
	tirarProdutoDoDestaque,
} from "@/lib/produtos/actions";

import { comFalhaGeral } from "../com-falha-geral";

type Props = {
	id: number;
	versao: number;
	esgotado: boolean;
	emDestaque: boolean;
	podeDestacar: boolean;
};

type Qual = "esgotar" | "disponibilizar" | "destacar" | "tirar";

// Os quatro estados ficam aqui (e não em cada botão): após o revalidate os botões trocam,
// mas o aviso de sucesso da última ação precisa continuar na tela.
export function AcoesProduto({ id, versao, esgotado, emDestaque, podeDestacar }: Props) {
	const [eEsgotar, esgotar, pEsgotar] = useActionState(comFalhaGeral(marcarEsgotado), null);
	const [eDisponivel, disponibilizar, pDisponivel] = useActionState(comFalhaGeral(marcarDisponivel), null);
	const [eDestacar, destacar, pDestacar] = useActionState(comFalhaGeral(destacarProduto), null);
	const [eTirar, tirar, pTirar] = useActionState(comFalhaGeral(tirarProdutoDoDestaque), null);
	const [ultima, setUltima] = useState<Qual | null>(null);
	const ocupado = pEsgotar || pDisponivel || pDestacar || pTirar;

	const resultado = {
		esgotar: eEsgotar,
		disponibilizar: eDisponivel,
		destacar: eDestacar,
		tirar: eTirar,
	}[ultima ?? "esgotar"];

	let aviso: React.ReactNode = null;
	if (ultima && resultado) {
		if (!resultado.ok) {
			aviso = <Aviso tipo="erro">{resultado.mensagem}</Aviso>;
		} else {
			const texto = {
				esgotar:
					eEsgotar?.ok && eEsgotar.saiuDoDestaque
						? "Produto marcado como esgotado e saiu do destaque."
						: "Produto marcado como esgotado.",
				disponibilizar: "Produto disponível de novo.",
				destacar: "Produto em destaque.",
				tirar: "Produto fora do destaque.",
			}[ultima];
			aviso = <Aviso tipo="sucesso">{texto}</Aviso>;
		}
	}

	const campos = (
		<>
			<input type="hidden" name="id" value={id} />
			<input type="hidden" name="versao" value={versao} />
		</>
	);

	return (
		<div className="flex flex-col gap-4">
			{aviso}
			<div className="flex flex-col gap-3 sm:flex-row">
				{esgotado ? (
					<form action={disponibilizar} onSubmit={() => setUltima("disponibilizar")}>
						{campos}
						<Button type="submit" variant="primary" disabled={ocupado}>
							Marcar como disponível
						</Button>
					</form>
				) : (
					<form action={esgotar} onSubmit={() => setUltima("esgotar")}>
						{campos}
						<Button type="submit" variant="primary" disabled={ocupado}>
							Marcar como esgotado
						</Button>
					</form>
				)}
				{podeDestacar ? (
					<form action={destacar} onSubmit={() => setUltima("destacar")}>
						{campos}
						<Button type="submit" variant="secondary" disabled={ocupado}>
							Destacar
						</Button>
					</form>
				) : null}
				{emDestaque ? (
					<form action={tirar} onSubmit={() => setUltima("tirar")}>
						{campos}
						<Button type="submit" variant="secondary" disabled={ocupado}>
							Tirar do destaque
						</Button>
					</form>
				) : null}
			</div>
		</div>
	);
}
