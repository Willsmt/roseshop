"use client";

import type { ItemConferido } from "@/lib/sacola/conferencia";
import { QTD_MAX, QTD_MIN } from "@/lib/sacola/sacola";
import { textos } from "@/lib/sacola/textos";
import { valorLinha } from "@/lib/sacola/total";

const botaoQtd =
	"inline-flex min-h-12 min-w-12 items-center justify-center rounded-lg border-2 border-neutral-900 text-xl font-semibold " +
	"disabled:cursor-not-allowed disabled:opacity-40";

// Linha da sacola conferida (CT§3). Disponível: quantidade de 1 a 10 e "Remover". Esgotado: só o
// texto e "Remover" (US3.1). As regras vêm de @/lib/sacola; aqui só a apresentação.
export function ItemSacola({
	item,
	precoMudou,
	aoMudarQuantidade,
	aoRemover,
}: {
	item: ItemConferido;
	precoMudou: boolean;
	aoMudarQuantidade: (quantidade: number) => void;
	aoRemover: () => void;
}) {
	const { produto, quantidade, codigo } = item;
	const disponivel = item.estado === "ok";
	return (
		<li className="flex gap-3 border-b py-3">
			{produto.capa ? (
				// eslint-disable-next-line @next/next/no-img-element
				<img
					src={produto.capa.url}
					alt={produto.capa.alt}
					width={96}
					height={96}
					className="size-24 shrink-0 object-cover"
				/>
			) : (
				<span className="flex size-24 shrink-0 items-center justify-center border">{textos.semFoto}</span>
			)}
			<div className="flex flex-col gap-1">
				<a href={produto.href} className="inline-flex min-h-12 items-center font-bold underline">
					{produto.nome}
				</a>
				<span>#{codigo}</span>
				<span>{item.precoUnitario}</span>
				{precoMudou ? <p role="status">{textos.precoMudou}</p> : null}
				{disponivel ? (
					<>
						<div className="flex items-center gap-3">
							<button
								type="button"
								className={botaoQtd}
								aria-label={textos.diminuirQuantidade(produto.nome)}
								disabled={quantidade <= QTD_MIN}
								onClick={() => aoMudarQuantidade(quantidade - 1)}
							>
								−
							</button>
							<output className="min-w-6 text-center">{quantidade}</output>
							<button
								type="button"
								className={botaoQtd}
								aria-label={textos.aumentarQuantidade(produto.nome)}
								disabled={quantidade >= QTD_MAX}
								onClick={() => aoMudarQuantidade(quantidade + 1)}
							>
								+
							</button>
						</div>
						<span className="font-semibold">
							{valorLinha({
								quantidade,
								nome: produto.nome,
								codigo,
								precoCentavos: produto.precoCentavos,
								aPartirDe: produto.aPartirDe,
							})}
						</span>
					</>
				) : (
					<strong>{textos.esgotado}</strong>
				)}
				<button type="button" className="inline-flex min-h-12 items-center self-start underline" onClick={aoRemover}>
					{textos.remover}
				</button>
			</div>
		</li>
	);
}
