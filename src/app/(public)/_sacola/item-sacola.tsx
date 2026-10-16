"use client";

import type { ItemConferido } from "@/lib/sacola/conferencia";
import { QTD_MAX, QTD_MIN } from "@/lib/sacola/sacola";
import { textos } from "@/lib/sacola/textos";
import { valorLinha } from "@/lib/sacola/total";

const botaoQtd =
	"inline-flex min-h-12 min-w-12 items-center justify-center rounded-pilula bg-superficie-2 text-2xl font-bold text-texto " +
	"hover:bg-linha disabled:cursor-not-allowed disabled:opacity-40";

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
		<li className="flex gap-4 border-b border-linha py-4">
			{produto.capa ? (
				// eslint-disable-next-line @next/next/no-img-element
				<img
					src={produto.capa.url}
					alt={produto.capa.alt}
					width={96}
					height={96}
					className="size-24 shrink-0 rounded-arco border-4 border-superficie-2 bg-linha object-cover"
				/>
			) : (
				<span className="flex size-24 shrink-0 items-center justify-center rounded-arco bg-superficie-2 text-center text-[1rem] font-bold text-texto-suave">
					{textos.semFoto}
				</span>
			)}
			<div className="flex min-w-0 flex-col gap-1">
				<a href={produto.href} className="inline-flex min-h-12 items-center font-bold underline underline-offset-4">
					{produto.nome}
				</a>
				<span className="text-[1rem] text-texto-suave">#{codigo}</span>
				<span className="text-texto-suave">{item.precoUnitario}</span>
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
							<output className="min-w-6 text-center text-xl font-bold">{quantidade}</output>
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
						<span className="font-titulo text-xl text-acao">
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
					<strong className="self-start rounded-pilula bg-texto px-3 py-0.5 text-[1rem] font-bold text-superficie">
						{textos.esgotado}
					</strong>
				)}
				<button type="button" className="inline-flex min-h-12 items-center self-start font-bold text-acao underline underline-offset-4"
					onClick={aoRemover}>
					{textos.remover}
				</button>
			</div>
		</li>
	);
}
