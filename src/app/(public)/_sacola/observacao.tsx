"use client";

import { medidorObservacao, restanteObservacao } from "@/lib/sacola/mensagem";
import { textos } from "@/lib/sacola/textos";
import type { LinhaPedido } from "@/lib/sacola/total";
import { classesControle } from "@/components/ui/campo-texto";

// Observação do pedido (CT§3, ajuste A2, FR-015a, FR-016). Guarda o texto bruto, só em memória
// (US2.8); a regra de normalizar e o orçamento vêm de @/lib/sacola/mensagem. O medidor não é
// região viva (não anuncia cada tecla); #obs-conta muda só na troca de modo. O número codificado
// nunca aparece.
export function Observacao({
	valor,
	aoMudar,
	numero,
	linhas,
}: {
	valor: string;
	aoMudar: (valor: string) => void;
	numero: string;
	linhas: LinhaPedido[];
}) {
	const medida = medidorObservacao({ numero, linhas, observacao: valor });
	const conta =
		medida.limite === "caracteres" ? "" : medida.excede ? textos.observacaoNaoCabe : textos.espacoQuaseCheio;

	// Entrada que deixaria o texto fora do limite é desfeita; encurtar é sempre aceito, mesmo com o
	// excesso causado pela sacola ter crescido (que é mostrado, nunca cortado).
	function mudar(novo: string) {
		const restante = restanteObservacao({ numero, linhas, observacao: novo });
		if (restante < 0 && restante < restanteObservacao({ numero, linhas, observacao: valor })) return;
		aoMudar(novo);
	}

	return (
		<div className="flex flex-col gap-2">
			<label htmlFor="obs" className="text-base font-semibold">
				{textos.rotuloObservacao}
			</label>
			<textarea
				id="obs"
				rows={3}
				value={valor}
				onChange={(e) => mudar(e.target.value)}
				aria-describedby="obs-medidor obs-conta"
				className={classesControle}
			/>
			<p id="obs-medidor" className="text-base text-neutral-700">
				{medida.limite === "caracteres" ? (
					textos.caracteresUsados(medida.usados)
				) : (
					<progress
						max={100}
						value={medida.excede ? 100 : Math.round(medida.fracao * 100)}
						aria-label={textos.espacoUsado}
						className="w-full"
					/>
				)}
			</p>
			<p id="obs-conta" aria-live="polite" className="text-base">
				{conta}
			</p>
		</div>
	);
}
